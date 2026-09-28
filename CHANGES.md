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
