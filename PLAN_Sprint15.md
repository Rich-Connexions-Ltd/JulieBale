# Sprint 15: Landing Page Sanitiser

## Spec References
- Owner decision (2026-09-28): add a sanitiser for `/l/{slug}` landing pages
  (previously recorded as accepted risk in Sprints 10 and 14 findings).
- Review mode: council (security work).

## Current State
- Landing pages are documents `landing/{slug}` = `{title, html}` written through
  the bearer-authenticated API/MCP. `renderLanding()` (`mcp/src/render.ts`)
  extracts the first `<style>` block and the `<main>` (or `<body>`) contents
  with regexes and inserts both **unsanitised** into the site chrome.
- Anyone holding the API key (Julie's GPT, MCP clients) can therefore publish
  script, event handlers, `javascript:` URLs, iframes or CSS that runs or
  exfiltrates on the public site. A compromised or confused assistant is the
  realistic threat, not an anonymous visitor.
- The one existing landing page (`singing-story-audit`, 15.5 KB) uses only:
  html/head/meta/title/style/body/header/footer/main/section/aside/div/span/
  h1–h3/p/strong/br/a/form/input/label/button; attributes class, id, href
  (`#…` and `https://www.juliebale.com…`), action `#step1`, method, type, name,
  placeholder, required, one inline `style="color:#e6bf72"`; no scripts,
  handlers, `url()` or `@import`. The sanitiser must leave its rendering
  unchanged (golden test).

## Goals / Non-goals
**Goals:** landing HTML and CSS can never execute script, load active content,
navigate to dangerous schemes, or break out of the page structure, regardless of
what is stored; authors get warnings describing what was removed.
**Non-goals:** sanitising other collections (they are rendered through
escaping already); changing the landing-page authoring format; a general CSP
for the whole site (only landing pages get a CSP here).

## Proposed Solution

### Approach (R2: narrowed to the landing-page need)
A **minimal allowlist** derived from what landing pages actually use, a
**scoped CSS allowlist with no URLs at all**, namespaced ids, and a strict CSP.
Applied at render time (covers stored documents); a separate pure function
produces write-time warnings.

Profile of the existing landing page (the requirement baseline): tags
html/head/meta/title/style/body/header/footer/main/section/aside/div/span/
h1–h3/p/strong/br/a/form/input/label/button; input types text, email, radio,
checkbox; one inline `style`; CSS uses only `@media`, custom properties,
positions absolute/relative/sticky, `z-index: 10`, and **no `url()`, no
backslashes, no `@import`**. Its selectors include `.nav`, `.section`,
`.eyebrow`, `a`, `body`, `html`, `*` — today these **leak into the site
header/nav**; scoping fixes that existing bug.

### Component 1 — `mcp/src/sanitize.ts` (new), three separate pure functions
1. `extractLanding(html) → { css: string[], body: string }` — structure only:
   every `<style>` block's text, and the inner HTML of `<main>` (else `<body>`,
   else the whole input). No filtering here; everything it returns is then
   filtered.
2. `sanitizeLandingHtml(body) → { html, notes }` using js-xss as the parser with
   a strict allowlist:
   - **Tags — baseline** (used by the existing page): `section header footer
     aside div span p h1 h2 h3 strong br a form label input button`.
     **Named extension** (common in landing copy, passive): `h4 em ul ol li
     img`. Everything else removed (with content for `script style noscript
     template iframe object embed svg math meta link base`). No iframes,
     video, audio, tables, select/textarea/fieldset.
   - **Attributes:** global `class id title aria-label aria-hidden`
     (no `role`, `lang`, `hidden`, other `aria-*`, `data-*`); `a`: `href target
     rel`; `img`: `src alt width height loading`; `form`: `action method`;
     `input`: `type name value placeholder required checked autocomplete`;
     `label`: `for`; `button`: `type`; `style` on any allowed tag
     (declarations through the CSS allowlist). No `srcset`, no event handlers.
   - **Namespacing:** `id="x"` → `id="l-x"`; `label for`, and fragment
     `href="#x"` / `action="#x"` are rewritten to `#l-x`, so landing ids cannot
     collide with site ids (`main`, `primary-nav`) and in-page links keep
     working. `class` values limited to `[A-Za-z0-9_-]` tokens (styling is
     scoped, below).
   - **URL policies, per attribute type** (`urlPolicy` unit): the value is
     entity-decoded; any value containing a backslash, whitespace or control
     character, or starting with `//` (protocol-relative), is rejected; then it
     is parsed with `new URL(value, "https://site.invalid/")`.
     - `a href`: fragment (`#…`), same-origin path (parsed origin equals the
       base), `mailto:`, `tel:`, or an **explicit absolute** `https:` URL.
       `http:` is rejected (not upgraded).
     - `img src`: same-origin path under `/assets/` or `/media/` only —
       already-public static files, served without any D1 lookup (asset
       references are not resolved in landing pages). No external loads, so no
       tracking pixels.
     - `form action`: fragment or same-origin path only. `formaction` never allowed.
   - **Forms:** input `type` limited to `text email tel number radio checkbox
     submit` (no `password`, `file`, `hidden`); `autocomplete` values limited to
     `name given-name family-name email tel off` (no `cc-*`, `current-password`).
   - `target="_blank"` forces `rel="noopener noreferrer"`.
