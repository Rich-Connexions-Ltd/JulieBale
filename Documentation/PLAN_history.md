# Plan History

Consolidated history of archived sprint plans.

---

# Sprint 10: Homepage Art Direction & Concept Previews

_Archived: 2026-09-28_

# Sprint 10: Homepage Art Direction & Concept Previews

## Spec References
- Feature requests #3–#8 in D1 `feature_requests` (logged 2026-09-28 by a chat
  session exploring three homepage concepts). Summarised in *Requirements* below.
- `SPRINTS.md` → Sprint 10.
- Existing code: `mcp/src/render.ts` (server renderer), `mcp/src/index.ts`
  (D1 store, MCP tools, REST, **OpenAPI schema in `openApiSchema()`**, router),
  `mcp/public/styles.css`, `mcp/public/app.js`, `mcp/context/content-model.md`
  (the context pack chat assistants read before editing; also stored in D1 as
  `context/content-model`).

## Current State
- The site is server-rendered by a Cloudflare Worker from JSON documents in D1.
  A page is `{title, seo, sections: [block, ...]}`; `renderBlock()` has a fixed
  layout per block type.
- Section backgrounds alternate cream/ivory automatically by index. No block has
  presentation options beyond `feature.reverse`.
- Every document has an unused `status` column; there is no way to preview a
  page before it is live.
- Motion: `.reveal`/`.stagger` fade content in via `app.js`. **Existing defect:**
  `.reveal { opacity: 0 }` applies unconditionally, so with JavaScript disabled
  or `app.js` failing, most of every page is invisible.
- All `/api/*` routes and `/mcp`, `/sse` require the bearer `API_KEY`. Every
  write is versioned and undoable (`versions` table).
- No automated tests exist in `mcp/`; only `tsc --noEmit`.

## Requirements (from the feature requests)
| # | Requirement (condensed) |
|---|---|
| 6 | Up to three **unpublished homepage variants**, sharing the live page's copy, with independent section order and presentation, each with a preview URL; live homepage untouched. |
| 3 | Presentation-only controls: page-level design concept; per-section theme (light / deep teal / near-black); full-bleed vs contained; spacing presets; optional antique-gold rule. Existing palette and type only. |
| 4 | Hero options: full-viewport editorial, split image/copy, portrait crop / focal point, copy alignment and max width, optional kicker (already exists), image treatment (teal overlay / cream field). |
| 5 | Showcase / feature / duo / pullquote: image left/right, portrait/landscape/bleed crop, text–image overlap, asymmetric grid, oversized pullquote, optional caption, mobile stacking order. |
| 7 | Optional chapter numbers and/or a slim progress line across a sequence of sections; no new copy required. |
| 8 | Lightweight, selectable animation vocabulary (fade/slide/scale/reveal entrances, stagger, image mask reveals, subtle parallax, hover/focus, animated rules/markers/CTA accents, hero text sequencing) with restrained speed presets; no layout shift; reduced motion; keyboard safe; clean no-JS fallback. |

## Scope decision (response to R1 finding 7)
The council recommended cutting the vocabulary to a minimum. The requests above
explicitly ask for each control, so cutting them would not deliver the sprint.
Instead this plan: (a) keeps only controls that trace to a request row (see the
**Req** column below), (b) drops `mobile_first` (the one control that risks
visual/reading-order divergence — see *Accessibility*), (c) implements every
control as a CSS modifier on existing markup with a hard **CSS budget of +350
lines**, and (d) reuses the existing reveal observer for all motion. Any control
that cannot be delivered within budget is deferred and recorded in CHANGES.md
rather than squeezed in.

## Glossary (shared by code, tool descriptions, OpenAPI and content-model.md)
- **Base page** — a live document in `pages` (e.g. `pages/home`).
- **Section** — one block in a page's `sections` array.
- **Section key** — a stable, persisted `key` string on a section (e.g. `hero-1`), used by variants to reference it.
- **Style** — the optional `style` object on a section: presentation only, never copy.
- **Design** — the optional `design` object on a page or variant: page-level presentation.
- **Concept** — `design.concept`, one of three whole-page looks.
- **Variant** — an unpublished document in `variants` that references a base page's sections by key and supplies its own order, style and design.
- **Preview** — a variant rendered at its private preview URL.
- **Publish** — writing a variant's order/style/design into its base page (undoable).
- **Presentation warning** — a message returned on write when a `style`/`design` value is not in the allowlist (the value is ignored).

## Proposed Solution

### Approach
One allowlisted **presentation vocabulary**, resolved by a pure module into CSS
class names (plus one validated inline value). All visual behaviour lives in CSS
modifiers on existing markup. Variants are normalised into **ordinary page
documents** by a pure function, so previews, publishing and the live site share
the single existing renderer.

Rejected alternatives:
- *Copy the whole page into each variant* — copy drifts from Julie's live words.
- *Use the `status` column for a draft of `pages/home`* — only one draft per id.
- *Free-form class/style strings* — injection surface and design footgun.
- *A second `renderVariant()` path* — duplicates renderer behaviour (R1 finding 4).
- *A JS animation library* — heavier than needed.

### Component 1: Presentation vocabulary — `mcp/src/presentation.ts` (new, pure)
Every key has a fixed value set. Anything else is **ignored at render**,
**reported as a warning on write**, and **stripped on publish**.

