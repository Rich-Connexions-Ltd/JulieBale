# juliebale.com — Sprint Plan

**Status:** Draft scaffold. Living document — we will refine scope, order and
detail as we go.
**Last updated:** 2026-09-12

Delivery plan for the architecture in [`ARCHITECTURE.md`](./ARCHITECTURE.md).
Each sprint lists a goal, scope, deliverables and a definition of done. Sprints
are numbered, not dated; we set dates when we commit to them. Status values:
`Not started` · `In progress` · `Done`.

Guiding sequence: **prove the design and the round-trip on the simplest content
first (pages), then widen to events/dates, then the heavy pieces (courses +
media), then auth.** Photography and design polish run alongside throughout.

Build approach (agreed 2026-09-12): **build the framework for everything first,
with boilerplate content** (including standard legal pages), get the structure
and the create/edit tools running, then hand to Julie to populate via chat.

## Progress log

- **Editing round-trip PROVEN on Julie's Plus account** — Custom GPT + Action →
  Cloudflare Worker → back. (MCP door also works for Enterprise/Claude.)
- **D1 backbone live** (`juliebale`, region WEUR): generic document store +
  **version history with undo** + **feature requests**. Same content API/URL, so
  Julie's Custom GPT keeps working.
- **Feature-request round-trip live** — chat can raise feature/element/content
  requests (`request_feature` tool, `POST /api/feature-requests`) for the dev
  side; the dev side lists and actions them. This is the loop that lets Julie
  ask for things the site can't do yet.
- Boilerplate pages seeded (home, about, work-with-me, privacy, terms, cookies).
- **Still to do this phase:** server-render the site from D1 (Cloudflare, no
  rebuild step); typed event/date tables + calendar; templates for every
  section; real legal boilerplate; harden auth + rotate the test key; seed the
  GPT with Julie's context pack; re-import the updated schema into Julie's GPT so
  it gains `undo` + `request_feature`.

---

## Sprint 0 — Foundations & decisions
**Status:** Not started

- **Goal:** everything in place to build with confidence.
- **Scope:**
  - Confirm Cloudflare account/project, domains and the Kajabi subdomain plan.
  - The 60-second **Plus connector check** (can Julie add a write-capable custom
    connector?) — decides primary vs fallback editing surface.
  - Seed the **context pack** (`context/` in repo or D1): brand, voice rules,
    offers/prices, design tokens, content model.
  - Rough **cost estimate** once expected course-video volume is known.
  - Agree the domain/subdomain cutover approach.
- **Deliverables:** confirmed platform access; context pack v1; decision log.
- **Done when:** we can create a Worker + D1 + R2 and know which editing surface
  Julie will use.

## Sprint 1 — Data-driven site on Cloudflare
**Status:** Not started

- **Goal:** the existing homepage prototype, served from Cloudflare, with copy
  coming from data instead of hard-coded HTML.
- **Scope:**
  - Stand up **Pages + Workers + D1**.
  - Define the `pages` schema and the read API.
  - Migrate `prototype/` into the Cloudflare build; homepage renders from D1.
  - Carry over the design system, fonts, responsive rules and photography.
- **Deliverables:** the current homepage live on Cloudflare Pages, content-driven.
- **Done when:** editing a page record changes the live homepage.

## Sprint 2 — Editing round-trip (MCP) + versioning
**Status:** Not started

- **Goal:** Julie can edit pages by chat, safely.
- **Scope:**
  - Build the **content API** (CRUD for pages) and the **MCP server** on Workers.
  - **Read** tools (context pack + current content) and **write** tools (pages).
  - **Risk tiers** (auto-publish vs approval) and **versioning + undo**.
  - Connect the **"Julie Bale Studio"** surface (Custom GPT / connector per
    Sprint 0), or the **fallback admin** if Plus blocks writes.
- **Deliverables:** working round-trip on pages; "undo that" works.
- **Done when:** Julie changes homepage copy by chat and can revert it by chat.

## Sprint 3 — Blog
**Status:** Not started

- **Goal:** a proper blog, editable by chat.
- **Scope:** `posts` schema + API + MCP tools; blog index and post templates;
  images via R2; permalinks; migrate existing Kajabi posts.
