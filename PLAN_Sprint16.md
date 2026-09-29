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
