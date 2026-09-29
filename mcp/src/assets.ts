/**
 * Visual asset library (collection `assets`) and the consent rule for
 * featuring people (Sprint 13, request #23).
 *
 * An asset describes one photograph, video or audio file for design use:
 * what it shows, how it can be used, and whether the people in it have agreed.
 * Pages refer to an asset as `asset:<id>` anywhere an image, poster or
 * portrait is expected; the renderer resolves the reference and shows the
 * file ONLY when consent is `granted` or `not-needed` (and not expired).
 * Bare filenames keep working as before and are not consent-checked.
 *
 * Everything here is pure, for direct unit testing.
 */

export const ASSET_OPTIONS = {
  type: ["image", "video", "audio"],
  orientation: ["portrait", "landscape", "square"],
  usage: ["julie-portrait", "julie-singing", "teaching", "singer", "community", "backstage", "concert", "venue", "atmosphere"],
  roles: ["hero", "background", "collage", "testimonial-portrait", "poster", "tile"],
  consent: ["granted", "not-needed", "pending", "refused"],
  suits: ["desktop", "mobile"],
} as const;

/** What each consent value means (shown to assistants). */
export const CONSENT_MEANINGS: Record<string, string> = {
  granted: "Everyone identifiable has agreed to this use (record who/when/how in consent_note).",
  "not-needed": "No identifiable people other than Julie (e.g. her own portraits, venues, details).",
  pending: "Not yet confirmed: the asset is NOT shown on the site until consent is granted.",
  refused: "Must not be used; never shown.",
};

export const ASSET_REF_RE = /^asset:([a-z][a-z0-9-]{0,63})$/;
export const assetIdOf = (v: unknown): string | null => {
  const m = typeof v === "string" ? ASSET_REF_RE.exec(v) : null;
  return m ? m[1] : null;
};

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const FOCUS_RE = /^\d{1,3}% \d{1,3}%$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * May this asset be shown? Consent must be granted or not needed, and an
 * expiry date (consent_expires, YYYY-MM-DD) must not have passed.
 */
export function consentOk(asset: unknown, today: Date = new Date()): boolean {
  if (!isObject(asset)) return false;
  if (asset.consent !== "granted" && asset.consent !== "not-needed") return false;
  if (typeof asset.consent_expires === "string" && DATE_RE.test(asset.consent_expires)) {
    if (new Date(asset.consent_expires + "T23:59:59Z").getTime() < today.getTime()) return false;
  }
  return true;
}

/** Testimonials need explicit agreement: only `granted` (and not expired). */
export function testimonialConsentOk(t: unknown, today: Date = new Date()): boolean {
  return isObject(t) && t.consent === "granted" && consentOk(t, today);
}

function enumWarnings(doc: Record<string, any>, key: keyof typeof ASSET_OPTIONS, many: boolean, out: string[]) {
  const allowed = ASSET_OPTIONS[key] as readonly string[];
  const v = doc[key];
  if (v === undefined) return;
  const vals = many ? (Array.isArray(v) ? v : [v]) : [v];
  for (const x of vals) if (!allowed.includes(x)) out.push(`${key}: ${JSON.stringify(x)} is not allowed (use ${allowed.join(" | ")}).`);
}

/** Problems with an asset document, returned as write warnings. */
export function assetWarnings(doc: unknown): string[] {
  if (!isObject(doc)) return ["asset must be a JSON object."];
  const out: string[] = [];
  if (typeof doc.file !== "string" || !doc.file) out.push("file is required (a filename in /assets, a media key, or a Stream video id).");
  if (doc.type === "image" && (typeof doc.alt !== "string" || !doc.alt.trim())) out.push("alt text is required for images (what the photograph shows).");
  if (doc.type === "video" && (typeof doc.alt !== "string" || !doc.alt.trim())) out.push("alt text is recommended for videos (what the poster shows).");
  if (doc.consent === undefined) out.push("consent is required (granted | not-needed | pending | refused); until set, the asset is not shown.");
  enumWarnings(doc, "type", false, out);
  enumWarnings(doc, "orientation", false, out);
  enumWarnings(doc, "consent", false, out);
  enumWarnings(doc, "usage", true, out);
  enumWarnings(doc, "roles", true, out);
  enumWarnings(doc, "suits", true, out);
  if (doc.focus !== undefined && !(typeof doc.focus === "string" && FOCUS_RE.test(doc.focus))) out.push('focus must look like "60% 20%".');
  if (doc.consent_expires !== undefined && !(typeof doc.consent_expires === "string" && DATE_RE.test(doc.consent_expires)))
    out.push("consent_expires must be a date like 2027-12-31.");
  if (doc.consent === "granted" && !doc.consent_note) out.push("consent_note is recommended: who agreed, when and how.");
  return out;
}

