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
  inherit: "Derivatives only (derive_video): follows the master video's consent, live. If the master is not shown, neither is the derivative.",
};

/**
 * Set by the loader (never by JSON) on a derivative: whether its master may be
 * shown right now. consentOk honours `consent: "inherit"` only through this.
 */
export const MASTER_CONSENT = Symbol("masterConsent");

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
  if (asset.consent === "inherit") {
    if (typeof asset.derived_from !== "string" || (asset as any)[MASTER_CONSENT] !== true) return false;
  } else if (asset.consent !== "granted" && asset.consent !== "not-needed") return false;
  if (typeof asset.consent_expires === "string" && DATE_RE.test(asset.consent_expires)) {
    if (new Date(asset.consent_expires + "T23:59:59Z").getTime() < today.getTime()) return false;
  }
  return true;
}

/**
 * Attach each derivative's live master consent (depth 1: a master that is
 * itself a derivative never counts). `masters` holds the loaded master docs.
 */
export function linkMasters(assets: Iterable<any>, masters: Map<string, any>, today: Date = new Date()): void {
  for (const a of assets) {
    if (!isObject(a) || a.consent !== "inherit" || typeof a.derived_from !== "string") continue;
    const m = masters.get(a.derived_from);
    (a as any)[MASTER_CONSENT] = isObject(m) && m.consent !== "inherit" && consentOk(m, today);
  }
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
  if (doc.consent === "inherit") {
    if (typeof doc.derived_from !== "string") out.push('consent "inherit" is only for derivatives made by derive_video; this asset will not be shown.');
  } else enumWarnings(doc, "consent", false, out);
  if (typeof doc.derived_from === "string" && doc.consent !== "inherit")
    out.push('this is a derivative: keep consent "inherit" so it follows its master video.');
  if (doc.edit !== undefined && !validEdit(doc.edit, doc.duration)) out.push("edit is not valid (start/end seconds, optional crop {x,y,w,h} percent, speed 0.5 | 0.75 | 1); crop and speed are ignored.");
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
      ...(typeof doc.derived_from === "string" ? { derived_from: doc.derived_from, edit: doc.edit } : {}),
    }));
}

/** Keep only allowed vocabulary values. */
const list = (v: unknown, allowed: readonly string[]) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && allowed.includes(x)) : undefined);
/** Free-text lists: at most 12 cleaned strings. */
const textList = (v: unknown, max = 80) => (Array.isArray(v) ? (v.map((x) => cleanText(x, max)).filter(Boolean) as string[]).slice(0, 12) : undefined);

/**
 * The descriptive metadata of an asset, re-validated (shared by imports and
 * derivatives): cleaned text, vocabulary arrays filtered, lists capped.
 * Empty values are omitted.
 */
export function describeAsset(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => { if (v !== undefined && !(Array.isArray(v) && !v.length)) out[k] = v; };
  put("alt", cleanText(src.alt, 300));
  put("setting", cleanText(src.setting, 200));
  put("people", textList(src.people));
  put("tone", textList(src.tone, 40));
  put("usage", list(src.usage, ASSET_OPTIONS.usage));
  put("roles", list(src.roles, ASSET_OPTIONS.roles));
  put("suits", list(src.suits, ASSET_OPTIONS.suits));
  return out;
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
    ...describeAsset({ usage: meta.usage, roles: meta.roles }),
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

/* ---------------------- Video derivatives (Sprint 19) --------------------- */

export const MAX_CLIP_SECONDS = 60;
export const MAX_DERIVATIVES = 20;
export const SPEEDS = [0.5, 0.75, 1] as const;

export interface Crop { x: number; y: number; w: number; h: number }
export interface Edit { start: number; end: number; crop?: Crop; speed?: number }

const int = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);

