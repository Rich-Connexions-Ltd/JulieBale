/**
 * Presentation vocabulary: the closed set of layout/motion options a page
 * section (`style`) or a whole page (`design`) may carry.
 *
 * `PRESENTATION_OPTIONS` is the single source of truth. The renderer, the write
 * warnings, publish-time sanitising, the OpenAPI enums and the
 * `presentation_options` tool are all derived from it, so a value that is not
 * listed here can never reach the rendered HTML.
 *
 * Every allowlisted value becomes a CSS class of the form `s-<key>-<value>`
 * (booleans: `s-<key>`; underscores become hyphens), e.g. `s-theme-teal`,
 * `s-image-side-left`, `s-rule`. Page design values become `d-<key>-<value>`
 * on <body>. All visual behaviour lives in public/styles.css.
 */

type Meanings = Record<string, string>;
interface Option {
  /** Block types the key applies to; omitted = every block type. */
  blocks?: string[];
  /** Allowed values and their one-line meanings. `true` means a boolean flag. */
  values?: Meanings;
  /** Free-form but validated values (only `focus`). */
  pattern?: { shape: string; meaning: string };
}

export const PRESENTATION_OPTIONS: { style: Record<string, Option>; design: Record<string, Option> } = {
  style: {
    theme: {
      values: {
        cream: "Warm cream ground.",
        ivory: "Light ivory ground.",
        teal: "Deep teal ground, ivory text.",
        night: "Near-black (ink) ground, ivory text, soft-gold accents.",
      },
    },
    width: {
      values: {
        contained: "Content sits within the normal content width.",
        full: "Full-bleed: content runs edge to edge.",
      },
    },
    spacing: {
      values: { compact: "Less space above and below.", standard: "Normal spacing.", generous: "More space above and below." },
    },
    rule: { values: { true: "Fine antique-gold hairline at the top of the section." } },
    chapter: { values: { true: "Section takes the next chapter number (01, 02, ...)." } },
    motion: {
      values: {
        none: "No entrance animation; content shows immediately.",
        fade: "Fades in.",
        rise: "Fades in while rising slightly.",
        scale: "Fades in from very slightly smaller.",
        mask: "Images are revealed by a wiping mask.",
        drift: "Images drift gently as the page scrolls.",
      },
    },
    speed: { values: { gentle: "Slower, smaller movements.", standard: "Normal speed." } },
    hero: {
      blocks: ["hero"],
      values: {
        cinematic: "Full-height photograph with copy over it (the default).",
        split: "Photograph and copy side by side.",
        portrait: "Tall portrait crop beside the copy.",
      },
    },
    align: { blocks: ["hero"], values: { left: "Copy aligned left.", centre: "Copy centred." } },
    measure: { blocks: ["hero"], values: { narrow: "Narrow copy column.", wide: "Wide copy column." } },
    treatment: {
      blocks: ["hero"],
      values: {
        teal: "Teal overlay on the photograph (the default); on split/portrait, a teal copy panel.",
        cream: "Cream field behind the copy.",
        none: "No overlay on split/portrait (ivory copy panel); on cinematic a lighter overlay is kept so text stays readable.",
      },
    },
    focus: {
      blocks: ["hero"],
      pattern: { shape: "<x>% <y>%", meaning: "Focal point of the hero photograph, e.g. \"60% 20%\" (whole numbers 0-100)." },
    },
    sequence: { blocks: ["hero"], values: { true: "Kicker, heading, intro and button appear one after another." } },
    image_side: {
      blocks: ["showcase", "feature", "duo"],
      values: { left: "Image on the left (wide screens).", right: "Image on the right (wide screens)." },
    },
    crop: {
      blocks: ["showcase", "feature", "duo"],
      values: { portrait: "Tall crop.", landscape: "Wide crop.", bleed: "Image fills its side to the edges." },
    },
    overlap: { blocks: ["showcase", "feature"], values: { true: "Copy panel overlaps the image on wide screens." } },
    grid: { blocks: ["showcase", "feature"], values: { balanced: "Equal columns.", asymmetric: "Large image, narrower copy." } },
    size: { blocks: ["pullquote"], values: { standard: "Normal quote size.", oversized: "Very large editorial quote." } },
  },
  design: {
    concept: {
      values: {
        stage: "Cinematic, concert-programme look.",
        editorial: "Magazine portrait look: fine rules, generous white space.",
        journey: "Transformation journey: chapters and a calm, forward rhythm.",
      },
    },
    progress: { values: { true: "Slim reading-progress line at the top of the page." } },
  },
};

