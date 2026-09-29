/**
 * Landing-page sanitiser (Sprint 15).
 *
 * Landing pages (collection `landing`, served at /l/{slug}) are raw HTML written
 * through the authenticated API. Everything is sanitised at RENDER time, so any
 * stored document is safe to serve; `landingWarnings()` runs the same policy at
 * write time to tell authors what will be removed.
 *
 * Policy (canonical description for authors: context/content-model.md,
 * "Landing pages"): a small allowlist of passive tags and attributes, ids
 * namespaced with "l-", URLs checked per attribute, and CSS reduced to an
 * allowlist of properties with every selector scoped under `.landing` and no
 * url() of any kind. Nothing here can execute script or load third-party content.
 *
 * Units: htmlPolicy (constants), urlPolicy, cssPolicy, rewriteLandingIds,
 * NoteCollector, then the public functions extractLanding,
 * sanitizeLandingHtml, sanitizeLandingCss and landingWarnings.
 */
import { FilterXSS, escapeAttrValue, friendlyAttrValue } from "xss";

/* ------------------------------ htmlPolicy ------------------------------ */

/** Tags used by the existing landing page (baseline) plus a named passive extension. */
export const LANDING_TAGS = {
  baseline: ["section", "header", "footer", "aside", "div", "span", "p", "h1", "h2", "h3", "strong", "br", "a", "form", "label", "input", "button"],
  extension: ["h4", "em", "ul", "ol", "li", "img"],
};
const ALL_TAGS = [...LANDING_TAGS.baseline, ...LANDING_TAGS.extension];
/** Removed together with everything inside them. */
export const LANDING_STRIPPED_WITH_CONTENT = ["script", "style", "noscript", "template", "iframe", "object", "embed", "svg", "math"];
export const LANDING_GLOBAL_ATTRS = ["class", "id", "title", "lang", "aria-label", "aria-hidden", "style"];
export const LANDING_TAG_ATTRS: Record<string, string[]> = {
  a: ["href"],
  img: ["src", "alt", "width", "height", "loading"],
  form: ["action", "method"],
  input: ["type", "name", "value", "placeholder", "required", "checked", "autocomplete"],
  label: ["for"],
  button: ["type"],
};
export const LANDING_INPUT_TYPES = ["text", "email", "tel", "number", "radio", "checkbox", "submit"];
export const LANDING_AUTOCOMPLETE = ["name", "given-name", "family-name", "email", "tel", "off"];
export const LANDING_IMG_PREFIXES = ["/assets/", "/media/"];
const TOKEN_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/* ------------------------------ NoteCollector ---------------------------- */

/** Generic, structural notes about removals: never echoes values or payload text. */
class NoteCollector {
  private notes = new Set<string>();
  add(note: string) {
    if (this.notes.size < 30) this.notes.add(note);
  }
  list() {
    return [...this.notes];
  }
}

/* ------------------------------- urlPolicy ------------------------------- */

const BASE = "https://site.invalid/";

/**
 * Decode entities and reject anything that could be reinterpreted: backslashes
 * (browsers treat "\" like "/"), whitespace/control characters (used to split
 * "java script:"), and protocol-relative "//host" URLs.
 */
function decodedUrl(raw: string): string | null {
  const v = friendlyAttrValue(raw).trim();
  if (!v || /[\\\s\u0000-\u001f\u007f]/.test(v) || v.startsWith("//")) return null;
  return v;
}
function parse(v: string): URL | null {
  try {
    return new URL(v, BASE);
  } catch {
    return null;
  }
}
const sameOrigin = (u: URL) => u.origin === new URL(BASE).origin;