/** A crop rectangle in whole-number percent of the source frame, or an error. */
export function parseCrop(c: unknown): Crop | string {
  if (!isObject(c)) return "crop must be an object {x, y, w, h} in whole-number percent of the frame";
  const x = int(c.x, 0, 90), y = int(c.y, 0, 90), w = int(c.w, 10, 100), h = int(c.h, 10, 100);
  if (x === undefined || y === undefined || w === undefined || h === undefined) return "crop x and y must be whole numbers 0-90, w and h whole numbers 10-100";
  if (x + w > 100 || y + h > 100) return "crop must stay inside the frame (x + w and y + h at most 100)";
  return { x, y, w, h };
}

/** Validate derive_video's edit; returns the edit or a precise error. */
export function parseEdit(e: { start?: unknown; end?: unknown; crop?: unknown; speed?: unknown }, duration?: unknown): Edit | string {
  const { start, end } = e;
  if (typeof start !== "number" || !Number.isFinite(start) || start < 0) return "start must be a number of seconds, 0 or more";
  if (typeof end !== "number" || !Number.isFinite(end) || end <= start) return "end must be a number of seconds after start";
  const len = end - start;
  if (len < 1 || len > MAX_CLIP_SECONDS) return `the excerpt must be 1-${MAX_CLIP_SECONDS} seconds long (it is ${Math.round(len * 10) / 10})`;
  if (typeof duration === "number" && Number.isFinite(duration) && end > duration + 0.5) return `end is after the end of the video (${duration} s)`;
  const out: Edit = { start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10 };
  if (e.crop !== undefined && e.crop !== null) {
    const c = parseCrop(e.crop);
    if (typeof c === "string") return c;
    out.crop = c;
  }
  if (e.speed !== undefined && e.speed !== null) {
    if (!(SPEEDS as readonly unknown[]).includes(e.speed)) return "speed must be 0.5, 0.75 or 1";
    if (e.speed !== 1) out.speed = e.speed as number;
  }
  return out;
}

/** Is a stored edit still valid? (Assets are editable, so render re-checks.) */
export const validEdit = (e: unknown, duration?: unknown) => isObject(e) && typeof parseEdit(e, duration) !== "string";

/** A new derivative asset: descriptive metadata from the master, consent inherited. */
export function buildDerivedAsset(master: Record<string, any>, masterId: string, uid: string, edit: Edit, title?: unknown): Record<string, unknown> {
  const base = cleanText(master.title, 100) || masterId;
  return {
    type: "video",
    file: uid,
    status: "processing",
    title: cleanText(title, 120) || `${base} (excerpt)`,
    ...describeAsset(master),
    derived_from: masterId,
    edit,
    muted: true,
    consent: "inherit",
  };
}

/** A still frame of a Stream video at `t` seconds (the asset's own timeline). */
export const streamFrame = (uid: string, t: number) =>
  STREAM_UID_RE.test(uid) && Number.isFinite(t) && t >= 0 ? `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg?time=${Math.round(t * 10) / 10}s&height=480` : undefined;

/** Pixels needed across a crop before it looks sharp in a wide or full-width frame. */
export const SHARP_WIDTH = 1000;

/**
 * Advice for the assistant about sharpness, from the real pixel size of what
 * will be shown (the whole frame, or the crop of it).
 */
export function resolutionAdvice(width: unknown, height: unknown, crop?: Crop): string[] {
  const px = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;
  if (!px(width) || !px(height)) return [];
  const w = Math.round(crop ? ((width as number) * crop.w) / 100 : (width as number));
  const h = Math.round(crop ? ((height as number) * crop.h) / 100 : (height as number));
  if (w >= SHARP_WIDTH) return [];
  const what = crop ? `The cropped area is only ${w}×${h} pixels` : `This video is only ${w}×${h} pixels`;
  return [
    `${what}, so it will look soft in a wide or full-width frame (media_ratio wide/cinematic, width full, or playback background). It is fine in a small portrait frame. For anything prominent, ask Julie for the original, higher-resolution footage rather than cropping this one.`,
  ];
}
