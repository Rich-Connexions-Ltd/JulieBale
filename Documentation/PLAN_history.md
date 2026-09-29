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


---

# Sprint 14: Composition and Ornament

_Archived: 2026-09-28_

# Sprint 14: Composition and Ornament

## Spec References
- Feature requests #13 (organic backgrounds; #17 decorative elements merged),
  #15 (multi-image collage), #14 (display typography), #22 (pointer/hover),
  #20 (responsive art direction — narrowed to phone-only overrides).
- `SPRINTS.md` → Sprint 14. Prior plans: `Documentation/PLAN_history.md`
  (Sprints 10–13 established the pattern this sprint extends).

## Current State
- Pages are block documents rendered server-side by `mcp/src/render.ts`.
  Presentation lives in a closed allowlist (`PRESENTATION_OPTIONS` in
  `mcp/src/presentation.ts`) that maps `section.style` / `page.design` values to
  classes (`s-<key>-<value>`); `decorate()` edits only the outer `<section>`
  tag and may inject a chapter mark or a scene spacer. All visuals live in
  `mcp/public/styles.css` (≈1,900 lines). Sections carry `--sec-pad`.
- Motion is progressive enhancement (`:where(html.js)` gating, reduced-motion
  end states, scroll-driven animation behind `@supports`), with a view timeline
  `--scene` on scene sections (Sprint 12).
- Images may be `asset:<id>` references, resolved with a consent gate (Sprint 13);
  variants may swap media per section (asset references only).
- Golden tests pin the HTML of unstyled pages; CSS tests pin the no-JS and
  reduced-motion guarantees; docs tests pin that `content-model.md` lists every
  allowlisted value.
- Live headings contain no `|` or `*` (checked across all 19 page/variant docs).

## Goals / Non-goals
**Goals:** the five capabilities below, as allowlisted presentation (plus one
content field for collage), with accessibility preserved by construction.
**Non-goals:** per-image numeric transforms (rotation degrees, pixel offsets);
arbitrary per-breakpoint copies of every option; custom cursors; link image
previews; animation that moves real text off-screen or behind images.

## Proposed Solution

### Sprint 14 scope (narrowed per council review)
Only the smallest vocabulary that delivers each request's core look:

