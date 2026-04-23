# Handoff — juliebale.com Kajabi → Azure migration analysis

**Status:** Discovery partial. Pick up from Step 2 below.

## Why this handoff exists

The sandbox this analysis started in blocks outbound HTTP to `www.juliebale.com`
(proxy returns `HTTP 403 x-deny-reason: host_not_allowed`). WebFetch, curl,
Wayback Machine, Google cache, and jina.ai reader were all blocked. Only
`WebSearch` snippets were usable, so only publicly-indexed pages could be
enumerated and the site's HTML/headers/assets were never observed directly.

A desktop Claude Code session with normal outbound access should complete the
crawl and produce the full analysis.

## Task (original user request)

> Do a deep analysis of all publicly available pages on www.juliebale.com. The
> site is currently hosted on Kajabi and we are considering moving it to Azure.

Deliverable: a migration analysis document (recommend `ANALYSIS.md` in this
repo) covering page inventory, Kajabi feature surface in use, Azure target
architecture options, feature-parity gaps, migration plan, risks, and
rough cost expectations.

---

## Step 1 — What has already been established (don't redo)

### Public pages discovered via search indexing

Core:
- `https://www.juliebale.com/` — "Julie Bale Voice Specialist | Diva Energy®"
- `https://www.juliebale.com/about` — "About - Julie Bale Singer & Hypnotherapist"
- `https://www.juliebale.com/blog` — blog index

Blog posts (Kajabi `/blog/<slug>` pattern, mixed-case slugs observed):
- `/blog/canyouhypnotiseyourself`
- `/blog/transform-your-singing-with-hypnosis-what-is-hypnosis`
- `/blog/what-to-do-if-you-re-feeling-blue`
- `/blog/Howtonailauditionswithhypnosis`
- `/blog/can-you-reset-your-weight-with-hypnotic-semaglutide-is-this-the-end-of-yo-yo-dieting`
- `/blog/singers-what-s-stopping-you-how-to-banish-the-many-stresses-and-anxieties-of-a-singer-s-life`
- `/blog/firstnote` — "The Transformative Power of a Six-Month Vocal Course"
- `/blog/hypnoticweightlossjab` — "Can You Replicate Ozempic & Wegovy using Hypnosis?"
- `/blog/learntolovethebodyyourein` — "Love The Body You're In"

Podcast (Kajabi `/podcasts/<slug>/episodes/<numeric-id>` pattern — a strong
Kajabi signature):
- `/podcasts/change-your-mind-change-your-life-mindset-for-singers` — hub
- `/podcasts/change-your-mind-change-your-life-mindset-for-singers/episodes/2147850457` — "How to Use Self-Hypnosis for Imposter Syndrome"

Adjacent Julie Bale properties (separate domains — confirm scope with user):
- `https://www.juliebale.co.uk/` — "Singing Lessons" (separate site)
- `https://juliebalehypnotherapy.com/` — separate hypnotherapy site
- `https://linktr.ee/juliebale` — link-in-bio
- Socials: LinkedIn `/in/juliebale`, Instagram `juliebalevoiceandmindtraining`,
  Facebook `juliebale.music.hypnotherapy`, YouTube channel `UCvnhn8rk90Irg_KKg2qpnZg`,
  Apple Podcasts show `id1663244014`

### Positioning / business context

Julie Bale: voice specialist, clinical hypnotherapist, professional soprano,
keynote speaker, author. Brand: "Diva Energy®". Signature six-month programme:
"From First Note to Final Curtain", culminating in a "Chronicles of Hope" gala
concert. Offerings referenced in search snippets: 1:1 coaching, group workshops,
Diva Day, Diva Taster Experience, Gala Concert, hypnotherapy for performance
anxiety / imposter syndrome / weight reduction.

### Confirmed Kajabi signatures