Section `style` (any block):
| Key | Values | Req | Effect |
|---|---|---|---|
| `theme` | `cream` · `ivory` · `teal` · `night` | 3 | Background/text set. `night` = existing `--colour-ink`. Absent → today's alternation. |
| `width` | `contained` · `full` | 3 | `full` = full-bleed (edge to edge); `contained` = within the content width. |
| `spacing` | `compact` · `standard` · `generous` | 3 | Vertical padding presets. |
| `rule` | `true` | 3, 8 | Antique-gold hairline at section top; draws in on reveal. |
| `chapter` | `true` | 7 | Section takes the next chapter number. |
| `motion` | `none` · `fade` · `rise` · `scale` · `mask` · `drift` | 8 | Entrance (`mask` = image clip reveal; `drift` = subtle scroll-linked image movement). Absent → today's `reveal`. |
| `speed` | `gentle` · `standard` | 8 | Duration/distance preset. |

Block-specific `style` keys:
| Blocks | Key | Values | Req |
|---|---|---|---|
| hero | `hero` | `cinematic` (current, default) · `split` · `portrait` | 4 |
| hero | `align` | `left` · `centre` | 4 |
| hero | `measure` | `narrow` · `wide` | 4 |
| hero | `treatment` | `teal` (current scrim) · `cream` · `none` | 4 |
| hero | `focus` | `"<x>% <y>%"`, integers 0–100 | 4 |
| hero | `sequence` | `true` — kicker, heading, intro, CTA enter in turn | 8 |
| showcase, feature, duo | `image_side` | `left` · `right` | 5 |
| showcase, feature, duo | `crop` | `portrait` · `landscape` · `bleed` | 5 |
| showcase, feature | `overlap` | `true` — ≥ 60rem only; DOM order unchanged | 5 |
| showcase, feature | `grid` | `balanced` · `asymmetric` | 5 |
| pullquote | `size` | `standard` · `oversized` | 5 |

Content addition (Req 5): optional `caption` string on showcase, feature and duo
items, escaped, rendered as `<figcaption>`.

Page/variant `design`:
| Key | Values | Req | Effect |
|---|---|---|---|
| `concept` | `stage` · `editorial` · `journey` | 3 | `body` class tuning type scale and rhythm. (Hero default renamed `cinematic` so `stage` is not overloaded.) |
| `progress` | `true` | 7 | Slim progress line (Component 4). |

Deferred (not in this sprint): `mobile_first` (reading-order risk).

**Single source of truth (R2).** `PRESENTATION_OPTIONS` is canonical. The OpenAPI
`SectionStyle`/`PageDesign` enums and the `presentation_options` tool output are
**generated from it** at runtime. `content-model.md` is prose for assistants and
is hand-written, but a test asserts that every key and value in
`PRESENTATION_OPTIONS` appears in it, so the two cannot drift silently.

Module API (pure, unit-tested):
- `PRESENTATION_OPTIONS` — the allowlist as data, with a one-line meaning per value.
- `resolveSection(block, ctx): { classes: string[]; imgStyle?: string }` — only
  strings from `PRESENTATION_OPTIONS` reach `class=`. `focus` is parsed by
  `/^(\d{1,3})% (\d{1,3})%$/`, clamped 0–100, and emitted as
  `object-position:X% Y%` from the two integers.
- `resolveDesign(design): { bodyClasses: string[]; progress: boolean }`
- `presentationWarnings(doc): string[]` — messages name the key, the rejected
  value (JSON-stringified, truncated to 40 chars) and the allowed values.
- `sanitizePresentation(section|design)` — returns a copy containing only
  allowlisted keys/values (used by publish).

### Component 2: Renderer changes — `mcp/src/render.ts`
- `renderBlock()` adds resolved classes to the existing outer `<section>` and
  modifier classes to existing inner elements. **With no `style`, markup is
  unchanged** (homepage golden test).
- Automatic cream/ivory alternation applies only when `theme` is absent.
- Hero modifiers: `hero--split` (two-column grid of the same image + copy at
  ≥ 60rem, stacked image-then-copy below, matching DOM order), `hero--portrait`,
  `hero--cream`/`hero--plain`, alignment/measure classes; `focus` sets the
  `<img>` `style` attribute.
- Feature's existing `reverse: true` (image on the right) keeps working;
  `style.image_side` takes precedence when both are set.
- `renderPage(env, page, site, opts?)` gains `opts.preview?: { label: string }`,
  which only adds a `noindex` meta and a banner. Chapter numbers are computed in
  `renderPage()` in section order. Design body classes and the progress element
  are added here. The no-JS guard (Component 5) is added to `<head>`.
- No second render path: previews call `renderPage()` with a normalised page.

### Component 3: Variants and previews (#6) — `mcp/src/variants.ts` (new, pure) + `index.ts`

**Stable section keys (R1 finding 3).** Section keys are persisted, not derived
at read time:
- `ensureSectionKeys(page)` gives every section lacking a `key` a unique one of
  the form `<type>-<n>` (lowest unused `n` for that type) and never changes an
  existing key. Keys are validated: `^[a-z][a-z0-9-]{0,39}$`; invalid or
  duplicate keys are replaced and reported.
- It runs in the **central write path for the `pages` collection**
  (`writeDoc`/`mergeDoc`), so every page write — MCP, REST, publish, undo —
  keeps keys stable, and inserting or reordering sections never changes the key
  of an existing section.
- `create_page_variant` runs it on the base page first. This is a versioned
  write that adds `key` fields only; keys are never rendered, so the live page's
  HTML is unchanged (asserted by test).