- **Done when:** Julie publishes and edits a post by chat; posts render with
  correct permalinks.

## Sprint 4 — Events & the dates calendar
**Status:** Not started

- **Goal:** events with permalinks, and one dates feed shown as list or calendar.
- **Scope:**
  - `events` schema (incl. the free `details`/running-order area, images, links,
    availability) + API + MCP tools.
  - Unified `dates` feed: events auto-appear; standalone dates add/edit/delete.
  - **List and calendar** views on the front-end.
- **Done when:** an event created by chat appears on its page and in the calendar.

## Sprint 5 — The Diva Hub
**Status:** Not started

- **Goal:** the members' hub at `/divahub`.
- **Scope:** footer-only placement; `noindex`; accordion of Courses · Events ·
  Dates pulled live; list/calendar toggle for dates.
- **Done when:** `/divahub` shows current courses, events and dates, unlinked
  from the main menu and out of search.

## Sprint 6 — Courses & self-hosted media
**Status:** Not started

- **Goal:** course pages with self-hosted video and audio.
- **Scope:**
  - `courses` schema (lessons, media ids) + API + MCP tools.
  - **R2** (audio/images) and **Cloudflare Stream** (video) with **signed upload
    URLs** brokered by the AI.
  - Course and lesson templates with the player.
- **Done when:** Julie attaches a video/audio to a lesson by chat and it plays on
  the course page.

## Sprint 7 — Fallback admin
**Status:** Not started

- **Goal:** editing that never depends on OpenAI's connector availability.
- **Scope:** a small authenticated admin (chat-style or form-based) on Cloudflare
  hitting the same API/MCP. Ships earlier if the Plus check in Sprint 0 blocks
  chat writes.
- **Done when:** Julie can make any edit without ChatGPT.

## Sprint 8 — SEO, redirects & launch
**Status:** Not started

- **Goal:** launch without losing search ranking.
- **Scope:** 301 map from Kajabi URLs (mixed-case blog slugs, podcast episodes);
  metadata, sitemaps, social images, structured data; forms wired to their
  destinations; DNS cutover plan and monitoring.
- **Done when:** the new site is live on `juliebale.com` with redirects verified.

## Sprint 9 — Authentication (later)
**Status:** Not started

- **Goal:** real privacy for the members area.
- **Scope:** Cloudflare Access or lightweight consumer auth; gate the Diva Hub
  and any private content; decide the relationship with Kajabi login.
- **Done when:** members authenticate and private content is no longer reachable
  by URL alone.

---

## Sprint 10 — Homepage art direction & concept previews
**Status:** Done (code complete, council approved 2026-09-28; deploy pending)

- **Goal:** chat can build up to three homepage concepts from Julie's existing
  copy, with real art direction and restrained motion, and preview them without
  touching the live homepage.
- **Source:** feature requests #3–#8 (logged 2026-09-28 from the homepage design
  exploration). #1 (testimonials carousel) is deliberately out of scope.
