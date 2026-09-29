# Findings Tracker: Sprint 18 (Editorial Video Modes)

> Reconstructed after archiving (the archive script deletes the working tracker;
> it was not copied first). Finding text is condensed from the council outputs;
> statuses and resolutions are as recorded before archiving.

## Plan review (R1–R5; max rounds reached, closing notes in the archived plan)

| # | Round | Sev | Finding | Status | Resolution |
|---|---|---|---|---|---|
| 1 | R1 | High | `video_mode` duplicated media layout controls | ADDRESSED | One key `playback`; framing via media_ratio/shape/focus/phone (+`wide`) |
| 2 | R1 | High | Layout shift from late UI/source changes | VERIFIED | CSS-reserved frames; absolute video/toggle; server-rendered `<source>`; headless CLS from video = 0 |
| 3 | R1 | High | Atmospheric text duplicated / reading order | VERIFIED | Background renders heading+caption once on the panel; video aria-hidden |
| 4 | R1 | Med | Revalidate stored MP4 at render | VERIFIED | `isStreamMp4` + `mp4_status` re-checked in `resolveAssetRefs` |
| 5 | R1 | Med | One validated URL builder for uid-derived URLs | VERIFIED | `streamThumbnail`/`streamIframe`/`isStreamMp4`; hostile tables |
| 6 | R1 | Med | Resolved data as author-facing fields | VERIFIED | Symbol-keyed `RESOLVED_VIDEO` |
| 7 | R1 | Med | Reuse shape/focus resolution and selectors | VERIFIED | Only `blocks` widened; selector lists extended |
| 8 | R1 | Med | Extend existing media JS lifecycle | ADDRESSED | Lives in the Performance media section of app.js |
| 9–11 | R1 | Med | Tool docs, asset `mp4` docs, video a11y terms | ADDRESSED | Content model, README, OpenAPI (Asset readOnly, MediaSummary), refresh descriptions |
| 12 | R1 | Low | Rejected focus → no style attribute | VERIFIED | Test incl. clamping |
| 13 | R1 | Low | `mp4_status` vocabulary | VERIFIED | processing / ready / error |
| 14 | R2 | High | Style key `video` collided with content field | ADDRESSED | Renamed `playback` |
| 15 | R2 | Med | Custom poster URL safety | ADDRESSED | Same `assetUrl()` + escaping as every image |
| 16 | R2 | Med | WeakMap hidden coupling | ADDRESSED | Symbol-keyed data on the section |
| 17 | R2 | Med | N+1 queries for URL builders | ADDRESSED | Builders are pure; one batched asset query per page |
| 18 | R2 | Low | Play control contrast | VERIFIED | Near-opaque discs; ≥ 3:1 test |
| 20 | R3 | High | object-position applied late (LCP) | VERIFIED | Server-rendered style |
| 21 | R3 | Med | Stale WeakMap wording | ADDRESSED | Plan text fixed |
| 22 | R3 | Med | Player fallback control contrast | VERIFIED | Contrast test covers `.media-play__icon` |
| 23 | R4 | High | CSS bloat / pruning | VERIFIED | Additive only; ≤ 2.5 KB budget test |
| 24 | R5 | High | `preload="none"` vs LCP | ADDRESSED | LCP is the poster, fetched regardless |
| 25 | R5 | High | Prior findings still OPEN | ADDRESSED | Tracker had not been updated; filled in |
| 26 | R5 | Med | Toggle label underspecified | VERIFIED | alt → caption → heading → "performance" |
| 27 | R5 | Med | Default `playback` value | VERIFIED | `player` stated everywhere |

## Code review (R1–R3; approved R3, convergence 85%)

| # | Round | Sev | Finding | Status | Resolution |
|---|---|---|---|---|---|
| 28 | R1 | High | Layout shift / no-JS access | VERIFIED | No-JS: native controls (ambient), still poster (background); CLS 0 from video |
| 29 | R1 | High | Markdown HTML injection | ADDRESSED | HTML already escaped; link targets now limited to http(s)/mailto/tel/site-relative/# (pre-existing gap, fixed) |
| 30 | R1 | High | Test coverage for URL helpers | VERIFIED | `test/video.test.ts` |
| 31 | R1 | High | `playback` description length | ADDRESSED | Shortened; the 300-char rule applies to operation descriptions |
| 32 | R2 | High | `/media` unauthenticated | WONTFIX | By design: public site media; imports consent-gated; masters never served |
| 33 | R2 | High | Toggle shown under reduced motion | WONTFIX | Reduced motion stops autoplay, not the visitor's choice |
| 34 | R2 | High | `data-loop` observer disconnect | WONTFIX | Pre-existing iframe path, out of scope |
| 35 | R2 | High | Default wording mismatch | VERIFIED | Generated schema matches content model |
| 36 | R2 | Med | `poster_at` validation | ADDRESSED | 400 for non-numeric/out-of-range; null = omitted |
| 37–39 | R3 | Med/Low | Naming in storeSource; mediaButton uid defence; data-loop disconnect | OPEN (accepted) | Cosmetic / callers already validate uid / pre-existing |
