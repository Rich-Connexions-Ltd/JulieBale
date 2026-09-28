# Changes

Change log for the Cloudflare/D1 rebuild (`main`). Earlier Astro static-rebuild
work lives on the `astro-static-rebuild` branch.

## Sprint 10: Homepage Art Direction & Concept Previews (0.7.0) — 2026-09-28

Implements feature requests #3–#8 (homepage design exploration).

**Files changed:**
- `mcp/src/presentation.ts` — new: allowlisted section `style` / page `design` vocabulary (themes, width, spacing, gold rule, chapters, motion, hero layouts, editorial image controls, pullquote size), write warnings, publish sanitising, OpenAPI enums, concept examples
- `mcp/src/variants.ts` — new: persisted section keys, page variants normalised to ordinary pages, token-guarded previews, publish transform
- `mcp/src/render.ts` — applies presentation to existing blocks; captions; chapter numbers; progress line; preview banner; no-JS motion guard
- `mcp/src/index.ts` — `presentation_options`, `create_page_variant`, `list_page_variants`, `publish_page_variant` (MCP + REST); `/preview/{id}/{token}`; write warnings; no-store API responses; OpenAPI 0.7.0
- `mcp/public/styles.css` — presentation and motion CSS (+213 lines); **fix:** reveal content no longer stays hidden if JavaScript fails or is disabled
- `mcp/public/app.js` — observes presentation sections
- `mcp/context/content-model.md`, `mcp/README.md` — vocabulary, variant workflow, preview security model, tests
- `mcp/test/*`, `mcp/vitest.config.ts`, `mcp/package.json` — Vitest suite (94 tests) on Node SQLite with the real schema; golden regression files
- `scripts/` — council review tooling