- **Scope:**
  - **Previews (#6):** unpublished page variants that reference the live page's
    copy, with independent ordering and presentation, a private preview URL, and
    a publish step that is undoable.
  - **Section presentation (#3):** per-section theme, width, spacing and gold
    rule; page-level concept.
  - **Hero layouts (#4)** and **editorial image/text controls (#5)** as
    presentation-only options on existing blocks.
  - **Journey chapters (#7):** chapter numbering and a slim progress line.
  - **Motion (#8):** a small, selectable animation vocabulary that honours
    reduced motion and never hides content when JavaScript is unavailable.
- **Deliverables:** presentation vocabulary + renderer support; variants
  collection, preview route and MCP/REST tools; CSS; automated tests; updated
  content-model context pack and tool descriptions.
- **Exit criteria:** pages with no presentation fields render as before; three
  variants of `home` can be created, previewed and one published (and undone)
  by chat; all tests and typecheck pass; council code review APPROVED.

---

## Sprint 11 — Image overflow & weighted section transitions
**Status:** Done (2026-09-28)

- **Goal:** give the Gallery concept (and the other three) images that break out
  of their frames and section-to-section transitions with real weight, without
  scroll-jacking.
- **Source:** feature requests #10 and #11 (2026-09-28). Review mode: no council
  (owner's call); tests + browser check instead.
- **Scope:**
  - **#10:** image escape (side / up / down / both), overshoot presets, layer
    order, clip shapes; clamped on narrow screens; no horizontal page scroll.
  - **#11:** per-section arrival transitions (overlap, wipe, crossfade, depth,
    hold, carry, divider, settle) with intensity presets, mobile reduction and
    reduced-motion fallbacks. CSS-only: sticky, scroll-snap *proximity* and
    scroll-driven animations; no scroll listeners.
- **Exit criteria:** unstyled pages unchanged (goldens); all tests pass; previews
  checked at desktop and mobile; deployed; content-model updated; #10 and #11 done.

---

## Sprint 12 — Scenes
**Status:** Done (2026-09-28)

- **Goal:** sections that take the viewport for a moment and evolve with scroll, then release, using native scrolling only.
- **Source:** #12 (scroll-progress scenes), #16 merged in (photographic storytelling), #21 (scene navigation); scroll-linked drift from #13.
- **Scope:** pin length presets; enter/hold/release phases; progress-linked fade/reveal/scale/translate and staged text; background colour interpolation; image zoom/re-crop/dissolve to an optional second image (new optional content field); carry into the next section; chapter label / progress rail. CSS scroll-driven animations with static fallback (Firefox, reduced motion); phones shorter or static.
- **Exit criteria:** goldens unchanged; tests pass; Gallery preview checked desktop + phone; deployed; content-model updated.

## Sprint 13 — Trust content
**Status:** Done (2026-09-28)

- **Goal:** first-class content for people and performance, with consent recorded before use.
- **Source:** #23 (asset library; rights/consent + usage metadata first), #18 (testimonials and singer stories; supersedes #1), #19 (performance media).
- **Scope:** `assets` collection with metadata, search/filter and variant assignment; testimonial/story content type with presentation modes (portrait + quote, story card, restrained carousel without auto-advance, short video); performance media block (poster frame, muted loop, audio excerpt, captions/transcript, lazy loading).
- **Exit criteria:** consent status enforced where assets are featured; accessible controls; tests; deployed.

## Sprint 14 — Composition and ornament
**Status:** Done (2026-09-28; council approved with one Known Debt item)

- **Goal:** richer editorial composition once the content exists.
- **Source:** #13 with #17 merged (organic backgrounds, decorative SVG), #15 (collage), #14 (display typography), #22 (hover), #20 narrowed.
- **Scope:** background shapes/dividers/washes and decorative elements in the brand palette; 2–4 image compositions; display type (with minimal inline markup for line breaks / emphasised words); touch-safe hover effects; phone-only overrides for crop, focal point, image escape, type size and motion (not every option per breakpoint).
- **Exit criteria:** contrast and reading order preserved; no horizontal overflow; tests; deployed.

---

## Sprint 15 — Landing page sanitiser
**Status:** Done (2026-09-28; council approved R3)

- **Goal:** landing pages (`/l/{slug}`) can never run script or load active content, whatever HTML is stored.
- **Source:** owner decision 2026-09-28 (previously accepted risk).
- **Scope:** parser-based allowlist sanitiser for landing HTML and CSS at render time, warnings at write time, strict CSP on `/l/` responses.
- **Exit criteria:** XSS payload corpus neutralised; existing landing page renders unchanged; council approved; deployed.

---

## Ongoing tracks (run alongside)

- **Photography** — integrate shoot assets as they arrive; fill the flagship
  image; produce the shot list before the shoot.
- **Design polish** — the deliberately-designed **mobile homepage**; section-scale
  variation; refinements from Julie's and ChatGPT's review.
- **Content migration** — pages, posts, podcast, media exported from Kajabi.
- **Context pack upkeep** — keep brand/voice/offers current as the single source
  of truth.

---

## Notes

- Sprints 3–6 are largely independent once Sprint 2's pattern (schema → API → MCP
  tools → template) exists; order can flex to Julie's priorities.
- Auth (Sprint 9) can move earlier if anything genuinely private needs the Diva
  Hub before then.
