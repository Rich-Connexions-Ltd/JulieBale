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