- Limitation, documented for assistants: if a chat client rewrites `sections`
  and drops a section's `key`, that section gets a new key and any variant that
  referenced the old key reports it as unresolved. Tool descriptions say to keep
  `key` fields when editing sections.

**Variant document** (collection `variants`, id chosen by chat, e.g. `home-stage`):
```json
{
  "base": "home",
  "label": "Stage",
  "note": "Concert-programme feel",
  "token": "<server-generated>",
  "design": { "concept": "stage" },
  "sections": [
    { "from": "hero-1", "style": { "hero": "split", "theme": "night" } },
    { "from": "statement-1", "style": { "theme": "teal", "rule": true } }
  ]
}
```
Only references and presentation; copy always comes from `pages/<base>`.
Omitting a key hides that section in the variant.

**Identifiers (R2).** `base` and variant `id` must match `^[a-z][a-z0-9-]{0,63}$`
and are validated before any lookup or persistence (create, list, publish,
preview). Preview URLs are built with `encodeURIComponent` on each path segment.
Tests cover `/`, `%2f`, `?`, `#`, whitespace, control characters, uppercase and
65-char ids.

**SQL (R2).** All new D1 access goes through the existing helpers or
`prepare(...).bind(...)`; no user-derived value (id, base, collection, filter,
limit) is ever interpolated into SQL text. A hostile-input test uses
`' OR 1=1 --` as base and id and asserts no extra rows and a validation error.

**Normalisation (R1 finding 4).** `variantToPage(basePage, variant)` →
`{ page, unresolved: string[], dropped: string[] }`: returns an ordinary page
document (base page fields + `design` from the variant + sections in variant
order, each = base section with `style` **replaced** (not merged) by the
variant's style — the one precedence rule, stated identically in docs, tool
descriptions and OpenAPI).
Unresolved references are skipped and listed. Both preview and publish use it.

**Central variant persistence (R1 finding 2).** `writeDoc` (which `mergeDoc`,
REST and create all use) and the undo restore call
`prepareVariantWrite(prevDoc, nextDoc)` whenever `collection === "variants"`
(not delete — deleting a variant needs no token handling):
it discards any client-supplied `token` and sets `token` to the stored one (or a
new one if none exists). This covers MCP `write_content`/`update_content`, REST
`PUT`/`PATCH`, `undo_content` (restored tokens are re-checked the same way) and
`create_page_variant`. `base` is also immutable after create.

**Token (R1 finding 9).** 18 bytes from `crypto.getRandomValues` (144 bits),
base64url-encoded, no padding → exactly 24 chars matching `^[A-Za-z0-9_-]{24}$`.
Preview route rejects any other shape before lookup and compares with a
constant-time byte comparison.

**Preview route.** `GET /preview/{variantId}/{token}`:
- 404 (normal 404 page) if the id or token is wrong or the base page is missing.
- All responses (200 and 404) carry `X-Robots-Tag: noindex, nofollow`,
  `Cache-Control: no-store`, `Referrer-Policy: no-referrer`.
- Banner: "Preview · <label> · not live" (escaped).
- Unresolved references render nothing — **no key text in comments or markup**
  (R1 finding 8).
- `robots.txt` adds `Disallow: /preview/` as an advisory extra only; the real
  controls are the token, `noindex` header/meta and `no-store` (R1 finding 16).

Previews are unlisted, not secret: they only show copy already public on the
live page, laid out differently.

**Authentication (R1 finding 1).** Every variant-management route is under the
existing bearer-authenticated `/api` prefix or the authenticated MCP door, and
additionally sets `Cache-Control: no-store`. The only unauthenticated variant
route is the token-guarded preview page, which exposes no token, note, key list
or warnings.

**Tools and routes:**
| MCP tool | REST (bearer, no-store) | Behaviour |
|---|---|---|
| `create_page_variant {base, id, label, note?}` | `POST /api/pages/{base}/variants` | Ensures section keys on the base, creates `variants/{id}` referencing every base section in current order with no style; returns preview URL + section key list. Refuses a 4th variant for the base, an existing id, or a missing base. |
| `list_page_variants {base}` | `GET /api/pages/{base}/variants` | Ids, labels, preview URLs, the base's section keys (type + first words of heading), unresolved references and presentation warnings per variant. |
| (existing) `update_content variants/{id}` | (existing) `PATCH /api/variants/{id}` | Edit order/style/design. Response adds `warnings`. |
| `publish_page_variant {id}` | `POST /api/variants/{id}/publish` | `variantToPage()` → **refuse if any unresolved reference** → `sanitizePresentation()` on every section style and the design → versioned write to `pages/{base}` → response lists dropped (omitted) sections, stripped values, and "undo with undo_content pages/{base}". Variant kept. |
| `presentation_options` | `GET /api/presentation-options` | The allowlist with meanings and one worked example per concept. |

Write warnings: `write_content`, `update_content`, REST `PUT`/`PATCH` on `pages/*`
and `variants/*` return `warnings: string[]` (empty when clean). Writes still
succeed: unknown values are harmless at render and are stripped on publish.

Version bump to **0.7.0** in `McpServer` and OpenAPI `info.version` (project rule).

### Component 4: Journey chapters and progress (#7)
- Sections with `style.chapter: true` get a decorative
  `<span class="chapter-mark" aria-hidden="true">01</span>` numbered in page order.
- `design.progress: true` renders `<div class="progress-line" aria-hidden="true">`
  driven only by CSS `animation-timeline: scroll()` inside `@supports`; not
  displayed where unsupported or under reduced motion. No JS, no scroll listeners.