/** Problems with a testimonial document, returned as write warnings. */
export function testimonialWarnings(doc: unknown): string[] {
  if (!isObject(doc)) return ["testimonial must be a JSON object."];
  const out: string[] = [];
  if (typeof doc.name !== "string" || !doc.name.trim()) out.push("name is required.");
  if (typeof doc.quote !== "string" || !doc.quote.trim()) out.push("quote is required.");
  if (!["granted", "pending", "refused"].includes(doc.consent)) out.push("consent is required (granted | pending | refused); only granted testimonials are shown.");
  if (doc.portrait !== undefined && !assetIdOf(doc.portrait)) out.push('portrait must be an asset reference like "asset:eve-portrait".');
  if (doc.consent_expires !== undefined && !(typeof doc.consent_expires === "string" && DATE_RE.test(doc.consent_expires)))
    out.push("consent_expires must be a date like 2027-12-31.");
  return out;
}

export interface AssetQuery { q?: string; type?: string; usage?: string; role?: string; orientation?: string; consent?: string; suits?: string; usable?: boolean }

/** Filter asset rows for search_assets. Text search covers title, alt, people, setting, tone and notes. */
export function searchAssets(rows: Array<{ id: string; doc: any }>, query: AssetQuery) {
  const q = (query.q || "").toLowerCase().trim();
  const has = (v: unknown, x: string) => (Array.isArray(v) ? v.includes(x) : v === x);
  return rows
    .filter(({ doc }) => isObject(doc))
    .filter(({ doc }) => !query.type || doc.type === query.type)
    .filter(({ doc }) => !query.usage || has(doc.usage, query.usage))
    .filter(({ doc }) => !query.role || has(doc.roles, query.role))
    .filter(({ doc }) => !query.orientation || doc.orientation === query.orientation)
    .filter(({ doc }) => !query.consent || doc.consent === query.consent)
    .filter(({ doc }) => !query.suits || has(doc.suits, query.suits))
    .filter(({ doc }) => !query.usable || consentOk(doc))
    .filter(({ id, doc }) => {
      if (!q) return true;
      const hay = [id, doc.title, doc.alt, doc.setting, doc.lighting, doc.notes, ...(doc.people || []), ...(doc.tone || [])].join(" ").toLowerCase();
      return q.split(/\s+/).every((w) => hay.includes(w));
    })
    .map(({ id, doc }) => ({
      ref: `asset:${id}`, title: doc.title, type: doc.type, file: doc.file, orientation: doc.orientation, focus: doc.focus,
      usage: doc.usage, roles: doc.roles, people: doc.people, consent: doc.consent, usable: consentOk(doc),
    }));
}

/* ---------------------- Imported media (Sprint 16) ----------------------- */

/** Media fields an import may set or replace; everything else on an asset is kept. */
export const MEDIA_FIELDS = ["file", "master", "status", "size", "duration", "width", "height", "orientation", "thumbnail", "source", "mp4", "mp4_status"] as const;
export const MEDIA_STATUS = ["processing", "ready", "error"] as const;
const STREAM_UID_RE = /^[a-f0-9]{32}$/;

/** Plain text: strings only, control characters removed, trimmed, capped. */
export function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  return t ? t.slice(0, max) : undefined;
}

export interface ImportedMedia {
  type: "video" | "audio";
  file: string;
  master: string;
  status: (typeof MEDIA_STATUS)[number];
  size?: number;
  source: { kind: "chatgpt" | "url"; name: string };
}
export interface ImportMeta {
  title?: unknown; alt?: unknown; consent?: unknown; consent_note?: unknown; usage?: unknown; roles?: unknown; caption?: unknown; transcript?: unknown;
}

