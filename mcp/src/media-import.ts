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
  // accents transliterated (été -> ete) before anything non-alphanumeric becomes "-"
  const plain = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const s = plain.replace(/\.[a-z0-9]{2,5}$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56);
  const id = /^[a-z]/.test(s) ? s : `media-${s || "file"}`.slice(0, 56).replace(/-+$/, "");
  // Contract: always a valid asset id ([a-z][a-z0-9-]{0,63}), safe in paths, markup and selectors.
  return /^[a-z][a-z0-9-]{0,63}$/.test(id) ? id : "media-file";
}

const randomToken = () => {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").toLowerCase();
};

/* ------------------------------ open a source ------------------------------ */

const GENERIC_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream", "application/binary"]);

/** File name from Content-Disposition (filename*= or filename=), if any. */
export function dispositionName(header: string | null): string | undefined {
  if (!header) return undefined;
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header)?.[1];
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)?.[1];
  const raw = (star || plain || "").trim();
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw).split(/[\\/]/).pop();
  } catch {
    return raw.split(/[\\/]/).pop();
  }
}

/**
 * Decide the file's type from everything we know, most specific first:
 * the response Content-Type (unless generic), the type ChatGPT stated, then the
 * file name's extension. A specific but disallowed response type (e.g.
 * text/html) is refused, as is an extension that contradicts the chosen type.
 * Returns the MIME type, kind and a file name that carries a matching extension.
 */
export function resolveType(responseType: string, statedMime: string | undefined, names: string[]):
  | { mime: string; kind: "video" | "audio"; name: string }
  | { error: string } {
  const allowed = (m?: string) => {
    const x = (m || "").split(";")[0].trim().toLowerCase();
    for (const kind of ["video", "audio"] as const) if (MEDIA_TYPES[kind].mimes[x]) return { mime: x, kind };
    return null;
  };
  const rt = responseType.split(";")[0].trim().toLowerCase();
  if (rt && !GENERIC_TYPES.has(rt) && !allowed(rt)) return { error: "the file is not a supported video or audio type" };
  const name = names.find((n) => n && extOf(n)) || names.find(Boolean) || "file";
  const picked = allowed(GENERIC_TYPES.has(rt) ? undefined : rt) || allowed(statedMime) || allowed(guessMime(name));
  if (!picked) return { error: "unsupported file type (video: mp4, mov, webm; audio: mp3, m4a, wav, ogg)" };
  const ext = extOf(name);
  const exts = MEDIA_TYPES[picked.kind].mimes[picked.mime];
  if (ext && guessMime(name) && !exts.includes(ext)) return { error: "the file's type does not match its name" };
  return { ...picked, name: ext && exts.includes(ext) ? name : `${name.replace(/\.[a-z0-9]{1,5}$/i, "")}.${exts[0]}` };
}

/**
 * Fetch a source (redirects followed manually, each hop re-checked, at most 3)
 * and work out its type and size. Nothing is stored yet.
 */
export async function openSource(src: ImportSource): Promise<
  | { ok: true; res: Response; mime: string; kind: "video" | "audio"; name: string; length: number }
  | { ok: false; error: string }
> {
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
  if (!res.ok || !res.body) {
    const refused = res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410;
    return {
      ok: false,
      error: !refused
        ? `could not download the file (HTTP ${res.status})`
        : src.kind === "chatgpt"
          ? "the chat file's download link has expired: attach the file again and retry straight away"
          : `the link refused the download (HTTP ${res.status}): the file is private, moved or deleted; use a publicly downloadable link`,
    };
  }
  const type = resolveType(res.headers.get("content-type") || "", src.mime, [src.name, dispositionName(res.headers.get("content-disposition")) || ""]);
  if ("error" in type) return { ok: false, error: type.error };
  const length = Number(res.headers.get("content-length"));
  const cap = MEDIA_TYPES[type.kind].cap;
  if (!Number.isFinite(length) || length <= 0)
    return { ok: false, error: "the server did not say how big the file is (no Content-Length), so it cannot be imported safely; try another link or attach the file in the chat" };
  if (length > cap) return { ok: false, error: `the file is too large (limit ${cap / MB} MB for ${type.kind})` };
  return { ok: true, res, ...type, length };
}

/** A stream that passes exactly `length` bytes (never more than `cap`) or errors. */
function countedStream(body: ReadableStream<Uint8Array>, length: number, cap: number, onCount: (n: number) => void) {
  let seen = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      seen += chunk.byteLength;
      onCount(seen);
      if (seen > length || seen > cap) ctrl.error(new Error("file larger than declared"));
      else ctrl.enqueue(chunk);
    },
  });
  const Fixed = (globalThis as any).FixedLengthStream;
  return Fixed ? body.pipeThrough(counter).pipeThrough(new Fixed(length)) : body.pipeThrough(counter);
}