### Component 5: Motion layer (#8)
- **No-JS fix (progressive enhancement):** the stylesheet keeps loading via the
  existing normal `<link rel="stylesheet">`; nothing about CSS delivery waits for
  JavaScript. Content is **visible by default**; only the *pre-animation hidden
  state* is scoped under `html.js`. A tiny synchronous inline script in `<head>`
  (≈ 150 bytes, no network) adds `js` to `<html>` and removes it after 2.5 s
  unless `app.js` has set `window.__jbMotion = true`, so a slow, failed or
  blocked `app.js` can never leave content invisible. (Commented in code.)
  Verification: a test asserts no hidden-state rule in `styles.css` is
  unscoped by `html.js`; manual smoke with JS disabled (everything visible on
  first paint) and with `app.js` blocked (content appears by 2.5 s).
- **Entrances** `m-fade`, `m-rise`, `m-scale`, `m-mask`: opacity / transform /
  clip-path only — no layout shift. Default remains the existing `.reveal`.
- **Stagger:** existing `.stagger` extended to 8 children.
- **Drift:** `m-drift` uses CSS `animation-timeline: view()` inside `@supports`
  for ≤ 6 % translate on an image scaled 1.08 so edges never show. No JS.
- **Hover and `:focus-visible`** share one treatment on panels, duo tiles, text
  links and CTAs.
- **Animated accents:** `has-rule` hairline and chapter marks fade/draw in with
  their section.
- **Hero sequencing:** `hero-seq` child delays 0/120/240/360 ms.
- **Speed:** `speed-gentle` changes the CSS custom properties `--m-dur` and
  `--m-dist` that all motion classes use.
- **Reduced motion:** one `@media (prefers-reduced-motion: reduce)` block puts
  every motion class in its final state with no transition/animation and hides
  the progress line.
- `app.js`: the existing observer also watches `[data-motion]` (set on sections
  with a `motion` value) and sets `window.__jbMotion = true`.

### Component 6: CSS — `mcp/public/styles.css` (budget +350 lines)
- Themes reuse existing tokens and rules: `theme-teal` shares the `.ground-teal`
  selectors (selector list extended, not duplicated); `theme-night` uses
  `--colour-ink` background, ivory text, `--colour-gold-soft` links;
  `theme-cream`/`theme-ivory` reuse `.ground-cream`/`.ground-ivory`. No new colours.
- Motion classes share custom properties instead of per-class rule sets.
- Layout modifiers change grid/`object-fit`/`aspect-ratio` only at ≥ 60rem where
  possible; below that, blocks stack in DOM order.
- Budget checked in the implementation notes (`git diff --stat`); anything over
  budget is deferred, not squeezed.

### Accessibility
- Contrast: ivory on teal `#1E4A4A` ≈ 9.9:1; ivory on ink `#252321` ≈ 15.4:1;
  gold-soft on ink ≈ 8.6:1; ink on cream ≈ 14.6:1. Gold `#B08A4A` only for
  decorative rules.
- **Visual order always equals DOM order on every breakpoint** (R1 finding 11):
  `image_side` swaps columns only at ≥ 60rem, where image and copy sit side by
  side and the image is non-interactive; `mobile_first` is removed.
- Chapter numbers and progress line are `aria-hidden`; banner text is readable.
- Every hover effect has a matching `:focus-visible` style.

### Data Flow
Live: `GET /` → `readDoc(pages/home)` → `renderPage()` → `resolveSection()` per block.
Preview: `GET /preview/{id}/{token}` → token shape check → `readDoc(variants/id)`
→ constant-time token compare → `readDoc(pages/base)` → `variantToPage()` →
`renderPage(..., {preview})`.
Publish: tool → `variantToPage()` → refuse if unresolved → `sanitizePresentation()`
→ `writeDoc(pages/base)` (versioned, keys ensured) → result.

### Error Handling
- Unknown presentation values: ignored at render; `warnings` on write; stripped on publish.
- Unresolved references: omitted from preview (no key text); listed by
  `list_page_variants`; publish refused naming them.
- Bad token / missing variant / missing base: standard 404, same headers.
- Variant cap / duplicate id / missing base on create: tool error naming the cause.
- Malformed stored JSON: existing behaviour unchanged.

### Documentation (R1 findings 5, 6, 13, 14, 15)
- **MCP tool descriptions** (`mcp/src/index.ts`): new tools use the existing
  WHEN / DO NOT style and state the variant lifecycle (create → edit with
  `update_content` → preview → publish → undo), that copy is shared, that
  publish drops omitted sections, what unresolved references mean, and to call
  `presentation_options` rather than guess values. `read_content`/`update_content`
  descriptions add: keep `key` fields on sections; `style`/`design` values are
  allowlisted and warnings are returned.
- **OpenAPI** (`openApiSchema()` in `mcp/src/index.ts`): new operations
  `createPageVariant`, `listPageVariants`, `publishPageVariant`,
  `presentationOptions`; `WriteResult` gains `warnings`, `previewUrl`,
  `unresolved`, `dropped`, `stripped`; new schemas `Variant`, `Section` (with
  persisted `key` — pattern, "preserve when editing" guidance — optional
  `style`, and `caption` on showcase/feature/duo), `SectionStyle`, `PageDesign`
  with enums generated from `PRESENTATION_OPTIONS`; one example request per
  operation, including keys and a caption.
- **`mcp/context/content-model.md`** (and the D1 copy `context/content-model`):
  glossary, `style`/`design` tables, the variant workflow, a worked example for
  each of the three concepts, and guidance on warnings and unresolved references.
