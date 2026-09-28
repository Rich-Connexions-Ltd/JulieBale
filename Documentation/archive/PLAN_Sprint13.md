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
