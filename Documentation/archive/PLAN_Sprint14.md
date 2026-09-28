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