- **`mcp/README.md`:** tools table, preview route and its security model, `npm test`.
- **`CHANGES.md`:** dated "Sprint 10 — 0.7.0" entry with files and commit.
- Code comments on key assignment, token preservation, publish refusal and the
  no-JS guard.

### Test Strategy
Runner: **Vitest** (Node environment), `npm test`. D1 is replaced by an
in-memory fake implementing the `prepare().bind().first()/all()/run()` calls used.
The REST handler and the default `fetch` export are exercised directly with
`Request` objects (the MCP agent class is not instantiated; tool bodies call the
same exported functions as REST).

1. **Property / invariant coverage**
   - `presentation.test.ts`: every allowlisted value yields its class; hostile
     inputs (`"teal\" onmouseover=x"`, `"x;background:url(y)"`, `"<script>"`,
     numbers, objects, arrays, `__proto__`/`constructor` keys) produce no class,
     no style and a warning; `focus` clamps and rejects bad shapes;
     `sanitizePresentation` output contains only allowlisted pairs.
   - `variants.test.ts`: `ensureSectionKeys` assigns `<type>-<n>`, never changes
     existing keys, replaces invalid/duplicate keys; **inserting a new section
     before or reordering sections leaves existing keys (and variant
     resolution) intact**; `variantToPage` preserves variant order, takes copy
     from the base, omits unreferenced sections, lists unresolved refs.
   - Token: 24 chars matching the regex; 1,000 generated tokens are unique;
     client attempts to set, change, remove or null `token` via merge, full
     write, REST PUT/PATCH and undo all leave the stored token intact.
   - `render.test.ts`: chapter numbering sequential over `chapter: true` only;
     `theme` suppresses alternation for that section only; `focus` produces the
     exact `object-position`; adding section keys to the home page does not
     change its HTML.
2. **Failure-path coverage** — unresolved refs (preview omits, with no key text
   in output; publish refuses), wrong/malformed/missing token → 404 with
   `no-store` and `X-Robots-Tag`; missing base; duplicate id; 4th variant;
   malformed variant JSON; invalid ids (`/`, `%2f`, `?`, `#`, whitespace,
   control chars, 65 chars) and `' OR 1=1 --` rejected before lookup;
   **unauthenticated** `GET/POST /api/pages/home/variants`,
   `POST /api/variants/x/publish`, `GET /api/presentation-options` → 401 with no
   preview URL or metadata in the body; publish of a variant containing hostile
   style values persists only sanitised values.
3. **Regression guards** — one **homepage golden file** (current `home` document
   rendered before any renderer change) plus one fixture page containing every
   block type once; after the change, pages without `style`/`design` must match
   exactly apart from the intended `<head>` no-JS guard (stripped before
   comparing). A test asserts every hidden-state rule in `styles.css` is scoped
   under `html.js` and the reduced-motion block exists; another asserts every
   `PRESENTATION_OPTIONS` key/value appears in `content-model.md`. Every finding fixed in a council round
   gets a named test.
4. **Fixture reuse plan** — `test/helpers.ts`: `fakeDb(docs)`, `homeFixture()`,
   `pageWith(blocks)`, `authed(req)`. Each test builds its own fake DB; no shared
   mutable state; no network.
5. **Test runtime budget** — suite < 5 s; no timers or network; flaky tests are
   fixed or removed, never retried.

Plus `npm run typecheck`, and a manual smoke test on `wrangler dev`: live pages
unchanged; three `home` variants created and previewed at desktop and mobile
widths, with reduced motion emulated and with JS disabled; publish then undo.

## Files to Create/Modify
| File | Action | Purpose |
|------|--------|---------|
| `mcp/src/presentation.ts` | Create | Allowlist, resolve, warnings, sanitise |
| `mcp/src/variants.ts` | Create | Section keys, `variantToPage`, token generate/compare, `prepareVariantWrite` |
| `mcp/src/render.ts` | Modify | Presentation classes, hero/media modifiers, chapters, progress, no-JS guard, preview banner |
| `mcp/src/index.ts` | Modify | Central write hooks, variant tools + REST routes, preview route, robots.txt, warnings, tool descriptions, **OpenAPI schema**, version 0.7.0 |
| `mcp/public/styles.css` | Modify | Themes, spacing, width, rule, hero/media/pullquote modifiers, motion, `html.js` gating (≤ +350 lines) |
| `mcp/public/app.js` | Modify | Observe `[data-motion]`; set `__jbMotion` |
| `mcp/context/content-model.md` | Modify | Glossary, vocabulary, variant workflow, examples |
| `mcp/README.md` | Modify | Tools, preview security model, tests |
| `mcp/package.json` | Modify | Vitest, `test` script, version 0.7.0 |
| `mcp/vitest.config.ts` | Create | Test config |
| `mcp/test/helpers.ts` | Create | Fake D1, fixtures, auth helper |
| `mcp/test/fixtures/home.json`, `all-blocks.json`, `*.golden.html` | Create | Golden regression fixtures |
| `mcp/test/presentation.test.ts` | Create | Allowlist tests |
| `mcp/test/variants.test.ts` | Create | Keys, normalisation, token, publish |
| `mcp/test/render.test.ts` | Create | Golden + render behaviour |
| `mcp/test/routes.test.ts` | Create | Auth, id validation, SQL hostile input, preview headers, REST variant routes |
| `mcp/test/docs.test.ts` | Create | content-model.md covers the allowlist; CSS gating assertions |
| `CHANGES.md` | Modify | Sprint 10 / 0.7.0 entry |
| `SPRINTS.md` | Modify | Sprint 10 status |

