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
