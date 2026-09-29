# Sprint 17: Media Import Fixes (bug #25)

## Problem
- Two MP4s uploaded in ChatGPT (`WhatsApp Video 2026-09-19 at 20.10.38.mp4`,
  `Chronicles of Hope - 018.mp4`) both failed at Cloudflare Stream's
  `/stream/copy` with 400 / code 10005 ("Bad Request: The request was invalid").
  The request body matched Stream's documented schema; the cause could not be
  isolated (Stream fetching our signed `workers.dev` URL is the only moving part).
- Retrying via URL import failed earlier: ChatGPT's link path is `.../raw`, and
  the importer decided the type from the URL's extension only.

## Changes
1. **Direct upload instead of copy-by-URL.** The Worker requests a one-time
   `direct_upload` URL (validated: `https://*.videodelivery.net|cloudflarestream.com/`)
   and streams the R2 original to it as `multipart/form-data` with an exact
   `Content-Length` (never buffered). Stream no longer fetches anything, so the
   signed master URL scheme is removed and `/media/masters/*` is **never** served.
2. **Type from the response.** `resolveType` picks, most specific first: the
   response `Content-Type` (unless generic `application/octet-stream`), ChatGPT's
   stated `mime_type`, then the extension of the stated name or the
   `Content-Disposition` filename. A specific disallowed type (e.g. `text/html`)
   or an extension contradicting the chosen type is refused. The stored name
   always carries a matching extension.
3. **Asset id after resolution.** The id is chosen once the real file name is
   known (so `.../raw` becomes `chronicles-of-hope-018`, not `raw`).
4. Clearer errors (private/unavailable link vs expired chat link; missing
   Content-Length) and Stream's own (redacted) message in errors and logs.
5. Sanitiser: js-xss ignores `onIgnoreTag` when `stripIgnoreTag` is set, so
   removal notes were silently dropped for some tags; now `onIgnoreTag` strips
   and notes (corpus unchanged, all safe).

## Tests
Multipart framing and exact bytes delivered to Stream; no `/stream/copy` call;
masters never served (with or without query); `raw` ChatGPT link with
Content-Disposition; chat file served as octet-stream; resolveType table
(response type, stated type, extension, disallowed/contradicting types);
Content-Disposition parsing incl. `filename*=` and path stripping; existing
policy, size, cleanup, consent and auth tests. 307 passing.

## Files
`mcp/src/media-import.ts`, `mcp/src/index.ts`, `mcp/src/sanitize.ts`,
`mcp/test/media-import.test.ts`, `CHANGES.md`, `SPRINTS.md`.
