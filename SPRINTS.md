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
