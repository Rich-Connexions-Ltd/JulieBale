# juliebale.com — Architecture & Build Plan

**Status:** Draft for review. Living document.
**Last updated:** 2026-09-12

This document captures the agreed architecture for Julie Bale's new website and
the chat-driven content platform behind it. It is the shared reference for
Julie, Rich Connexions and ChatGPT. Sprints are tracked separately in
[`SPRINTS.md`](./SPRINTS.md).

---

## 1. What we are building

A new public website for Julie Bale (dramatic soprano, Vocal Transformation
Specialist and Mentor) that is:

- **Editorial and premium** — the design language established in `prototype/`
  (teal / gold / cream, Playfair + Raleway, cinematic photography, generous space).
- **Content-driven** — page copy, events, blog, courses and dates are stored as
  data, not hard-coded, so they can change without a redeploy.
- **Editable by Julie through chat** — she talks to an AI that knows her business
  and can update the live site. This round-trip is the defining requirement.

Kajabi remains the back office (CRM, courses/checkout, client login, email) for
now, likely on a subdomain. Authentication on the new site is a later phase.

### Guiding principles

1. **The capability is a thin, portable API. The AI surface is a swappable
   adapter.** We do not bet the architecture on any single vendor's product
   (Custom GPTs, Apps, workflows). The durable core is an API + an MCP server.
2. **Julie's context is a first-class, versioned asset** — never trapped in one
   chat thread. It is the single source of truth that both the site and the
   editing AI read from.
3. **Small edits are frictionless; risky edits are gated; nothing is ever lost.**
   Every change is versioned and reversible by chat.