export const urlPolicy = {
  /** a href: fragment, same-origin path, mailto:, tel:, or explicit absolute https:. */
  link(raw: string): string | null {
    const v = decodedUrl(raw);
    if (!v) return null;
    if (v.startsWith("#")) return TOKEN_RE.test(v.slice(1)) ? `#l-${v.slice(1)}` : null;
    const u = parse(v);
    if (!u) return null;
    if (/^(mailto|tel):/i.test(v)) return v;
    // keep the author's (validated) text rather than a normalised form
    if (/^https:\/\//i.test(v)) return u.protocol === "https:" && u.hostname ? v : null;
    if (v.startsWith("/") && sameOrigin(u)) return u.pathname + u.search + u.hash;
    return null;
  },
  /** img src: same-origin static files under /assets/ or /media/ only. */
  image(raw: string): string | null {
    const v = decodedUrl(raw);
    if (!v || !v.startsWith("/")) return null;
    const u = parse(v);
    if (!u || !sameOrigin(u)) return null;
    return LANDING_IMG_PREFIXES.some((p) => u.pathname.startsWith(p)) && !u.pathname.includes("..") ? u.pathname : null;
  },
  /** form action: fragment or same-origin path only. */
  formAction(raw: string): string | null {
    const v = decodedUrl(raw);
    if (!v) return null;
    if (v.startsWith("#")) return TOKEN_RE.test(v.slice(1)) ? `#l-${v.slice(1)}` : null;
    const u = v.startsWith("/") ? parse(v) : null;
    return u && sameOrigin(u) ? u.pathname + u.search : null;
  },
};

/* ------------------------------- cssPolicy ------------------------------- */

/** Properties used by the existing landing page (baseline) plus a named extension. */
export const LANDING_CSS_PROPERTIES = {
  baseline: [
    "align-items", "backdrop-filter", "background", "border", "border-bottom", "border-color", "border-left", "border-radius", "border-top",
    "bottom", "box-shadow", "box-sizing", "color", "content", "cursor", "display", "filter", "flex-wrap", "font", "font-family", "font-size",
    "font-weight", "gap", "grid-template-columns", "height", "justify-content", "letter-spacing", "line-height", "margin", "margin-bottom",
    "margin-right", "margin-top", "max-width", "min-height", "outline", "overflow", "padding", "padding-bottom", "padding-top", "position",
    "right", "scroll-behavior", "scroll-margin-top", "text-decoration", "text-transform", "top", "transform", "transition", "width", "z-index",
  ],
  extension: [
    "text-align", "font-style", "opacity", "left", "margin-left", "padding-left", "padding-right", "background-color", "flex", "flex-direction",
    "list-style", "white-space", "min-width", "grid-column",
  ],
};
const CSS_PROPS = new Set([...LANDING_CSS_PROPERTIES.baseline, ...LANDING_CSS_PROPERTIES.extension]);
export const LANDING_POSITIONS = ["static", "relative", "absolute", "sticky"];
// Anything that could load a resource, run code, or escape the value context.
const BANNED_VALUE = /url\(|image-set\(|expression|javascript:|vbscript:|attr\(|[@<\\{}]/i;

export const cssPolicy = {
  /** One declaration "prop: value" -> safe text, or null (and a note). */
  declaration(decl: string, notes: NoteCollector): string | null {
    const i = decl.indexOf(":");
    if (i < 0) return null;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim();
    if (!value) return null;
    const custom = /^--[a-z0-9-]{1,40}$/.test(prop);
    if (!custom && !CSS_PROPS.has(prop)) return notes.add("removed a CSS property that is not allowed"), null;
    if (BANNED_VALUE.test(value)) return notes.add("removed a CSS value containing url(), escapes or other active content"), null;
    const bare = value.replace(/\s*!important\s*$/i, "").trim().toLowerCase();
    if (prop === "position" && !LANDING_POSITIONS.includes(bare)) return notes.add("removed position: fixed (or other disallowed position)"), null;
    if (prop === "z-index" && !(bare === "auto" || (/^\d{1,2}$/.test(bare) && Number(bare) <= 20))) return notes.add("removed a z-index above 20"), null;
    return `${prop}: ${value}`;
  },
  /** Scope one selector under .landing, namespacing ids. */
  selector(sel: string): string | null {
    const s = sel.trim();
    if (!s || /[<@{}\\]|url\(/i.test(s)) return null;
    const ids = s.replace(/#([A-Za-z][A-Za-z0-9_-]*)/g, "#l-$1");
    if (/^(:root|html|body)$/i.test(ids)) return ".landing";
    if (/^(html|body)\s+/i.test(ids)) return ".landing " + ids.replace(/^(html|body)\s+/i, "");
    if (/^(html|body)(?=[.:#[])/i.test(ids)) return ".landing" + ids.replace(/^(html|body)/i, "");
    return `.landing ${ids}`;
  },
};

/** Split on `sep` at depth 0, outside quotes and parentheses. */
function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, quote = "", cur = "";
  for (const ch of text) {
    if (quote) { if (ch === quote) quote = ""; cur += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** Read "prelude { body }" blocks at the top level of `css` (quote-aware). */
function blocks(css: string): Array<{ prelude: string; body: string }> {
  const out: Array<{ prelude: string; body: string }> = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    let depth = 0, quote = "", j = open;
    for (; j < css.length; j++) {
      const ch = css[j];
      if (quote) { if (ch === quote) quote = ""; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === "{") depth++;
      if (ch === "}" && --depth === 0) break;
    }
    // A statement at-rule (e.g. @import ...;) before the block is dropped with the prelude.
    const prelude = css.slice(i, open).split(";").pop()!.trim();
    out.push({ prelude, body: css.slice(open + 1, j) });
    i = j + 1;
  }
  return out;
}

function rule(prelude: string, body: string, notes: NoteCollector): string {
  const sels = splitTop(prelude, ",").map(cssPolicy.selector).filter(Boolean) as string[];
  if (!sels.length) return notes.add("removed a CSS rule with an unsafe selector"), "";
  const decls = splitTop(body, ";").map((d) => (d.trim() ? cssPolicy.declaration(d, notes) : null)).filter(Boolean);
  return decls.length ? `${sels.join(", ")} { ${decls.join("; ")}; }` : "";
}

/* --------------------------- rewriteLandingIds --------------------------- */

/** id / label-for values get an "l-" prefix so they cannot collide with the site's own ids. */
export const rewriteLandingIds = (raw: string): string | null => {
  const v = friendlyAttrValue(raw).trim();
  return TOKEN_RE.test(v) ? `l-${v}` : null;
};

/* ------------------------------ public API ------------------------------- */

/** Structure only: all <style> texts and the inner HTML of <main> (else <body>, else everything). */
export function extractLanding(html: unknown): { css: string[]; body: string } {
  const s = typeof html === "string" ? html : "";
  const css = [...s.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map((m) => m[1]);
  const main = /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i.exec(s)?.[1];
  const body = main ?? /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(s)?.[1] ?? s;
  return { css, body };
}

export function sanitizeLandingCss(css: string, notes = new NoteCollector()): { css: string; notes: string[] } {
  const text = String(css || "").replace(/\/\*[\s\S]*?\*\//g, "");
  if (/@import|@charset|@font-face|@namespace/i.test(text)) notes.add("removed a CSS at-rule that is not allowed (only @media is)");
  const out: string[] = [];
  for (const { prelude, body } of blocks(text)) {
    if (/^@media\b/i.test(prelude)) {
      if (!/^@media\s*[a-z0-9 ():,.-]+$/i.test(prelude)) { notes.add("removed an @media block with an unsafe condition"); continue; }
      const inner = blocks(body).map((b) => (b.prelude.startsWith("@") ? "" : rule(b.prelude, b.body, notes))).filter(Boolean);
      if (inner.length) out.push(`${prelude} { ${inner.join(" ")} }`);
    } else if (prelude.startsWith("@")) {
      notes.add("removed a CSS at-rule that is not allowed (only @media is)");
    } else {
      const r = rule(prelude, body, notes);
      if (r) out.push(r);
    }
  }
  return { css: out.join("\n"), notes: notes.list() };
}

function attr(name: string, value: string) {
  return `${name}="${escapeAttrValue(value)}"`;
}

export function sanitizeLandingHtml(body: string, notes = new NoteCollector()): { html: string; notes: string[] } {
  // Tags removed together with their content are not reported by the parser's
  // hooks, so note them from a scan first.
  for (const m of String(body || "").matchAll(new RegExp(`<\\s*(${LANDING_STRIPPED_WITH_CONTENT.join("|")})\\b`, "gi")))
    notes.add(`removed <${m[1].toLowerCase()}> element`);
  const whiteList: Record<string, string[]> = {};
  for (const t of ALL_TAGS) whiteList[t] = [...LANDING_GLOBAL_ATTRS, ...(LANDING_TAG_ATTRS[t] || [])];
  const filter = new FilterXSS({
    whiteList,
    // Disallowed tags are stripped (content kept) by returning "" from onIgnoreTag;
    // js-xss ignores onIgnoreTag if stripIgnoreTag is also set, so it is not.
    stripIgnoreTagBody: LANDING_STRIPPED_WITH_CONTENT,
    allowCommentTag: false,
    onIgnoreTag: (tag: string) => { notes.add(`removed <${tag.toLowerCase()}> element`); return ""; },
    onIgnoreTagAttr: (tag: string, name: string) => {
      notes.add(/^on/i.test(name) ? `removed an event-handler attribute from <${tag}>` : `removed the ${name.toLowerCase().slice(0, 30)} attribute from <${tag}>`);
      return "";
    },
    // NB: js-xss calls onTagAttr for EVERY attribute, allowed or not. Anything
    // outside the allowlist must go to onIgnoreTagAttr (which removes it).
    onTagAttr: (tag: string, name: string, value: string, isWhiteAttr: boolean) => {
      if (!isWhiteAttr) return undefined;
      const drop = (why: string) => (notes.add(why), "");
      switch (name) {
        case "id": { const v = rewriteLandingIds(value); return v ? attr("id", v) : drop(`removed an invalid id from <${tag}>`); }
        case "for": { const v = rewriteLandingIds(value); return v ? attr("for", v) : drop("removed an invalid label target"); }
        case "class": {
          const tokens = friendlyAttrValue(value).split(/\s+/).filter((t) => /^[A-Za-z0-9_-]{1,64}$/.test(t));
          return tokens.length ? attr("class", tokens.join(" ")) : "";
        }
        case "lang": return LANG_RE.test(value) ? attr("lang", value) : drop("removed an invalid lang value");
        case "style": {
          const decls = splitTop(friendlyAttrValue(value), ";").map((d) => (d.trim() ? cssPolicy.declaration(d, notes) : null)).filter(Boolean);
          return decls.length ? attr("style", decls.join("; ")) : "";
        }
        case "href": { const v = urlPolicy.link(value); return v ? attr("href", v) : drop(`removed an unsafe or external-http link from <${tag}>`); }
        case "src": { const v = urlPolicy.image(value); return v ? attr("src", v) : drop("removed an image that is not a site file under /assets/ or /media/"); }
        case "action": { const v = urlPolicy.formAction(value); return v ? attr("action", v) : drop("removed a form action that is not on this site"); }
        case "method": return /^(get|post)$/i.test(value) ? attr("method", value.toLowerCase()) : "";
        case "type":
          if (tag === "input") return LANDING_INPUT_TYPES.includes(value.toLowerCase()) ? attr("type", value.toLowerCase()) : drop("removed a disallowed input type");
          return /^(submit|button|reset)$/i.test(value) ? attr("type", value.toLowerCase()) : "";
        case "autocomplete": return LANDING_AUTOCOMPLETE.includes(value.toLowerCase()) ? attr("autocomplete", value.toLowerCase()) : drop("removed a disallowed autocomplete value");
        case "loading": return /^(lazy|eager)$/i.test(value) ? attr("loading", value.toLowerCase()) : "";
        case "width":
        case "height": return /^\d{1,4}$/.test(value) ? attr(name, value) : "";
        case "aria-hidden": return /^(true|false)$/.test(value) ? attr(name, value) : "";
        case "required":
        case "checked": return name;
        default: return attr(name, friendlyAttrValue(value)); // title, alt, name, value, placeholder, aria-label: escaped text
      }
    },
  });
  return { html: filter.process(String(body || "")), notes: notes.list() };
}

/** Everything the renderer will serve for a landing document (fail closed on error). */
export function sanitizeLanding(html: unknown): { css: string; body: string; notes: string[] } {
  try {
    const notes = new NoteCollector();
    const { css, body } = extractLanding(html);
    const safeCss = sanitizeLandingCss(css.join("\n"), notes).css;
    const safeBody = sanitizeLandingHtml(body, notes).html;
    return { css: safeCss, body: safeBody, notes: notes.list() };
  } catch {
    return { css: "", body: "", notes: ["the page could not be read and was not shown"] };
  }
}

/** Write-time warnings for a landing document: what the renderer will remove. */
export function landingWarnings(doc: unknown): string[] {
  const html = doc && typeof doc === "object" ? (doc as any).html : undefined;
  if (typeof html !== "string") return ["landing pages need an html field (a string)."];
  return sanitizeLanding(html).notes.map((n) => `landing: ${n}.`);
}