const FOCUS_RE = /^(\d{1,3})% (\d{1,3})%$/;
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const cls = (prefix: string, key: string, value?: string) =>
  `${prefix}-${key.replace(/_/g, "-")}${value === undefined ? "" : `-${value}`}`;

/** True when `value` is allowed for `key` on this block type. */
function allowed(opt: Option | undefined, blockType: string | undefined, value: unknown): boolean {
  if (!opt) return false;
  if (opt.blocks && blockType !== undefined && !opt.blocks.includes(blockType)) return false;
  if (opt.pattern) return typeof value === "string" && parseFocus(value) !== null;
  if (!opt.values) return false;
  if (own(opt.values, "true")) return value === true;
  return typeof value === "string" && own(opt.values, value);
}

function parseFocus(v: string): [number, number] | null {
  const m = FOCUS_RE.exec(v);
  if (!m) return null;
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  return [clamp(Number(m[1])), clamp(Number(m[2]))];
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export interface ResolvedSection {
  classes: string[];
  /** Inline style for the hero <img>, built only from two clamped integers. */
  imgStyle?: string;
  hasTheme: boolean;
  motion: boolean;
  chapter: boolean;
}

/** Map a block's `style` to classes. Unknown keys/values are ignored. */
export function resolveSection(block: { type?: string; style?: unknown }): ResolvedSection {
  const out: ResolvedSection = { classes: [], hasTheme: false, motion: false, chapter: false };
  const style = block?.style;
  if (!isObject(style)) return out;
  for (const key of Object.keys(PRESENTATION_OPTIONS.style)) {
    if (!own(style, key)) continue;
    const opt = PRESENTATION_OPTIONS.style[key];
    const value = style[key];
    if (!allowed(opt, block.type, value)) continue;
    if (key === "focus") {
      const [x, y] = parseFocus(value as string)!;
      out.imgStyle = `object-position:${x}% ${y}%`;
      continue;
    }
    out.classes.push(value === true ? cls("s", key) : cls("s", key, value as string));
    if (key === "theme") out.hasTheme = true;
    if (key === "chapter") out.chapter = true;
    if (key === "motion") out.motion = true;
  }
  return out;
}

/** Map a page's `design` to <body> classes. */
export function resolveDesign(design: unknown): { bodyClasses: string[]; progress: boolean } {
  const out = { bodyClasses: [] as string[], progress: false };
  if (!isObject(design)) return out;
  for (const key of Object.keys(PRESENTATION_OPTIONS.design)) {
    if (!own(design, key) || !allowed(PRESENTATION_OPTIONS.design[key], undefined, design[key])) continue;
    if (key === "progress") out.progress = true;
    else out.bodyClasses.push(cls("d", key, design[key] as string));
  }
  return out;
}

function describe(opt: Option): string {
  if (opt.pattern) return `"${opt.pattern.shape}"`;
  const vals = Object.keys(opt.values || {});
  return vals.length === 1 && vals[0] === "true" ? "true" : vals.join(" | ");
}
const show = (v: unknown) => {
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 40 ? s.slice(0, 37) + "..." : s;
};

function checkObject(obj: unknown, group: "style" | "design", where: string, blockType?: string): string[] {
  if (obj === undefined) return [];
  if (!isObject(obj)) return [`${where}: ${group} must be an object; ignored.`];
  const warnings: string[] = [];
  for (const key of Object.keys(obj)) {
    const opt = own(PRESENTATION_OPTIONS[group], key) ? PRESENTATION_OPTIONS[group][key] : undefined;
    if (!opt) {
      warnings.push(`${where}: unknown ${group} key "${show(key).replace(/^"|"$/g, "")}" ignored.`);
      continue;
    }
    if (opt.blocks && blockType !== undefined && !opt.blocks.includes(blockType)) {
      warnings.push(`${where}: ${group}.${key} only applies to ${opt.blocks.join(", ")}; ignored.`);
      continue;
    }
    // `false` on a boolean flag is simply "off", not a mistake.
    if (obj[key] === false && own(opt.values || {}, "true")) continue;
    if (!allowed(opt, blockType, obj[key])) warnings.push(`${where}: ${group}.${key} = ${show(obj[key])} is not allowed (use ${describe(opt)}); ignored.`);
  }
  return warnings;
}

/**
 * Warnings for every non-allowlisted presentation value in a page or variant
 * document. Writes still succeed (unknown values are ignored at render);
 * the warnings tell the chat assistant what to fix.
 */
export function presentationWarnings(doc: unknown): string[] {
  if (!isObject(doc)) return [];
  const warnings = checkObject(doc.design, "design", "page");
  const sections = Array.isArray(doc.sections) ? doc.sections : [];
  sections.forEach((s: unknown, i: number) => {
    if (!isObject(s)) return;
    const label = typeof s.key === "string" ? `section ${i + 1} (${s.key})` : typeof s.from === "string" ? `section ${i + 1} (${s.from})` : `section ${i + 1}`;
    warnings.push(...checkObject(s.style, "style", label, typeof s.type === "string" ? s.type : undefined));
  });
  return warnings;
}

/**
 * Copy of a style/design object containing only allowlisted key/value pairs.
 * Used at publish so nothing unvetted is ever persisted into a live page.
 * `blockType` restricts block-specific keys; omit it for `design`.
 */
export function sanitizePresentation(obj: unknown, group: "style" | "design", blockType?: string): Record<string, unknown> | undefined {
  if (!isObject(obj)) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(PRESENTATION_OPTIONS[group])) {
    if (own(obj, key) && allowed(PRESENTATION_OPTIONS[group][key], blockType, obj[key])) out[key] = obj[key];
  }
  return Object.keys(out).length ? out : undefined;
}