4. **British English throughout. No em dashes in site copy. Singing is always the
   primary subject.** (Julie's brand voice rules.)
5. **Tool descriptions are documentation, not labels.** Every MCP tool and API
   operation carries a verbose description: *when* to reach for it, *how* to use
   it, and *what NOT to do* (naming the safer alternative). The model chooses and
   uses tools from these words, so as the toolset grows this documentation surface
   is the main lever on reliable behaviour. A blunt "create or replace" once let
   the model strip an event; a description that says "REPLACES the whole document,
   use updateContent to edit a field" prevents it. Keep every new tool to this
   standard.

---

## 2. Platform — Cloudflare

| Layer | Product | Role |
|---|---|---|
| Front-end hosting | **Cloudflare Pages** | Serves the site (hand-written HTML/CSS/JS build). |
| API + edge logic | **Cloudflare Workers** | The content API and the **remote MCP server**. |
| Content store | **Cloudflare D1** (SQLite) | Pages, posts, events, courses, dates, context pack. |
| Media storage | **Cloudflare R2** | Images and audio. **Zero egress fees.** |
| Video | **Cloudflare Stream** | Self-hosted course video: transcode, adaptive streaming, signed playback. |
| Auth (later) | **Cloudflare Access / Zero Trust** | Gating the members area when auth arrives. |

**Why Cloudflare:** self-hosted course video is the heaviest requirement, and
R2's zero-egress plus Stream's per-minute model make it materially cheaper and
less DIY than the alternatives. Rich Connexions already operates Cloudflare, so
it is one vendor and known billing. Workers is also a first-class host for a
remote MCP server, which is central to the editing round-trip (section 5).

```
                         ┌──────────────────────────────┐
   Visitors ───────────► │  Cloudflare Pages (the site)  │
                         └───────────────┬──────────────┘
                                         │ reads content
                                         ▼
   Julie (ChatGPT) ─┐        ┌────────────────────────────┐
   Fallback admin ──┼──────► │  Workers: Content API + MCP │ ──► D1 (content + context)
   Claude / other ──┘        └────────────────────────────┘ ──► R2 (images, audio)
                                                             └─► Stream (video)
```

---

## 3. Content model

All content lives in D1 and is exposed through the content API. Fields below are
illustrative, not final DDL.

### `pages`
Generic pages, including landing pages.
- `slug` (permalink), `title`, `blocks` (ordered content), `hero`
- `placement`: `menu` | `footer` | `hidden`
- `status`: `draft` | `published`, `noindex` (bool), timestamps

### `posts` (blog)
- `slug`, `title`, `date`, `excerpt`, `body`, `hero`, `tags[]`, `status`

### `events`
- `slug` (permalink), `title`, `starts_at`, `ends_at`, `location`
- `description`, `images[]`, `links[]`
- `details` — free editable rich area (running orders, notes, etc.)
- `availability` (e.g. open / limited / sold out), `status`

### `courses`
- `slug`, `title`, `description`
- `lessons[]` — each with `title`, `body`, and `media` (a Stream video id or an
  R2 audio object)
- `status`

### `dates` (unified calendar feed)
- Every **event** contributes a date automatically.
- Plus standalone entries Julie can add / edit / delete (`title`, `date`,
  `note`, `link`).
- Rendered as **list or calendar** on the front-end and in the Diva Hub.

### `context` (the business context pack)
- Versioned records of Julie's durable business truths: brand, voice rules,
  offers and prices, positioning, design tokens, content conventions.
- Read by the editing AI on every task; editable by chat. Single source of truth
  shared by the site and the AI.

### Navigation model
Driven by each page's `placement`:
- **menu** — primary navigation (Home, About, Work With Me, Podcast, Performances).
- **footer** — footer-only links (e.g. the Diva Hub, Everything, legal pages).
- **hidden** — reachable only by its permalink (landing pages created as required).

### The Diva Hub (`/divahub`)
- Footer-linked only, `noindex` until authentication exists.
- An **accordion**: Courses · Events · Dates — all pulled live from the
  collections above, so it stays in sync.
- **Privacy caveat:** with no auth, an unlisted URL is *not* private — treat Diva
  Hub content as effectively public until Access/auth lands (section 6). Nothing
  genuinely sensitive goes there before then.

---

## 4. Media (self-hosted video and audio)

- **Video** → Cloudflare Stream. The AI requests a one-time upload URL; the file
  is uploaded; Stream transcodes and returns a playback id stored against the
  lesson. Adaptive streaming and signed playback come built in.
- **Audio and images** → R2 via signed upload URLs. Zero egress keeps bandwidth
  cheap.
- The editing AI never handles raw bytes through the chat; it brokers **signed
  upload URLs** and records the resulting ids.

---

## 5. The editing round-trip ("Julie Bale Studio")

Julie's ideal: discuss her business in ChatGPT, then say *"and now update the
website to reflect our findings,"* and it happens.

### How it works
- The editing capability is a **remote MCP server on Cloudflare Workers**, with a
  plain REST API underneath. MCP is the convergent standard (OpenAI Apps/
  connectors, Claude, and others speak it), so it is the least likely piece to be
  deprecated.
- The AI (the "Julie Bale Studio") **reads** the context pack and current site
  content at the start of a task, so it always works from Julie's real voice,
  facts and what is actually on each page.
- It **writes** both the **site** and the **context pack**, so refining the
  business feeds back into the single source of truth rather than evaporating in
  a chat.
- **Memory on**, so it accumulates continuity like normal ChatGPT.

### Publishing policy (risk-tiered)
Small changes publish immediately; higher-stakes changes draft and wait for a
"yes, publish." Everything is versioned, so any change is reversible by chat
("undo that", "put the homepage back to yesterday") — that is what makes
auto-publish safe.

**Auto-publish (no approval):**
- Editing text/copy on an existing page or post
- Updating an existing event's details (time, location, running order, links, images)
- Adding, editing or removing dates
- Typo and wording fixes

**Hold for "yes, publish":**
- Creating or deleting a whole page, post, event or course
- Publishing a new landing page, or changing navigation/placement
- Changing a price or an offer's core terms
- Publishing or replacing course video/audio

The line is a starting point and easy to move once Julie feels it in use.

---

## 6. Integration & access (how the AI reaches the MCP server)

### No OpenAI publishing or review for private use
An app-store submission/review is only needed to *list an App publicly*. Julie's
editor is private and single-user, so there is **no OpenAI approval process.** It
is added to her account as a **custom connector** (paste the MCP server URL,
authorise once via OAuth).

### The real gate is her plan, not approval
- Custom connectors have generally sat behind a **developer-mode/beta setting**
  and rolled out **tier-first** (Pro/Team/Enterprise ahead of Plus).
- Early MCP-in-ChatGPT allowed **read** tools widely, but **write** tools (which
  "publish to my site" needs) have been more gated. So the binding question is:
  **does Julie's Plus account currently expose write-capable custom connectors in
  normal chat?**
- **Action:** a 60-second empirical check on her account (Settings → Connectors /
  developer mode) will settle this. It is also verifiable the moment the server
  exists.

### Runtime approvals
Even once connected, ChatGPT asks Julie to authorise the connector and to allow
actions the first time they run. That dovetails with our own risk tiers.

### Swappable AI surface + guaranteed fallback
- **MCP-first** means the same server works from a **Custom GPT** (while those
  last), an **App/connector**, a **workflow**, from **Claude**, and from Rich
  Connexions' own MCP tooling.
- Because Plus write-connector availability is uncertain and moves month to
  month, we build a **provider-independent fallback**: a small authenticated
  admin (even chat-style) on our own Cloudflare stack. ChatGPT stays the
  preferred front-end when available; it is never a single point of failure. This
  guarantees Julie can always edit her own site.

---

## 7. Authentication (future phase)

- Not built now. The members area (Diva Hub / client content) is reachable by
  footer link and marked `noindex` in the interim.
- When it lands: **Cloudflare Access** for simple gating, or a lightweight
  consumer auth for self-serve member accounts. Kajabi remains the client login
  in the meantime, and the site can link straight to it.
- Anything genuinely private waits for this phase.

---

## 8. SEO, URLs and migration

- **Permalinks** are first-class for every page, post and event.
- **301 redirect map** from the current Kajabi URLs (including mixed-case blog
  slugs and `/podcasts/.../episodes/<id>`) to preserve ranking. See the page
  inventory in [`HANDOFF.md`](./HANDOFF.md).
- Diva Hub and any hidden landing pages are `noindex`.
- Standard metadata, social share images, alt text and structured data.

---

## 9. Data, compliance and cost

- **UK / GDPR:** Julie is UK-based. Use Cloudflare's EU data localisation where
  applicable; document what personal data the forms collect and where it goes.
- **Versioning / audit:** all content changes are versioned in D1 (supports undo
  and a change history).
- **Cost:** dominated by video (Stream) and, secondarily, storage. To be
  estimated once course video volume is known (see open questions).

---

## 10. Open questions / decisions pending

- **Flagship photograph** for "From First Note to Final Curtain" — the last
  prominent placeholder on the homepage.
- **Course video volume** — drives the Stream/R2 cost estimate.
- **Plus connector capability** — the empirical check in section 6.
- **Photography shot list** for the upcoming shoot (wide shots with negative
  space on a known side, per-slot crops).
- **Mobile homepage** — designed deliberately, not just reflowed (per the
  creative brief).
- **Domain / subdomain plan** — new site on `juliebale.com`, Kajabi moved to a
  branded subdomain (e.g. `members.` or `courses.`).
- **Whether to reuse any Rich Connexions platform components** vs building
  bespoke on Cloudflare.

---

## 11. Related documents

- [`SPRINTS.md`](./SPRINTS.md) — the delivery plan, sprint by sprint.
- [`HANDOFF.md`](./HANDOFF.md) — original Kajabi page inventory and migration notes.
- `prototype/` — the current homepage design prototype (staging:
  https://rich-connexions-ltd.github.io/JulieBale/prototype/ ).
