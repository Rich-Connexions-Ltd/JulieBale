/**
 * Media import bridge (Sprint 16, request #24).
 *
 * Takes files uploaded in a ChatGPT chat (Actions `openaiFileIdRefs`, whose
 * download links live ~5 minutes) or https URLs, and turns each into a site
 * asset (`asset:<id>`):
 *   1. copy the exact original into R2 as the private master (size-capped);
 *   2. audio: that object is the playable file (served only with consent);
 *      video: Cloudflare Stream copies it from a signed 15-minute URL, so
 *      Stream never depends on ChatGPT's expiring link;
 *   3. the asset record is built by assets.ts helpers and saved by the caller.
 * Stream details (duration, size, dimensions, readiness) arrive later via
 * refresh. Nothing here returns or logs STREAM_TOKEN.
 */

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  API_KEY?: string;
  STREAM_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
}

export interface ImportSource {
  kind: "chatgpt" | "url";
  url: string;
  name: string;
  mime?: string;
}

const MB = 1024 * 1024;
/** Allowed MIME types, their file extensions, and size caps. */
export const MEDIA_TYPES = {
  video: { cap: 200 * MB, mimes: { "video/mp4": ["mp4", "m4v"], "video/quicktime": ["mov"], "video/webm": ["webm"] } as Record<string, string[]> },
  audio: {
    cap: 50 * MB,
    mimes: { "audio/mpeg": ["mp3"], "audio/mp4": ["m4a", "mp4"], "audio/x-m4a": ["m4a"], "audio/wav": ["wav"], "audio/ogg": ["ogg", "oga"] } as Record<string, string[]>,
  },
};
export const MAX_SOURCES = 10;

/* ----------------------------- normaliseSources ---------------------------- */

/**
 * One shape for both doors: ChatGPT's runtime `openaiFileIdRefs` objects
 * ({name, id, mime_type, download_link}) and plain `urls`.
 */
export function normaliseSources(body: any): { sources: ImportSource[] } | { error: string } {
  const out: ImportSource[] = [];
  const refs = Array.isArray(body?.openaiFileIdRefs) ? body.openaiFileIdRefs : [];
  for (const r of refs) {
    if (!r || typeof r !== "object" || typeof r.download_link !== "string")
      return { error: "openaiFileIdRefs entries must be files uploaded in the chat (with a download link)." };
    out.push({ kind: "chatgpt", url: r.download_link, name: typeof r.name === "string" ? r.name : "upload", mime: typeof r.mime_type === "string" ? r.mime_type : undefined });
  }
  const urls = Array.isArray(body?.urls) ? body.urls : [];
  for (const u of urls) {
    if (typeof u !== "string") return { error: "urls must be https links (strings)." };
    const name = (() => { try { return decodeURIComponent(new URL(u).pathname.split("/").pop() || "download"); } catch { return "download"; } })();
    out.push({ kind: "url", url: u, name });
  }
  if (!out.length) return { error: "nothing to import: attach a file in the chat, or give an https url." };
  if (out.length > MAX_SOURCES) return { error: `at most ${MAX_SOURCES} files per import.` };
  return { sources: out };
}

/* -------------------------------- fetchPolicy ------------------------------ */

/**
 * Is this URL safe for the server to fetch? https only; no credentials; default
 * port; a real DNS name (no IP literals, localhost, .local/.internal/.localhost
 * or single-label hosts). ChatGPT file links must stay on *.oaiusercontent.com
 * for the first URL AND every redirect hop. Returns an error message or null.
 */
export function checkFetchUrl(raw: string, kind: ImportSource["kind"]): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "not a valid link";
  }
  if (u.protocol !== "https:") return "only https links can be imported";
  if (u.username || u.password) return "links with credentials are not allowed";
  if (u.port && u.port !== "443") return "only the default https port is allowed";
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (/^\d+(\.\d+){3}$/.test(host) || host.startsWith("[") || host.includes(":")) return "IP addresses are not allowed";
  if (!host.includes(".") || host === "localhost" || /\.(local|internal|localhost|lan|home|arpa)$/.test(host)) return "that host is not allowed";
  if (kind === "chatgpt" && !(host === "oaiusercontent.com" || host.endsWith(".oaiusercontent.com"))) return "chat files must come from ChatGPT's file storage";
  return null;
}

