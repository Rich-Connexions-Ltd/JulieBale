# juliebale.com — Kajabi → Azure Migration Analysis

**Prepared:** 2026-04-23  
**Branch:** `claude/analyze-juliebale-azure-migration-DU9YA`  
**Scope:** www.juliebale.com only (not juliebale.co.uk or juliebalehypnotherapy.com)

---

## 3.1 Executive Summary

juliebale.com is a **fully integrated Kajabi tenant** — not just a hosted website. The site combines marketing pages, a blog, a podcast, email capture funnels, Kajabi-native checkout with active recurring-revenue offers (£197–£4,995), a member login area, and (likely) the Diva Circle® membership community. Wistia handles all video and audio.

**Moving to Azure** means choosing how much of that stack to replace:

| Option | What moves | Effort | Monthly cost (GBP) | Recommended? |
|--------|-----------|--------|-------------------|--------------|
| A — Static marketing site only | Homepage, about, blog, landing pages | 6–10 weeks | £10–£40 | **Yes, if courses stay elsewhere** |
| B — Headless CMS on Azure | All of the above + editorial CMS | 8–14 weeks | £30–£150 | **Yes, if client wants editorial control** |
| C — Full Kajabi replacement | Everything including checkout, email, community | 16–24 weeks | £200–£600+ | Not recommended |

**Recommendation:** Option B — headless CMS (Sanity + Astro/Next.js → Azure Static Web Apps) for the marketing side, with specialist third-party platforms replacing Kajabi's course/checkout/email stack. This removes Kajabi's ~£119–£199/month fee while keeping operational complexity manageable.

**Biggest risks before go-live:**
1. Kajabi Offers/checkout is active (£2,995–£4,995 transactions) — payment replacement must be in place first.
2. Kajabi email automations power all opt-in funnels — these must be rebuilt before DNS cutover.
3. Podcast RSS at `app.kajabi.com` — subscribers will break if not migrated to a new host with feed forwarding.
4. Wistia embeds on at least three pages — require a paid Wistia account or video re-hosting.

---

## 3.2 Current-State Inventory

### Technical Footprint