/** Stream an opened source into R2 under `key`; partial objects are deleted on failure. */
export async function putToR2(env: Env, opened: { res: Response; mime: string; kind: "video" | "audio"; length: number }, key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let seen = 0;
  const body = countedStream(opened.res.body!, opened.length, MEDIA_TYPES[opened.kind].cap, (n) => (seen = n));
  try {
    await env.MEDIA.put(key, body, { httpMetadata: { contentType: opened.mime } });
  } catch {
    await env.MEDIA.delete(key).catch(() => {});
    return { ok: false, error: "the upload was interrupted or larger than declared" };
  }
  if (seen !== opened.length) {
    await env.MEDIA.delete(key).catch(() => {});
    return { ok: false, error: "the upload was incomplete" };
  }
  return { ok: true };
}

/* --------------------------------- Stream ---------------------------------- */

const streamApi = (env: Env, path: string) => `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream${path}`;
const streamHeaders = (env: Env) => ({ authorization: `Bearer ${env.STREAM_TOKEN}`, "content-type": "application/json" });

/**
 * Stream errors summarised: status, code and Stream's own message (which says
 * what was wrong), with anything token-like removed and length capped. Never
 * includes our request headers or the STREAM_TOKEN.
 */
function streamError(j: any, status: number, token?: string): string {
  const e = Array.isArray(j?.errors) ? j.errors[0] : undefined;
  let msg = typeof e?.message === "string" ? e.message : "";
  if (token) msg = msg.split(token).join("[redacted]");
  msg = msg.replace(/(token|key|secret|sig|authorization)=?\S*/gi, "[redacted]").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 200);
  return `Cloudflare Stream refused the request (${status}${e?.code ? `, code ${e.code}` : ""})${msg ? `: ${msg}` : ""}`;
}

export const streamConfigured = (env: Env) => !!(env.STREAM_TOKEN && env.CF_ACCOUNT_ID);

/**
 * Send the stored original to Stream ourselves: ask for a one-time direct-upload
 * URL, then POST the R2 object to it as multipart form data, streamed (never
 * buffered). Stream never has to fetch anything from us or from ChatGPT.
 */
export async function streamUploadFromR2(env: Env, key: string, size: number, mime: string, name: string, assetId: string, posterAt: number): Promise<{ uid: string } | { error: string }> {
  const res = await fetch(streamApi(env, "/direct_upload"), {
    method: "POST",
    headers: streamHeaders(env),
    body: JSON.stringify({ maxDurationSeconds: 21600, meta: { name: name.slice(0, 120), asset: assetId }, thumbnailTimestampPct: posterAt / 100 }),
  });
  const j = (await res.json().catch(() => ({}))) as any;
  const uid = j?.result?.uid, uploadURL = j?.result?.uploadURL;
  if (!res.ok || !j?.success || typeof uid !== "string" || !/^[a-f0-9]{32}$/.test(uid) || typeof uploadURL !== "string" || !/^https:\/\/[a-z0-9.-]+\.(videodelivery\.net|cloudflarestream\.com)\//i.test(uploadURL)) {
    const err = streamError(j, res.status, env.STREAM_TOKEN);
    console.log("stream direct_upload refused", JSON.stringify({ error: err }));
    return { error: err };
  }
  const obj = await env.MEDIA.get(key);
  if (!obj) return { error: "the stored original could not be read back" };
  const boundary = `----jb${crypto.randomUUID().replace(/-/g, "")}`;
  const enc = new TextEncoder();
  const headPart = enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName(name)}"\r\nContent-Type: ${mime}\r\n\r\n`);
  const tailPart = enc.encode(`\r\n--${boundary}--\r\n`);
  const total = headPart.byteLength + size + tailPart.byteLength;
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const pump = (async () => {
    const w = writable.getWriter();
    await w.write(headPart);
    const r = obj.body.getReader();
    for (;;) {
      const { value, done } = await r.read();
      if (done) break;
      await w.write(value);
    }
    await w.write(tailPart);
    await w.close();
  })();
  const Fixed = (globalThis as any).FixedLengthStream;
  const up = await fetch(uploadURL, {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": String(total) },
    body: Fixed ? readable.pipeThrough(new Fixed(total)) : readable,
    // Node's fetch needs this for streamed bodies; Workers ignores it.
    ...({ duplex: "half" } as any),
  });
  await pump.catch(() => {});
  if (!up.ok) {
    const uj = (await up.json().catch(() => ({}))) as any;
    const err = streamError(uj, up.status, env.STREAM_TOKEN);
    console.log("stream upload refused", JSON.stringify({ error: err }));
    return { error: err };
  }
  return { uid };
}

