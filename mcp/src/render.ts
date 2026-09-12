/**
 * Server-side renderer: turns a block-based page document (from D1) into HTML,
 * reusing the prototype's teal/gold/cream design system (public/styles.css).
 */

interface Env {
  DB: D1Database;
}

const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Convert plain text with blank-line paragraphs into <p> blocks.
const paras = (body: string): string =>
  String(body || "")
    .split(/\n\s*\n/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");

// Resolve an image/media reference: absolute (http / leading slash) stays as-is;
// a bare filename is a bundled design asset (/assets); an R2 key uses /media.
const assetUrl = (file: string): string => (!file ? "" : /^(https?:|\/)/.test(file) ? file : `/assets/${file}`);
const mediaUrl = (key: string): string => (!key ? "" : /^(https?:|\/)/.test(key) ? key : `/media/${key}`);

const img = (file: string, alt: string, cls = ""): string =>
  file ? `<img src="${esc(assetUrl(file))}" alt="${esc(alt)}"${cls ? ` class="${cls}"` : ""}>` : "";

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

async function renderBlock(env: Env, b: any, i: number): Promise<string> {
  // alternate cream/ivory grounds for calm full-width content sections
  const ivory = i % 2 === 1 ? " ground-ivory" : "";

  switch (b.type) {
    case "hero":
      return `<section class="hero-stage media-band">
  ${img(b.image, b.heading || "Julie Bale")}
  <div class="media-band__scrim"></div>
  <div class="media-band__inner"><div class="container--wide reveal">
    ${b.kicker ? `<p class="kicker">${esc(b.kicker)}</p>` : ""}
    <h1>${esc(b.heading)}</h1>
    ${b.intro ? `<p class="lede">${esc(b.intro)}</p>` : ""}
    ${button(b.cta)}
  </div></div>
</section>`;

    case "statement":
      return `<section class="section quiet${ivory}"><div class="container--reading reveal">
    ${b.eyebrow ? `<p class="kicker">${esc(b.eyebrow)}</p>` : ""}
    <p class="statement--lead">${esc(b.statement)}</p>
    ${b.sub ? `<p>${esc(b.sub)}</p>` : ""}
  </div></section>`;

    case "showcase":
      return `<section class="showcase"><div class="showcase__grid">
    <div class="showcase__media reveal">${
      b.image
        ? img(b.image, b.heading || "")
        : `<span class="showcase__ph">${esc(b.heading)}<span>Large performance / Diva photograph</span></span>`
    }</div>
    <div class="showcase__body reveal">
      <h2>${esc(b.heading)}</h2>
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
    ${b.heading ? `<h2 class="section-title">${esc(b.heading)}</h2>` : ""}
    <div class="panels stagger">
      ${(b.items || [])
        .map(
          (it: any) => `<a class="panel" href="${esc(it.href || "#")}">
        <span class="panel__media">${
          it.image ? img(it.image, it.title || "") : `<span class="panel__ph">${esc(it.title)}</span>`
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
    <div class="feature__media reveal"><figure class="frame image--portrait">${
      b.image ? img(b.image, b.heading || "") : `<figcaption class="frame__label">${esc(b.heading)}</figcaption>`
    }</figure></div>
    <div class="feature__body reveal">
      ${b.eyebrow ? `<p class="eyebrow">${esc(b.eyebrow)}</p>` : ""}
      <h2>${esc(b.heading)}</h2>
      ${b.body ? paras(b.body) : ""}
      ${textlink(b.cta)}
    </div>
  </div></section>`;

    case "duo":
      return `<section class="section"><div class="container">
    ${b.heading ? `<h2 class="section-title section-title--centre">${esc(b.heading)}</h2>` : ""}
    <div class="duo stagger">
      ${(b.items || [])
        .map(
          (it: any) => `<article class="duo__item">
        <span class="duo__media">${it.image ? img(it.image, it.title || "") : `<span class="duo__ph">${esc(it.title)}</span>`}</span>
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
    <h2>${esc(b.heading)}</h2>
    ${b.note ? `<p class="cta-band__note">${esc(b.note)}</p>` : ""}
    ${button(b.cta)}
  </div></section>`;

    case "doorway":
      return `<section class="section--tight ground-ivory doorway"><div class="container--reading reveal">
    <h2>${esc(b.heading)}</h2>
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
    ${b.heading ? `<h2 class="section-title">${esc(b.heading)}</h2>` : ""}
    ${b.body ? paras(b.body) : ""}
  </div></section>`;

    case "form":
      return `<section class="section ground-ivory"><div class="container--reading reveal">
    ${b.heading ? `<h2 class="section-title">${esc(b.heading)}</h2>` : ""}
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
    ${b.heading ? `<h2 class="section-title">${esc(b.heading)}</h2>` : ""}
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
      const heading = b.heading ? `<h2 class="section-title">${esc(b.heading)}</h2>` : "";
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
      ${l.body ? paras(l.body) : ""}
    </article>`
            )
            .join("")
        : `<p class="muted">${esc(b.empty || "Lessons coming soon.")}</p>`
    }
  </div></section>`;
    }

    case "calendar": {
      const items = await upcomingDates(env);
      const heading = b.heading ? `<h2 class="section-title">${esc(b.heading)}</h2>` : "";
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

    default:
      return `<!-- unknown block type: ${esc(b.type)} -->`;
  }
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

export async function renderPage(env: Env, page: any, site: any): Promise<string> {
  const sections = await Promise.all((page.sections || []).map((b: any, i: number) => renderBlock(env, b, i)));
  const desc = page?.seo?.description || site?.brand?.tagline || "";
  const noindex = page.noindex ? `<meta name="robots" content="noindex">` : "";
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(page.title)}</title>
  <meta name="description" content="${esc(desc)}">
  ${noindex}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Raleway:wght@400;500;600;700&display=swap">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
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

// Serve a raw landing page inside the site header/footer, keeping its own <style>.
export function renderLanding(doc: any, site: any): string {
  const html = String(doc.html || "");
  const style = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || "";
  const main =
    (html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) || [])[1] ||
    (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [])[1] ||
    html;
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