| Property | Value |
|----------|-------|
| Platform | Kajabi (site ID 2147603041) |
| DNS | `www.juliebale.com` CNAME → `ssl.kajabi.com` → `endpoint.mykajabi.com` |
| CDN | Cloudflare (origin: AWS ALB — Kajabi's own infrastructure) |
| TLS | Google Trust Services cert, CN=www.juliebale.com, valid Feb–May 2026 |
| Server cookie | `_kjb_session` (Kajabi session, Ruby on Rails) |
| Image CDN | `kajabi-storefronts-production.kajabi-cdn.com` |
| Themes in use | 7+ distinct Kajabi theme IDs (each pipeline landing page has its own theme) |

### Page Inventory (from sitemap.xml)

**Core marketing pages (7)**

| URL | Title / Purpose |
|-----|----------------|
| `/` | Julie Bale Voice Specialist \| Diva Energy® — home |
| `/homepage` | Duplicate/A-B home (last modified 2026-04-23) |
| `/about` | About page |
| `/contact` | Contact page |
| `/workwithme` | "Ways to Work with Me" — product hub |
| `/store` | "Store — Featured Courses" |
| `/blog` | Blog index (+ `?tag=hypnosis`, `?tag=singer`) |

**Campaign landing / pipeline pages (10)**

| URL | Purpose |
|-----|---------|
| `/discoversinging` | Top-of-funnel discovery page (modified 2026-04-23) |
| `/divaenergylive` | Live events hub |
| `/bravoforspeakers` | BRAVO for Speakers programme |
| `/divacircle` | Diva Circle® membership |
| `/divataster` | Diva Taster Experience |
| `/selfhypnosis` | Self-hypnosis lead magnet |
| `/weightmanagement` | Weight management hypnotherapy page |
| `/opt-in` | Lead magnet: "5 Ways To Create Awesome Performances With Hypnotherapy" |
| `/newsletter` | Newsletter sign-up |
| `/divaenergymail` | Email list opt-in variant |
| `/resettaster` | Weight reset taster |
| `/MindTrainingforSingers` | Mind training landing page (mixed-case) |
| `/bravo` | BRAVO landing page variant |
| `/book` | "The Real Me Isn't Fat" book page (Amazon links) |

**Thank-you / confirmation pages (7)**

| URL |
|-----|
| `/thank-you` |
| `/thank-you-59645c1c-207c-40d5-acb3-415118dcdbd5` |
| `/thank-you-dc4ca130-8f99-476d-b791-1ce5e5550acb` |
| `/thank-you-3e155630-7ef8-4011-8280-1af7590fe655` |
| `/thank-you-f2af2b7f-1536-4319-98e9-e912268d19d5` |
| `/thankyoumindshift` |
| `/thank-you-self-hypnosis` |

**Blog posts (~22)**

| URL | Date |
|-----|------|
| `/blog/divaframework` | Apr 2026 |
| `/blog/divaenergypromo` | Nov 2025 |
| `/blog/nobodybetter` | Oct 2025 |
| `/blog/september` | Aug 2025 |
| `/blog/charities` | Jun 2025 |
| `/blog/iwishicouldsing` | Jun 2025 |
| `/blog/womeninbusiness` | Mar 2025 |
| `/blog/firstnote` | Mar 2025 |
| `/blog/gymforthemind` | Jan 2025 |
| `/blog/selflove` | Dec 2024 |
| `/blog/canyouhypnotiseyourself` | Dec 2024 |
| `/blog/ozempicvshypnosis` | Dec 2024 |
| `/blog/stepintoyourpower` | Oct 2024 |
| `/blog/hypnoticweightlossjab` | Oct 2024 |
| `/blog/learntolovethebodyyourein` | Feb 2024 |
| `/blog/itsnotyouitsthediet` | Jan 2024 |
| `/blog/usinghypnotherapytorelievemigraines` | Oct 2023 |
| `/blog/10weekstochristmasnofoodstress` | Oct 2023 |
| `/blog/howtogiveupdietingtoloseweight` | Jan 2024 |
| `/blog/bestwaystoloseweightwithhypnosis` | Jul 2023 |
| `/blog/can-you-reset-your-weight-with-hypnotic-semaglutide-is-this-the-end-of-yo-yo-dieting` | May 2023 |
| `/blog/hy` | Apr 2023 (stub) |
| `/blog/what-to-do-if-you-re-feeling-blue` | Jan 2023 |
| `/blog/singers-what-s-stopping-you-how-to-banish-the-many-stresses-and-anxieties-of-a-singer-s-life` | Jan 2023 |
| `/blog/Howtonailauditionswithhypnosis` | Nov 2022 (mixed-case) |
| `/blog/transform-your-singing-with-hypnosis-what-is-hypnosis` | Nov 2022 |

**Podcast (1 show, 3 indexed episodes)**

| URL | Title |
|-----|-------|
| `/podcasts/change-your-mind-change-your-life-mindset-for-singers` | Show hub |
| `/podcasts/.../episodes/2147844748` | Episode 1 |
| `/podcasts/.../episodes/2147847399` | Episode 2 |
| `/podcasts/.../episodes/2147850457` | "How to Use Self-Hypnosis for Imposter Syndrome" |

RSS feed lives at `https://app.kajabi.com/podcasts/2147509010/feed` (not on the custom domain).

**System / legal pages**

`/login`, `/privacy-policy`, `/terms-and-conditions`

---

### 3.3 Kajabi Feature Inventory

| Feature | Status | Evidence |
|---------|--------|---------|
| Marketing pages | **Yes** | 7 core + 14 campaign/pipeline pages |
| Blog | **Yes** | ~22 posts, 2 tags (hypnosis, singer), 2022–2026 |
| Podcast | **Yes** | 3 episodes; RSS at `app.kajabi.com`; audio stored on Kajabi CDN |
| Courses / products | **Yes** | At least 3 products linked via `/resource_redirect/landing_pages/<id>` |
| Kajabi Offers (checkout) | **Yes** | `/resource_redirect/offers/roTFfCL5` and `auFzWGsQ` — Kajabi-native checkout with GBP pricing |
| Pricing in use | **Yes** | Diva Circle® £2,995 (6M) or £499/mo · Total DIVA £4,995 (12M) or £416.25/mo · BRAVO Day £197 · VIP 1:1 Day £997 |
| Recurring payments | **Yes** | Monthly payment plans confirmed on Diva Circle® |
| Member login / library | **Yes** | `/login` page present; Kajabi Products CSS loaded |
| Membership / community | **Likely** | Diva Circle® sold via Kajabi Offers; CSP allows `communities.kajabi.com` |
| Email marketing / automations | **Yes** | Multiple opt-in funnels with thank-you pages; forms post to Kajabi; Kajabi pipeline signatures throughout |
| Lead magnets / forms | **Yes** | ≥4 confirmed forms posting to `https://www.juliebale.com/forms/<id>/form_submissions` |
| Email list | **Unknown** | Almost certainly Kajabi native (no ConvertKit/ActiveCampaign found) |
| Video hosting | **Yes (Wistia)** | `fast.wistia.com` confirmed on BRAVO for Speakers, Self-Hypnosis, Opt-in pages |
| Coaching scheduler | **Unknown** | No Calendly or Acuity found; may use Kajabi Coaching or manual booking |
| Affiliates | **No evidence** | |
| GA4 | **Yes** | G-T7NFPMTGT1 |
| Google Ads | **Yes** | AW-11248288364 |
| Meta Pixel | **Yes** | IDs: 1064912124894806 and 335307382152681 |
| Facebook domain verification | **Yes** | `dldh8izw4pusv30oa4zj7cfshjsf09` |
| Hotjar | **No** | Not detected |
| Cookie consent banner | **Not detected** | Potential UK GDPR gap — needs investigation |

---

## 3.3 Azure Target Architecture — Three Options

### Option A — Static Marketing Site (Marketing Only)

**When it fits:** Client keeps courses, checkout, and email automation on a specialist platform (e.g. Podia, Teachable, or a stripped-down Kajabi Growth plan). Azure hosts the marketing pages and blog only.

**Stack:**
- **Hosting:** Azure Static Web Apps (free tier for static, £0–£8/month for Standard)
- **Framework:** Astro or Hugo (builds to static HTML at deploy time)
- **CMS:** Decap CMS or TinaCMS on top of a Git repo — editor-friendly WYSIWYG, no server needed
- **Blog:** Markdown files in git, built at deploy time; tags preserved as static pages
- **Podcast:** Transistor (£15–£49/month) or Buzzsprout (£12–£25/month) — provides RSS feed, feed forwarding from old Kajabi URL, Apple/Spotify distribution
- **Email / forms:** ConvertKit (£29–£79/month) or MailerLite (free–£18/month)
- **Video:** Keep existing Wistia account or move embeds to YouTube
- **Courses / checkout / membership:** Podia (£33/month), Teachable, or retain Kajabi on a lower plan
- **DNS cutover:** CNAME `www` → Azure Static Web Apps custom domain endpoint; Azure Front Door optional for global PoPs

**Rough cost:**
| Component | GBP/month |
|-----------|-----------|
| Azure Static Web Apps Standard | £8 |
| Transistor podcast | £15 |
| ConvertKit Creator | £29 |
| Wistia (existing, keep) | varies |
| Courses platform (e.g. Podia) | £33 |
| **Total** | **~£85–£120** |

**Pros:** Low hosting cost, fast CDN delivery, simple ops, Kajabi risk eliminated for marketing.  
**Cons:** Courses/checkout still need a home; email list migration from Kajabi needed; does not eliminate course platform fees.

---

### Option B — Headless CMS on Azure *(Recommended)*

**When it fits:** Client wants full editorial control of all marketing content — including the ability to add pages, update landing pages, and write blog posts — without touching code.

**Stack:**
- **Hosting:** Azure Static Web Apps (Standard, £8/month) or Azure Front Door + Azure Storage static website
- **Framework:** Next.js (App Router, static export) or Astro with SSR via Azure Functions
- **CMS:** Sanity (free tier for small teams; £99/month for Growth if team grows) — provides live preview, rich text editor, structured content for landing pages and blog
- **Media:** Images and downloads migrated to Azure Blob Storage (£0.02/GB/month), served via Azure CDN or Front Door
- **Blog:** Managed in Sanity; URL slugs replicate Kajabi slugs exactly (see §3.6)
- **Podcast:** Transistor or Buzzsprout (£15–£49/month) — same as Option A
- **Email / automations:** ConvertKit (£29–£79/month) — replaces Kajabi native email; tags and automations recreated; API integration for form submissions
- **Lead magnet forms:** Azure Functions (serverless, ~£0/month for low volume) POST to ConvertKit API
- **Video:** Wistia account migrated/kept; or move to Mux (pay-per-minute) or YouTube unlisted
- **Checkout / courses:** Stripe for direct checkout (custom payment links) + Podia or Teachable for course hosting and membership (Diva Circle® equivalent)
- **Analytics:** GA4 and Meta Pixel replanted into Next.js app; no platform change needed

**Rough cost:**
| Component | GBP/month |
|-----------|-----------|
| Azure Static Web Apps Standard | £8 |
| Azure Blob + CDN (media storage) | £5–£15 |
| Sanity (free tier initially) | £0–£99 |
| Transistor podcast | £15–£49 |
| ConvertKit Creator | £29–£79 |
| Wistia (existing or renegotiated) | ~£19–£79 |
| Podia (courses + membership) | £33–£66 |
| **Total** | **~£110–£395** |

**Pros:** Full client control; no Kajabi lock-in; content lives in structured CMS; Azure hosting is cost-transparent.  
**Cons:** Higher setup effort (8–14 weeks); multiple platform relationships to manage; Kajabi's all-in-one simplicity is lost.

---

### Option C — Full Kajabi Replacement on Azure

**When it fits:** Client wants everything — checkout, email, courses, community, and marketing — on Azure infrastructure with no third-party SaaS dependencies. This is a platform build, not a site migration.

**Stack:**
- **Hosting:** Azure Container Apps (Next.js + API) or Azure App Service
- **Database:** Azure Database for PostgreSQL Flexible Server
- **Storage:** Azure Blob Storage + Azure CDN
- **Auth / member login:** Azure AD B2C or Auth0
- **Checkout:** Stripe (payment gateway) + custom subscription management
- **Email / automations:** Azure Communication Services (transactional) + Mailchimp or Customer.io (marketing automation)
- **Course delivery:** Custom-built LMS or open-source (Moodle on Azure App Service)
- **Community:** Circle.so or Mighty Networks (SaaS) — building a community platform from scratch is out of scope
- **Video:** Mux or Azure Media Services

**Rough cost:**
| Component | GBP/month |
|-----------|-----------|
| Azure Container Apps / App Service | £40–£120 |
| Azure PostgreSQL | £40–£80 |
| Azure Blob + CDN | £5–£20 |
| Azure AD B2C | £0 (50k MAU free) |
| Stripe processing | 1.5%+20p per transaction (variable) |
| Azure Communication Services | £2–£15 |
| Community platform (Circle.so) | £49–£99 |
| **Total** | **~£140–£335 infra + Stripe fees** |

**Build effort:** 16–24+ weeks. Requires experienced full-stack engineers.  
**Warning:** Option C is only justified if the client has technical staff or a dedicated development budget. The operational overhead (security patches, database backups, SSL renewal, platform upgrades) falls entirely on the client. For a solopreneur, this is rarely the right choice.

---

## 3.4 Feature-Parity Gap Analysis

| Kajabi Feature | Azure / Third-Party Equivalent | Gap / Loss |
|----------------|-------------------------------|-----------|
| Marketing pages (WYSIWYG) | Sanity CMS + Astro/Next.js | Minor learning curve; more flexible long-term |
| Blog with tags | Sanity + static generation | Full parity; URL slugs preserved |
| Podcast hosting | Transistor or Buzzsprout | Full parity; better analytics than Kajabi |
| Kajabi native email + automations | ConvertKit or MailerLite | Rebuild automations; export subscriber list from Kajabi (CSV + tags) |
| Kajabi Offers / checkout | Stripe Payment Links or Podia | Recurring payment plans supported; webhook for thank-you automation needed |
| Member login / course library | Podia or Teachable | Full parity for courses; community feature varies |
| Diva Circle® membership | Podia Memberships or Circle.so | Circle.so has richer community features than Kajabi Communities |
| Kajabi pipeline pages (per-page themes) | Sanity + custom Next.js components | Full flexibility; no per-page theme constraint |
| Kajabi Coaching scheduler | Calendly or TidyCal | Full parity or better |
| Forms / opt-ins | ConvertKit embedded forms | Full parity |
| Analytics (RudderStack/Kajabi internal) | GA4 already in use | No gap — GA4 continues |
| Meta Pixel | No change | Pixel IDs replanted into new site |
| Wistia video | Wistia (keep existing account) | No gap if account retained |
| `/login` member portal | Podia or Teachable student dashboard | Different URL and UX; communicate to members |
| Podcast RSS at `app.kajabi.com` | New RSS at Transistor/Buzzsprout custom domain | **Critical:** requires feed forwarding before decommission; Apple Podcasts accepts forwarding |

---

## 3.5 Migration Plan (Phased)

### Phase 0 — Discovery Lock-In (1–2 weeks)
- Confirm scope with client: which Kajabi features must move vs. can stay on a cheaper plan.
- Inventory full email subscriber list (tags, sequences, automation triggers) from Kajabi admin.
- List all Wistia video IDs in use; confirm Wistia account ownership and plan.
- Confirm Kajabi Offers pricing, payment plan schedules, and active subscriber count for Diva Circle®.
- Export all blog post content (Kajabi provides a Markdown export or HTML dump).
- Export podcast audio files from Kajabi CDN (download originals before migration).
- Identify the email notification template for each thank-you/confirmation page.

### Phase 1 — Parallel Build (6–10 weeks)
- Provision Azure Static Web Apps + Sanity workspace.
- Migrate blog posts to Sanity (22 posts; preserve slugs exactly).
- Build marketing pages in Astro/Next.js; replicate layout from Kajabi theme.
- Wire ConvertKit for all opt-in forms; set up equivalent automations and sequences.
- Set up Transistor/Buzzsprout; upload podcast audio; confirm feed URL and forwarding from old RSS.
- Set up Stripe/Podia for checkout and membership; test GBP payment flows including monthly plans.
- Replant GA4, Google Ads, and Meta Pixel tags in new site.
- Add cookie consent banner (UK GDPR requirement — currently absent on Kajabi site).

### Phase 2 — Staging QA (1–2 weeks)
- Point a staging subdomain at new site.
- Check every URL in the sitemap renders correctly with correct title, meta description, canonical.
- Verify all forms submit to ConvertKit; check automations fire.
- Verify podcast feed validates at Transistor; submit to Apple Podcasts for forwarding.
- Verify checkout flow end-to-end (test mode Stripe).
- Run Lighthouse / Core Web Vitals on key pages; compare to current scores.
- Test login flow on Podia/Teachable with a test member account.

### Phase 3 — SEO Lock-In (1 week before cutover)
- Build 301 redirect map (see §3.6); implement in Azure Static Web Apps `staticwebapp.config.json`.
- Submit updated sitemap to Google Search Console.
- Lower Kajabi site TTL to 60 seconds to speed DNS propagation.

### Phase 4 — DNS Cutover
- Update `www.juliebale.com` CNAME to Azure Static Web Apps custom domain endpoint (or Azure Front Door).
- Monitor for 4xx/5xx via Azure Monitor or Cloudflare Analytics for 48 hours.
- Keep Kajabi site live in read-only for 30 days as a fallback.
- Verify Kajabi Offers checkout URLs redirect correctly (active checkout links in emails to existing customers).

### Phase 5 — Post-Cutover (30 days)
- Monitor GA4 for organic traffic regression.
- Confirm Apple Podcasts, Spotify, and other directories are receiving episodes from new RSS.
- Communicate login URL change to existing Diva Circle® members.
- Cancel Kajabi subscription only after all active member subscriptions are confirmed migrated.

---

## 3.6 SEO / URL Preservation

The following URL patterns require exact-match 301 redirects on the new platform.

### Mixed-case blog slugs (must be case-exact)

| Old Kajabi URL | New URL | Note |
|----------------|---------|------|
| `/blog/Howtonailauditionswithhypnosis` | `/blog/howtonailauditionswithhypnosis` | Kajabi serves case-insensitively; new server may not — add 301 |
| `/blog/MindTrainingforSingers` | `/MindTrainingforSingers` or lowercase equivalent | Landing page with mixed-case slug |

### Podcast episode URLs

| Old URL | Action |
|---------|--------|
| `/podcasts/change-your-mind-change-your-life-mindset-for-singers` | 301 → new podcast hub URL |
| `/podcasts/change-your-mind-change-your-life-mindset-for-singers/episodes/2147844748` | 301 → episode page on new podcast platform or Transistor |
| `/podcasts/change-your-mind-change-your-life-mindset-for-singers/episodes/2147847399` | 301 → episode page |
| `/podcasts/change-your-mind-change-your-life-mindset-for-singers/episodes/2147850457` | 301 → "How to Use Self-Hypnosis for Imposter Syndrome" episode |

### Kajabi system URLs that must redirect or be suppressed

| Old URL | Action |
|---------|--------|
| `/login` | 301 → new member portal (Podia/Teachable) |
| `/store` | 301 → `/workwithme` or equivalent |
| `/forms/<id>/form_submissions` | POST endpoint — handled by ConvertKit; no public URL redirect needed |
| `/resource_redirect/offers/<slug>` | 301 → new Stripe/Podia checkout URL |
| `/resource_redirect/landing_pages/<id>` | 301 → equivalent new landing page |

### Thank-you pages with UUID slugs

UUID-suffixed thank-you pages (e.g. `/thank-you-59645c1c-207c-40d5-acb3-415118dcdbd5`) are sent in Kajabi automation emails. If these links exist in email sequences, they must either be preserved as pages on the new site or the email sequences updated before decommissioning Kajabi.

---

## 3.7 Risks and Open Questions

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Active Kajabi Offers/checkout in use (£2,995–£4,995 transactions) | **Critical** | Stripe/Podia must be live and tested before any DNS cutover; communicate checkout URL change to active leads |
| Monthly payment subscribers on Diva Circle® | **Critical** | Kajabi handles recurring billing; must migrate active subscriptions to Stripe manually or use Podia's import; confirm with client how many active members |
| Kajabi email automations and pipelines (opt-in → sequence → thank-you) | **High** | Full audit of all Kajabi pipelines in admin; rebuild each sequence in ConvertKit before cutover |
| Podcast RSS at `app.kajabi.com` | **High** | Transistor/Buzzsprout both support RSS feed forwarding; submit forwarding before decommission; Apple Podcasts propagation takes 1–2 weeks |
| UUID thank-you page links in live email sequences | **High** | Audit all Kajabi email sequences; either replicate pages or update links before cancelling Kajabi |
| Wistia video embeds on ≥3 pages | **Medium** | Confirm Wistia account ownership; if moving platforms, re-embed using same Wistia account |
| UK GDPR / cookie banner absent | **Medium** | Add a compliant cookie consent solution (e.g. Cookiebot, CookieYes) on the new site; review Privacy Policy for UK GDPR accuracy |
| Mixed-case blog slug `/blog/Howtonailauditionswithhypnosis` | **Medium** | Static hosts are case-sensitive (unlike Kajabi/Rails); add exact 301 redirect |
| Multiple Kajabi theme IDs (7+ themes for different pages) | **Low–Medium** | Each campaign landing page has its own custom Kajabi theme; replicate styling in Astro/Next.js components; budget design time |
| SEO ranking of indexed blog posts | **Low** | 22 blog posts are indexed; 301 redirects from all old slugs preserve link equity |
| Three adjacent domains (juliebale.co.uk, juliebalehypnotherapy.com) | **Out of scope** | Confirm with client whether these are in scope |
| Azure region | **Low** | Use **UK South** (London) for data residency; relevant for email data, subscriber PII |

---

## 3.8 Recommendation

**Proceed with Option B — Headless CMS on Azure.**

**Why Option B over A:**  
The client actively edits landing pages and blog posts (22 posts, newest dated 2026-04-23; `/discoversinging` and `/homepage` both modified today). A static site without a CMS would require developer involvement for every content change — not appropriate for a solopreneur. Sanity provides the WYSIWYG editor her team already expects, while Azure Static Web Apps delivers the marketing pages at CDN speed.

**Why Option B over C:**  
Kajabi's course/checkout/community features are in active commercial use (£2,995–£4,995 products, recurring monthly plans). Rebuilding a full LMS, membership, and billing system on Azure from scratch would cost far more than it saves. Third-party specialists (Podia, ConvertKit, Transistor) exist precisely because this is a solved problem at lower cost and complexity.

**Suggested third-party stack alongside Azure:**

| Need | Recommended tool | Why |
|------|-----------------|-----|
| Courses + member login | Podia | One flat fee; handles courses, digital downloads, memberships, basic community |
| Membership community (Diva Circle®) | Circle.so (or Podia) | Richer community than Kajabi; embeds in Podia or standalone |
| Email marketing + automations | ConvertKit | Visual automation builder; strong for creator/course businesses; tag-based segmentation |
| Podcast hosting | Transistor | Feed forwarding from Kajabi; Apple/Spotify distribution; analytics |
| Video | Keep Wistia | Already in use; migration is disruptive; Wistia plays well with Sanity |
| Checkout (direct) | Stripe Payment Links | For bespoke coaching packages; no checkout platform needed |
| Cookie consent | CookieYes | UK GDPR compliant; simple script integration |

**Estimated total monthly recurring cost after migration:** £200–£350/month replacing a Kajabi Pro plan (£119–£199/month). The delta is small; the main gain is data portability, no content lock-in, and flexibility to change any component independently. Present this honestly to the client — the financial case for migration is primarily about control and flexibility, not cost reduction.

**Build estimate:** 10–14 weeks for a competent web agency or freelance team, assuming:
- Client provides Kajabi admin access for content/subscriber export
- Wistia account credentials are available
- Decisions on Podia vs. Teachable vs. Circle.so are made in Phase 0

---

## Appendix — Quick Reference

### DNS / Hosting

```
www.juliebale.com  CNAME  ssl.kajabi.com
ssl.kajabi.com     CNAME  endpoint.mykajabi.com
endpoint.mykajabi.com  A  104.18.42.139
                       A  172.64.145.117  (Cloudflare anycast)
```

### Key Kajabi IDs

| Item | ID |
|------|-----|
| Site ID | 2147603041 |
| Account ID | 2147587923 |
| Podcast ID | 2147509010 |
| Podcast RSS | `https://app.kajabi.com/podcasts/2147509010/feed` |

### Analytics Tag IDs

| Tag | ID |
|-----|----|
| GA4 | G-T7NFPMTGT1 |
| Google Ads | AW-11248288364 |
| Meta Pixel (primary) | 1064912124894806 |
| Meta Pixel (secondary) | 335307382152681 |
| Facebook domain verification | dldh8izw4pusv30oa4zj7cfshjsf09 |
