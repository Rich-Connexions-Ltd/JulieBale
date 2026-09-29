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
