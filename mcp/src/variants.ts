/**
 * Page variants: unpublished alternative presentations of a live page.
 *
 * A variant (collection `variants`) stores only references to the base page's
 * sections (by persisted section `key`) plus its own order, `style` and
 * `design`. Copy is never duplicated: `variantToPage()` rebuilds an ordinary
 * page document from the live base page at read time, and both the preview
 * route and publishing go through it, so there is one rendering path.
 *
 * Everything here is pure (no D1 access) so it can be unit-tested directly.
 */
import { presentationWarnings, sanitizePresentation } from "./presentation";

/** Page and variant ids: lowercase slug, safe in a URL path segment. */
export const ID_RE = /^[a-z][a-z0-9-]{0,63}$/;
/** Persisted section keys. */
export const KEY_RE = /^[a-z][a-z0-9-]{0,39}$/;
/** Preview tokens: 18 random bytes, base64url without padding = 24 chars. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{24}$/;
/** Maximum number of variants per base page (feature request #6). */
export const MAX_VARIANTS_PER_BASE = 3;

export const isValidId = (s: unknown): s is string => typeof s === "string" && ID_RE.test(s);

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const sectionsOf = (page: any): any[] => (Array.isArray(page?.sections) ? page.sections : []);

/**
 * Give every section a stable, unique `key` (`<type>-<n>`, lowest unused n)
 * without ever changing a valid existing key. Invalid or duplicate keys are
 * replaced and reported. Runs in the central write path for `pages`, so keys
 * survive inserts and reorders; keys are never rendered.
 */
export function ensureSectionKeys(page: any): { page: any; changed: boolean; replaced: string[] } {
  if (!isObject(page) || !Array.isArray(page.sections)) return { page, changed: false, replaced: [] };
  const used = new Set<string>();
  const needsKey: number[] = [];
  const replaced: string[] = [];
  page.sections.forEach((s: any, i: number) => {
    if (!isObject(s)) return;
    if (typeof s.key === "string" && KEY_RE.test(s.key) && !used.has(s.key)) used.add(s.key);
    else {
      if (s.key !== undefined) replaced.push(String(s.key).slice(0, 40));
      needsKey.push(i);
    }
  });
  if (!needsKey.length) return { page, changed: false, replaced };
  const sections = page.sections.slice();
  for (const i of needsKey) {
    const type = typeof sections[i].type === "string" && /^[a-z]+$/.test(sections[i].type) ? sections[i].type : "section";
    let n = 1;
    while (used.has(`${type}-${n}`)) n++;
    used.add(`${type}-${n}`);
    sections[i] = { ...sections[i], key: `${type}-${n}` };
  }
  return { page: { ...page, sections }, changed: true, replaced };
}

/** Short human description of each base section, for listing to assistants. */
export function sectionSummaries(page: any): Array<{ key: string; type: string; heading: string }> {
  return sectionsOf(page)
    .filter((s) => isObject(s) && typeof s.key === "string")
    .map((s) => {
      const text = String(s.heading || s.statement || s.quote || s.title || "");
      return { key: s.key, type: String(s.type || ""), heading: text.length > 48 ? text.slice(0, 45) + "..." : text };
    });
}

/**
 * Rebuild an ordinary page document from the live base page and a variant.
 * Each referenced base section is used as-is except that its `style` is
 * REPLACED (not merged) by the variant entry's `style`. The page `design` is
 * replaced by the variant's. Unresolved references are skipped and listed;
 * base sections the variant does not reference are listed as `dropped`.
 */
export function variantToPage(base: any, variant: any): { page: any; unresolved: string[]; dropped: string[] } {
  const byKey = new Map<string, any>();
  for (const s of sectionsOf(base)) if (isObject(s) && typeof s.key === "string") byKey.set(s.key, s);
  const referenced = new Set<string>();
  const unresolved: string[] = [];
  const sections: any[] = [];
  for (const entry of Array.isArray(variant?.sections) ? variant.sections : []) {
    const from = isObject(entry) && typeof entry.from === "string" ? entry.from : null;
    const src = from !== null ? byKey.get(from) : undefined;
    if (!src || referenced.has(from!)) {
      unresolved.push(from === null ? "(entry without a 'from' key)" : referenced.has(from) ? `${from.slice(0, 40)} (repeated)` : from.slice(0, 40));
      continue;
    }
    referenced.add(from!);
    const { style: _baseStyle, ...rest } = src;
    sections.push(entry.style === undefined ? rest : { ...rest, style: entry.style });
  }
  const dropped = [...byKey.keys()].filter((k) => !referenced.has(k));
  const { design: _baseDesign, ...baseRest } = isObject(base) ? base : ({} as any);
  const page = { ...baseRest, ...(variant?.design !== undefined ? { design: variant.design } : {}), sections };
  return { page, unresolved, dropped };
}

/**
 * The page that publishing a variant would write, or a refusal. Publishing is
 * refused while any reference is unresolved, and every style/design is reduced
 * to allowlisted values so nothing unvetted reaches a live page.
 */
export function publishedPage(base: any, variant: any):
  | { ok: false; unresolved: string[] }
  | { ok: true; page: any; dropped: string[]; stripped: string[] } {
  const { page, unresolved, dropped } = variantToPage(base, variant);
  if (unresolved.length) return { ok: false, unresolved };
  const stripped = presentationWarnings(page);
  const sections = page.sections.map((s: any) => {
    const { style, ...rest } = s;
    const clean = sanitizePresentation(style, "style", typeof s.type === "string" ? s.type : undefined);
    return clean ? { ...rest, style: clean } : rest;
  });
  const { design, ...rest } = page;
  const cleanDesign = sanitizePresentation(design, "design");
  return { ok: true, page: { ...rest, ...(cleanDesign ? { design: cleanDesign } : {}), sections }, dropped, stripped };
}

/** A new variant that references every base section, in order, unstyled. */
export function newVariant(base: any, meta: { base: string; label: string; note?: string }) {
  return {
    base: meta.base,
    label: meta.label,
    ...(meta.note ? { note: meta.note } : {}),
    token: generateToken(),
    sections: sectionsOf(base)
      .filter((s) => isObject(s) && typeof s.key === "string")
      .map((s) => ({ from: s.key })),
  };
}

export function generateToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time comparison (for equal-length inputs) of a presented token. */
export function tokensEqual(presented: string, stored: unknown): boolean {
  if (typeof stored !== "string" || !TOKEN_RE.test(presented) || !TOKEN_RE.test(stored)) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i++) diff |= presented.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}

/**
 * Applied on EVERY write to `variants` (write, merge, REST, create, undo
 * restore): the server-generated `token` cannot be set, changed or removed by
 * a client, and `base` cannot change once set. Clients' values are discarded.
 */
export function prepareVariantWrite(prev: any | null, next: any): any {
  if (!isObject(next)) return next;
  const out: Record<string, any> = { ...next };
  out.token = isObject(prev) && typeof prev.token === "string" && TOKEN_RE.test(prev.token) ? prev.token : generateToken();
  if (isObject(prev) && typeof prev.base === "string") out.base = prev.base;
  return out;
}

export const previewPath = (id: string, token: string) => `/preview/${encodeURIComponent(id)}/${encodeURIComponent(token)}`;