- `/blog/<slug>` routing with mixed-case slugs.
- `/podcasts/<slug>/episodes/<numeric-id>` — Kajabi's native podcast feature.
- `www.` subdomain fronting a Kajabi tenant (typical Kajabi custom-domain setup
  with `www` CNAME'd to `ready.kajabi-app.com` or similar — **verify via DNS**).

### What has NOT been seen (noindex or behind forms — need direct crawl)

Kajabi commonly has these routes that will not appear in a search engine:
- `/offers/<id-or-slug>` — sales/checkout landing pages
- `/offers/<id>/checkouts/<token>` — Kajabi checkout
- `/products/<slug>` — course/product landing
- `/library` — logged-in member dashboard
- `/app` — member app shell
- `/pl/<slug>` — public landing / pipeline pages (funnels)
- `/a/...` — protected member content
- `/forms/<id>` — opt-in/lead-magnet forms
- Thank-you / confirmation pages, download delivery pages

---

## Step 2 — Crawl checklist to execute on desktop

Run these against `https://www.juliebale.com` with normal outbound. Use a
plain `curl -A "Mozilla/5.0 ..."` if any endpoint 403s a default UA.

### 2.1 Technical footprint

```bash
# Headers — look for Server, X-Kajabi-*, CDN (CloudFront/Cloudflare), CSP, HSTS
curl -sSI https://www.juliebale.com/ | tee headers-home.txt

# DNS / hosting confirmation
dig +short www.juliebale.com CNAME
dig +short www.juliebale.com A
dig +short juliebale.com A
whois juliebale.com | head -40

# TLS certificate (issuer / SAN list reveals Kajabi tenant)
openssl s_client -connect www.juliebale.com:443 -servername www.juliebale.com </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -text | head -40

# Robots & sitemap — essential for a complete page list
curl -sS https://www.juliebale.com/robots.txt
curl -sS https://www.juliebale.com/sitemap.xml
curl -sS https://www.juliebale.com/sitemap_pages.xml
curl -sS https://www.juliebale.com/sitemap_posts.xml
curl -sS https://www.juliebale.com/sitemap_podcasts.xml
```

### 2.2 Page-by-page crawl

1. Save the sitemap(s) and extract every `<loc>` URL.
2. Fetch each URL and extract: `<title>`, `meta[name=description]`, `<h1>`,
   all `<a href>`, all `<form action>`, all `<script src>`, all `<img/video src>`,
   any `iframe[src]`, any `link[rel=canonical]`.
3. From the set of discovered links, find any non-indexed routes (e.g. `/offers/*`,
   `/pl/*`, `/forms/*`, `/pages/*`, `/products/*`). These carry the
   revenue-critical parts of the site.

### 2.3 Kajabi feature inventory (fill in)

Classify usage (Yes / No / Unknown) with evidence:

- [ ] **Marketing pages** (home, about, landing/pipeline pages)
- [ ] **Blog** — post count, tags/categories, RSS at `/blog/rss`
- [ ] **Podcast hosting** — confirm `/podcasts/.../feed.xml` or similar; number
      of episodes; whether audio is served from `kajabi-storefronts-production...`
      or a CDN
- [ ] **Courses / products** — count, lesson counts, video host (Wistia, Mux,
      Kajabi native)
- [ ] **Memberships / community** — Kajabi Communities feature in use?
- [ ] **Coaching scheduler** — Kajabi Coaching feature in use?
- [ ] **Checkout / payments** — offers, Stripe/PayPal, single vs recurring,
      currencies (GBP expected), tax handling
- [ ] **Email marketing / automations / broadcasts** — evidence from footer
      unsubscribe links, pipeline automations
- [ ] **Forms / opt-ins / lead magnets** — how many, where they post
- [ ] **Affiliates** — Kajabi affiliate links?
- [ ] **Analytics / pixels** — GA4, Meta Pixel, TikTok Pixel, Hotjar, Kajabi
      internal analytics

### 2.4 Third-party integrations to note

From page source and network calls: payment processors, email (ConvertKit /
ActiveCampaign / Kajabi native), video (Wistia, YouTube, Vimeo, Mux),
scheduler (Calendly, Acuity), fonts (Google/Adobe), chat, CMP/cookie banner.

---

## Step 3 — Azure migration analysis framework

Write the final report as `ANALYSIS.md` on this branch. Suggested structure:

### 3.1 Executive summary
One-page TL;DR: recommended Azure target, estimated monthly run cost, effort
estimate, biggest risks, hardest-to-replace Kajabi features.

### 3.2 Current-state inventory
Output of Step 2 in tabular form.

### 3.3 Azure target architecture — three options

Evaluate at least these three, with pros/cons and indicative cost (GBP/month):

**Option A — Lift-and-shift static marketing site**
- **When it fits:** site is mostly marketing pages + blog + podcast, with
  courses/checkout moved to a specialised platform (Teachable / Thinkific /
  Podia) or kept on Kajabi as a subdomain.
- **Stack:** Azure Static Web Apps (or Storage static website + Azure Front
  Door) fronting a static site generator (Astro / Hugo / 11ty). Blog content
  migrated to Markdown. Podcast RSS re-hosted (Transistor / Buzzsprout / Azure
  Blob + RSS generator). Forms → Azure Functions + SendGrid (or Formspree).
- **Rough cost:** £5–£25 / month.

**Option B — Headless CMS on Azure**
- **When it fits:** client wants to keep editing in a WYSIWYG UI without Kajabi.
- **Stack:** Azure Static Web Apps + a headless CMS (Sanity, Contentful,
  Strapi-on-Azure-Container-Apps, or Azure-hosted Payload/Directus) + Azure
  Front Door + Azure Blob for media + SendGrid/Communication Services for mail.
- **Rough cost:** £25–£120 / month depending on CMS tier.

**Option C — Full Kajabi replacement on Azure**
- **When it fits:** client wants to replicate courses, memberships, checkout,
  email automations and community.
- **Stack:** Azure App Service (or Container Apps) running WordPress + LMS
  plugin (LifterLMS / LearnDash) + WooCommerce + MemberPress, OR a
  custom Next.js app on Container Apps with Stripe + Auth0/Entra External ID
  + Azure SQL/Postgres + Azure Blob + Azure Front Door + SendGrid.
- **Rough cost:** £150–£600+ / month, significant build effort (8–16+ weeks).
- **Warning:** this is a platform-replacement project, not a hosting migration.

### 3.4 Feature-parity gap analysis
For every Kajabi feature confirmed in Step 2.3, state the Azure/third-party
equivalent and any loss of function.

### 3.5 Migration plan (phased)
Suggested phases: discovery lock-in → content export (blog, podcast, pages,
media) → new site build in staging → SEO preservation (URL map + 301
redirects — see §3.6) → DNS cutover → post-cutover monitoring.

### 3.6 SEO / URL preservation
Produce a 301 redirect map from every Kajabi URL (especially the mixed-case
`/blog/Howtonailauditionswithhypnosis` and `/podcasts/.../episodes/<id>`) to
the new URLs. This protects ranking on the indexed pages listed in Step 1.

### 3.7 Risks and open questions
- Does the client monetise via Kajabi checkout today? If yes, Option A is not
  a full replacement — flag this early.
- Diva Energy® trademark assets — any brand guidelines to follow?
- Email list — where does it live, and what's the export path?
- GDPR/UK-GDPR: the client is UK-based; Azure region should be UK South, and
  the cookie banner/privacy policy must be verified.
- Video/course content volume drives cost; measure before quoting.

### 3.8 Recommendation
Make a concrete pick among A/B/C with justification tied to the Step 2
evidence.

---

## Step 4 — Commit the final report

When the analysis is complete, commit `ANALYSIS.md` (and any supporting data
files like `crawl-index.csv`, `redirect-map.csv`) to this branch
(`claude/analyze-juliebale-azure-migration-DU9YA`) and push. Do not open a PR
unless the user asks.

---

## Notes for the next session

- The user is Rich Connexions Ltd; the repo is `rich-connexions-ltd/juliebale`.
- Repo was empty at handoff time — this file is the first commit.
- If the desktop also turns out to have egress restrictions, fall back to
  asking the user to paste the rendered HTML of a few key pages (home,
  about, one blog post, one podcast episode page, and any sales page they
  know about) so you can at least inspect the Kajabi markup directly.
