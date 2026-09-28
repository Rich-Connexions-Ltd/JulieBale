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
