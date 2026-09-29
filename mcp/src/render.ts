/**
 * Server-side renderer: turns a block-based page document (from D1) into HTML,
 * reusing the prototype's teal/gold/cream design system (public/styles.css).
 *
 * Presentation (`section.style`, `page.design`) is resolved by ./presentation
 * into allowlisted classes applied to each block's outer <section>; a section
 * with no `style` renders exactly as before.
 */
import { resolveSection, resolveDesign, validCollageEntry, type ResolvedSection } from "./presentation";
import { assetIdOf, consentOk, testimonialConsentOk, isStreamMp4, streamThumbnail } from "./assets";
import { sanitizeLanding } from "./sanitize";

interface Env {
  DB: D1Database;
}

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Link targets allowed in Markdown: web, mail, phone, site-relative and in-page.
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

// Inline Markdown: bold, italic, code, links (input is already HTML-escaped).
function mdInline(t: string): string {
  return t
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) => (SAFE_HREF.test(href) ? `<a href="${href}">${text}</a>` : text));
}

// Minimal, dependency-free Markdown -> HTML for body copy.
// Escapes HTML first, then renders headings, lists, blockquotes, code and paragraphs.
function md(body: string): string {
  const lines = esc(String(body || "")).split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  // NB: esc() has already turned '>' into '&gt;', so blockquotes match on '&gt;'.
  const isBlockStart = (l: string) => /^(#{1,4}\s|&gt;\s?|```|\s*[-*]\s+|\s*\d+\.\s+)/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }
    if (/^```/.test(line)) {
      i++; const code: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++; out.push(`<pre><code>${code.join("\n")}</code></pre>`); continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { const lvl = Math.min(h[1].length + 1, 6); out.push(`<h${lvl}>${mdInline(h[2])}</h${lvl}>`); i++; continue; }
    if (/^&gt;\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) { q.push(lines[i].replace(/^&gt;\s?/, "")); i++; }
      out.push(`<blockquote>${mdInline(q.join(" "))}</blockquote>`); continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(`<li>${mdInline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`); i++; }
      out.push(`<ul>${items.join("")}</ul>`); continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(`<li>${mdInline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`); i++; }
      out.push(`<ol>${items.join("")}</ol>`); continue;
    }
    const para: string[] = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])) { para.push(lines[i]); i++; }
    out.push(`<p>${mdInline(para.join(" "))}</p>`);
  }
  return `<div class="prose">${out.join("\n")}</div>`;
}

// Resolve an image/media reference: absolute (http / leading slash) stays as-is;
// a bare filename is a bundled design asset (/assets); an R2 key uses /media.
const assetUrl = (file: string): string => (!file ? "" : /^(https?:|\/)/.test(file) ? file : `/assets/${file}`);
const mediaUrl = (key: string): string => (!key ? "" : /^(https?:|\/)/.test(key) ? key : `/media/${key}`);

const img = (file: string, alt: string, cls = "", style = ""): string =>
  file ? `<img src="${esc(assetUrl(file))}" alt="${esc(alt)}"${cls ? ` class="${cls}"` : ""}${style ? ` style="${esc(style)}"` : ""}>` : "";

const caption = (text: unknown): string => (text ? `<figcaption class="caption">${esc(text)}</figcaption>` : "");

/**
 * Heading mini-markup (Sprint 14), the only markup allowed in heading-type
 * fields: "|" = line break, "*word*" = display italic. Escapes FIRST, so the
 * output can only ever contain escaped text, <br> and <em class="display-em">.
 * Text without markup renders exactly as esc() did.
 */
export function headline(text: unknown): string {
  return esc(text)
    .replace(/\*([^*|]+)\*/g, '<em class="display-em">$1</em>')
    .replace(/\s*\|\s*/g, "<br>");
}
/** The same words with the markup removed (titles, alt text, labels, ghost text). */
export function plainHeadline(text: unknown): string {
  return String(text ?? "").replace(/\*([^*|]+)\*/g, "$1").replace(/\s*\|\s*/g, " ").trim();
}

/* ---- Collage (#15) ---- */
const COLLAGE_PRESETS = ["stack", "scatter", "mosaic"];
/**
 * 2-4 images from `images` (consent-resolved to {file, alt}, or bare filenames
 * that pass validCollageEntry). Fewer than two usable images -> no collage.
 */
function renderCollage(b: any, p: ResolvedSection): string {
  const items = (Array.isArray(b.images) ? b.images : [])
    .map((v: any) =>
      typeof v === "string"
        ? validCollageEntry(v) && !v.startsWith("asset:") ? { file: v, alt: "" } : null
        : v && typeof v.file === "string" ? v : null
    )
    .filter(Boolean)
    .slice(0, 4);
  if (items.length < 2) return "";
  const preset = COLLAGE_PRESETS.find((x) => p.classes.includes(`s-collage-${x}`)) || "stack";
  return `<div class="collage collage--${preset} collage--n${items.length}">${items
    .map((it: any, i: number) => `<figure class="collage__item"><img src="${esc(assetUrl(it.file))}" alt="${esc(it.alt || "")}"${i ? ' loading="lazy"' : ""}></figure>`)
    .join("")}</div>`;
}

/* ---- Decoration layer (#13, #17, #14 ghost) ---- */
// Static, server-owned SVG: nothing from documents is ever placed in these.
const ORNAMENTS: Record<string, string> = {
  arc: '<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet"><path d="M10 190 A180 180 0 0 1 190 10" /><path d="M40 190 A150 150 0 0 1 190 40" /><path d="M70 190 A120 120 0 0 1 190 70" /></svg>',
  contour: '<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet"><path d="M0 60 C50 20 90 100 140 60 S200 40 200 40" /><path d="M0 90 C50 50 90 130 140 90 S200 70 200 70" /><path d="M0 120 C50 80 90 160 140 120 S200 100 200 100" /><path d="M0 150 C50 110 90 190 140 150 S200 130 200 130" /></svg>',
  "quote-mark": '<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet"><text x="10" y="190" font-family="Playfair Display, Georgia, serif" font-size="260">“</text></svg>',
  stave: '<svg viewBox="0 0 400 120" preserveAspectRatio="none"><path d="M0 20 C100 0 200 40 400 10" /><path d="M0 40 C100 20 200 60 400 30" /><path d="M0 60 C100 40 200 80 400 50" /><path d="M0 80 C100 60 200 100 400 70" /><path d="M0 100 C100 80 200 120 400 90" /></svg>',
};
/** The aria-hidden decoration layer: only allowlisted enums, static SVG, and escaped plain ghost text. */
export function renderDecorations(p: ResolvedSection, ghostText: string): string {
  const d = p.deco;
  if (!d) return "";
  const field = d.field ? `<div class="s-deco__field"></div>` : "";
  const ornament = d.ornament && ORNAMENTS[d.ornament] ? `<div class="s-deco__ornament">${ORNAMENTS[d.ornament]}</div>` : "";
  const ghost = d.ghost && ghostText ? `<div class="s-deco__ghost">${esc(ghostText)}</div>` : "";
  return field || ornament || ghost ? `<div class="s-deco" aria-hidden="true">${field}${ornament}${ghost}</div>` : "";
}

// Optional second photograph for scene_image "dissolve". A decorative
// duplicate of the scene (the first image carries the alt text). Rendered only
// when that scene is chosen, so adding image_2 to a live page changes nothing
// until a dissolve is published.
const secondImage = (b: any, p: ResolvedSection): string =>
  b.image && b.image_2 && p.classes.includes("s-scene-image-dissolve")
    ? `<img src="${esc(assetUrl(b.image_2))}" alt="" class="scene-img-2" loading="lazy"${p.imgStyle ? ` style="${esc(p.imgStyle)}"` : ""}>`
    : "";

const button = (cta: any, cls = "button"): string =>
  cta && cta.label ? `<a class="${cls}" href="${esc(cta.href || "#")}">${esc(cta.label)}</a>` : "";

const textlink = (cta: any): string =>
  cta && cta.label
    ? `<a class="textlink" href="${esc(cta.href || "#")}">${esc(cta.label)} <span class="arrow" aria-hidden="true">&rsaquo;</span></a>`
    : "";

// Where a collection document's detail page lives.
function linkFor(collection: string, id: string, doc: any): string | null {
  if (collection === "events") return `/events/${encodeURIComponent(id)}`;
  if (collection === "courses") return `/courses/${encodeURIComponent(id)}`;
  if (collection === "posts" || collection === "episodes") return `/blog/${encodeURIComponent(id)}`;
  if (collection === "dates") return null; // dates are calendar entries, not page links
  return null;
}
function fmtDate(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return esc(s);
  let out = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  if (/T\d/.test(s)) out += ", " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return out;
}
function titleHtml(collection: string, id: string, doc: any): string {
  const href = linkFor(collection, id, doc);
  const t = esc(doc.title);
  return href ? `<a href="${esc(href)}">${t}</a>` : t;
}
async function readRows(env: Env, collection: string): Promise<Array<{ id: string; doc: any }>> {
  const ids = await listIds(env, collection);
  const rows = await Promise.all(ids.map(async (id) => ({ id, doc: await readJson(env, collection, id) })));
  return rows.filter((r) => r.doc);
}

interface DateItem { when: Date; raw: string; title: string; href: string | null; location?: string; note?: string; kind: string; }

// Unified upcoming feed: events (by starts_at) + standalone dates, sorted ascending.
async function upcomingDates(env: Env): Promise<DateItem[]> {
  const items: DateItem[] = [];
  for (const { id, doc } of await readRows(env, "events")) {
    if (doc.starts_at) items.push({ when: new Date(doc.starts_at), raw: doc.starts_at, title: doc.title, href: `/events/${encodeURIComponent(id)}`, location: doc.location, kind: "event" });
  }
  for (const { doc } of await readRows(env, "dates")) {
    // Standalone dates are informational (not page links); only events link to their detail page.
    if (doc.date) items.push({ when: new Date(doc.date), raw: doc.date, title: doc.title, href: null, note: doc.note, kind: "date" });
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return items.filter((i) => !isNaN(i.when.getTime()) && i.when >= today).sort((a, b) => a.when.getTime() - b.when.getTime());
}

function renderMonthGrid(y: number, m: number, items: DateItem[]): string {
  const monthName = new Date(y, m, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const byDay: Record<number, DateItem[]> = {};
  for (const it of items) (byDay[it.when.getDate()] = byDay[it.when.getDate()] || []).push(it);
  const cells: string[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(`<div class="cal__cell cal__cell--empty"></div>`);
  for (let day = 1; day <= daysInMonth; day++) {
    const dayItems = byDay[day] || [];
    const marks = dayItems
      .map((it) => (it.href ? `<a class="cal__event" href="${esc(it.href)}">${esc(it.title)}</a>` : `<span class="cal__event">${esc(it.title)}</span>`))
      .join("");
    cells.push(`<div class="cal__cell${dayItems.length ? " cal__cell--has" : ""}"><span class="cal__day">${day}</span>${marks}</div>`);
  }
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="cal__dow">${d}</div>`).join("");
  return `<div class="cal"><h3 class="cal__title">${esc(monthName)}</h3><div class="cal__grid">${dow}${cells.join("")}</div></div>`;
}

function renderCalendar(items: DateItem[]): string {
  const byMonth = new Map<string, { y: number; m: number; items: DateItem[] }>();
  for (const it of items) {
    const k = `${it.when.getFullYear()}-${it.when.getMonth()}`;
    if (!byMonth.has(k)) byMonth.set(k, { y: it.when.getFullYear(), m: it.when.getMonth(), items: [] });
    byMonth.get(k)!.items.push(it);
  }
  return [...byMonth.values()].sort((a, b) => a.y - b.y || a.m - b.m).map((mo) => renderMonthGrid(mo.y, mo.m, mo.items)).join("");
}

function renderAgenda(items: DateItem[]): string {
  return `<ul class="listing">${items
    .map(
      (it) =>
        `<li class="listing__item"><span class="listing__title">${it.href ? `<a href="${esc(it.href)}">${esc(it.title)}</a>` : esc(it.title)}</span><span class="listing__meta">${fmtDate(it.raw)}${it.location ? " · " + esc(it.location) : ""}</span>${it.note ? `<p>${esc(it.note)}</p>` : ""}</li>`
    )
    .join("")}</ul>`;
}

/* ------------------------------- Blocks -------------------------------- */

async function renderBlock(env: Env, b: any, i: number, p: ResolvedSection): Promise<string> {
  // alternate cream/ivory grounds for calm full-width content sections
  // (an explicit style.theme replaces this; see decorate())
  const ivory = i % 2 === 1 && !p.hasTheme ? " ground-ivory" : "";

  switch (b.type) {
    case "hero":
      return `<section class="hero-stage media-band">
  ${img(b.image, b.image_alt || plainHeadline(b.heading) || "Julie Bale", "", p.imgStyle)}${secondImage(b, p)}
  <div class="media-band__scrim"></div>
  <div class="media-band__inner"><div class="container--wide reveal">
    ${b.kicker ? `<p class="kicker">${esc(b.kicker)}</p>` : ""}
    <h1>${headline(b.heading)}</h1>
    ${b.intro ? `<p class="lede">${esc(b.intro)}</p>` : ""}
    ${button(b.cta)}
  </div></div>
</section>`;

    case "statement":
      return `<section class="section quiet${ivory}"><div class="container--reading reveal">
    ${b.eyebrow ? `<p class="kicker">${esc(b.eyebrow)}</p>` : ""}
    <p class="statement--lead">${headline(b.statement)}</p>
    ${b.sub ? `<p>${esc(b.sub)}</p>` : ""}${renderCollage(b, p)}
  </div></section>`;

    case "showcase":
      return `<section class="showcase"><div class="showcase__grid">
    <div class="showcase__media reveal">${
      renderCollage(b, p) ||
      (b.image
        ? img(b.image, b.image_alt || plainHeadline(b.heading), "", p.imgStyle) + secondImage(b, p) + caption(b.caption)
        : `<span class="showcase__ph">${esc(plainHeadline(b.heading))}<span>Large performance / Diva photograph</span></span>`)
    }</div>
    <div class="showcase__body reveal">
      <h2>${headline(b.heading)}</h2>
      ${b.sub ? `<p class="showcase__sub">${esc(b.sub)}</p>` : ""}
      ${b.facts ? `<p class="showcase__facts">${esc(b.facts)}</p>` : ""}
      ${textlink(b.cta)}
    </div>
  </div></section>`;

    case "pullquote":
      return `<section class="section${ivory}"><figure class="pullquote pullquote--v2 reveal">
    <blockquote>${esc(b.quote)}</blockquote>
    ${b.cite ? `<figcaption>${esc(b.cite)}</figcaption>` : ""}
  </figure></section>`;

    case "panels":
      return `<section class="section"><div class="container">
    ${b.heading ? `<h2 class="section-title">${headline(b.heading)}</h2>` : ""}
    <div class="panels stagger">
      ${(b.items || [])
        .map(
          (it: any) => `<a class="panel" href="${esc(it.href || "#")}">
        <span class="panel__media">${
          it.image ? img(it.image, it.image_alt || it.title || "") : `<span class="panel__ph">${esc(it.title)}</span>`
        }</span>
        <span class="panel__title">${esc(it.title)}</span>
        ${it.line ? `<span class="panel__line">${esc(it.line)}</span>` : ""}
        <span class="explore">Explore &rsaquo;</span>
      </a>`
        )
        .join("\n")}
    </div>
  </div></section>`;

    case "feature":
      return `<section class="section${ivory}"><div class="container feature__grid${b.reverse ? " feature--reverse" : ""}">
    <div class="feature__media reveal">${renderCollage(b, p) || `<figure class="frame image--portrait">${
      b.image ? img(b.image, b.image_alt || plainHeadline(b.heading), "", p.imgStyle) + secondImage(b, p) + caption(b.caption) : `<figcaption class="frame__label">${esc(plainHeadline(b.heading))}</figcaption>`
    }</figure>`}</div>
    <div class="feature__body reveal">
      ${b.eyebrow ? `<p class="eyebrow">${esc(b.eyebrow)}</p>` : ""}
      <h2>${headline(b.heading)}</h2>
      ${b.body ? md(b.body) : ""}
      ${textlink(b.cta)}
    </div>
  </div></section>`;

    case "duo":
      return `<section class="section"><div class="container">
    ${b.heading ? `<h2 class="section-title section-title--centre">${headline(b.heading)}</h2>` : ""}
    <div class="duo stagger">
      ${(b.items || [])
        .map(
          (it: any) => `<article class="duo__item">
        <span class="duo__media">${it.image ? img(it.image, it.image_alt || it.title || "") : `<span class="duo__ph">${esc(it.title)}</span>`}</span>${it.caption ? `\n        <p class="caption">${esc(it.caption)}</p>` : ""}
        ${it.kicker ? `<p class="kicker">${esc(it.kicker)}</p>` : ""}
        <h3 class="duo__title">${esc(it.title)}</h3>
        ${textlink({ label: it.cta_label || "Open", href: it.href })}
      </article>`
        )
        .join("\n")}
    </div>
  </div></section>`;

    case "cta":
      return `<section class="section ground-teal cta-band cta-band--final"><div class="container--reading reveal">
    ${b.eyebrow ? `<p class="kicker">${esc(b.eyebrow)}</p>` : ""}
    <h2>${headline(b.heading)}</h2>
    ${b.note ? `<p class="cta-band__note">${esc(b.note)}</p>` : ""}
    ${button(b.cta)}
  </div></section>`;

    case "doorway":
      return `<section class="section--tight ground-ivory doorway"><div class="container--reading reveal">
    <h2>${headline(b.heading)}</h2>
    ${b.body ? `<p>${esc(b.body)}</p>` : ""}
    <form class="newsletter__form" action="#" novalidate>
      <label class="visually-hidden" for="email">Email address</label>
      <input id="email" name="email" type="email" placeholder="Your email address" autocomplete="email" required>
      <button class="button" type="submit">Send it to me</button>
    </form>
    ${b.note ? `<p class="newsletter__note">${esc(b.note)}</p>` : ""}
  </div></section>`;

    case "richtext":
      return `<section class="section${ivory}"><div class="container--reading reveal">
    ${b.heading ? `<h2 class="section-title">${headline(b.heading)}</h2>` : ""}
    ${b.body ? md(b.body) : ""}
  </div></section>`;

    case "form":
      return `<section class="section ground-ivory"><div class="container--reading reveal">
    ${b.heading ? `<h2 class="section-title">${headline(b.heading)}</h2>` : ""}
    <form class="stack-form" action="#" novalidate>
      ${(b.fields || [])
        .map((f: string) => `<label class="field"><span>${esc(f)}</span><input type="text" name="${esc(f)}"></label>`)
        .join("\n")}
      <button class="button" type="submit">${esc(b.submit || "Send")}</button>
    </form>
  </div></section>`;

    case "listing": {
      const rows = await readRows(env, b.collection);
      return `<section class="section${ivory}"><div class="container">
    ${b.heading ? `<h2 class="section-title">${headline(b.heading)}</h2>` : ""}
    ${
      rows.length
        ? `<ul class="listing">${rows
            .map(
              ({ id, doc: d }) =>
                `<li class="listing__item"><span class="listing__title">${titleHtml(b.collection, id, d)}</span>${
                  d.starts_at || d.date ? `<span class="listing__meta">${fmtDate(d.starts_at || d.date)}${d.location ? " · " + esc(d.location) : ""}</span>` : ""
                }${d.description || d.excerpt ? `<p>${esc(d.description || d.excerpt)}</p>` : ""}</li>`
            )
            .join("")}</ul>`
        : `<p class="muted">${esc(b.empty || "Nothing here yet.")}</p>`
    }
  </div></section>`;
    }

    case "accordion": {
      const groupName = `accordion-${i}`;
      const groups = await Promise.all(
        (b.items || []).map(async (grp: any, gi: number) => {
          const rows = await readRows(env, grp.collection);
          const inner = rows.length
            ? `<ul class="listing">${rows
                .map(
                  ({ id, doc: d }) =>
                    `<li class="listing__item"><span class="listing__title">${titleHtml(grp.collection, id, d)}</span>${
                      d.date || d.starts_at ? `<span class="listing__meta">${fmtDate(d.date || d.starts_at)}${d.location ? " · " + esc(d.location) : ""}</span>` : ""
                    }${d.note ? `<p>${esc(d.note)}</p>` : ""}</li>`
                )
                .join("")}</ul>`
            : `<p class="muted">${esc(grp.empty || "Nothing here yet.")}</p>`;
          return `<details class="accordion__item" name="${groupName}"${gi === 0 ? " open" : ""}><summary>${esc(grp.title)}</summary><div class="accordion__body">${inner}</div></details>`;
        })
      );
      return `<section class="section"><div class="container--reading reveal">${groups.join("\n")}</div></section>`;
    }

    case "lessons": {
      const items = b.items || [];
      const heading = b.heading ? `<h2 class="section-title">${headline(b.heading)}</h2>` : "";
      return `<section class="section${ivory}"><div class="container--reading">
    ${heading}
    ${
      items.length
        ? items
            .map(
              (l: any, idx: number) => `<article class="lesson">
      <h3 class="lesson__title">${esc(l.title || `Lesson ${idx + 1}`)}</h3>
      ${l.video ? `<div class="video"><iframe src="https://iframe.videodelivery.net/${esc(l.video)}" loading="lazy" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowfullscreen></iframe></div>` : ""}
      ${l.audio ? `<audio class="lesson__audio" controls src="${esc(mediaUrl(l.audio))}"></audio>` : ""}
      ${l.body ? md(l.body) : ""}
    </article>`
            )
            .join("")
        : `<p class="muted">${esc(b.empty || "Lessons coming soon.")}</p>`
    }
  </div></section>`;
    }

    case "calendar": {
      const items = await upcomingDates(env);
      const heading = b.heading ? `<h2 class="section-title">${headline(b.heading)}</h2>` : "";
      if (!items.length)
        return `<section class="section${ivory}"><div class="container">${heading}<p class="muted">${esc(b.empty || "Nothing on the calendar yet.")}</p></div></section>`;
      const uid = `dv${i}`;
      const defaultCal = (b.view || "calendar") !== "list";
      return `<section class="section${ivory}"><div class="container">
    ${heading}
    <div class="dateswitch">
      <input class="r-cal" type="radio" name="${uid}" id="${uid}-cal"${defaultCal ? " checked" : ""}>
      <input class="r-list" type="radio" name="${uid}" id="${uid}-list"${defaultCal ? "" : " checked"}>
      <div class="dateswitch__tabs">
        <label class="for-cal" for="${uid}-cal">Calendar</label>
        <label class="for-list" for="${uid}-list">List</label>
      </div>
      <div class="dateswitch__cal">${renderCalendar(items)}</div>
      <div class="dateswitch__list">${renderAgenda(items)}</div>
    </div>
  </div></section>`;
    }

    case "testimonials":
      return renderTestimonials(env, b, p, ivory);

    case "media":
      return renderMedia(b, p, ivory);

    default:
      return `<!-- unknown block type: ${esc(b.type)} -->`;
  }
}

/**
 * Apply resolved presentation to a rendered block: add classes (and
 * `data-motion`) to the outer <section>, drop the block's default ground class
 * when a theme is chosen, and insert a decorative chapter number. Returns the
 * HTML untouched when the block has no presentation.
 */
function decorate(html: string, p: ResolvedSection, chapterNo: number, ghostText = ""): string {
  if (!p.classes.length) return html;
  const m = /^(\s*<section class=")([^"]*)(")/.exec(html);
  if (!m) return html;
  let base = m[2];
  if (p.hasTheme) base = base.replace(/\s*\bground-(?:cream|ivory|teal)\b/g, "");
  const attrs = (p.chapter ? ` id="chapter-${String(chapterNo).padStart(2, "0")}"` : "") + (p.motion ? ` data-motion` : "");
  const mark = p.chapter ? `<span class="chapter-mark" aria-hidden="true">${String(chapterNo).padStart(2, "0")}</span>` : "";
  const rest = html.slice(m[0].length);
  const close = rest.indexOf(">");
  let out = `${m[1]}${[base, ...p.classes].filter(Boolean).join(" ")}${m[3]}${rest.slice(0, close)}${attrs}>${renderDecorations(p, ghostText)}${mark}${rest.slice(close + 1)}`;
  // Scenes pin their content while the visitor scrolls through this spacer
  // (a real element: sticky content can only travel within its parent).
  if (p.scene) {
    const end = out.lastIndexOf("</section>");
    out = `${out.slice(0, end)}<div class="scene-spacer" aria-hidden="true"></div>${out.slice(end)}`;
  }
  return out;
}

/* ------------------------- Assets and consent -------------------------- */

// Fields that may hold an `asset:<id>` reference (sections and list items).
const MEDIA_FIELDS = ["image", "image_2", "poster", "video", "audio"];
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);

/** Load the named assets in one bound query. */
async function loadAssets(env: Env, ids: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (!ids.length) return map;
  const { results } = await env.DB.prepare(`SELECT id, data FROM documents WHERE collection='assets' AND id IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids)
    .all<{ id: string; data: string }>();
  for (const r of results) {
    try {
      map.set(r.id, JSON.parse(r.data));
    } catch {}
  }
  return map;
}

/** Resolved web MP4 for a media section's video asset (internal; see resolveAssetRefs). */
export const RESOLVED_VIDEO = Symbol("resolvedVideo");
interface ResolvedVideo { mp4: string; alt: string }

/**
 * Replace `asset:<id>` references with the asset's file (plus its alt text and
 * default focal point for the main image). An asset without consent (pending,
 * refused, expired, or missing) resolves to nothing, so it is never shown.
 * Pages without references are returned unchanged.
 */
export async function resolveAssetRefs(env: Env, page: any): Promise<any> {
  const sections: any[] = Array.isArray(page?.sections) ? page.sections : [];
  const ids = new Set<string>();
  const collect = (o: any) => {
    if (!isObj(o)) return;
    MEDIA_FIELDS.forEach((f) => { const id = assetIdOf(o[f]); if (id) ids.add(id); });
    if (Array.isArray(o.images)) o.images.forEach((v: unknown) => { const id = assetIdOf(v); if (id) ids.add(id); });
  };
  sections.forEach((s) => { collect(s); if (isObj(s) && Array.isArray(s.items)) s.items.forEach(collect); });
  if (!ids.size) return page;
  const assets = await loadAssets(env, [...ids]);
  const apply = (o: any, withStyle: boolean) => {
    if (!isObj(o)) return o;
    const c: any = { ...o };
    for (const f of MEDIA_FIELDS) {
      const id = assetIdOf(o[f]);
      if (!id) continue;
      const a = assets.get(id);
      if (!a || !consentOk(a)) { c[f] = ""; continue; }
      c[f] = a.file;
      // Editorial playback data travels under a Symbol key: JSON content can
      // never supply or spoof it. The stored MP4 is re-checked here because
      // asset documents are editable.
      if (f === "video" && withStyle && a.type === "video" && a.mp4_status === "ready" && isStreamMp4(a.mp4, a.file))
        c[RESOLVED_VIDEO] = { mp4: a.mp4, alt: typeof a.alt === "string" ? a.alt : "" } satisfies ResolvedVideo;
      if (f === "image") {
        if (!c.image_alt && a.alt) c.image_alt = a.alt;
        if (withStyle && a.focus && !(isObj(c.style) && c.style.focus)) c.style = { ...(isObj(c.style) ? c.style : {}), focus: a.focus };
      }
    }
    if (Array.isArray(o.items)) c.items = o.items.map((it: any) => apply(it, false));
    // Collage entries: consented assets become {file, alt}; anything unconsented or unknown is dropped.
    if (Array.isArray(o.images))
      c.images = o.images
        .map((v: unknown) => {
          const id = assetIdOf(v);
          if (!id) return v;
          const a = assets.get(id);
          return a && consentOk(a) ? { file: a.file, alt: a.alt || "" } : null;
        })
        .filter((v: unknown) => v !== null);
    return c;
  };
  return { ...page, sections: sections.map((s) => apply(s, true)) };
}

/* --------------------------- Media (#19) --------------------------------- */

const STREAM_RE = /^[a-f0-9]{32}$/;

/** Poster-first video: nothing heavy loads until the visitor presses play (app.js swaps in the player). */
function mediaButton(uid: string, label: string, poster: string, loop = false, style = ""): string {
  const src = poster ? assetUrl(poster) : streamThumbnail(uid);
  return `<button type="button" class="media-play" data-stream="${uid}"${loop ? ` data-loop="1"` : ""} aria-label="${esc(label)}"><img src="${esc(src)}" alt="" loading="lazy"${style ? ` style="${esc(style)}"` : ""}><span class="media-play__icon" aria-hidden="true"></span></button>`;
}

/**
 * Editorial video (#26): a real <video> cropped to its frame. Muted, looping,
 * no preload; app.js plays it only while on screen (never under reduced
 * motion) and swaps the native controls for a pause/play toggle. Without
 * JavaScript an ambient video keeps native controls; a background one stays a
 * still poster.
 */
function editorialVideo(uid: string, v: ResolvedVideo, poster: string, style: string, name: string, background: boolean): string {
  const posterUrl = poster ? assetUrl(poster) : streamThumbnail(uid);
  const attrs = background ? ` aria-hidden="true" tabindex="-1"` : ` controls aria-label="${esc(name)}"`;
  return `<video class="media-video" muted playsinline loop preload="none" poster="${esc(posterUrl)}"${attrs}${style ? ` style="${esc(style)}"` : ""}><source src="${esc(v.mp4)}" type="video/mp4"></video>`;
}
const videoToggle = (label: string) =>
  `<button type="button" class="media-toggle" data-video-toggle data-label="${esc(label)}" aria-label="Play ${esc(label)}" hidden><span aria-hidden="true"></span></button>`;

function renderMedia(b: any, p: ResolvedSection, ivory: string): string {
  const uid = typeof b.video === "string" && STREAM_RE.test(b.video) ? b.video : "";
  const what = b.caption || plainHeadline(b.heading) || "performance";
  const v: ResolvedVideo | undefined = uid ? b[RESOLVED_VIDEO] : undefined;
  const mode = v && p.classes.includes("s-playback-background") ? "background" : v && p.classes.includes("s-playback-ambient") ? "ambient" : "player";
  const transcript = b.transcript ? `<details class="transcript"><summary>Transcript</summary>${md(b.transcript)}</details>` : "";
  if (mode === "background") {
    // Heading and caption render once, on the overlay panel; the video is decorative.
    return `<section class="section media-scene media-scene--bg${ivory}">
    <div class="media-bg">${editorialVideo(uid, v!, b.poster || "", p.imgStyle || "", "", true)}</div>
    <div class="container"><div class="media-overlay">
      ${b.heading ? `<h2 class="section-title">${headline(b.heading)}</h2>` : ""}${b.caption ? `<p class="caption">${esc(b.caption)}</p>` : ""}${transcript}
    </div></div>
    ${videoToggle("background video")}
  </section>`;
  }
  const visual =
    mode === "ambient"
      ? editorialVideo(uid, v!, b.poster || "", p.imgStyle || "", v!.alt || what, false) + videoToggle(`video: ${v!.alt || what}`)
      : uid
        ? mediaButton(uid, `${b.loop ? "Play atmospheric video" : "Play video"}: ${what}`, b.poster || "", !!b.loop, p.imgStyle || "")
        : b.poster ? img(b.poster, b.image_alt || what, "", p.imgStyle || "") : "";
  const audio = b.audio ? `<audio class="media-audio" controls preload="none" src="${esc(mediaUrl(b.audio))}"></audio>` : "";
  if (!visual && !audio) return "";
  return `<section class="section media-scene${ivory}"><div class="container">
    ${b.heading ? `<h2 class="section-title">${headline(b.heading)}</h2>` : ""}
    <figure class="media-frame">${visual ? `<div class="media-frame__visual">${visual}</div>` : ""}${audio}${b.caption ? `<figcaption class="caption">${esc(b.caption)}</figcaption>` : ""}</figure>
    ${transcript}
  </div></section>`;
}

/* ------------------------ Testimonials (#18) ----------------------------- */

/** Consent-checked testimonials for a block: explicit `items` (ids, in order) or all, optionally by `tag`. */
async function loadTestimonials(env: Env, b: any): Promise<any[]> {
  const wanted: string[] = Array.isArray(b.items) ? b.items.filter((x: unknown) => typeof x === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(x as string)) : [];
  const { results } = wanted.length
    ? await env.DB.prepare(`SELECT id, data FROM documents WHERE collection='testimonials' AND id IN (${wanted.map(() => "?").join(",")})`).bind(...wanted).all<{ id: string; data: string }>()
    : await env.DB.prepare("SELECT id, data FROM documents WHERE collection='testimonials' ORDER BY id").all<{ id: string; data: string }>();
  let rows = results.map((r) => { try { return { id: r.id, ...JSON.parse(r.data) }; } catch { return null; } }).filter(Boolean) as any[];
  if (wanted.length) rows.sort((x, y) => wanted.indexOf(x.id) - wanted.indexOf(y.id));
  if (typeof b.tag === "string") rows = rows.filter((t) => Array.isArray(t.tags) && t.tags.includes(b.tag));
  rows = rows.filter((t) => testimonialConsentOk(t)).slice(0, Math.min(Math.max(Number(b.limit) || 6, 1), 12));
  // Portraits and videos may be asset references: consent-check those too.
  const assets = await loadAssets(env, [...new Set(rows.flatMap((t) => [assetIdOf(t.portrait), assetIdOf(t.video)]).filter(Boolean) as string[])]);
  return rows.map((t) => {
    const pa = assets.get(assetIdOf(t.portrait) || "");
    const va = assets.get(assetIdOf(t.video) || "");
    const videoUid = va ? (consentOk(va) ? va.file : "") : t.video;
    return {
      ...t,
      portraitFile: pa && consentOk(pa) ? pa.file : "",
      portraitAlt: pa?.alt || `Portrait of ${t.name}`,
      videoUid: typeof videoUid === "string" && STREAM_RE.test(videoUid) ? videoUid : "",
    };
  });
}

async function renderTestimonials(env: Env, b: any, p: ResolvedSection, ivory: string): Promise<string> {
  let items = await loadTestimonials(env, b);
  const layout = (p.classes.find((c) => c.startsWith("s-testimonial-layout-")) || "s-testimonial-layout-cards").slice("s-testimonial-layout-".length);
  if (layout === "before-after") items = items.filter((t) => t.before && t.after);
  if (!items.length) return ""; // nothing consented to show: omit the section entirely
  const who = (t: any) => `<figcaption class="testimonial__who"><strong>${esc(t.name)}</strong>${t.role ? ` · ${esc(t.role)}` : ""}</figcaption>`;
  const portrait = (t: any) => (t.portraitFile ? `<span class="testimonial__portrait"><img src="${esc(assetUrl(t.portraitFile))}" alt="${esc(t.portraitAlt)}" loading="lazy"></span>` : "");
  const video = (t: any) => (t.videoUid ? mediaButton(t.videoUid, `Watch ${t.name}'s story`, t.portraitFile) : "");
  const story = (t: any) => (t.story ? `<details class="testimonial__story"><summary>Read ${esc(t.name)}'s story</summary>${md(t.story)}</details>` : "");
  let inner: string;
  if (layout === "quote") {
    inner = `<div class="testimonials testimonials--quote">${items.map((t) => `<figure class="testimonial"><blockquote>${esc(t.quote)}</blockquote>${who(t)}</figure>`).join("")}</div>`;
  } else if (layout === "portrait") {
    inner = `<div class="testimonials testimonials--portrait">${items.map((t) => `<figure class="testimonial">${portrait(t)}<div class="testimonial__body"><blockquote>${esc(t.quote)}</blockquote>${who(t)}${video(t)}</div></figure>`).join("")}</div>`;
  } else if (layout === "before-after") {
    inner = `<div class="testimonials testimonials--ba">${items
      .map((t) => `<figure class="testimonial"><div class="ba"><div class="ba__side"><span class="ba__label">Before</span><p>${esc(t.before)}</p></div><div class="ba__side ba__side--after"><span class="ba__label">After</span><p>${esc(t.after)}</p></div></div>${who(t)}</figure>`)
      .join("")}</div>`;
  } else if (layout === "carousel") {
    const n = items.length;
    inner = `<div class="carousel" data-carousel>
      <div class="carousel__track" tabindex="0" role="region" aria-roledescription="carousel" aria-label="${esc(plainHeadline(b.heading) || "Singer stories")}">${items
        .map((t, i) => `<figure class="carousel__slide testimonial" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}">${portrait(t)}<blockquote>${esc(t.quote)}</blockquote>${who(t)}</figure>`)
        .join("")}</div>
      <div class="carousel__controls"><button type="button" class="carousel__prev" aria-label="Previous story">&lsaquo;</button><span class="carousel__count" aria-live="polite">1 / ${n}</span><button type="button" class="carousel__next" aria-label="Next story">&rsaquo;</button></div>
    </div>`;
  } else {
    inner = `<ul class="testimonials testimonials--cards">${items
      .map((t) => `<li><figure class="testimonial-card testimonial">${portrait(t)}<blockquote>${esc(t.quote)}</blockquote>${who(t)}${story(t)}${video(t)}</figure></li>`)
      .join("")}</ul>`;
  }
  return `<section class="section${ivory}"><div class="container">
    ${b.heading ? `<h2 class="section-title">${headline(b.heading)}</h2>` : ""}
    ${inner}
  </div></section>`;
}

/* ------------------------------ Helpers -------------------------------- */

async function listIds(env: Env, collection: string): Promise<string[]> {
  const { results } = await env.DB.prepare("SELECT id FROM documents WHERE collection=? ORDER BY id")
    .bind(collection)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}
async function readJson(env: Env, collection: string, id: string): Promise<any | null> {
  const row = await env.DB.prepare("SELECT data FROM documents WHERE collection=? AND id=?")
    .bind(collection, id)
    .first<{ data: string }>();
  if (!row) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

/* --------------------------- Header / footer --------------------------- */

function renderHeader(site: any): string {
  const nav = (site?.nav || [])
    .map((n: any) => `<li><a class="nav__link" href="${esc(n.href)}">${esc(n.label)}</a></li>`)
    .join("");
  const cta = site?.cta ? `<a class="button nav__cta" href="${esc(site.cta.href)}">${esc(site.cta.label)}</a>` : "";
  return `<header class="site-header">
  <div class="masthead"><div class="container--wide masthead__inner">
    <a class="wordmark" href="/" aria-label="Julie Bale — home"><img class="wordmark__logo" src="/assets/logo.png" alt="Julie Bale"></a>
    <button class="nav-toggle" aria-expanded="false" aria-controls="primary-nav" aria-label="Open menu"><span></span><span></span><span></span></button>
  </div></div>
  <nav class="nav" id="primary-nav" aria-label="Primary"><div class="container--wide nav__inner">
    <ul class="nav__list">${nav}</ul>
    ${cta}
  </div></nav>
</header>`;
}

function renderFooter(site: any): string {
  const f = site?.footer || {};
  const cols = (f.columns || [])
    .map(
      (c: any) => `<div class="footer__col"><h4>${esc(c.heading)}</h4><ul>${(c.links || [])
        .map((l: any) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`)
        .join("")}</ul></div>`
    )
    .join("");
  const legal = (f.legal || []).map((l: any) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join("");
  return `<footer class="site-footer">
  <div class="container--wide">
    <div class="footer__grid">
      <div class="footer__brand"><img class="wordmark__logo" src="/assets/logo.png" alt="Julie Bale" style="height:2.4rem">${
        f.tagline ? `<p>${esc(f.tagline)}</p>` : ""
      }</div>
      ${cols}
    </div>
    <div class="footer__bottom"><span>${esc(f.copyright || "")}</span><nav aria-label="Legal">${legal}</nav></div>
  </div>
</footer>`;
}

/* ------------------------------- Page ---------------------------------- */

// Motion is progressive enhancement: content is visible unless <html> has the
// `js` class. This adds it synchronously, and removes it after 2.5 s unless
// app.js has started (window.__jbMotion), so a slow or blocked app.js can
// never leave content hidden.
export const MOTION_GUARD =
  `<script>(function(d){d.classList.add("js");setTimeout(function(){if(!window.__jbMotion)d.classList.remove("js")},2500)})(document.documentElement)</script>`;

export interface RenderOptions {
  /** Render as an unlisted preview: noindex plus a "not live" banner. */
  preview?: { label: string };
}

/** Short chapter label for scene navigation: the section's own words, trimmed. */
function chapterLabel(b: any, n: number): string {
  const raw = plainHeadline(b.eyebrow || b.heading || b.statement || b.quote || b.title || `Chapter ${n}`).replace(/\s+/g, " ").trim();
  return raw.length > 42 ? raw.slice(0, 40).trimEnd() + "…" : raw;
}

/** Chapter rail / current-chapter label (design.scene_nav), linking #chapter-NN. */
function renderSceneNav(mode: string, chapters: Array<{ n: number; label: string }>): string {
  if (chapters.length < 2) return "";
  const id = (n: number) => `chapter-${String(n).padStart(2, "0")}`;
  // rail: wide screens only; label: everywhere; both: rail on wide screens, label on phones
  const cls = mode === "rail" ? "scene-nav--rail" : mode === "label" ? "scene-nav--label" : "scene-nav--rail scene-nav--label-narrow";
  return `<nav class="scene-nav ${cls}" aria-label="Chapters"><ol>${chapters
    .map((c) => `<li><a href="#${id(c.n)}" data-chapter="${id(c.n)}"><span class="scene-nav__no">${String(c.n).padStart(2, "0")}</span><span class="scene-nav__label">${esc(c.label)}</span></a></li>`)
    .join("")}</ol></nav>`;
}

export async function renderPage(env: Env, page: any, site: any, opts: RenderOptions = {}): Promise<string> {
  page = await resolveAssetRefs(env, page);
  let chapter = 0;
  const chapters: Array<{ n: number; label: string }> = [];
  const sections = await Promise.all(
    (page.sections || []).map((b: any, i: number) => {
      const p = resolveSection(b);
      const n = p.chapter ? ++chapter : 0;
      if (n) chapters.push({ n, label: chapterLabel(b, n) });
      return renderBlock(env, b, i, p).then((html) => decorate(html, p, n, plainHeadline(b.heading || b.statement || "")));
    })
  );
  const design = resolveDesign(page.design);
  const desc = page?.seo?.description || site?.brand?.tagline || "";
  const noindex = page.noindex || opts.preview ? `<meta name="robots" content="noindex">` : "";
  const bodyClass = design.bodyClasses.length ? ` class="${design.bodyClasses.join(" ")}"` : "";
  const progress =
    (design.progress ? `<div class="progress-line" aria-hidden="true"></div>` : "") +
    (design.sceneNav ? renderSceneNav(design.sceneNav, chapters) : "");
  const banner = opts.preview ? `<div class="preview-banner" role="note">Preview · ${esc(opts.preview.label)} · not live</div>` : "";
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(page.title)}</title>
  <meta name="description" content="${esc(desc)}">
  ${noindex}
  ${MOTION_GUARD}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Raleway:wght@400;500;600;700&display=swap">
  <link rel="stylesheet" href="/styles.css">
</head>
<body${bodyClass}>
  ${banner}${progress}<a class="skip-link" href="#main">Skip to content</a>
  ${renderHeader(site)}
  <main id="main">
    ${sections.join("\n")}
  </main>
  ${renderFooter(site)}
  <script src="/app.js" defer></script>
</body>
</html>`;
}

// Build a page (block model) from a collection document, for detail routes.
export function pageFromDoc(collection: string, doc: any): any {
  if (collection === "events") {
    const when = [doc.starts_at, doc.ends_at].filter(Boolean).join(" – ");
    const meta = [when, doc.location].filter(Boolean).join(" · ");
    return {
      title: doc.title,
      seo: { description: doc.description || "" },
      sections: [
        { type: "statement", statement: doc.title, sub: meta },
        doc.description ? { type: "richtext", body: doc.description } : null,
        doc.details ? { type: "richtext", heading: "Details", body: doc.details } : null,
        { type: "cta", heading: "Interested? Come and sing with me.", cta: { label: "Get in touch", href: "/start" } },
      ].filter(Boolean),
    };
  }
  if (collection === "courses") {
    return {
      title: doc.title,
      seo: { description: doc.description || "" },
      sections: [
        { type: "statement", statement: doc.title, sub: doc.description || "" },
        { type: "lessons", items: doc.lessons || [] },
      ],
    };
  }
  if (collection === "posts") {
    return {
      title: doc.title,
      seo: { description: doc.excerpt || "" },
      sections: [
        { type: "statement", statement: doc.title, sub: doc.date || "" },
        doc.body ? { type: "richtext", body: doc.body } : null,
      ].filter(Boolean),
    };
  }
  return { title: doc.title || "", sections: [{ type: "richtext", heading: doc.title, body: "" }] };
}

// Serve a landing page inside the site header/footer. Its HTML and CSS are
// sanitised on every render (src/sanitize.ts): CSS is scoped to .landing and
// can only style the landing content, never the site chrome.
export function renderLanding(doc: any, site: any): string {
  const html = typeof doc.html === "string" ? doc.html : "";
  const { css: style, body } = sanitizeLanding(html);
  const main = `<div class="landing">${body}</div>`;
  const title = doc.title || (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || "Julie Bale";
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Raleway:wght@400;500;600;700&display=swap">
  ${MOTION_GUARD}
  <link rel="stylesheet" href="/styles.css">
  <style>${style}</style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  ${renderHeader(site)}
  <main id="main">${main}</main>
  ${renderFooter(site)}
  <script src="/app.js" defer></script>
</body>
</html>`;
}

export async function render404(site: any): Promise<string> {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Not found — Julie Bale</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500&family=Raleway:wght@400;600&display=swap"></head><body>${renderHeader(site)}<main id="main"><section class="section quiet"><div class="container--reading"><p class="statement--lead">This page has wandered off.</p><p><a class="textlink" href="/">Back to the beginning <span class="arrow">&rsaquo;</span></a></p></div></section></main>${renderFooter(site)}</body></html>`;
}
