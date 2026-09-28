# Findings Tracker: Sprint 15 (code)

Editor: Update the **Status** and **Resolution** columns after addressing each finding.
Status values: `OPEN` | `ADDRESSED` | `VERIFIED` | `WONTFIX` | `REOPENED`

| # | Round | Severity | Finding | Status | Resolution |
|---|-------|----------|---------|--------|------------|
| 1 | R1 | High | CSS sanitisation is too permissive and partly deny-list based, allowing page takeover, tracking, or exfiltration prim... | ADDRESSED | Plan R2 (see Revision History) |
| 2 | R1 | High | The proposed HTML allowlist is far broader than the landing-page need, including media, tables, forms, iframes, broad... | ADDRESSED | Plan R2 (see Revision History) |
| 3 | R1 | High | `class` and `id` are allowed globally without namespace or value restrictions, allowing collisions with site chrome, ... | ADDRESSED | Plan R2 (see Revision History) |
| 4 | R1 | High | Iframe support contradicts the stated “cannot load active content” goal unless heavily constrained with fixed sandbox... | ADDRESSED | Plan R2 (see Revision History) |
| 5 | R1 | High | OpenAPI, MCP tool descriptions, and assistant-facing content model updates are underspecified for the new landing-pag... | ADDRESSED | Plan R2 (see Revision History) |
| 6 | R1 | High | The proposed `xss` dependency may be too large for the Worker path, risking cold-start and execution-time regressions... | ADDRESSED | Plan R2 (see Revision History) |
| 7 | R1 | Medium | URL handling is too broad and should be separated by attribute type. Navigation links, passive asset loads, CSS URLs,... | ADDRESSED | Plan R2 (see Revision History) |
| 8 | R1 | Medium | Forms create phishing and credential-harvesting risk on Julie’s domain unless restricted to known same-origin endpoin... | ADDRESSED | Plan R2 (see Revision History) |
| 9 | R1 | Medium | CSP still allows broad same-origin scripts via `script-src 'self'`; `/l/` should prefer only exact hashes or nonces r... | ADDRESSED | Plan R2 (see Revision History) |
| 10 | R1 | Medium | `sanitizeLanding(html)` overloads extraction and sanitisation responsibilities. Extraction of `<style>` and `<main>/<... | ADDRESSED | Plan R2 (see Revision History) |
| 11 | R1 | Medium | Write-time warnings should not depend directly on render-specific `{ css, body }` output shape. (Source: Code Simplic... | ADDRESSED | Plan R2 (see Revision History) |
| 12 | R1 | Medium | No drift guard is planned between sanitizer policy and assistant-facing docs. (Source: Documentation Expert) | ADDRESSED | Plan R2 (see Revision History) |
| 13 | R1 | Low | Warning messages should be structural, generic, capped, escaped, and value-truncated to avoid echoing unsafe payloads... | ADDRESSED | Plan R2 (see Revision History) |
| 14 | R1 | Low | Non-obvious sanitizer logic needs brief comments around decoded URL/CSS checks and extraction behaviour. (Source: Doc... | ADDRESSED | Plan R2 (see Revision History) |
| 15 | R1 | Low | Documentation should avoid duplicating the full policy across README and content model; keep one canonical authoring ... | ADDRESSED | Plan R2 (see Revision History) |
| 16 | R2 | Medium | URL policy does not explicitly reject protocol-relative URLs, backslash-normalised escapes, or parsed origin mismatch... | ADDRESSED | Plan R3 (see Revision History) |
| 17 | R2 | Medium | The HTML allowlist remains broader than the stated landing-page baseline. Tags and attributes such as extra structura... | ADDRESSED | Plan R3 (see Revision History) |
| 18 | R2 | Medium | The CSS allowlist is large enough to behave like a second presentation system. Reduce the initial property set to wha... | ADDRESSED | Plan R3 (see Revision History) |
| 19 | R2 | Medium | Media embedding limitations and alternatives are under-specified for the assistant. The content model should clearly ... | ADDRESSED | Plan R3 (see Revision History) |
| 20 | R2 | Medium | Image support may create performance risk if each image asset requires separate D1 lookup or resolution during render... | ADDRESSED | Plan R3 (see Revision History) |
| 21 | R2 | Low | `role` and `lang` should not be globally unconstrained. Restrict `lang` to a conservative BCP-47-shaped token and eit... | ADDRESSED | Plan R3 (see Revision History) |
| 22 | R2 | Low | Keep `sanitize.ts` internally structured around small policy/helper units such as `htmlPolicy`, `urlPolicy`, `cssPoli... | ADDRESSED | Plan R3 (see Revision History) |
| 23 | R3 | Medium | Constrained `lang` support appears to have been dropped from the sanitizer attribute policy, despite the prior plan r... | ADDRESSED | lang allowed globally when it matches ^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$; tested. |
| 24 | R3 | Medium | Image policy lacks `srcset` support, limiting responsive image delivery and risking unnecessary bandwidth on smaller ... | WONTFIX | Deferred: landing images are same-origin static files and the site has no image-size pipeline yet; revisit with an image resizing feature. |
| 25 | R3 | Medium | The planned drift guard does not cover the full assistant-facing landing-page policy. It checks core constants but no... | ADDRESSED | Drift guard extended to URL schemes/path prefixes, input types, autocomplete values, id namespacing and the documented alternatives. |
| 26 | R1 | High | Unauthenticated administrative/editor UI access allows `/ui/edit/` and `/admin/upload` to be reached without an acces... | ADDRESSED | Checked: renderEditorPage only renders fields of events/dates/posts/courses (public) and shows 'No editor' otherwise, so no token/consent data reached the page; /admin/upload needs the API key for every call. Hardened anyway: /ui/edit/ returns 404 before any D1 read for other collections (test). |
| 27 | R1 | High | Accessibility attributes are over-restricted: `role`, `lang`, and safe `aria-*` attributes are not adequately preserv... | WONTFIX | Deliberate, council-approved narrowing (R2/R3): landing pages keep lang (validated), aria-label and aria-hidden; role/other aria-* excluded to minimise surface. Revisit if a landing page needs them. |
| 28 | R1 | High | `lang` attribute validation is incomplete; the current `LANG_RE` is too permissive or not sufficiently aligned with e... | WONTFIX | LANG_RE (^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$) is BCP-47-shaped and cannot carry markup or quotes (output is attribute-escaped); full BCP-47 registry validation is out of scope. |
| 29 | R1 | Medium | External font stylesheets are render-blocking in landing/page rendering and may delay first paint. (File: `mcp/src/re... | WONTFIX | Pre-existing site-wide font link, already display=swap; unchanged by this sprint. |
| 30 | R1 | High | Sprint 15 is missing from `CHANGES.md`, leaving the release/change history incomplete. (File: `CHANGES.md`, Location:... | ADDRESSED | CHANGES.md Sprint 15 entry added. |
| 31 | R2 | High | Potential SQL injection in dynamic query construction for `readRows` and `loadTestimonials`. Dynamic table, collectio... | WONTFIX | False: readRows/loadTestimonials only interpolate '?' placeholders (count from a validated id list); all values are bound. Ids are validated against ^[a-z][a-z0-9-]{0,63}$ first. |
| 32 | R2 | Medium | Missing `prefers-reduced-motion` support for landing page CSS sanitisation. Sanitised landing pages should be able to... | ADDRESSED | Site stylesheet disables transitions/smooth scrolling inside .landing under prefers-reduced-motion; authors may also add their own @media (prefers-reduced-motion) block (allowed by the sanitiser). Tested. |
| 33 | R2 | Low | Inconsistent terminology for “Landing Page Sanitiser” between `CHANGES.md` and `PLAN_Sprint15.md`. (File: `CHANGES.md... | ADDRESSED | Both use 'Landing Page Sanitiser' (CHANGES heading and plan title match). |
| 34 | R3 | Medium | Landing page authoring docs do not explicitly guide authors to preserve WCAG contrast and visible focus states for cu... | ADDRESSED | content-model.md Landing pages: accessibility guidance (4.5:1 contrast, explicit heading colours on coloured panels, never remove focus outlines, label every input). |
| 35 | R3 | Medium | URL-policy terminology is inconsistent in the landing-page content model, which may confuse assistant-facing guidance... | ADDRESSED | Landing docs name the three address rules once and use them consistently. |
| 36 | R3 | Medium | CSS `z-index` validation remains permissive up to `50`, which may allow landing-page content to escape the intended l... | ADDRESSED | .landing gets its own stacking context (isolation: isolate) so landing z-index cannot reach the site header; cap tightened to 20; tested. |