3. `sanitizeLandingCss(css) → { css, notes }` — **allowlist**, via a small
   brace parser (comments stripped first):
   - Only plain rules and `@media` blocks; every other at-rule removed.
   - Every selector is **scoped** under `.landing` (`:root`, `html`, `body`
     become `.landing`; `*` becomes `.landing *`), so landing CSS can only style
     landing content.
   - Declarations (`cssPolicy` unit, constants in one place): **baseline** = the
     existing page's properties (`align-items backdrop-filter background border
     border-bottom border-color border-left border-radius border-top bottom
     box-shadow box-sizing color content cursor display filter flex-wrap font
     font-family font-size font-weight gap grid-template-columns height
     justify-content letter-spacing line-height margin margin-bottom
     margin-right margin-top max-width min-height outline overflow padding
     padding-bottom padding-top position right scroll-behavior
     scroll-margin-top text-decoration text-transform top transform transition
     width z-index`, plus custom properties `--[a-z0-9-]+`); **named
     extension** = `text-align font-style opacity left margin-left
     padding-left padding-right background-color flex flex-direction
     list-style white-space min-width grid-column`. `position` limited to
     `static relative absolute sticky` (no `fixed` overlays); `z-index` 0–50.
   - Values rejected if they contain `url(`, `image-set(`, `expression`,
     `\` (no escapes at all), `<`, `@`, `javascript:`/`vbscript:`, or
     `attr(`. Background images therefore only via gradients.
   - The same declaration filter applies to `style` attributes.
- **Notes** (for warnings) are generic, structural and capped at 30:
  e.g. "removed <script> element", "removed onclick attribute from <button>",
  "removed unsafe link (javascript:) from <a>", "removed CSS url()". They never
  echo attribute values or payload text.

- **Module structure:** `sanitize.ts` is organised as small units —
  `htmlPolicy` (tag/attribute constants), `urlPolicy`, `cssPolicy`,
  `rewriteLandingIds`, and a `NoteCollector` — plus the three public functions.

### Component 2 — render and write paths
- `renderLanding()` = extract → sanitise HTML → sanitise CSS → wrap body in
  `<div class="landing">` inside `<main>`. Sanitiser exceptions render an empty
  landing body (fail closed).
- Write warnings: `landingWarnings(html)` (collects the notes from the same
  functions; independent of render output shape) wired into `warningsFor` for
  `landing/*` (MCP write/update and REST PUT/PATCH).
- Stored HTML is not rewritten; render-time sanitisation is the guarantee.

### Component 3 — CSP on `/l/` responses (defence in depth)
`default-src 'none'; script-src 'sha256-<MOTION_GUARD>' <origin>/app.js;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src
https://fonts.gstatic.com; img-src 'self'; form-action 'self'; base-uri 'none';
frame-ancestors 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'`.
Only the exact guard hash and the exact app.js URL may run. The hash is
computed from the `MOTION_GUARD` constant and a test recomputes it.

### Library and size
js-xss (pure JS, no DOM). Budget: bundled Worker size increase ≤ 40 KB gzip,
measured with `wrangler deploy --dry-run --outdir` before/after and recorded;
the sanitiser runs only on `/l/` requests.

### Documentation (one canonical source)
- `mcp/context/content-model.md` gets the canonical "Landing pages" section:
  allowed tags, attributes, URL rules, CSS rules, id namespacing, what warnings
  mean, and **what to use instead** of blocked content: videos/audio/embeds →
  a `media` block on a normal page, or a link to it; images → files in
  `/assets/` or uploaded media (`/media/…`), not external URLs or asset
  references; interactive widgets/scripts → request a feature.
- MCP `write_content`/`update_content` and OpenAPI `writeContent`/`updateContent`
  descriptions add one sentence: landing HTML is sanitised; see the content
  model; warnings list what was removed (≤ 300 chars).
- README: two-line summary pointing to the content model.
- **Drift guard:** a test asserts every allowed tag, attribute, input type and
  CSS property constant appears in the content-model section.

### Data Flow
`GET /l/{slug}` → read → `extractLanding` → `sanitizeLandingHtml` +
`sanitizeLandingCss` → `renderLanding` → response + CSP.
Write: `landing/*` → `landingWarnings` → warnings.

### Error Handling
Parser handles malformed input; any exception → empty landing body, site chrome
intact. Non-string html → empty.

## Test Strategy
1. **Property / invariant coverage** — XSS corpus (OWASP filter-evasion cases:
   script in many casings, event handlers, `javascript:` with
   entities/whitespace/newlines/tabs/case/control chars, SVG/MathML vectors,
   `<img src=x onerror>`, `<iframe srcdoc>`, meta refresh, base href,
   formaction, `data:` URLs, external `img` hosts, `http:` links, CSS
   `url()`/`expression`/`@import`/escapes/`</style>` breakout, `position:
   fixed` overlays, attribute-selector exfiltration). Invariants on output: no
   `<script`, no `on\w+=`, no disallowed tag/attribute, every URL passes its
   attribute's policy, every CSS selector starts with `.landing`, no banned CSS
   tokens, all ids start `l-`.
2. **Failure-path coverage** — malformed/unclosed markup, empty/non-string,
   1 MB input under budget, forced exception → empty body.
3. **Regression guards** — the real landing page: rendered text content, form
   controls, link targets (rewritten `#l-…`) and CSS declarations match the
   original apart from scoping/namespacing (normalised comparison); a test that
   site-chrome selectors (`.nav`, `.section`) no longer escape the landing
   scope; CSP present with the recomputed guard hash; warnings via REST
   PUT/PATCH; docs drift guard; existing site goldens unchanged.
4. **Fixture reuse** — landing fixture copied from the repo HTML; `fakeEnv`.
5. **Runtime budget** — suite < 6 s.

## Files to Create/Modify
| File | Action | Purpose |
|------|--------|---------|
| `mcp/src/sanitize.ts` | Create | extractLanding, sanitizeLandingHtml, sanitizeLandingCss, landingWarnings |
| `mcp/src/render.ts` | Modify | renderLanding uses them; `.landing` wrapper |
| `mcp/src/index.ts` | Modify | landing warnings; CSP on `/l/`; tool and OpenAPI descriptions |
| `mcp/package.json` | Modify | `xss` dependency |
| `mcp/context/content-model.md` | Modify | Canonical landing-page rules |
| `mcp/README.md` | Modify | Two-line summary |
| `mcp/test/sanitize.test.ts`, `mcp/test/fixtures/landing-audit.html` | Create | Corpus, golden, drift guard |
| `CHANGES.md`, `SPRINTS.md` | Modify | Records |

## Open Questions
1. None blocking. SVG/MathML, iframes and media are out of scope (use page blocks).

## Risks and Mitigations
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sanitiser bypass | Low | High | Parser-based allowlist, decoded-scheme checks, payload corpus, CSP as second layer |
| Legitimate landing markup stripped | Medium | Medium | Golden on the real landing page; warnings tell authors what was removed |
| Library size/perf in Worker | Low | Low | ~145 KB unpacked; landing pages only; measured in tests |
| CSP breaks the page (fonts, guard) | Medium | Medium | Guard hash test; fonts allowed; browser check of the real landing page |

## Revision History
| Round | Date | Changes |
|-------|------|---------|
| R1 | 2026-09-28 | Initial draft |
| R2 | 2026-09-28 | Narrowed allowlist to the landing need (no iframe/media/tables/data-*/srcset); scoped CSS allowlist with no url() at all, position/z-index limits; id namespacing and class token rule; per-attribute URL policies, http rejected, same-origin images/forms; form input/autocomplete limits; exact-hash CSP; extraction separated from filtering; warnings from a separate function, generic and capped; canonical docs + drift guard; bundle-size budget. |
| R3 | 2026-09-28 | URL validation via new URL() with backslash/whitespace/protocol-relative rejection and parsed same-origin checks (R2-1); tags/attributes cut to baseline + named passive extension, role/lang/hidden/most aria dropped (R2-2, R2-6); CSS properties = baseline + named extension, centralised constants (R2-3); docs say what to use instead of blocked media (R2-4); images static paths only, no D1 lookups (R2-5); module split into policy units (R2-7). |