| Area | Keys and values in this sprint |
|---|---|
| Backgrounds (#13) | `edge`: `wave`, `curve` · `field`: `ellipse`, `halo`, `spotlight`, `blob`, `wash` · `field_colour`: `teal`, `gold`, `cream`, `ivory`, `night` · `field_position`: `left`, `centre`, `right` |
| Ornaments (#17) | `ornament`: `arc`, `contour`, `quote-mark`, `stave` · `ornament_position`: `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| Collage (#15) | content `images` (2–4) · `collage`: `stack`, `scatter`, `mosaic` |
| Typography (#14) | heading markup `\|` and `*word*` · `type_scale`: `display`, `monumental` · `ghost`: `true` |
| Phone overrides (#20) | `style.phone.focus` (`"x% y%"`), `style.phone.crop`: `portrait`, `landscape`, `square` (phones = screens up to 48rem) |
| Hover (#22) | `hover`: `shift`, `draw` |

**Deferred** (recorded in each request's resolution): `edge` shapes beyond wave/
curve, `field_bleed`, `field_scale`, decoration motion (drift/breathe/draw),
ornament scale/texture/breath, collage tilt/overlap/shape modifiers and
triptych/inset, `line_motion`, vertical labels, `ghost_bleed`, hover
`attract` (no new JS this sprint), and every phone override except focus/crop.

Naming: British spelling throughout (`colour`, `centre`), matching the existing
`align: centre` and the `--colour-*` tokens. `arch` stays a `shape` value only.

### Principle: decoration never carries or obscures content
Fields, ornaments and ghost text are decorative: one `<div class="s-deco"
aria-hidden="true">` container, `pointer-events: none`, behind content. Real
text is never rotated, outlined, bled off-screen or placed over imagery.

### Layering model (one model, no negative z-index)
- A decorated section gets class `s-has-deco` and `position: relative`.
- `.s-deco` is its **first child**: `position: absolute; inset: 0; z-index: 0;
  overflow: hidden` (decoration never leaves the section).
- Content children are raised with a zero-specificity rule:
  `:where(.s-has-deco > :not(.s-deco, .chapter-mark, .scene-spacer)) { position:
  relative; z-index: 1 }` — so Sprint 12 pinning (`position: sticky`, higher
  specificity) still wins and stays above the decoration.
- `edge` masks the whole section (decoration included) and overlaps the previous
  section by the edge height; it takes precedence over `transition: overlap`
  (both shift the top boundary; CSS gives `edge` the later, higher-specificity
  margin rule and the docs say not to combine them).
- Not offered on `hero` (it has its own imagery band).

### Component 1 — Backgrounds and ornaments
- `edge`: CSS `mask` with two layers: a static SVG data URI (wave or curve) sized
  `100% var(--edge-h)` at the top, plus a solid layer for the rest; section
  `margin-top: calc(-1 * var(--edge-h))`; `--edge-h` 4.5rem (phones 2.5rem),
  always below `--sec-pad`. **Performance constraints:** masks are static (never
  animated); not applied to `hero` or to the first section of a page (nothing to
  overlap, and it keeps masks off the most likely LCP element); inside
  `@supports (mask-image: ...)` so unsupported browsers get a straight edge.
- `field`: gradient shapes (ellipse, halo, spotlight, wash) or an SVG mask
  (blob) on `.s-deco__field`, coloured by `field_colour` from brand tokens.
  **Contrast guarantee — opacity capped by ground, computed against the
  weakest text colour on that ground (the muted body colour):**
  - light grounds (cream, ivory, unthemed): field opacity **0.18**. Worst case
    (night or teal field on cream) keeps muted ink-soft text ≥ 4.5:1.
  - dark grounds (teal/night themes, showcase, teal cta): field opacity
    **0.08**. Worst case (ivory or cream field on teal) keeps muted
    ivory-at-86% text ≈ 4.9:1 and full ivory ≥ 5:1.
  - Every `field_colour` is therefore allowed on every ground; the cap, not the
    pairing, guarantees contrast. The CSS sets the cap by ground selector; a
    test parses the colour tokens and computes all 5 colours × 4 grounds × each
    ground's text colours (primary and muted) at the capped opacity, asserting
    ≥ 4.5:1, and asserts the stylesheet's caps equal the tested values.
  - Preview check includes `field_colour: "cream"` and `"ivory"` on a
    `theme: "night"` section and on a `theme: "teal"` section.
- `ornament`: one of four **static, server-owned SVG snippets** (no
  document-derived attributes, ids, URLs or styles), gold hairlines at ≤ 0.5
  opacity, placed by `ornament_position`.

### Component 2 — Collage
- **Content field** `images` on `feature`, `showcase`, `statement`: array of
  2–4 values, each either `asset:<id>` or a **bare filename** matching
  `^[a-z0-9][a-z0-9._-]{0,80}\.(jpe?g|png|webp|avif)$` (served only from
  `/assets/`; no scheme, slash, `..`, query, fragment, encoding or control
  characters). Anything else is dropped with a write warning.
- **Consent:** asset references resolve in the **same single batched query** as
  all other asset references on the page (`resolveAssetRefs` collects `images`
  too); unconsented items are dropped; fewer than 2 left → no collage (the
  block falls back to its single `image`).
- **Variants:** `media.images` = array of 2–4 asset references only.
- **Presets:** `collage`: `stack`, `scatter`, `mosaic` (nth-child transforms in
  CSS). Phones: 2-up grid, tilt ≤ 2°. First image eager, others lazy.
- **Alt:** asset alt (escaped); bare filenames `alt=""`.

### Component 3 — Display typography
- **One shared parser** `headline(text)` in `render.ts`: escape first, then
  `|` → `<br>` and paired `*x*` → `<em class="display-em">x</em>`; unpaired `*`
  and anything else stay literal. Applied to hero heading, statement, section
  titles and showcase/feature/cta headings. `plainHeadline(text)` strips the
  markup (for `<title>`, alt text, chapter labels and ghost text).
- `type_scale`: `display`, `monumental` (clamp sizes; 12ch fits at 320px).
- `ghost: true`: the section's heading as plain escaped text in an aria-hidden
  oversized outline duplicate inside `.s-deco` (clipped to the section).

### Component 4 — Phone overrides
`style.phone` with its own sub-allowlist: `focus` parsed as two integers and
clamped to 0–100 (the same shared parser as `focus`; anything else rejected) and emitted only as `--fp:X% Y%` inside the image's
validated style; `crop`: `portrait`, `landscape`, `square` → `p-crop-*` classes.
Applied under `@media (max-width: 48rem)`. Anything else in `phone` is ignored
and warned.

### Component 5 — Hover
`hover`: `shift` (image eases toward zoom 1.04), `draw` (rules/text-link
underlines draw across). Inside `@media (hover: hover) and (pointer: fine)`
with identical `:focus-visible` / `:focus-within` states; off under reduced
motion. No JavaScript.

### Rendering changes (`render.ts`)
- New pure helper `renderDecorations(resolved, heading)` builds `.s-deco` from
  allowlisted enums and static SVG constants only; `decorate()` just inserts
  its string after the opening tag (as it already does for chapter marks).
- `headline()` / `plainHeadline()`; collage helper shared by three blocks;
  `resolveAssetRefs` extended to `images`; `--fp` added to `imgStyle`.
- Unstyled output unchanged (goldens).

### Validation on every write path
All checks live in `presentationWarnings()` (style keys, `phone`, `images`) and
`sanitizePresentation()` (publish), which `writeDoc` already calls for every
write to `pages` and `variants` — MCP `write_content`/`update_content`, REST
`PUT`/`PATCH`, variant creation, publish, and undo restore (via
`applyWriteRules`). Render-time resolution is independent and never trusts
stored values.

### Documentation (every assistant-facing surface)
- `mcp/context/content-model.md` (and D1 copy): new keys, heading markup,
  `images`, layering/contrast guidance, what is deferred.
- `mcp/src/index.ts`: `update_content`/`write_content` descriptions mention
  heading markup and `images`; OpenAPI `Section` gains `images` and markup notes;
  `SectionStyle` enums (incl. `phone`) generated from `PRESENTATION_OPTIONS`;
  `presentation_options` output generated likewise; version 0.9.0.
- `mcp/README.md`: short section on decoration, collage and heading markup.
- `CHANGES.md`: dated Sprint 14 / 0.9.0 entry listing files, the deferred
  vocabulary and the commit.

### Data Flow
document → `resolveAssetRefs` (one query, incl. `images`) → `resolveSection`
(classes, imgStyle incl. `--fp`) → block HTML (`headline`, collage) →
`decorate` (+ `renderDecorations`) → page.

### Error Handling
Unknown values ignored at render, warned on write, stripped on publish; invalid
`images` entries dropped and warned; `<2` valid → no collage; unpaired `*` literal.

## Accessibility
Decoration aria-hidden, behind content, contrast-capped by computed test; no
rotated/outlined/off-screen real text; hover non-essential with focus
equivalents; reduced motion honoured; DOM order unchanged at all widths.

## Performance
Static SVG (< 1.5 KB each); collage max 4 images, lazy after the first;
CSS ≤ +300 lines; no new JavaScript.

## Test Strategy
1. **Property / invariant coverage** — allowlist loop covers new values;
   `phone` sub-allowlist; `headline()` escapes first and only ever emits `<br>`
   and `<em class="display-em">`; `plainHeadline()` removes markup;
   `renderDecorations()` output always `aria-hidden="true"` and contains no
   document-derived text except escaped ghost text; contrast test over tokens.
2. **Failure-path coverage** — hostile headings and asset alt text (quotes,
   `<script>`, `&`, `onerror=`), unpaired `*`, lone `|`; `phone.focus` with
   `;`, `url()`, `calc()`, `var()`, comments, units, out-of-range, nested
   objects; hostile collage filenames (`../x.jpg`, `/x.jpg`,
   `https://x/y.jpg`, `x.jpg?y`, `%2e%2e/x.jpg`, `x.svg`, control chars);
   mixed arrays; unconsented collage assets; the same hostile values sent via
   MCP-equivalent functions, REST `PUT`/`PATCH`, variant update and publish
   produce the same warnings/stripping.
3. **Regression guards** — goldens unchanged; asset resolution for a page with
   a collage issues exactly one assets query; CSS guards: decoration never uses
   negative z-index, headings/body never rotated/outlined outside `.s-deco`,
   reduced-motion and no-JS guarantees extend to hover; headless-Chrome check
   of a local variant combining decoration with `transition: overlap`, a pinned
   scene, `image_escape` and a collage (desktop 1440, phone 390, reduced motion).
4. **Fixture reuse** — `fakeEnv`/`fakeDb` (Node SQLite + real schema) with a
   query counter; `pageWith`; Sprint 13 asset fixtures.
5. **Runtime budget** — suite < 5 s.

## Files to Create/Modify
| File | Action | Purpose |
|------|--------|---------|
| `mcp/src/presentation.ts` | Modify | Sprint 14 keys; `phone` sub-allowlist; `images` checks; generated schema for `phone` |
| `mcp/src/render.ts` | Modify | `headline`/`plainHeadline`, collage, `renderDecorations`, `--fp`, batched `images` resolution |
| `mcp/src/variants.ts` | Modify | `media.images` (asset refs only) |
| `mcp/src/index.ts` | Modify | Tool descriptions, OpenAPI `Section.images`, version 0.9.0 |
| `mcp/public/styles.css` | Modify | Edges, fields, ornaments, collage, type scale, ghost, phone crop/focus, hover |
| `mcp/context/content-model.md` | Modify | Vocabulary, markup, guidance, deferred list |
| `mcp/README.md` | Modify | Decoration, collage, heading markup |
| `mcp/test/*.test.ts` | Modify/Create | As Test Strategy |
| `CHANGES.md`, `SPRINTS.md` | Modify | Records |

## Open Questions
1. Is limiting "text over imagery / off-screen / outline" to decorative ghost
   duplicates an acceptable reading of #14? (Proposed: yes — it delivers the look
   without making real text illegible.)
2. Should `edge` also offer bottom edges, or is top-only (next section shapes
   the boundary) sufficient? (Proposed: top-only; fewer combinations.)

## Risks and Mitigations
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vocabulary sprawl makes combinations incoherent | High | Medium | Presets not numbers; docs give one example per concept; decoration capped |
| Contrast loss from fields | Medium | High | Opacity capped by ground; computed contrast test |
| Masks clip content | Low | Medium | Edge height < `--sec-pad`; test on every block type at 390px |
| CSS growth / render cost | Medium | Low | ≤ +300 lines budget; static SVG; no new listeners |
| Collage bypasses consent | Low | High | Same resolver as Sprint 13; tests |

## Revision History
| Round | Date | Changes |
|-------|------|---------|
| R1 | 2026-09-28 | Initial draft |
| R2 | 2026-09-28 | Narrowed Sprint 14 vocabulary with explicit deferred list (F4, F8, F7 phone, F9 motion terms); one layering model, no negative z-index, zero-specificity content raise compatible with pinning (F6/RC7); strict collage filename allowlist + single batched asset query (F1/F2/RC2); strict phone.focus parsing (RC3); `renderDecorations` pure helper with static SVG only, plain escaped ghost text, shared `headline` parser (F5/F11/RC4); index.ts and README added with full documentation surface (F3/RC5); validation tied to every write path via `presentationWarnings`/`sanitizePresentation` in `writeDoc` (F10/RC6); British naming settled (F12); preview regression coverage of combined features (F13); CHANGES content specified (F14). Kept `edge` (wave/curve) as the core of #13. |
| R3 | 2026-09-28 | Contrast guarantee made explicit and computed against muted text: field opacity caps 0.18 (light) / 0.08 (dark), all colour × ground pairs tested, preview includes cream/ivory on dark (R2-1); edge performance constraints: static masks, not on hero or first section, @supports fallback (R2-2); scope wording (R2-3); CSS budget +300 consistently (R2-4). |

---

## Implementation Notes

### Deviations from Plan
- **Field opacity caps lowered to 0.10 (light) / 0.12 (dark).** The approved plan
  said 0.18 / 0.08 from a hand calculation; the new computed contrast test
  (`test/contrast.test.ts`, reading the colour tokens from the stylesheet)
  showed muted body text over a teal or night field at 0.18 is 3.94:1. Muted
  ink on plain cream is only 5.61:1, so the light cap must be ≤ 0.11. At
  0.10 / 0.12 the worst cases are 4.64:1 (light) and 5.61:1 (dark).
- **Phone collage specificity:** the phone rule needed `:nth-child(n)` to
  out-rank the desktop presets (found in the headless-Chrome check; now tested).

### Verification
- `npm test`: 176 passed; goldens unchanged; typecheck clean.
- Headless Chrome on a local variant combining `edge`, fields (cream on night,
  ivory on teal, gold blob on light), ornaments, ghost, a scatter collage with
  `image_escape` and `transition: overlap`, a pinned scene, and hover:
  no horizontal overflow at 1440 and 390px; pending asset dropped from the
  collage; pinned content still `sticky`; content `z-index: 1` above the
  decoration; edges overlap by 72px (40px on phones); reduced motion: no pin,
  all text fully visible.


---

# Sprint 15: Landing Page Sanitiser

_Archived: 2026-09-28_

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

---

## Implementation Notes

### Deviations from Plan
- **`target`/`rel` dropped from links entirely** (instead of forcing `rel`):
  landing links open in the same tab; simpler and removes the opener risk.
- **Validated `https:` links keep the author's text** rather than the URL
  parser's normalised form (which appended a trailing slash).
- **Found by tests:** js-xss calls `onTagAttr` for every attribute, so the
  first version re-emitted event handlers and `formaction`. Fixed by handing
  non-allowlisted attributes to the removal hook; the XSS corpus covers it.
- Tags removed with their content are noted by a pre-scan (the parser does not
  report them).

### Verification
- `npm test`: 249 passed (41-payload XSS corpus + 14 CSS payloads with output
  invariants; URL policy; real landing page: no warnings, identical text,
  controls, links (fragments namespaced) and CSS declaration count, now scoped;
  CSP header with recomputed guard hash; REST write warnings; docs drift guard).
- Bundle: 1222.57 → 1284.21 KiB (gzip 238.82 → 251.48 KiB, +12.7 KiB; budget 40).
- Headless Chrome on the real landing page under the CSP: motion guard and
  app.js ran, **zero CSP violations**, `#l-step*` anchors resolve, site nav no
  longer affected by the landing's `.nav` rule, no horizontal overflow.
- Pre-existing content issue noted (not a regression): the landing's card
  heading inherits the site's ink heading colour on a teal card.


---

# Sprint 16: Media Import Bridge

_Archived: 2026-09-29_

# Sprint 16: Media Import Bridge

## Spec References
- Feature request #24 (2026-09-29): import files uploaded in chat into the
  asset library as `asset:<id>`, with metadata, poster frame, web renditions,
  preserved master, consent/usage fields, and placeholder replacement.
- Builds on Sprint 13 (#19 media block, #23 asset library + consent gate).
- Review mode: council (external fetches, secrets, consent).

## Current State
- Assets (`assets/<id>`) hold `file` (Stream uid for video, R2 key for audio,
  filename/path for images), metadata and consent; pages reference
  `asset:<id>` and the renderer resolves them through the consent gate, so
  swapping an asset's `file` updates every page that uses it.
- Cloudflare Stream is configured (`STREAM_TOKEN` secret, `CF_ACCOUNT_ID` var);
  `/api/video/direct-upload` and the `/admin/upload` page exist for manual
  uploads. R2 bucket `MEDIA` is served publicly at `/media/<key>`.
- The GPT cannot hand a file to the site: ChatGPT Actions can, via
  `openaiFileIdRefs` (declared as `array` of `string` in a POST body; at runtime
  objects `{name, id, mime_type, download_link}`; ≤ 10 files per call; links
  valid for 5 minutes). ChatGPT Actions time out after roughly 45 seconds.
- Stream: `POST /accounts/{id}/stream/copy {url, meta, thumbnailTimestampPct}`
  returns `uid` immediately; `GET /stream/{uid}` later reports `readyToStream`,
  `duration`, `input.width/height`, `size`, `thumbnail`; adaptive HLS/DASH
  renditions are produced automatically.

## Goals / Non-goals
**Goals:** one call imports 1–10 uploaded video/audio files into assets; video
becomes a Stream video with automatic renditions and a chosen poster frame;
the exact original is kept; metadata is filled in when Stream finishes;
consent defaults to pending; an existing asset can be re-pointed at a new file.
**Non-goals:** codec detection (Stream does not expose it), audio duration
parsing, image import (images already go via `/admin/upload`), deleting old
Stream videos automatically, transcoding audio.

## Proposed Solution

### Terms (used identically in code, docs and tools)
- **master** — the exact uploaded file, kept in R2 under `masters/…`; never
  public (see "Serving imported files").
- **status** — `processing` (Stream still encoding), `ready`, `error`.
- **source** — `{kind: "chatgpt" | "url", name}`: where the file came from.
- **previous_files** — earlier `{file, master, replaced_at}` entries (≤ 5), for
  rollback and manual cleanup of old Stream videos.
- **poster_at** — whole-number **percent** 0–100 through the video where the
  poster frame is taken (default 10). Converted internally to Stream's
  `thumbnailTimestampPct` (0–1); that name is never exposed.
- Existing asset fields keep their Sprint 13 meanings: `usage`, `roles`,
  `consent`, `consent_note`, plus `caption` and `transcript` (plain text /
  Markdown, escaped when rendered).

### Flow
1. **Normalise** the request once (`normaliseSources`) into `ImportSource[]`
   `{kind, url, name, mime}` from either `openaiFileIdRefs` (runtime objects)
   or `urls`; ≤ 10 sources. Top-level `title`, `consent`, `consent_note`,
   `usage`, `roles`, `poster_at` are **defaults applied to every source**;
   `asset` (replace) is accepted only with exactly one source.
2. **Validate** type (MIME allowlist + matching extension) and the source URL
   (fetch policy below).
3. **Copy the master into R2**: `fetch` with `redirect: "manual"` (each hop
   re-validated, max 3), stream into `MEDIA.put("masters/<assetId>/<random>/<name>")`
   with hard caps (video ≤ 200 MB, audio ≤ 50 MB): `Content-Length` required and
   re-checked by a counting stream that aborts past the cap; partial objects are
   deleted on failure.
4. **Audio:** also copied to the playable key `imports/<assetId>/<random>/<name>`
   (R2-to-R2), which becomes the asset `file`.
5. **Video:** Stream copies from a **signed, 15-minute** URL for the master
   (`/media/masters/...?exp=…&sig=…`, HMAC-SHA256 with a key derived from
   `API_KEY`), so Stream never depends on ChatGPT's expiring link and the master
   is never publicly readable. Asset `file` = the returned `uid`,
   `status: "processing"`.
6. **Write the asset** via helpers in `assets.ts` (`buildImportedAsset`,
   `replaceAssetMedia`) and the normal versioned `writeDoc` (warnings, undo).
7. **Refresh:** `refresh_media_asset {id, poster_at?}` reads Stream and fills
   `duration`, `width`, `height`, `orientation`, `size`, `status`; with
   `poster_at` it first sets the poster frame. `thumbnail` is **derived** from
   the validated uid (`https://videodelivery.net/<uid>/thumbnails/thumbnail.jpg`),
   never copied from Stream's response. Numbers are validated (finite, ≥ 0).
   Asset construction, replacement and refresh projection all live in
   `assets.ts` (`buildImportedAsset`, `replaceAssetMedia`, `applyStreamDetails`);
   routes never shape asset fields.

### Replacement rules (content-model rule, implemented in `replaceAssetMedia`)
Replacing a placeholder (`asset` given): **media fields change** — `file`,
`master`, `status`, `size`, `duration`, `width`, `height`, `orientation`,
`thumbnail`, `source`; **everything else is kept** — `title`, `alt`, `consent`,
`consent_note`, `usage`, `roles`, `suits`, `caption`, `transcript`, `notes`;
the previous `file`/`master` go to `previous_files` (≤ 5). Pages keep working
because they refer to `asset:<id>`. Undo restores the previous record.

### Serving imported files (consent at fetch time, not only at render)
- `/media/masters/*` is served **only** with a valid, unexpired signature
  (for Stream's fetch); otherwise 404.
- `/media/imports/<assetId>/*` is served **only** when `assets/<assetId>`
  exists, its `file` equals that key, and its consent passes the Sprint 13 rule
  (granted / not-needed, not expired); otherwise 404. One D1 read per request,
  cached for the response only.
- Both protected paths respond with `Cache-Control: no-store, private` (a
  signature can expire and consent can be revoked); tests cover expired and
  tampered signatures and revoked/expired consent.
- Other `/media/*` keys (existing course audio, uploads) behave as before.
- Video playback is by Stream uid (random 32-hex); pages only render it through
  the consent gate. (Stream signed playback URLs are out of scope; noted.)

### Rendering (unchanged, stated for completeness)
- Asset references are resolved in **one batched D1 query per page**
  (`resolveAssetRefs`, Sprint 13–14; tested) — imports add no per-block reads.
- Media frames reserve their space with CSS `aspect-ratio` (`media_ratio`,
  Sprint 13), so a missing/processing poster causes no layout shift.
- Imported media plays through the existing `media` block: poster first, player
  on demand; muted loops never autoplay under `prefers-reduced-motion`
  (Sprint 13; tested). No new motion is introduced.

### Interfaces
| Surface | Shape |
|---|---|
| REST `POST /api/media/import` | `{ openaiFileIdRefs?, urls?, asset?, title?, alt?, consent?, consent_note?, usage?, roles?, poster_at? }` → `{ results: [{ ok, asset, ref, status, warnings } \| { ok: false, error, name }] }` where `asset` is the asset **id** (e.g. `aria-rehearsal`) and `ref` the page-usable token (`asset:aria-rehearsal`) |
| REST `POST /api/media/refresh/{id}` | `{ poster_at? }` → asset summary |
| MCP `import_media_from_url` | `{ url, asset?, title?, consent?, consent_note?, usage?, roles?, poster_at? }` |
| MCP `refresh_media_asset` | `{ id, poster_at? }` |
| OpenAPI | `importMedia` with `openaiFileIdRefs: {type: array, items: {type: string}}` exactly as ChatGPT requires; `refreshMedia`; descriptions ≤ 300 chars; response schemas with properties |

**Which door to use (assistant guidance):** files uploaded in a ChatGPT chat →
`importMedia` (ChatGPT fills `openaiFileIdRefs`). Claude/MCP clients → only
`import_media_from_url` with a publicly reachable https link. Images keep using
`/admin/upload`.

### Security
- **Auth:** bearer key on `/api/*` and the MCP door.
- **Fetch policy** (`fetchPolicy`): https only; no userinfo; default port;
  hostname must be a DNS name (no IPv4/IPv6 literals, no `localhost`, `.local`,
  `.internal`, `.localhost`, single-label names). **ChatGPT file refs: the
  first URL and every redirect hop must be on `*.oaiusercontent.com`**; any
  off-host redirect is rejected. URL imports: every hop must pass the generic
  policy.
- **Types:** MIME allowlist (`video/mp4 video/quicktime video/webm audio/mpeg
  audio/mp4 audio/x-m4a audio/wav audio/ogg`); extension must match; the
  response `content-type` must agree.
- **Text fields** (`title`, `source.name`, `caption`, `transcript`, `usage`,
  `roles`, `consent_note`): strings only, control characters stripped, length
  capped (title 120, name 120, caption 300, transcript 20 000, note 500;
  `usage`/`roles` validated against the Sprint 13 vocabularies); always
  escaped (or Markdown-escaped) when rendered.
- **Keys:** `…/<assetId>/<random 144-bit>/<name reduced to [a-z0-9._-]>`.
- **Secrets:** `STREAM_TOKEN` only in server-side requests; never returned;
  Stream errors summarised.
- **Consent:** default `pending`; `granted` requires `consent_note`.

### Error Handling
Per-source results; clear errors for unsupported type, too large, link
expired/unreachable, disallowed host/redirect, Stream not configured (501),
Stream refusal (summarised). Partial R2 objects deleted on failure.

### Documentation
- `content-model.md`: the Terms above, which door to use, the replacement
  rules, consent defaults, refresh, that imported files stay private until
  consented, and **alt text**: set `alt` on a video asset to describe what the
  poster/video shows (used for the poster image), separate from `caption`
  (visible) and `transcript` (speech/lyrics).
- MCP and OpenAPI descriptions (≤ 300 chars) summarising the same.
- README: bindings/secrets used (`MEDIA`, `STREAM_TOKEN`, `CF_ACCOUNT_ID`,
  `API_KEY` as signing root), the endpoints, and the manual cleanup note for old
  Stream videos listed in `previous_files`; version 0.10.0.
- `CHANGES.md`: dated Sprint 16 / 0.10.0 entry.
- **Drift test:** `content-model.md` contains `pending`, `granted`,
  `not-needed`, `processing`, `ready`, `error`, `master`, `previous_files`,
  `poster_at`, `importMedia`, `import_media_from_url`, `refresh_media_asset`.

## Open Questions
None. (Decided: masters are required for video and audio in this sprint; caps
200 MB video / 50 MB audio, revisited after real use.)

## Risks and Mitigations
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SSRF via URL import | Low | High | fetchPolicy on every hop; https + DNS names only; Workers cannot reach private networks |
| Action timeout on large files | Medium | Medium | Caps; per-source results; clear retry guidance |
| Storage cost (masters + Stream) | Medium | Low | Caps; `previous_files` list for manual cleanup |
| Consent bypass | Low | High | Default pending; granted needs a note; render-time gate unchanged |
| Secret leakage | Low | High | Token server-side only; test asserts it never appears in responses |

## Revision History
| Round | Date | Changes |
|-------|------|---------|
| R1 | 2026-09-29 | Initial draft |
| R2 | 2026-09-29 | Masters private (signed 15-min URLs for Stream) and imported audio served only with consent (F1); batched asset resolution and reduced-motion behaviour stated (F2, F3); poster_at defined as percent (F4); Terms section and full field vocabulary (F5); which-door guidance (F6); replacement rules as a content-model rule in assets.ts helpers (F7, F10); text-field sanitisation invariants (F8); file-ref redirects must stay on *.oaiusercontent.com (F9); normaliseSources with top-level defaults and single-source replace (F11, F14); docs drift test and README scope (F12, F13); tests split by ownership (F15). |
| R3 | 2026-09-29 | Post-approval clarifications: no-store/private on protected media with expiry/revocation tests; thumbnail derived from validated uid; alt-text guidance; aspect-ratio reservation stated; masters decided; CHANGES; `asset` vs `ref`; asset shaping owned by assets.ts. |


---

# Sprint 17: Media Import Fixes

_Archived: 2026-09-29_

# Sprint 17: Media Import Fixes (bug #25)

## Problem
- Two MP4s uploaded in ChatGPT (`WhatsApp Video 2026-09-19 at 20.10.38.mp4`,
  `Chronicles of Hope - 018.mp4`) both failed at Cloudflare Stream's
  `/stream/copy` with 400 / code 10005 ("Bad Request: The request was invalid").
  The request body matched Stream's documented schema; the cause could not be
  isolated (Stream fetching our signed `workers.dev` URL is the only moving part).
- Retrying via URL import failed earlier: ChatGPT's link path is `.../raw`, and
  the importer decided the type from the URL's extension only.

## Changes
1. **Direct upload instead of copy-by-URL.** The Worker requests a one-time
   `direct_upload` URL (validated: `https://*.videodelivery.net|cloudflarestream.com/`)
   and streams the R2 original to it as `multipart/form-data` with an exact
   `Content-Length` (never buffered). Stream no longer fetches anything, so the
   signed master URL scheme is removed and `/media/masters/*` is **never** served.
2. **Type from the response.** `resolveType` picks, most specific first: the
   response `Content-Type` (unless generic `application/octet-stream`), ChatGPT's
   stated `mime_type`, then the extension of the stated name or the
   `Content-Disposition` filename. A specific disallowed type (e.g. `text/html`)
   or an extension contradicting the chosen type is refused. The stored name
   always carries a matching extension.
3. **Asset id after resolution.** The id is chosen once the real file name is
   known (so `.../raw` becomes `chronicles-of-hope-018`, not `raw`).
4. Clearer errors (private/unavailable link vs expired chat link; missing
   Content-Length) and Stream's own (redacted) message in errors and logs.
5. Sanitiser: js-xss ignores `onIgnoreTag` when `stripIgnoreTag` is set, so
   removal notes were silently dropped for some tags; now `onIgnoreTag` strips
   and notes (corpus unchanged, all safe).

## Tests
Multipart framing and exact bytes delivered to Stream; no `/stream/copy` call;
masters never served (with or without query); `raw` ChatGPT link with
Content-Disposition; chat file served as octet-stream; resolveType table
(response type, stated type, extension, disallowed/contradicting types);
Content-Disposition parsing incl. `filename*=` and path stripping; existing
policy, size, cleanup, consent and auth tests. 307 passing.

## Files
`mcp/src/media-import.ts`, `mcp/src/index.ts`, `mcp/src/sanitize.ts`,
`mcp/test/media-import.test.ts`, `CHANGES.md`, `SPRINTS.md`.


---

# Sprint 18: Editorial Video Modes

_Archived: 2026-09-29_

# Sprint 18: Editorial Video Modes

## Spec References
- Feature request #26 (2026-09-29): video as moving photography — moving
  portrait, cinematic band, atmospheric background; cover crop (no
  letterboxing), poster first, muted autoplay only in view, minimal chrome,
  masks, focal point, reduced-motion poster fallback, accessible pause/play.
- Builds on Sprint 13 (`media` block, consent gate), Sprint 14 (shapes,
  `phone.focus`), Sprint 16–17 (imported Stream videos).
- Review mode: council (autoplay, contrast, live content).

## Current State
- `media` block renders video poster-first; pressing play swaps in Cloudflare
  Stream's **iframe** player (`app.js`). An iframe letterboxes: a portrait clip
  in a 3:2 frame gets black bars and visible chrome — the reported problem.
- Imported videos are assets `{type: "video", file: <uid>, status, width,
  height, orientation, consent, ...}` (Sprints 16–17); both placeholder clips
  are `ready`.
- Stream can generate a web MP4 per video: `POST /stream/{uid}/downloads`,
  poll until `status: ready`; URL
  `https://customer-<code>.cloudflarestream.com/<uid>/downloads/default.mp4`;
  billed like streaming. A plain `<video src>` needs no CORS.

## Goals / Non-goals
**Goals:** three editorial modes rendering a real `<video>` with
`object-fit: cover`, focal point and masks; autoplay muted only in view and
only when motion is allowed; an always-available pause/play control; poster
fallback; contrast-safe text over video.
**Non-goals:** adaptive streaming in editorial modes (hls.js), custom player
UI beyond play/pause, audio in editorial modes (they are muted; use `player`
mode for sound), video on landing pages.

## Proposed Solution

### Component 1 — Web MP4 on the asset (refresh)
- `refresh_media_asset` / `refreshMedia`: once Stream reports `readyToStream`,
  request the MP4 (`POST .../downloads`, idempotent) and record
  `mp4_status` — `processing` | `ready` | `error` (same vocabulary as the
  asset's own `status`) — and, when ready, `mp4`.
- `mp4` is stored only if `isStreamMp4(url, uid)` accepts it (Component 2);
  anything else is discarded and `mp4_status` becomes `error`.
- Downloads API failures never fail the refresh: the asset stays usable and
  the refresh response says the web MP4 is not ready (and why, redacted).
- Helper `applyStreamDownload` in `assets.ts`; Stream call
  `streamEnableDownload` in `media-import.ts`; stubbed-fetch tests.

### Component 2 — One validated URL path, revalidated at render time
- New `stream-urls.ts` (or the existing Stream helpers in `assets.ts`):
  `streamThumbnail(uid)`, `streamIframe(uid)`, `isStreamMp4(url, uid)`. Every
  one requires `uid` to match `^[a-f0-9]{32}$`; `isStreamMp4` requires
  `^https://customer-[a-z0-9]{1,64}\.cloudflarestream\.com/<uid>/downloads/default\.mp4$`
  exactly (no query, fragment, userinfo, port, or other uid).
- These builders are pure string functions — no D1 or network calls — and
  all asset data comes from the single batched `resolveAssetRefs` query
  already made per page, so media-heavy pages add no queries.
- Custom (non-Stream) posters go through the existing `assetUrl()` builder
  (only `/media/…` paths or allowlisted https hosts, as for every image);
  anything it rejects falls back to `streamThumbnail(uid)`.
- `render.ts` and `app.js` build poster, iframe and source URLs **only**
  through these (the current inline thumbnail string in `mediaButton` moves
  to `streamThumbnail`). A hostile uid never reaches an attribute.
- **Render-time check:** asset JSON is writable by authenticated clients, so
  `resolveAssetRefs` re-runs `isStreamMp4` (and requires `mp4_status ===
  "ready"`) before anything is emitted; failing closed means the block
  falls back to the poster + player, exactly as today.

### Component 3 — Resolved data stays internal
`resolveAssetRefs` keeps resolving `video: "asset:<id>"` to the uid through
the consent gate. The web MP4, dimensions and alt are attached to the
resolved section under an exported `RESOLVED_VIDEO` **Symbol** key — explicit
data travelling with the section (no identity/ordering coupling), yet
unreachable from content: JSON cannot produce Symbol keys, and author fields
such as `video_mp4` are simply ignored. Raw-uid videos (no asset) have no entry → fallback. Unconsented assets
resolve to nothing (unchanged).

### Component 4 — Vocabulary: one playback key; framing reuses existing keys
| Key | Blocks | Values |
|---|---|---|
| `playback` (new) | media | `player` (default: today's poster → player on press), `ambient` (moving photography: muted, loops in the frame while in view), `background` (full-bleed muted loop behind the heading and caption) |
| `media_ratio` (existing) | media | adds `wide` (21:9; 16:9 on phones) to landscape/portrait/cinematic/square |
| `shape` (existing) | now also media | same values, same `s-shape-*` classes; CSS selector lists gain `.media-frame__visual` |
| `focus` (existing) | now also media | same parser and `imgStyle`; applied to the poster `<img>` and the `<video>` |
| `phone.focus` / `phone.crop` (existing) | media | unchanged; the `--fp` rule extends to the `<video>` element |

The request's named modes are **recipes** in docs and `CONCEPT_EXAMPLES`:
- moving portrait = `playback: ambient` + `media_ratio: portrait` (+ `shape: arch`)
- cinematic band = `playback: ambient` + `media_ratio: wide` + `width: full`
- atmospheric = `playback: background`

No new parsing or class paths: `playback` is an ordinary allowlisted
`s-playback-<value>` class (named so it never collides with the block's
`video: "asset:<id>"` content field); `shape`/`focus` only widen their `blocks` lists.

### Component 5 — Markup (stable before any JavaScript runs)
**ambient** (when a validated MP4 exists):
```html
<section class="section media-scene s-playback-ambient …">
  <div class="container">
    <h2 class="section-title">…</h2>                     <!-- as today -->
    <figure class="media-frame">
      <div class="media-frame__visual">                   <!-- aspect-ratio reserved by CSS -->
        <video class="media-video" muted playsinline loop preload="none" controls
               poster="<streamThumbnail or poster asset>" aria-label="<asset alt or caption>"
               style="<imgStyle>"><source src="<mp4>" type="video/mp4"></video>
        <button type="button" class="media-toggle" data-video-toggle hidden
                aria-label="Play video: <what>"></button>  <!-- absolutely positioned -->
      </div>
      <figcaption class="caption">…</figcaption>          <!-- as today -->
    </figure>
    <details class="transcript">…</details>              <!-- as today -->
  </div>
</section>
```
**background:** same `<video>` (plus `aria-hidden="true"`, no label — it is
decorative; the toggle is labelled "Pause background video") inside
`.media-bg`, which is absolutely positioned behind the container; the heading
and caption render **once**, in normal DOM order, inside a
`.media-overlay` panel in the container (`<h2>`, then `<p class="caption">`).
There is no separate figcaption, so the text is never duplicated and
assistive technology reads heading → caption → transcript → toggle.

**Layout stability:** the frame's size comes from `aspect-ratio` (ambient)
or `min-height` (background) in CSS, never from video metadata; the video
and the toggle are absolutely positioned, so removing `controls` or
un-hiding the toggle cannot move anything. `<source>` is in the HTML from the
start (no JS source swapping); `preload="none"` defers the download.

**Focal point at first render:** `object-position` (and `--fp` for phones)
is in the server-rendered `style` attribute of both the poster `<img>` and
the `<video>` — computed by `resolveSection` exactly as for images today — so
the first paint (the LCP candidate, the poster) is already cropped correctly;
nothing is positioned by JavaScript or after the video loads.

**LCP:** the LCP candidate is the poster image, which the browser fetches
from the `poster` attribute regardless of `preload="none"`; the poster URL is
server-rendered and not lazy for a video in the first section. The MP4
itself is never the LCP element, so deferring it costs nothing at first paint.

**Accessible names:** `<what>` = asset `alt` → `caption` → plain heading →
"performance" (the existing chain), so the toggle reads e.g. "Pause video:
Julie singing at the Diva Day". Default `playback` is `player`.

**No JavaScript:** native `controls` and the poster; nothing autoplays.

**Play control contrast (all modes, including the `player` fallback):** the
existing `.media-play__icon` (a 90% ivory disc with a primary glyph —
unchanged) and the new toggle (a 90% ink disc with an ivory glyph) are both
near-opaque, so their contrast never depends on the poster; the contrast test computes ≥ 3:1 (non-text) against white and black
frames.

**Fallback:** no validated MP4 (not refreshed yet, raw uid, invalid URL) →
today's `player` markup, with the same frame classes, so the section still
looks right.

### Component 6 — Playback (extends the existing media code in `app.js`)
The existing "Performance media" section already owns `prefersReduced`, the
IntersectionObserver pattern and labels; editorial videos join it (~30
lines), no parallel lifecycle:
- On start: remove `controls`, un-hide the toggle.
- `prefersReduced` → never autoplay; poster stays; toggle reads "Play …".
- Otherwise one shared observer (threshold 0.35) plays in view, pauses out
  of view. `play()` rejection (autoplay blocked) → poster + "Play" toggle.
- Toggle: 44×44 px, bottom-right, solid ink background (0.9) with an ivory
  icon — contrast independent of the frame beneath (≥ 3:1 non-text, tested),
  visible focus ring, label flips between
  "Pause …" and "Play …" (`aria-label` only; no `aria-pressed` mix); a
  visitor's pause sticks (no auto-resume). Satisfies WCAG 2.2.2.
- The existing `data-loop` iframe path is unchanged.

### Component 7 — CSS
- `.media-video` fills the frame: `position:absolute; inset:0; width/height
  100%; object-fit: cover; object-position` from `style`; phones use `--fp`
  like images. Never `contain` → no letterboxing.
- `media_ratio: wide`; `shape` selectors gain `.media-frame__visual`.
- **background:** section `position:relative; min-height: 70vh` (60vh phones);
  `.media-bg` covers it; `.media-overlay` panel has an ink backdrop at 0.85
  opacity so ivory text is ≥ 4.5:1 over any frame (computed test, worst case
  a white frame). The toggle sits outside the panel.
- Reduced motion: no transitions on the toggle; poster shown.
- **CSS budget:** nothing becomes redundant — `player` mode and the existing
  `media_ratio` values keep working, so no rules are removed. New rules are
  additive and small: `shape` reuses its existing four rules by adding one
  selector to each list, `wide` is one rule plus a phone override, and
  ambient/background/toggle are ~25 rules. Budget: ≤ 2.5 KB unminified
  (styles.css is ~95 KB), checked in the regression test.

### Documentation (all tool-facing surfaces)
- `presentation_options` / generated vocabulary / OpenAPI `SectionStyle`:
  `playback` values and default, `media_ratio: wide`, `shape` and `focus` now on
  media, and the fallback rule (editorial playback needs an imported,
  refreshed video asset; otherwise the player shows).
- Asset docs (content model, README, OpenAPI asset schema, `search_assets` /
  `refresh_media_asset` descriptions): `mp4_status` (`processing | ready |
  error`), `mp4` (set by refresh, read-only in practice, ignored at render
  unless valid), absence = not prepared yet → run refresh.
- Video accessibility definitions (content model): asset `alt` = the video's
  accessible name / toggle label; `caption` = visible editorial text;
  `transcript` still recommended; `background` videos are decorative, so the
  meaning must be in the heading/caption.
- Recipes for moving portrait / cinematic band / atmospheric.
- OpenAPI version 0.11.0; regenerated `mcp/openapi.json`; CHANGES, SPRINTS,
  `Documentation/archive/PLAN_Sprint18.md` and findings after the sprint.

## Test Strategy
1. **Property / invariant coverage** — `playback` allowlist (existing loop);
   `isStreamMp4` / `streamThumbnail` / `streamIframe` hostile table (other
   uids, other hosts, http, query, fragment, userinfo, port, `javascript:`,
   protocol-relative, quotes/spaces/slashes in the uid); `applyStreamDownload`
   stores only valid URLs; **render-time**: an asset whose stored `mp4` was
   edited to a hostile value renders the fallback and no `<source>`;
   author-supplied fields (e.g. `video_mp4`) are ignored; ambient markup:
   `muted playsinline loop preload="none" controls`, escaped label, poster
   from uid, style only from clamped integers, and **rejected `focus` values
   produce no `style` attribute**; background: heading and caption appear
   exactly once, video `aria-hidden`; `player` output unchanged.
2. **Failure-path coverage** — no MP4 yet / raw uid / unconsented asset →
   poster + player fallback (or nothing when unconsented); downloads API
   errors during refresh keep the asset usable and report `mp4_status: error`.
3. **Regression guards** — goldens unchanged; contrast test adds the
   atmospheric panel (ivory and muted ivory over white/black frames);
   CSS guard: editorial frames use `object-fit: cover` and never
   `contain`; reduced-motion block present for editorial videos; headless-
   Chrome check on a local variant: portrait clip fills 4:5 with no bars, plays
   only in view, pauses out of view, toggle works by keyboard, reduced motion
   shows poster only, no-JS shows native controls.
4. **Fixture reuse** — `fakeEnv`, `fakeMedia`, `stubFetch`.
5. **Runtime budget** — suite < 8 s.

## Files to Create/Modify
| File | Action | Purpose |
|------|--------|---------|
| `mcp/src/media-import.ts` | Modify | `streamEnableDownload` |
| `mcp/src/assets.ts` | Modify | `applyStreamDownload`, `isStreamMp4`, `streamIframe` (beside `streamThumbnail`) |
| `mcp/src/index.ts` | Modify | refresh prepares MP4; descriptions; OpenAPI 0.11.0 |
| `mcp/src/render.ts` | Modify | `RESOLVED_VIDEO` Symbol data + render-time check; ambient/background markup; URL builders |
| `mcp/src/presentation.ts` | Modify | `playback`; `media_ratio: wide`; `shape`/`focus` on media; recipes |
| `mcp/public/app.js` | Modify | in-view playback + toggle |
| `mcp/public/styles.css` | Modify | modes, toggle, overlay, reduced motion |
| `mcp/context/content-model.md`, `mcp/README.md`, `CHANGES.md`, `SPRINTS.md` | Modify | Docs |
| `Documentation/archive/PLAN_Sprint18.md`, `Documentation/findings/` | Create | Archive after the sprint |
| `mcp/test/*` | Modify | As Test Strategy |

## Open Questions
1. Autoplay default for `ambient` and `background`: proposed yes
   (muted, in view, motion allowed) as requested; `player` never autoplays.

## Risks and Mitigations
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Motion sensitivity / distraction | Medium | Medium | Reduced motion → poster only; visible pause; muted; plays only in view |
| Contrast over moving video | Medium | High | Overlay panel at 0.85 ink; computed test |
| Bandwidth | Medium | Medium | `preload="none"`, load on first view, only one MP4 rendition, pause off-screen |
| Stream download costs | Low | Low | Billed like streaming; only enabled on refresh for imported videos |
| Autoplay blocked by browser | Medium | Low | Poster + Play toggle |

## Revision History
| Round | Date | Changes |
|-------|------|---------|
| R1 | 2026-09-29 | Initial draft |
| R2 | 2026-09-29 | One playback key (`video`), framing via existing `media_ratio`/`shape`/`focus` (+`wide`); named modes become recipes; resolved video data in a WeakMap; single Stream URL builder with render-time revalidation; background text rendered once; layout stability rules; playback joins the existing media JS; `mp4_status` uses processing/ready/error; full doc surface list |
| R3 | 2026-09-29 | Key renamed `playback` (no collision with `video` field); Symbol-keyed internal data instead of WeakMap; custom posters via `assetUrl()`; builders are pure (no queries); toggle on a solid ink background |
| R4 | 2026-09-29 | Stale WeakMap wording removed; focal point in server-rendered markup (first paint); play-control contrast guaranteed in the player fallback too |
| R5 | 2026-09-29 | CSS budget (additive, ≤ 2.5 KB, tested); existing play icon described accurately |
| R5 close | 2026-09-29 | Council max rounds reached. Closing notes: LCP = poster (not affected by `preload="none"`); toggle label chain specified; default `player` restated. Prior-round items marked open by the tracker (layout shift #2, first-paint focus #20, CSS #23) are addressed in Component 5 ("Layout stability", "Focal point at first render") and Component 7 ("CSS budget"). Proceeding to implementation; code review will re-check. |


---

# Sprint 19: Video Derivatives

_Archived: 2026-09-29_

# Sprint 19: Video Derivatives

## Spec References
- Feature request #27 (2026-09-29): non-destructive derivatives of imported
  master videos — in/out points, short excerpts, crop/reframe, focal area,
  cut title/end cards, mute, gentle speed, loops, web renditions, new poster,
  link back to the master; the derivative is its own `asset:<id>`,
  independently replaceable; smart crop where practical, manual control always.
- Builds on Sprint 16–17 (imported Stream videos) and Sprint 18
  (`playback` ambient/background, web MP4, `RESOLVED_VIDEO`).
- Review mode: council (creates billable Stream videos, consent inheritance,
  live content).
- Agreed approach (user, 2026-09-29): Stream clipping for time edits; crop and
  speed applied at render; frames tool for the GPT to choose; re-encoding
  (ffmpeg in a Container) and crossfade loops deferred.

## Terms
- **Master:** the imported video asset a derivative is cut from (Sprint 16–17
  import). Its media is never changed by this sprint.
- **Derivative:** a new video asset made by `derive_video`, pointing at its
  master through `derived_from: <master asset id>`.
- "Source frame" means the master's (and therefore the clip's) full picture;
  crop percentages refer to it.

## Current State
- Video assets `{type: "video", file: <uid>, status, width, height, duration,
  mp4, mp4_status, consent, ...}`; refresh fills details and the web MP4.
- Stream supports `POST /stream/clip` `{clippedFromVideoUID, startTimeSeconds,
  endTimeSeconds, thumbnailTimestampPct, meta}` → a **new** video
  (`result.uid`, `clippedFrom`); the source is untouched.
- Cloudflare Media Transformations only centre-crop (no position), need a
  transform-enabled zone and a public source → not used.
- The WhatsApp master is 576×1024; its landscape window ≈ 576×324 px, so any
  crop of it is low resolution (a content limitation, documented for the GPT).

## Proposed Solution

### Component 1 — `derive_video` (MCP) / `deriveVideo` (REST `POST /api/media/derive`)
Input:
| Field | Rule |
|---|---|
| `from` | id of a **video** asset whose `status` is `ready` (Stream uid valid) |
| `id` | optional new asset id (`^[a-z][a-z0-9-]{0,63}$`); default `<from>-cut`, `-cut-2`, … |
| `title` | optional, cleaned (`cleanText`), ≤ 120 chars; default "<master title> (excerpt)" |
| `start`, `end` | seconds, finite, `0 ≤ start < end`, `1 ≤ end − start ≤ 60`, `end ≤ duration + 0.5` when known |
| `crop` | optional `{x, y, w, h}` whole-number percent of the source frame; `w, h ≥ 10`; `x + w ≤ 100`, `y + h ≤ 100` |
| `speed` | optional `0.5 | 0.75 | 1` (default 1) |
| `poster_at` | optional 0–100 (percent through the excerpt), default 10 |

Behaviour:
- Validates everything **before** calling Stream; any invalid field → 400 with
  a precise message (no Stream call, no cost).
- Calls Stream clip; validates `result.uid` (`^[a-f0-9]{32}$`); Stream errors
  redacted via `streamError` (never the token).
- Writes a new asset (`writeDoc`, so it is versioned and undoable):
  `{type: "video", file: <clip uid>, status: "processing",
  derived_from: <from>, edit: {start, end, crop?, speed?}, muted: true,
  title, alt (from master), people/setting/usage/roles/suits/tone (from
  master), consent: "inherit", caption/transcript not copied}`.
- Copied descriptive fields are re-validated on the way in, not trusted:
  strings through `cleanText` (control characters removed, length capped),
  vocabulary arrays (`usage`, `roles`, `suits`) filtered to `ASSET_OPTIONS`,
  free-text arrays (`people`, `tone`) to ≤ 12 cleaned strings. They are
  plain data rendered only through `esc()`, as every asset field is today.
- **Re-derive:** if `id` exists and is a derivative of the same master, its
  media is replaced (`replaceAssetMedia`, old uid kept in `previous_files`),
  keeping title/alt/usage/etc. — pages using `asset:<id>` follow. If `id`
  exists and is not a derivative of `from` → 409.
- Returns `{ok, asset, ref, status, derived_from, edit, next: "call
  refresh_media_asset until status and mp4_status are ready"}`.
- Rate/cost guard: at most 20 derivatives per master (count of assets with
  `derived_from = from`) → 409 beyond that.

### Component 2 — Consent: derivatives inherit live
- A derivative's `consent` is `"inherit"` (new allowed value, only valid with
  `derived_from`). `consentOk(derivative)` is true only when the **master**
  is consentOk now (and the derivative's own `consent_expires`, if set, has
  not passed). Revoking the master hides every derivative immediately.
- `resolveAssetRefs`: after the existing batched load, if any loaded asset
  has `derived_from`, the masters are loaded in **one** more batched query
  (depth 1 only; a derivative of a derivative is refused at creation).
- Missing/deleted master → not consented → not shown.
- `search_assets` reports derivatives' effective consent and `derived_from`.
- Setting `consent: "inherit"` on a non-derivative, or `granted` on a
  derivative, via `update_content` produces a write warning; render treats
  `inherit` without a master as not consented.

### Component 3 — Render-time crop and speed (ambient/background only)
- `RESOLVED_VIDEO` gains `crop` and `speed`, computed in `resolveAssetRefs`
  from the derivative's `edit` and its `width`/`height` (from refresh) — only
  whole numbers, re-validated with the same rules as Component 1; invalid or
  missing dimensions → no crop (plain cover).
- The `<video>` gets custom properties built only from integers:
  `--sw`/`--sh` (source px), `--cx`/`--cy` (crop centre px), `--cw`/`--ch`
  (crop size px). CSS (container query units; `.media-frame__visual` and
  `.media-bg` get `container-type: size`) scales the element so the crop
  rectangle **covers** the frame, centred on the crop:
  `--u: max(100cqw / cw, 100cqh / ch)`; `width: sw·u; height: sh·u;
  left: 50cqw − cx·u; top: 50cqh − cy·u; object-fit: fill`.
  The poster, drawn in the same box, is cropped identically.
- A crop replaces `focus`/`phone.focus` for that video (documented).
- **CSS budget:** one rule for `container-type: size` (added to the existing
  frame/bg selectors), one crop rule on `.media-video[style*="--cw"]`
  reusing `.media-video`'s positioning; ≤ 1 KB, checked by a test.
- `speed` → `data-speed="0.5|0.75"`; `app.js` sets `playbackRate` (and
  `defaultPlaybackRate`) from an allowlist. Speed only ever **slows** a clip
  (≤ 1), so it never adds motion. It does not change the reduced-motion
  rules from Sprint 18: under reduced motion nothing autoplays whatever the
  speed; if the visitor presses play, the clip plays at its set (slow) speed
  and still pauses off screen.
- `player` mode is unchanged (Stream iframe, whole frame, with sound); the
  docs say derivatives are meant for ambient/background.

### Component 4 — `video_frames` (MCP) / `videoFrames` (REST `GET /api/media/frames/{id}?times=…`)
- For a video asset (master or derivative), returns up to 8 still-frame URLs
  `https://videodelivery.net/<uid>/thumbnails/thumbnail.jpg?time=<n>s&height=480`
  for the requested times (clamped to the duration; default: 8 evenly
  spaced), plus `width`, `height`, `duration`. Built by a pure builder from a
  validated uid and numbers. The GPT views them to choose in/out points and
  the crop (its "smart crop"); manual values always win.

### Component 5 — Docs and schema
- Content model: "Cutting a moving photograph from a longer video" workflow
  (frames → derive → refresh → use with `playback`), crop coordinates
  (percent of the source frame), resolution caveat (a crop of a small window
  is soft; ask Julie for original footage), muted/speed/loop notes, consent
  inheritance, re-derive, limits (≤ 60 s, 20 per master).
- OpenAPI 0.12.0: `deriveVideo`, `videoFrames`, Asset `derived_from`, `edit`,
  `muted`, consent enum + `inherit`; descriptions ≤ 300 chars.
- README, CHANGES, SPRINTS; regenerated `mcp/openapi.json`.

## Test Strategy
1. **Property / invariant coverage** — derive validation table (start/end
   bounds, 60 s cap, duration check, crop bounds and minimum size, speed
   allowlist, id pattern, non-ready or non-video master, derivative-of-
   derivative) → 400 and **no Stream call**; clip body sent to Stream exactly;
   hostile `result.uid` rejected; crop custom properties are integers only and
   absent when dimensions are missing or `edit` is edited to hostile values;
   frames URLs only from a valid uid.
2. **Failure-path coverage** — Stream clip error → 502 redacted, nothing
   written; re-derive into a non-derivative id → 409; 21st derivative → 409;
   master consent pending/refused/expired/deleted → derivative hidden
   (render) and `usable: false` (search).
3. **Regression guards** — goldens unchanged; Sprint 18 video tests
   unchanged; `inherit` never counts as consent without a live master;
   `player` output unchanged for derivatives; headless Chrome: a derived clip
   with a crop fills a portrait and a wide frame with the crop centred, poster
   cropped the same way, speed applied, no layout shift, no horizontal scroll
   (phone and desktop).
4. **Fixture reuse** — `fakeEnv`, `fakeMedia`, stubbed fetch from Sprint 18.
5. **Runtime budget** — suite < 10 s.

## Files to Create/Modify
| File | Action | Purpose |
|------|--------|---------|
| `mcp/src/media-import.ts` | Modify | `streamClip` |
| `mcp/src/assets.ts` | Modify | derive validation, `buildDerivedAsset`, `consent: inherit`, `streamFrame` builder, crop maths |
| `mcp/src/index.ts` | Modify | `derive_video`, `video_frames` (MCP + REST), OpenAPI 0.12.0 |
| `mcp/src/render.ts` | Modify | master batch load for consent; crop/speed into `RESOLVED_VIDEO`; markup |
| `mcp/public/styles.css` | Modify | container units; crop rules |
| `mcp/public/app.js` | Modify | playbackRate from allowlist |
| `mcp/context/content-model.md`, `mcp/README.md`, `CHANGES.md`, `SPRINTS.md` | Modify | Docs |
| `mcp/test/derive.test.ts` | Create | As Test Strategy |
| `Documentation/archive/PLAN_Sprint19.md`, `Documentation/findings/FINDINGS_Sprint19.md` | Create | After the sprint (copy findings before archiving) |

## Risks and Mitigations
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Consent leaks through a derivative | Low | High | Live inheritance from the master at render; tests for every master state |
| Runaway Stream cost | Low | Medium | ≤ 60 s clips, 20 per master, validation before any call |
| Soft image from small source windows | High (WhatsApp clip) | Medium | Documented; GPT told to prefer original footage |
| Crop maths wrong at some ratio | Medium | Medium | Headless checks at portrait/wide/phone; unit test of the custom properties |
| `container-type: size` side effects | Low | Medium | Only on the frame/bg boxes, whose size comes from aspect-ratio/absolute inset |

## Revision History
| Round | Date | Changes |
|-------|------|---------|
| R1 | 2026-09-29 | Initial draft |
| R2 | 2026-09-29 | Terms section (master/derivative/source frame); speed vs reduced motion; copied fields re-validated; CSS budget |