/* ------------------------------- type checks ------------------------------- */

const extOf = (name: string) => (/\.([a-z0-9]{2,5})$/i.exec(name)?.[1] || "").toLowerCase();

/** "video" | "audio" when the MIME type is allowed and matches the file extension; otherwise null. */
export function mediaKind(mime: string | undefined, name: string): "video" | "audio" | null {
  const m = (mime || "").split(";")[0].trim().toLowerCase();
  const ext = extOf(name);
  for (const kind of ["video", "audio"] as const) {
    const exts = MEDIA_TYPES[kind].mimes[m];
    if (exts && exts.includes(ext)) return kind;
  }
  return null;
}

/** File names reduced to [a-z0-9._-] (keeps the extension), for R2 keys. */
export function safeName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "").slice(-80);
  return cleaned || "file";
}

/** Asset id from a title or file name: [a-z][a-z0-9-]{0,63}. */
export function slugForAsset(text: string): string {
  const s = text.toLowerCase().replace(/\.[a-z0-9]{2,5}$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56);
  return /^[a-z]/.test(s) ? s : `media-${s || "file"}`.slice(0, 56);
}

const randomToken = () => {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").toLowerCase();
};

/* ------------------------------ signed masters ----------------------------- */

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`masters:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A 15-minute URL for a private master (only Stream uses it). */
export async function signMasterUrl(origin: string, key: string, secret: string, nowMs = Date.now()): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + 15 * 60;
  return `${origin}/media/${key}?exp=${exp}&sig=${await hmac(secret, `${key}:${exp}`)}`;
}

/** Valid, unexpired signature for this key? (Constant-time compare.) */
export async function verifyMasterSig(key: string, exp: string | null, sig: string | null, secret: string | undefined, nowMs = Date.now()): Promise<boolean> {
  if (!secret || !exp || !sig || !/^\d{9,11}$/.test(exp) || Number(exp) * 1000 < nowMs) return false;
  const expected = await hmac(secret, `${key}:${exp}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------- copy to R2 -------------------------------- */

/**
 * Fetch a source (redirects followed manually, each hop re-checked, at most 3)
 * and stream it into R2 under `key`, refusing anything over `cap` bytes or with
 * a mismatched content type. Partial objects are deleted on failure.
 */
export async function copyToR2(env: Env, src: ImportSource, key: string, kind: "video" | "audio"): Promise<{ ok: true; size: number; contentType: string } | { ok: false; error: string }> {
  let url = src.url;
  let res: Response | null = null;
  for (let hop = 0; hop <= 3; hop++) {
    const bad = checkFetchUrl(url, src.kind);
    if (bad) return { ok: false, error: hop ? `redirected to a link that is not allowed (${bad})` : bad };
    res = await fetch(url, { redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url).href;
      res = null;
      continue;
    }
    break;
  }
  if (!res) return { ok: false, error: "too many redirects" };
  if (!res.ok || !res.body) return { ok: false, error: res.status === 403 || res.status === 410 ? "the download link has expired: upload the file again and retry" : `could not download the file (HTTP ${res.status})` };
  const contentType = (res.headers.get("content-type") || src.mime || "").split(";")[0].trim().toLowerCase();
  if (mediaKind(contentType, src.name) !== kind) return { ok: false, error: "the downloaded file's type does not match its name" };
  const length = Number(res.headers.get("content-length"));
  const cap = MEDIA_TYPES[kind].cap;
  if (!Number.isFinite(length) || length <= 0) return { ok: false, error: "the file size is unknown, so it cannot be imported safely" };
  if (length > cap) return { ok: false, error: `the file is too large (limit ${cap / MB} MB for ${kind})` };
  // Count bytes as they pass; abort if the body is longer than declared or the cap.
  let seen = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      seen += chunk.byteLength;
      if (seen > length || seen > cap) ctrl.error(new Error("file larger than declared"));
      else ctrl.enqueue(chunk);
    },
  });
  const Fixed = (globalThis as any).FixedLengthStream;
  const body = Fixed ? res.body.pipeThrough(counter).pipeThrough(new Fixed(length)) : res.body.pipeThrough(counter);
  try {
    await env.MEDIA.put(key, body, { httpMetadata: { contentType } });
  } catch {
    await env.MEDIA.delete(key).catch(() => {});
    return { ok: false, error: "the upload was interrupted or larger than declared" };
  }
  if (seen !== length) {
    await env.MEDIA.delete(key).catch(() => {});
    return { ok: false, error: "the upload was incomplete" };
  }
  return { ok: true, size: length, contentType };
}