## Open Questions
1. Tokenised, unauthenticated preview URL acceptable given it shows only
   already-public copy? (Proposed: yes — Julie's browser cannot send the API key.)
2. Publish drops sections the variant omits (proposed, reported and undoable)
   vs refusing unless every base section is referenced?

## Risks and Mitigations
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Renderer change alters live pages | Medium | High | Golden files; no style → identical markup |
| Chat drops `key` fields when rewriting sections | Medium | Medium | Descriptions say keep keys; unresolved refs reported; publish refuses |
| Motion causes CLS or jank | Low | Medium | transform/opacity/clip-path only; CSS scroll timelines behind `@supports`; no scroll listeners |
| Content invisible without JS | Existing | High | `html.js` gating + self-removing guard |
| Vocabulary misuse by assistants | Medium | Low | Allowlist, warnings, `presentation_options`, docs, sanitise on publish |
| CSS bloat | Medium | Low | +350-line budget; shared custom properties; defer over budget |
| Preview discovered | Low | Low | 144-bit token, constant-time compare, noindex, no-store |

## Revision History

| Round | Date | Changes |
|-------|------|---------|
| R1 | 2026-09-28 | Initial draft |
| R2 | 2026-09-28 | Persisted stable section keys in the central pages write path (F3); `variantToPage()` normalisation, no second render path (F4); variant routes bearer + no-store and tests (F1); centralised token preservation on all write paths incl. undo (F2); 144-bit base64url token + constant-time compare (F9); publish sanitises and refuses unresolved (F10); no key text in preview output (F8); removed `mobile_first`, DOM order = visual order (F11); CSS budget + reuse (F12); explicit OpenAPI/MCP/content-model/README/CHANGES documentation and glossary (F5, F6, F13, F14, F15); robots.txt advisory (F16); hero `stage` renamed `cinematic`. F7 (scope) partly declined: all controls trace to explicit requests; see *Scope decision*. |
| R3 | 2026-09-28 | CSS never waits for JS; visible-by-default progressive enhancement + verification (R2-1); id regex + URL encoding + tests (R2-2); bound-parameter rule + hostile SQL test (R2-3); OpenAPI section `key` and `caption` (R2-4); `PRESENTATION_OPTIONS` canonical, OpenAPI/tool generated, docs drift test (R2-5); full-bleed wording (R2-6); variant style replaces base style (R2-7); no token handling on delete (R2-8). |

---

## Implementation Notes

### Deviations from Plan
- **`:where(html.js)` instead of `html.js`** for the existing reveal hidden states.
  Found during the browser smoke test: `html.js .reveal` has specificity (0,2,1),
  which beats `.reveal.is-visible` (0,2,0), so content would never have appeared.
  Every hidden start state is now either `:where(html.js) …` (no added
  specificity) or excludes `:not(.is-visible)`; `docs.test.ts` enforces this
  and was mutation-checked against the original bug.
- **Preview banner stacking** (`position: relative; z-index: 100`): on mobile the
  closed menu tucks up behind the header and otherwise covered the banner.
- **Hero `treatment: none` on the cinematic layout** keeps a lighter overlay
  (legibility) rather than none; documented in the option meaning.
- **Test harness:** D1 is simulated with Node's built-in `node:sqlite` loaded
  with the real `schema.sql` (not a hand-written fake), so SQL in tests is real.
  `agents/mcp` is stubbed in `vitest.config.ts` because it cannot load in Node;
  MCP tool bodies call the same functions the REST tests exercise.

### Implementation Details
- Presentation classes are applied by one function, `decorate()`, which edits
  only the opening tag of a block's outer `<section>`; blocks without `style`
  are returned untouched (golden tests prove byte-identity).
- `applyWriteRules()` in `index.ts` is the single hook for section keys (pages)
  and token/base preservation (variants); used by `writeDoc` (hence merge, REST,
  create, publish) and by undo restores.
- `list_page_variants` uses one bound query over the `variants` collection.

### Test Results
`npm test`: 94 passed, 1 skipped (the opt-in golden capture), ~0.35 s.
`npm run typecheck`: clean.

Manual smoke on `wrangler dev` with local D1 (seeded from production `home`):
three variants created from the `presentation_options` examples with zero
warnings; a 4th refused; previews checked at 1440 px and 390 px (no horizontal
overflow); unauthenticated list → 401; page with scripts stripped → no hidden
content; `app.js` blocked → guard removes `js`, content visible; publish →
concept + chapters live; undo → live HTML byte-identical to before.

### Files Changed
| File | Summary |
|------|---------|
| `mcp/src/presentation.ts` | New: allowlist, resolve, warnings, sanitise, JSON schema, concept examples |
| `mcp/src/variants.ts` | New: section keys, `variantToPage`, publish transform, tokens, write rule |
| `mcp/src/render.ts` | `decorate()`, hero focus, captions, chapters, design classes, progress, preview banner, motion guard |
| `mcp/src/index.ts` | Write rules + warnings, variant functions/tools/REST, preview route, robots, OpenAPI, 0.7.0 |
| `mcp/public/styles.css` | `:where(html.js)` gating + presentation block (+213/−8 lines, budget 350) |
| `mcp/public/app.js` | Observe presentation sections; `__jbMotion` |
| `mcp/context/content-model.md` | Glossary, vocabulary tables, variant workflow, examples |
| `mcp/README.md`, `mcp/package.json` | Tools, security model, tests; vitest; 0.7.0 |
| `mcp/test/*` | Harness, goldens, 94 tests |


---

# Sprint 11: Image Overflow & Weighted Section Transitions

_Archived: 2026-09-28_

# Sprint 11: Image Overflow & Weighted Section Transitions

Requests #10 (true image overflow / cross-section bleed) and #11 (weighted
transitions between sections). Review mode: **no council** (owner's decision);
verification is automated tests plus a browser check of preview variants.

## Approach
Extend the Sprint 10 allowlist in `mcp/src/presentation.ts`; every new option is
a class on the section's outer `<section>`, styled in `public/styles.css`. No new
markup for unstyled pages (goldens unchanged). No JavaScript beyond adding the
new classes to the existing reveal observer.

## New section `style` keys
| Key | Blocks | Values | Notes |
|---|---|---|---|
| `image_escape` | showcase, feature, duo | `side`, `up`, `down`, `both`, `side-up`, `side-down` | Moves/grows the image frame with `translate`/`scale` (no layout shift). `side` = toward the image's outer edge. |
| `overshoot` | showcase, feature, duo | `subtle`, `medium`, `bold` | Distance presets (default medium). Narrow screens: side escape off, vertical capped at 1.5rem. |
| `layer` | showcase, feature, duo | `above`, `below` | Paint order against neighbouring sections (default above). |
| `shape` | showcase, feature, duo | `arch`, `circle`, `soft`, `slant` | Clip shape of the image frame. |
| `transition` | any | `overlap`, `wipe`, `crossfade`, `depth`, `hold`, `carry`, `divider`, `settle` | How this section arrives from the previous one. |
| `intensity` | any | `gentle`, `standard`, `strong` | Strength of the transition; reduced on narrow screens. |

## Transition mechanics (all CSS)
- **overlap:** negative top margin + raised layer; background guaranteed via `:where()` default.
- **wipe:** section clip-path reveals top→bottom on reveal (html.js-gated).
- **crossfade:** section background fades in on reveal.
- **depth:** scroll-driven scale/opacity on entry (`animation-timeline: view()`, `@supports`).
- **hold:** section gets extra height and its content is `position: sticky` — a held scene using native scrolling.
- **carry:** image carried up into the previous section (image escape up).
- **divider:** full-width gold line draws across the boundary on reveal.
- **settle:** `scroll-snap-type: y proximity` on the page (only near a boundary; wide screens only).

## Safety
- `main { overflow-x: clip }` so escaped images never cause horizontal scroll (does not break sticky).
- Escaped media get `pointer-events: none` so they can never block links in neighbouring sections.
- Reduced motion: all transitions render static; hold/settle/depth off.
- Without JS: final states (html.js gating as in Sprint 10).

## Tests
Allowlist tests extend automatically (they iterate `PRESENTATION_OPTIONS`); new
render tests for classes; CSS tests for `overflow-x: clip`, reduced-motion
coverage of transitions and html.js/`:not(.is-visible)` gating; docs test
ensures content-model lists the new values; goldens unchanged.

---

## Implementation Notes

### Deviations found in the browser check
- **Feature image escapes now anchor to the section edge.** A plain 8rem shift
  never left the section (sections carry ~10rem padding), so on wide screens the
  feature image aligns to the section's top/bottom and is translated by the
  section padding plus the overshoot. `--sec-pad` now drives `.section` padding
  and the spacing presets (same values as before).
- **`hold` uses a spacer, not min-height/padding.** Sticky content only travels
  within its parent's content box, so the extra scroll distance is an `::after`
  block (25/50/80vh by intensity, 20vh on phones); every direct child except the
  chapter mark is pinned below the header.
- **Gallery example:** `hold` moved to the quote (a held moment reads best on
  type), showcase uses `wipe`.

### Verification
- `npm test`: 107 passed; goldens unchanged; typecheck clean.
- Local preview of a Gallery variant built from the `presentation_options`
  example (0 warnings): 1440px — no horizontal overflow, overlap 3.5rem, feature
  image crosses 8rem into the hero, quote pinned for 25vh, showcase panel drops
  5rem into the next section, divider draws on the boundary. 390px — no
  horizontal overflow, sideways escape off, overlap 1.5rem, hold 20vh.


---

# Sprint 12: Scenes

_Archived: 2026-09-28_

# Sprint 12: Scenes

Requests #12 (scroll-progress scenes), #16 (photographic storytelling, merged)
and #21 (scene navigation). Review mode: no council (as Sprint 11).

## Approach
Same pattern as Sprints 10–11: allowlisted `style`/`design` values → classes →
CSS. Scene effects use CSS scroll-driven animations (`view-timeline` on the
section, `animation-timeline` on its content), so scrolling stays native and no
scroll listeners are added. Where scroll-driven animation is unsupported
(Firefox today) or motion is reduced, content shows in its final, readable
state; pinning is also dropped under reduced motion.

## New section `style` keys
| Key | Blocks | Values |
|---|---|---|
| `scene_length` | any | `short`, `medium`, `long` — pins the section's content for 30/60/100vh of extra scroll (phones 15/25/35vh) |
| `scene_timing` | any | `enter`, `hold` (default), `release` — which phase the effects play in |
| `scene_text` | any | `fade`, `rise`, `stagger` (lines/children in turn), `spotlight` (text brightens from dim) |
| `scene_image` | hero, showcase, feature | `zoom`, `pan`, `reframe` (focal point moves from `focus` to `focus_end`), `dissolve` (to `image_2`), `carry` (image travels on into the next section as it releases) |
| `scene_background` | any | `deepen` (dark sections darken), `warm` (light sections warm toward cream), `glow` (soft gold vignette) |
| `focus` | hero, showcase, feature | now also on showcase and feature |
| `focus_end` | hero, showcase, feature | end focal point for `reframe` |

## New content field
`image_2` on hero, showcase and feature: optional second photograph for
`dissolve`. Rendered only when present (decorative duplicate, `alt=""`).

## Page `design`
`scene_nav`: `rail` (slim chapter rail with numbered links), `label` (current
chapter label), `both`. Built server-side from sections with `chapter: true`
(label = eyebrow, heading, statement or quote, truncated); links target
`#chapter-NN` ids. A small addition to `app.js` marks the current chapter
(`aria-current`) and shows/hides the label. Rail hidden on phones.

## Safety
Background effects stay within a light or dark family (no mid-scroll contrast
flips). Pinning and effects inside `prefers-reduced-motion: no-preference`;
effects inside `@supports (animation-timeline: view())`. No new markup for
unstyled pages (goldens unchanged).

---

## Implementation Notes

### Deviations
- **`image_2` renders only with `scene_image: "dissolve"`** (lazy-loaded). Variants
  hold only presentation, so `image_2` lives on the live page; rendering it
  unconditionally would have added a hidden download to the live site.
- **Pin spacer is a real element** (`.scene-spacer`), not `::after`, so scenes
  combine with `divider`/`hold` transitions that already use `::after`.
- **Text ranges always complete.** A range ending inside `contain` can be
  unreachable for a section at the foot of a page, leaving copy dim. Unpinned
  text scenes now finish by `contain 0%` (fully on screen); pinned ones within
  the hold (the spacer guarantees the scroll); `release` applies to photographs
  and backgrounds only. Stagger uses keyframe offsets within one range.
- **`both` scene nav** = rail on wide screens, label on phones.
- Background washes use an inset box-shadow driven by a registered `--wash`
  property (paints above background, below content; no pseudo-element clashes).

### Verification
- `npm test`: 123 passed; goldens unchanged; typecheck clean.
- Headless Chrome (real rendering, driven over DevTools; the automation window
  reports `visibilityState: hidden` and never advances scroll timelines) on a
  local Scenes variant: statement text 0.12 → 0.48 → 1 and warm wash 0 → 0.4 → 1
  through its pin; feature dissolve 0 → 0.63 → 1; showcase deepen; nav current
  chapter 01 → 02 → 03; no horizontal overflow at 1440 and 390px.
- Reduced motion: no pin, spacer hidden, no dissolve, all text opacity 1.
- Text scene on the last section, scrolled to the very bottom: all text opacity 1
  at 1440 and 390px.


---

# Sprint 13: Trust Content

_Archived: 2026-09-28_

# Sprint 13: Trust Content

Requests #23 (asset library with rights/consent), #18 (testimonials and singer
stories; supersedes #1) and #19 (performance media). Review mode: no council.

## Decisions (made on the owner's behalf; easy to change)
- **Consent values:** assets `granted | not-needed | pending | refused`;
  testimonials `granted | pending | refused`. Optional `consent_note` (who,
  when, how) and `consent_expires` (YYYY-MM-DD; after it, treated as not given).
- **Enforcement at render:** `asset:<id>` references resolve only when consent
  is granted or not-needed (testimonials: granted only). Otherwise the image,
  portrait, poster or video is left out; a testimonials block with nothing
  consented renders nothing.
- **Bare filenames are not checked** (existing live pages use them). Existing
  photos of other people are seeded as assets with `pending` consent.
- **Carousel never auto-advances** (WCAG 2.2.2); visitor-driven with buttons,
  swipe/scroll and arrow keys; works without JS as a scroll-snap strip.
- **Video is poster-first:** the Stream player loads only on play; atmospheric
  loops autoplay muted when visible, never under reduced motion.
- **Variant-level assignment:** variant entries may set `media` (image,
  image_2, poster, video, audio) to asset references only.

## Delivered
- `mcp/src/assets.ts` — vocabulary, consent rule, warnings, search.
- `mcp/src/render.ts` — asset resolution (one bound query), `testimonials`
  block (quote / portrait / cards / before-after / carousel), `media` block.
- `mcp/src/presentation.ts` — `testimonial_layout`, `media_ratio`; variant media warnings.
- `mcp/src/variants.ts` — variant media overrides (asset refs only).
- `mcp/src/index.ts` — `search_assets` (MCP) / `GET /api/assets/search`; write
  warnings for assets and testimonials; OpenAPI 0.8.0 (Asset, Testimonial, AssetList).
- `mcp/public/app.js` — poster-first player, carousel controls.
- `mcp/public/styles.css` — testimonials, carousel, media.
- `mcp/seed/sprint13-assets.{json,sql}` — seven existing photos as assets;
  the homepage quote as a pending testimonial.

## Verification
- `npm test`: 142 passed (consent gate, expiry, search, warnings, rendering of
  each layout, before-after filtering, empty block omitted, media poster-first,
  bad video ids ignored, variant media overrides asset-only, seed data clean,
  OpenAPI validator rules).
- Headless Chrome on a local-only test page: consented portrait shown, pending
  portrait (group photo) omitted, pending poster replaced by the video's own
  thumbnail, carousel next → "2 / 2", no horizontal overflow.