/** A new asset record for imported media. Consent defaults to pending; granted needs a note. */
export function buildImportedAsset(media: ImportedMedia, meta: ImportMeta): { doc: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = [];
  let consent = typeof meta.consent === "string" && (ASSET_OPTIONS.consent as readonly string[]).includes(meta.consent) ? meta.consent : "pending";
  const note = cleanText(meta.consent_note, 500);
  if (consent === "granted" && !note) {
    consent = "pending";
    warnings.push("consent kept as pending: granted needs a consent_note saying who agreed, when and how.");
  }
  const list = (v: unknown, allowed: readonly string[]) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && allowed.includes(x)) : undefined);
  // Accessibility (same rule as content-model.md "Importing video and audio"):
  //   alt        - videos: what the poster shows (recommended; warning if missing)
  //   caption    - visible text under the player (optional)
  //   transcript - speech or lyrics, video or audio (recommended; warning if missing)
  if (media.type === "video" && !cleanText(meta.alt, 300)) warnings.push("add alt: describe what the video's poster shows (used as its alternative text).");
  if (!cleanText(meta.transcript, 20000)) warnings.push(`add a transcript if the ${media.type} has speech or lyrics.`);
  const doc: Record<string, unknown> = {
    ...media,
    title: cleanText(meta.title, 120) || media.source.name,
    ...(cleanText(meta.alt, 300) ? { alt: cleanText(meta.alt, 300) } : {}),
    ...(cleanText(meta.caption, 300) ? { caption: cleanText(meta.caption, 300) } : {}),
    ...(cleanText(meta.transcript, 20000) ? { transcript: cleanText(meta.transcript, 20000) } : {}),
    consent,
    ...(note ? { consent_note: note } : {}),
    ...(list(meta.usage, ASSET_OPTIONS.usage)?.length ? { usage: list(meta.usage, ASSET_OPTIONS.usage) } : {}),
    ...(list(meta.roles, ASSET_OPTIONS.roles)?.length ? { roles: list(meta.roles, ASSET_OPTIONS.roles) } : {}),
  };
  return { doc, warnings };
}

/**
 * Replace a placeholder's media, keeping everything else (title, alt, consent,
 * usage, roles, suits, caption, transcript, notes). The previous file/master go
 * to previous_files (newest first, at most 5) for rollback and manual cleanup.
 */
export function replaceAssetMedia(prev: Record<string, any>, media: ImportedMedia, now = new Date().toISOString()): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(prev)) if (!(MEDIA_FIELDS as readonly string[]).includes(k)) kept[k] = v;
  const history = [
    ...(prev.file ? [{ file: prev.file, master: prev.master, replaced_at: now }] : []),
    ...(Array.isArray(prev.previous_files) ? prev.previous_files : []),
  ].slice(0, 5);
  return { ...kept, ...media, previous_files: history };
}

export const orientationOf = (w: number, h: number) => (w > h ? "landscape" : w < h ? "portrait" : "square");
export const streamThumbnail = (uid: string) => (STREAM_UID_RE.test(uid) ? `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg` : undefined);
export const streamIframe = (uid: string) => (STREAM_UID_RE.test(uid) ? `https://iframe.videodelivery.net/${uid}` : undefined);

// Stream's web MP4 for one video: exactly this shape, for this video's own uid.
const STREAM_MP4_RE = /^https:\/\/customer-[a-z0-9]{1,64}\.cloudflarestream\.com\/([a-f0-9]{32})\/downloads\/default\.mp4$/;
export function isStreamMp4(url: unknown, uid: unknown): url is string {
  if (typeof url !== "string" || typeof uid !== "string" || !STREAM_UID_RE.test(uid)) return false;
  const m = STREAM_MP4_RE.exec(url);
  return !!m && m[1] === uid;
}

/**
 * Fold Stream's download state into a video asset: `mp4_status` is
 * processing | ready | error, and `mp4` is kept only when it is a valid web MP4
 * for this asset's uid.
 */
export function applyStreamDownload(asset: Record<string, any>, d: any): Record<string, unknown> {
  const out: Record<string, unknown> = { ...asset };
  delete out.mp4;
  if (!d || d.error) {
    out.mp4_status = "error";
    return out;
  }
  if (d.status === "ready") {
    if (isStreamMp4(d.url, asset.file)) Object.assign(out, { mp4: d.url, mp4_status: "ready" });
    else out.mp4_status = "error";
  } else out.mp4_status = d.status === "error" ? "error" : "processing";
  return out;
}

/** Fold Stream's video details into an asset: validated numbers only; thumbnail derived from the uid. */
export function applyStreamDetails(asset: Record<string, any>, d: any): Record<string, unknown> {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
  const width = num(d?.input?.width), height = num(d?.input?.height);
  const out: Record<string, unknown> = { ...asset };
  const duration = num(d?.duration), size = num(d?.size);
  if (duration !== undefined) out.duration = Math.round(duration * 10) / 10;
  if (size !== undefined) out.size = size;
  if (width && height) Object.assign(out, { width, height, orientation: orientationOf(width, height) });
  const thumb = streamThumbnail(String(asset.file || ""));
  if (thumb) out.thumbnail = thumb;
  out.status = d?.status?.state === "error" ? "error" : d?.readyToStream === true ? "ready" : "processing";
  return out;
}