/* --------------------------------- Stream ---------------------------------- */

const streamApi = (env: Env, path: string) => `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream${path}`;
const streamHeaders = (env: Env) => ({ authorization: `Bearer ${env.STREAM_TOKEN}`, "content-type": "application/json" });
/** Stream errors summarised (codes/messages only), never echoing headers or tokens. */
const streamError = (j: any, status: number) =>
  `Cloudflare Stream refused the request (${status}${Array.isArray(j?.errors) && j.errors[0]?.code ? `, code ${j.errors[0].code}` : ""})`;

export const streamConfigured = (env: Env) => !!(env.STREAM_TOKEN && env.CF_ACCOUNT_ID);

export async function streamCopy(env: Env, url: string, name: string, assetId: string, posterAt: number): Promise<{ uid: string } | { error: string }> {
  const res = await fetch(streamApi(env, "/copy"), {
    method: "POST",
    headers: streamHeaders(env),
    body: JSON.stringify({ url, meta: { name, asset: assetId }, thumbnailTimestampPct: posterAt / 100 }),
  });
  const j = (await res.json().catch(() => ({}))) as any;
  const uid = j?.result?.uid;
  return res.ok && j?.success && typeof uid === "string" && /^[a-f0-9]{32}$/.test(uid) ? { uid } : { error: streamError(j, res.status) };
}

export async function streamDetails(env: Env, uid: string): Promise<any | { error: string }> {
  const res = await fetch(streamApi(env, `/${uid}`), { headers: streamHeaders(env) });
  const j = (await res.json().catch(() => ({}))) as any;
  return res.ok && j?.success ? j.result : { error: streamError(j, res.status) };
}

export async function streamSetPoster(env: Env, uid: string, posterAt: number): Promise<true | { error: string }> {
  const res = await fetch(streamApi(env, `/${uid}`), { method: "POST", headers: streamHeaders(env), body: JSON.stringify({ thumbnailTimestampPct: posterAt / 100 }) });
  const j = (await res.json().catch(() => ({}))) as any;
  return res.ok && j?.success ? true : { error: streamError(j, res.status) };
}

/** poster_at: whole-number percent 0-100 (default 10). */
export const posterPercent = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 10);

/* ------------------------------- import one -------------------------------- */

/** Store one source; returns the media fields for the asset (see assets.ts). */
export async function storeSource(env: Env, origin: string, src: ImportSource, assetId: string, posterAt: number) {
  const k = mediaKind(src.mime || guessMime(src.name), src.name);
  if (!k) return { error: "unsupported file type (video: mp4, mov, webm; audio: mp3, m4a, wav, ogg)" } as const;
  if (k === "video" && !streamConfigured(env)) return { error: "video import needs Cloudflare Stream to be configured" } as const;
  if (!env.API_KEY) return { error: "imports are disabled until the API key is configured" } as const;
  const prefix = k === "audio" ? "imports" : "masters";
  const key = `${prefix}/${assetId}/${randomToken()}/${safeName(src.name)}`;
  const copied = await copyToR2(env, src, key, k);
  if (!copied.ok) return { error: copied.error } as const;
  const source = { kind: src.kind, name: src.name.slice(0, 120) };
  if (k === "audio") return { media: { type: "audio" as const, file: key, master: key, status: "ready" as const, size: copied.size, source } };
  const signed = await signMasterUrl(origin, key, env.API_KEY);
  const s = await streamCopy(env, signed, src.name, assetId, posterAt);
  if ("error" in s) {
    await env.MEDIA.delete(key).catch(() => {});
    return { error: s.error } as const;
  }
  return { media: { type: "video" as const, file: s.uid, master: key, status: "processing" as const, size: copied.size, source } };
}

/** MIME from extension, for URL imports that give no type up front (the response type is still checked). */
export function guessMime(name: string): string | undefined {
  const ext = extOf(name);
  for (const kind of ["video", "audio"] as const)
    for (const [mime, exts] of Object.entries(MEDIA_TYPES[kind].mimes)) if (exts.includes(ext)) return mime;
  return undefined;
}
