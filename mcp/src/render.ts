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

const img = (file: string, alt: string, cls = ""): string =>
  file ? `<img src="/assets/${esc(file)}" alt="${esc(alt)}"${cls ? ` class="${cls}"` : ""}>` : "";

const button = (cta: any, cls = "button"): string =>
  cta && cta.label ? `<a class="${cls}" href="${esc(cta.href || "#")}">${esc(cta.label)}</a>` : "";

const textlink = (cta: any): string =>
  cta && cta.label
    ? `<a class="textlink" href="${esc(cta.href || "#")}">${esc(cta.label)} <span class="arrow" aria-hidden="true">&rsaquo;</span></a>`
    : "";

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
      const ids = await listIds(env, b.collection);
      const rows = await Promise.all(ids.map((id) => readJson(env, b.collection, id)));
      const items = rows.filter(Boolean);
      return `<section class="section${ivory}"><div class="container">
    ${b.heading ? `<h2 class="section-title">${esc(b.heading)}</h2>` : ""}
    ${
      items.length
        ? `<ul class="listing">${items
            .map(
              (d: any) =>
                `<li class="listing__item"><span class="listing__title">${esc(d.title)}</span>${
                  d.starts_at || d.date ? `<span class="listing__meta">${esc(d.starts_at || d.date)}${d.location ? " · " + esc(d.location) : ""}</span>` : ""
                }${d.description ? `<p>${esc(d.description)}</p>` : ""}</li>`
            )
            .join("")}</ul>`
        : `<p class="muted">${esc(b.empty || "Nothing here yet.")}</p>`
    }
  </div></section>`;
    }

    case "accordion": {
      const groups = await Promise.all(
        (b.items || []).map(async (grp: any) => {
          const ids = await listIds(env, grp.collection);
          const rows = (await Promise.all(ids.map((id) => readJson(env, grp.collection, id)))).filter(Boolean);
          const inner = rows.length
            ? `<ul class="listing">${rows
                .map((d: any) => `<li class="listing__item"><span class="listing__title">${esc(d.title)}</span>${d.date || d.starts_at ? `<span class="listing__meta">${esc(d.date || d.starts_at)}</span>` : ""}</li>`)
                .join("")}</ul>`
            : `<p class="muted">${esc(grp.empty || "Nothing here yet.")}</p>`;
          return `<details class="accordion__item"><summary>${esc(grp.title)}</summary><div class="accordion__body">${inner}</div></details>`;
        })
      );
      return `<section class="section"><div class="container--reading reveal">${groups.join("\n")}</div></section>`;
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

export async function render404(site: any): Promise<string> {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Not found — Julie Bale</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500&family=Raleway:wght@400;600&display=swap"></head><body>${renderHeader(site)}<main id="main"><section class="section quiet"><div class="container--reading"><p class="statement--lead">This page has wandered off.</p><p><a class="textlink" href="/">Back to the beginning <span class="arrow">&rsaquo;</span></a></p></div></section></main>${renderFooter(site)}</body></html>`;
}