**Deferred:** `mobile_first` stacking control (reading-order risk); testimonials carousel (request #1).

**Commit:** `f94677d`

## Sprint 10 fix: OpenAPI accepted by ChatGPT Actions — 2026-09-28

**Files changed:**
- `mcp/src/index.ts` — `createPageVariant` / `publishPageVariant` descriptions under 300 chars; `PresentationOptions` and `VariantList` response schemas with properties
- `mcp/test/routes.test.ts` — test enforcing the Actions validator rules (description ≤ 300, object schemas have properties)

## Feature request #9: six variants per page — 2026-09-28

**Files changed:**
- `mcp/src/variants.ts` — `MAX_VARIANTS_PER_BASE` 3 → 6 (tool and OpenAPI descriptions derive from it)
- `mcp/test/routes.test.ts` — limit test covers six and refuses a seventh
- `mcp/context/content-model.md`, `mcp/README.md` — limit wording

## Sprint 11: Image Overflow & Weighted Section Transitions — 2026-09-28

Feature requests #10 and #11. Review mode: no council (owner's call); tests + browser check.

**Files changed:**
- `mcp/src/presentation.ts` — new style keys `image_escape`, `overshoot`, `layer`, `shape` (showcase/feature/duo) and `transition`, `intensity` (any block); Gallery worked example
- `mcp/public/styles.css` — image escape (edge-anchored on wide screens, clamped on phones), clip shapes, layer order; transitions overlap/wipe/crossfade/depth/hold/carry/divider/settle with intensity presets, phone reduction and reduced-motion fallbacks; `main { overflow-x: clip }`; `--sec-pad` drives section padding
- `mcp/public/app.js` — observes reveal-driven transitions
- `mcp/context/content-model.md` — new options, guidance, Gallery example
- `mcp/test/render.test.ts`, `mcp/test/docs.test.ts` — classes, CSS safety (no horizontal scroll, pointer-events, reduced-motion and motion-gated transitions)
- `Documentation/archive/PLAN_Sprint11.md` — plan and implementation notes

## Backlog triage: requests #12–#23 — 2026-09-28

**Files changed:**
- `mcp/schema.sql` + D1 — `feature_requests.resolution` column (developer note on each status)
- `mcp/src/index.ts` — 0.7.1: `request_feature` / `list_feature_requests` descriptions (list first, don't re-log planned items); OpenAPI `FeatureRequest` exposes id, status, resolution, timestamps
- `mcp/context/content-model.md` — pause on new art-direction requests until Julie chooses a concept; planned sprint order; consent note
- `SPRINTS.md` — Sprints 12–14
- `mcp/test/routes.test.ts` — resolution is listed

## Sprint 12: Scenes — 2026-09-28

Feature requests #12, #16 (merged) and #21. Review mode: no council; tests + headless-Chrome check.

**Files changed:**
- `mcp/src/presentation.ts` — `scene_length`, `scene_timing`, `scene_text`, `scene_image`, `scene_background`, `focus_end`; `focus` extended to showcase/feature; page `design.scene_nav`
- `mcp/src/render.ts` — focal points on showcase/feature, optional `image_2` (dissolve only, lazy), pin spacer, `#chapter-NN` anchors, server-rendered scene nav
- `mcp/public/styles.css` — scroll-driven scenes (pin, text, photograph, background wash) behind reduced-motion and `@supports` guards; scene nav rail/label
- `mcp/public/app.js` — current-chapter tracking for the scene nav
- `mcp/context/content-model.md` — scenes, `image_2`, `focus_end`, scene nav
- `mcp/test/*` — scene rendering, nav, CSS guards (motion/support gating, text ranges always complete)
- `Documentation/archive/PLAN_Sprint12.md`

## Sprint 13: Trust Content (0.8.0) — 2026-09-28

Requests #23, #18 (supersedes #1), #19. Review mode: no council; tests + headless-Chrome check.

**Files changed:**
- `mcp/src/assets.ts` — asset library vocabulary, consent rule (granted / not-needed / pending / refused, optional expiry), warnings, search
- `mcp/src/render.ts` — `asset:<id>` resolution with consent gate; `testimonials` and `media` blocks
- `mcp/src/presentation.ts`, `mcp/src/variants.ts` — `testimonial_layout`, `media_ratio`; variant-level asset assignment
- `mcp/src/index.ts` — `search_assets` / `GET /api/assets/search`; asset and testimonial write warnings; OpenAPI 0.8.0
- `mcp/public/app.js`, `mcp/public/styles.css` — poster-first video, restrained carousel, testimonial and media styling
- `mcp/context/content-model.md` — assets and consent, testimonials, media
- `mcp/seed/sprint13-assets.*` — existing photography as assets (people other than Julie: consent pending)
- `mcp/test/assets.test.ts`, `seed.test.ts`, render and route tests

## Sprint 14: Composition and Ornament (0.9.0) — 2026-09-28

Requests #13 (+#17), #15, #14, #22, #20 (narrowed). Council review: plan approved R3; code review reached the round limit with one item accepted as Known Debt (pre-existing hover transitions' paint cost).

**Files changed:**
- `mcp/src/presentation.ts` — `edge`, `field`, `field_colour`, `field_position`, `ornament`, `ornament_position`, `collage`, `type_scale`, `ghost`, `hover`, `phone` (focus, crop); collage entry validation and warnings
- `mcp/src/render.ts` — `headline()` / `plainHeadline()` heading markup (`|`, `*…*`); collage (consent-gated, one asset query); `renderDecorations()` aria-hidden decoration layer (static SVG only)
- `mcp/src/variants.ts` — `media.images` per variant
- `mcp/src/index.ts` — descriptions; OpenAPI 0.9.0 (`Section.images`, markup)
- `mcp/public/styles.css` — decoration layer (no negative z-index), fields with contrast-capped opacity, ornaments, ghost, edges, collage, display type, phone crop/focus, hover; fixes: CTA kicker contrast, eyebrow contrast on decorated sections, `.frame img` will-change removed
- `mcp/context/content-model.md`, `mcp/README.md` — vocabulary, markup, guidance, deferred list
- `mcp/test/contrast.test.ts` (computed contrast for every field colour × ground × text colour), render/route/presentation/docs tests
- `Documentation/archive/PLAN_Sprint14.md`, `Documentation/findings/FINDINGS_Sprint14.md`

## Sprint 15: Landing Page Sanitiser — 2026-09-28

Owner decision to sanitise `/l/{slug}` landing pages. Council review (security).

**Files changed:**
- `mcp/src/sanitize.ts` — new: allowlist HTML (js-xss), per-attribute URL policies (no http:, no external images/forms, no protocol-relative/backslash URLs), `l-` id namespacing, scoped CSS allowlist with no url(), generic capped removal notes
- `mcp/src/render.ts` — `renderLanding` sanitises on every render; content wrapped in `.landing`
- `mcp/src/index.ts` — landing write warnings; strict CSP on `/l/` (exact motion-guard hash + app.js); `/ui/edit/` only reads collections that have an editor
- `mcp/context/content-model.md` — canonical "Landing pages" rules and alternatives; README summary
- `mcp/test/sanitize.test.ts` — XSS/CSS corpus, real landing page regression, docs drift guard; route tests for CSP and editor
- Fix: the existing landing page's CSS no longer restyles the site header/nav (now scoped)
- `mcp/public/styles.css` — `.landing` stacking context (z-index capped at 20) and reduced-motion rule for landing transitions