export async function streamDetails(env: Env, uid: string): Promise<any | { error: string }> {
  const res = await fetch(streamApi(env, `/${uid}`), { headers: streamHeaders(env) });
  const j = (await res.json().catch(() => ({}))) as any;
  return res.ok && j?.success ? j.result : { error: streamError(j, res.status, env.STREAM_TOKEN) };
}

export async function streamSetPoster(env: Env, uid: string, posterAt: number): Promise<true | { error: string }> {
  const res = await fetch(streamApi(env, `/${uid}`), { method: "POST", headers: streamHeaders(env), body: JSON.stringify({ thumbnailTimestampPct: posterAt / 100 }) });
  const j = (await res.json().catch(() => ({}))) as any;
  return res.ok && j?.success ? true : { error: streamError(j, res.status, env.STREAM_TOKEN) };
}

/**
 * Ask Stream for the video's web MP4 (idempotent: an existing download is
 * returned as-is). Returns Stream's `default` download ({status, url}).
 */
export async function streamEnableDownload(env: Env, uid: string): Promise<{ status?: string; url?: string } | { error: string }> {
  const res = await fetch(streamApi(env, `/${uid}/downloads`), { method: "POST", headers: streamHeaders(env) });
  const j = (await res.json().catch(() => ({}))) as any;
  const d = j?.result?.default;
  return res.ok && j?.success && d && typeof d === "object" ? { status: d.status, url: d.url } : { error: streamError(j, res.status, env.STREAM_TOKEN) };
}

/** Cut a new Stream video from an existing one (#27). The source is untouched. */
export async function streamClip(env: Env, uid: string, start: number, end: number, posterAt: number, name: string, assetId: string): Promise<{ uid: string } | { error: string }> {
  const res = await fetch(streamApi(env, "/clip"), {
    method: "POST",
    headers: streamHeaders(env),
    body: JSON.stringify({ clippedFromVideoUID: uid, startTimeSeconds: start, endTimeSeconds: end, thumbnailTimestampPct: posterAt / 100, meta: { name: name.slice(0, 120), asset: assetId } }),
  });
  const j = (await res.json().catch(() => ({}))) as any;
  const clip = j?.result?.uid;
  if (!res.ok || !j?.success || typeof clip !== "string" || !/^[a-f0-9]{32}$/.test(clip)) return { error: streamError(j, res.status, env.STREAM_TOKEN) };
  return { uid: clip };
}

/** poster_at: whole-number percent 0-100 (default 10). */
export const posterPercent = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 10);

/* ------------------------------- import one -------------------------------- */

/**
 * Store one source; returns the media fields for the asset (see assets.ts).
 * The type is settled from the response, so links without an extension work.
 */
export async function storeSource(env: Env, src: ImportSource, idFor: (resolvedName: string) => Promise<string>, posterAt: number) {
  if (!env.API_KEY) return { error: "imports are disabled until the API key is configured" } as const;
  const opened = await openSource(src);
  if (!opened.ok) return { error: opened.error } as const;
  // The id is chosen once the real file name is known (links like ".../raw" name the file in their headers).
  const assetId = await idFor(opened.name);
  if (opened.kind === "video" && !streamConfigured(env)) {
    await opened.res.body?.cancel().catch(() => {});
    return { error: "video import needs Cloudflare Stream to be configured" } as const;
  }
  const prefix = opened.kind === "audio" ? "imports" : "masters";
  const key = `${prefix}/${assetId}/${randomToken()}/${safeName(opened.name)}`;
  const put = await putToR2(env, opened, key);
  if (!put.ok) return { error: put.error } as const;
  const source = { kind: src.kind, name: opened.name.slice(0, 120) };
  if (opened.kind === "audio") return { assetId, media: { type: "audio" as const, file: key, master: key, status: "ready" as const, size: opened.length, source } };
  const s = await streamUploadFromR2(env, key, opened.length, opened.mime, opened.name, assetId, posterAt);
  if ("error" in s) {
    await env.MEDIA.delete(key).catch(() => {});
    return { error: s.error } as const;
  }
  return { assetId, media: { type: "video" as const, file: s.uid, master: key, status: "processing" as const, size: opened.length, source } };
}

/** MIME from extension (used as the last resort in resolveType). */
export function guessMime(name: string): string | undefined {
  const ext = extOf(name);
  for (const kind of ["video", "audio"] as const)
    for (const [mime, exts] of Object.entries(MEDIA_TYPES[kind].mimes)) if (exts.includes(ext)) return mime;
  return undefined;
}
