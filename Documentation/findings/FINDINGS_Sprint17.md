# Findings Tracker: Sprint 17 (code)

Editor: Update the **Status** and **Resolution** columns after addressing each finding.
Status values: `OPEN` | `ADDRESSED` | `VERIFIED` | `WONTFIX` | `REOPENED`

| # | Round | Severity | Finding | Status | Resolution |
|---|-------|----------|---------|--------|------------|
| 1 | R1 | High | Unauthenticated `/admin/upload` route exposes internal upload/import UI without the API bearer gate used by `/api` an... | WONTFIX | Static page (no data); every upload/list call it makes requires the bearer key; a browser cannot send a bearer header when navigating. Recorded previously (Sprint 15). |
| 2 | R1 | Medium | Landing pages are sanitized on every `/l/{slug}` render, which can add avoidable repeated parser work for unchanged c... | WONTFIX | Sanitising a ~15 KB landing page takes a few ms; caching by document version is a possible later optimisation, not needed now. |
| 3 | R1 | Medium | Missing `Content-Length` import failure message is clear for absent length, but does not help users distinguish unkno... | WONTFIX | The message already states the cause (the server did not give the size) and the next step (another link or attach the file in the chat); oversized files get a separate 'too large (limit …)' message. |
| 4 | R1 | Medium | `ImportResults.results[].warnings` lacks import-specific OpenAPI description, making asset consent, alt text, transcr... | ADDRESSED | OpenAPI ImportResults warnings/error now describe what they contain. |
| 5 | R1 | Medium | Sanitizer `onIgnoreTag` behavior is not explicitly covered by a regression test despite being called out in Sprint 17... | ADDRESSED | Regression test: disallowed tags keep their text and produce notes. |
| 6 | R2 | Medium | Inconsistent terminology for “asset id” in the `importMedia` OpenAPI request schema may confuse API consumers about t... | ADDRESSED | OpenAPI importMedia `asset` now has the id pattern and explains id vs asset:<id> reference. |
| 7 | R2 | Medium | `streamUploadFromR2` does not explicitly test the `FixedLengthStream` path, leaving an important upload branch withou... | ADDRESSED | Test stubs FixedLengthStream and asserts both the R2 write and the multipart upload use it with exact lengths. |
| 8 | R2 | Low | Potential N+1 D1 query pattern for asset consent checks on landing-page rendering. This is a performance optimization... | WONTFIX | Landing pages do not resolve asset references (images must be /assets or /media paths), so there are no per-render asset queries. |
| 9 | R2 | Low | Missing `prefers-color-scheme` support for theme/color combinations may reduce UX polish for users with system dark/l... | WONTFIX | Out of scope for a bug fix; the site has a single brand colour scheme by design. |
| 10 | R2 | Low | `/api/media` appears to allow unauthenticated R2 object listing in `handleApi`. This should be reviewed as hardening,... | WONTFIX | False: handleApi rejects every /api request without the bearer key (and fails closed with no key) before any route, including GET /api/media; tests cover 401/503. |
