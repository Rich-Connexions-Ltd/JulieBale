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