/** JSON-Schema fragments generated from the allowlist (used by OpenAPI). */
export function presentationJsonSchema(group: "style" | "design") {
  const properties: Record<string, unknown> = {};
  for (const [key, opt] of Object.entries(PRESENTATION_OPTIONS[group])) {
    const applies = opt.blocks ? ` Applies to: ${opt.blocks.join(", ")}.` : "";
    if (opt.pattern) properties[key] = { type: "string", pattern: FOCUS_RE.source, description: opt.pattern.meaning + applies };
    else if (own(opt.values!, "true")) properties[key] = { type: "boolean", description: opt.values!.true + applies };
    else properties[key] = { type: "string", enum: Object.keys(opt.values!), description: Object.entries(opt.values!).map(([v, m]) => `${v}: ${m}`).join(" ") + applies };
  }
  return { type: "object", additionalProperties: false, properties };
}

/** One worked variant per concept, using the home page's section keys. */
export const CONCEPT_EXAMPLES = {
  stage: {
    design: { concept: "stage" },
    sections: [
      { from: "hero-1", style: { hero: "cinematic", align: "left", sequence: true, focus: "60% 20%" } },
      { from: "showcase-1", style: { theme: "night", grid: "asymmetric", motion: "mask" } },
      { from: "statement-1", style: { theme: "teal", rule: true, spacing: "generous" } },
      { from: "pullquote-1", style: { size: "oversized", motion: "fade" } },
      { from: "panels-1" },
      { from: "cta-1" },
    ],
  },
  editorial: {
    design: { concept: "editorial" },
    sections: [
      { from: "hero-1", style: { hero: "portrait", treatment: "cream", measure: "narrow" } },
      { from: "feature-1", style: { image_side: "left", crop: "portrait", overlap: true, motion: "rise" } },
      { from: "pullquote-1", style: { theme: "ivory", size: "oversized", rule: true } },
      { from: "duo-1", style: { crop: "landscape", motion: "fade", speed: "gentle" } },
      { from: "doorway-1" },
    ],
  },
  journey: {
    design: { concept: "journey", progress: true },
    sections: [
      { from: "hero-1", style: { hero: "split", treatment: "none" } },
      { from: "statement-1", style: { chapter: true, rule: true } },
      { from: "feature-1", style: { chapter: true, image_side: "right", motion: "rise" } },
      { from: "showcase-1", style: { chapter: true, theme: "teal", motion: "drift" } },
      { from: "cta-1", style: { chapter: true, theme: "night" } },
    ],
  },
};
