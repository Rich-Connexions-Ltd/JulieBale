# juliebale.com — Rebuild Sprints

## Context

**Goal:** Rebuild the marketing pages of www.juliebale.com as a static site on Azure, with a consistent design system and shared page structure. Commerce (checkout, courses, email automations, member login) stays on Kajabi.

**Stack:** Astro · Azure Static Web Apps · Decap CMS · GitHub Actions

**Reference:** See `ANALYSIS.md` for full site inventory, design tokens, URL patterns, and risks.

**Commerce subdomain convention:**
- `www.juliebale.com` → new Azure Static Web Apps site
- `members.juliebale.com` → Kajabi (CNAME to `ssl.kajabi.com`; all checkout/login links point here)

---

## Sprint 1: Scaffold, Design System & Shell

**Goal:** A deployed, empty-content site with the full design system and shared page shell (header, footer, base layout) from which every subsequent page can be built.

**Deliverables:**
- Astro project with TypeScript, strict linting, and Prettier configured
- GitHub repo wired to Azure Static Web Apps via GitHub Actions (deploy on push to `main`; preview deploys on PRs)
- Design token file (`src/styles/tokens.css` or Tailwind config) covering:
  - Colour palette: Gold `#c19b33`, Teal `#66bcbc`, Pink `#e65cb4`, Charcoal `#2c3e50`, Muted Teal `#608082`, White, Off-White `#ecf0f1`
  - Typography: Raleway (body, nav), Playfair Display (editorial headings), Licorice (decorative h6), Allison / Comforter (accent script), Font Awesome icons
  - Spacing scale, border radii, box shadows, button variants (solid, outline, small/medium/large)
- Shared `BaseLayout.astro` component containing: SEO `<head>` (title, description, OG, canonical, robots), Google Fonts preload, GA4 + Google Ads + Meta Pixel script slots, cookie consent hook
- `Header.astro` component: logo (two variants: primary mark + logotype), navigation links, social icons (Facebook, Instagram, LinkedIn, YouTube), mobile hamburger
- `Footer.astro` component: logo, nav links, social icons, legal links (Privacy Policy, T&C), "Powered by" attribution removed
- Navigation items: Home · About · Work With Me · Diva Energy Live Events · BRAVO for Speakers · Blog · Login (→ members.juliebale.com/login)
- Placeholder index page confirming full shell renders with correct fonts and colours
- `staticwebapp.config.json` skeleton with platform routing rules

**Exit criteria:**
- Push to `main` triggers a successful Azure deploy in < 3 minutes
- The placeholder page at the Azure preview URL shows correct header, footer, fonts, and brand colours
- Design tokens documented in a `DESIGN_SYSTEM.md` reference file

**Status:** COMPLETE

---

## Sprint 2: Core Navigation Pages

**Goal:** The five primary navigation pages are live on staging, content-accurate, and built exclusively from reusable section components.

**Deliverables:**

**Section component library** (these are built once here and reused across all future pages):
- `Hero.astro` — full-width background image/colour + headline + subheadline + CTA button(s); supports typed/rotating text animation slot
- `TextImage.astro` — two-column text + image (reversible)
- `FeatureGrid.astro` — icon or image + heading + paragraph cards (2–4 columns)
- `Testimonial.astro` — quote + attribution + optional star rating image
- `TestimonialRow.astro` — horizontal scroll / grid of Testimonial
- `PricingCard.astro` — price display, description, CTA button; accepts external href for Kajabi offer links
- `VideoEmbed.astro` — Wistia and YouTube wrapper (lazy-load, aspect-ratio preserved)
- `FormEmbed.astro` — renders a Kajabi form embed snippet passed as a prop; honeypot field preserved
- `CTABanner.astro` — full-width colour band with headline + button
- `BlogCard.astro` — thumbnail, title, date, tag badge; links to blog post

**Pages:**
- **`/homepage`** (Astro route) and **`/`** redirect → `/homepage`
- **`/about`** — biography, credentials, programme overview, testimonials
- **`/contact`** — contact form (Kajabi form embed `2148925970` or equivalent), address/social links
- **`/workwithme`** — product hub: From First Note to Final Curtain, BRAVO for Speakers, Diva Taster; each card links to `members.juliebale.com/resource_redirect/landing_pages/<id>`
- **`/store`** — Featured Courses listing; cards link to Kajabi checkout

**Exit criteria:**
- All 5 pages deployed to staging and visually match the Kajabi originals at mobile and desktop breakpoints
- All CTA links resolve correctly (Kajabi offer/landing-page URLs)
- Kajabi form embeds submit without errors
- No console errors; Lighthouse accessibility score ≥ 85

**Status:** COMPLETE

---

## Sprint 3: Campaign Landing Pages

**Goal:** All campaign/funnel landing pages are rebuilt from the Sprint 2 component library, each with the correct Kajabi checkout links and any Wistia embeds.

**Deliverables:**

Additional components (where Sprint 2 doesn't cover):
- `AudioPlayer.astro` — Wistia audio-theme embed wrapper (matches `#c19b33` gold background from original)
- `PricingTable.astro` — side-by-side plan comparison (used by Diva Circle® and BRAVO for Speakers)
- `ThankYou.astro` — shared thank-you page template (reused for all 7 confirmation pages)
- `EventCard.astro` — date, venue, CTA for live events

**Pages:**
- `/divaenergylive` — live events listing
- `/bravoforspeakers` — BRAVO Framework® for Speakers; Wistia audio embed (`wistia_hsz5tw7re2`); pricing: Bravo Day £197 / VIP 1:1 Day £997
- `/divacircle` — Diva Circle® membership; pricing: 6M £2,995 (or £499/mo) / 12M £4,995 (or £416.25/mo); Kajabi offer links `roTFfCL5` and `auFzWGsQ` → `members.juliebale.com`
- `/divataster` — Diva Taster Experience; Kajabi LP `2151639319`
- `/selfhypnosis` — Self-Hypnosis lead magnet; Wistia embed; Kajabi form `2148842010`
- `/weightmanagement` — weight management hypnotherapy
- `/opt-in` — "5 Ways To Create Awesome Performances With Hypnotherapy"; Kajabi form `2147921082`
- `/newsletter` — newsletter sign-up
- `/divaenergymail` — email list opt-in variant
- `/resettaster` — weight reset taster
- `/discoversinging` — top-of-funnel discovery page
- `/MindTrainingforSingers` — mixed-case slug must be preserved exactly
- `/bravo` — BRAVO variant landing page
- `/book` — "The Real Me Isn't Fat"; Amazon purchase links (`amzn.eu/d/0U9bgi5`, `amzn.eu/d/8KKf3J9`)
- `/thank-you` and six UUID-suffixed thank-you pages (all use the shared `ThankYou.astro` template)
- `/privacy-policy` and `/terms-and-conditions`

**Exit criteria:**
- All pages deployed; all Kajabi form embeds and Wistia embeds functioning
- Pricing and offer links verified against the live Kajabi site
- Mixed-case slug `/MindTrainingforSingers` resolves correctly (case-sensitive)
- Mobile responsive; no layout breaks at 375px, 768px, 1280px

**Status:** COMPLETE

---

## Sprint 4: Blog System & Content Migration

**Goal:** Full blog live at `/blog` with all 22 posts migrated to Markdown, tag pages working, and CMS configured for the client to write and publish new posts without developer involvement.

**Deliverables:**

**Blog infrastructure:**
- Astro Content Collections for blog posts (`src/content/blog/`) with frontmatter schema: `title`, `description`, `publishDate`, `tags[]`, `heroImage`, `draft`
- `BlogIndex.astro` — paginated post list, tag filter sidebar, latest-post card
- `BlogPost.astro` — full post layout: hero image, title, date, tag badges, body, related-posts strip, CTA
- Tag archive pages: `/blog?tag=hypnosis`, `/blog?tag=singer` (static generated from content collection)
- RSS feed at `/blog/rss.xml` (Astro's built-in RSS helper)

**Content migration (22 posts):**
Extract each post from the live Kajabi site and save as a `.md` file. Slugs must be preserved exactly:
- All lowercase-slug posts: straightforward
- `/blog/Howtonailauditionswithhypnosis` — Astro slug matches mixed case; also add 301 in `staticwebapp.config.json` for any case variant
- `/blog/can-you-reset-your-weight-with-hypnotic-semaglutide-is-this-the-end-of-yo-yo-dieting` — long slug, copy exactly
- Any images referenced from `kajabi-storefronts-production.kajabi-cdn.com` — download to `public/blog-images/` and update refs

**CMS:**
- Decap CMS configured at `/admin` with GitHub backend
- Collection definition for Blog: all frontmatter fields, body (Markdown), image upload to `public/blog-images/`
- Editorial workflow enabled (draft → review → publish via git)
- Test: create a new draft post, publish it, confirm it appears at `/blog`

**Exit criteria:**
- All 22 posts live at their original slug paths; content and images correct
- Tag pages at `?tag=hypnosis` and `?tag=singer` each show correct post subsets
- `/blog/rss.xml` validates in an RSS reader
- Client can log into Decap CMS and publish a new post without developer help
- Post URLs verified against the current Kajabi sitemap (no missing slugs)

**Status:** COMPLETE

---

## Sprint 5: Podcast Pages, SEO, Analytics & DNS Cutover

**Goal:** Podcast pages live, full SEO instrumentation in place, all 301 redirects implemented, analytics verified, UK GDPR cookie consent added, and the site is production-ready for DNS cutover.

**Deliverables:**

**Podcast pages:**
- `/podcasts/change-your-mind-change-your-life-mindset-for-singers` — show hub with episode list
- `/podcasts/.../episodes/2147844748` — Episode 1
- `/podcasts/.../episodes/2147847399` — Episode 2
- `/podcasts/.../episodes/2147850457` — "How to Use Self-Hypnosis for Imposter Syndrome"
- Episode content sourced from the Kajabi RSS feed (`app.kajabi.com/podcasts/2147509010/feed`) at build time via Astro's `fetch` in `getStaticPaths`
- Note: podcast audio stays on Kajabi CDN at this MVP stage; episode pages embed the Kajabi player or link to Apple Podcasts

**SEO instrumentation:**
- `sitemap.xml` auto-generated by `@astrojs/sitemap` (all public routes)
- `robots.txt` — allow all; point to sitemap
- Per-page `<title>`, `<meta name="description">`, Open Graph (`og:title`, `og:description`, `og:image`, `og:url`), Twitter Card, `<link rel="canonical">`
- OG images: use existing Kajabi CDN images as OG image sources (same URLs as today; no re-upload needed at MVP)

**Analytics:**
- GA4 (G-T7NFPMTGT1) via `@astrojs/partytown` (off-main-thread)
- Google Ads (AW-11248288364) loaded alongside GA4
- Meta Pixel (1064912124894806) via Partytown or direct script
- Facebook domain verification meta tag (`dldh8izw4pusv30oa4zj7cfshjsf09`)
- Verify: GA4 DebugView shows PageView events on staging

**Cookie consent (UK GDPR):**
- CookieYes or CookieBot script — categorises GA4 and Meta Pixel as Analytics/Marketing
- Consent gate: analytics scripts load only after consent granted
- Privacy Policy page updated to reference cookie categories

**301 redirect map** in `staticwebapp.config.json`:

| From | To |
|------|----|
| `/blog/Howtonailauditionswithhypnosis` | `/blog/Howtonailauditionswithhypnosis` (preserved; add lowercase variant 301) |
| `/login` | `https://members.juliebale.com/login` |
| `/store` | `/workwithme` |
| `/resource_redirect/offers/:slug` | `https://members.juliebale.com/resource_redirect/offers/:slug` |
| `/resource_redirect/landing_pages/:id` | `https://members.juliebale.com/resource_redirect/landing_pages/:id` |
| `/forms/:id/form_submissions` | `https://members.juliebale.com/forms/:id/form_submissions` |
| `/library` | `https://members.juliebale.com/library` |
| `/app` | `https://members.juliebale.com/app` |
| `/a/*` | `https://members.juliebale.com/a/*` |
| Podcast episode URLs | preserved as static pages (no redirect needed) |

**Performance:**
- Lighthouse score ≥ 90 on Performance, Accessibility, SEO for homepage and a blog post
- Core Web Vitals: LCP < 2.5 s, CLS < 0.1 (verify in PageSpeed Insights)

**DNS cutover checklist:**
- [ ] Azure custom domain `www.juliebale.com` configured and SSL provisioned
- [ ] Kajabi configured on `members.juliebale.com` and tested
- [ ] All CTA/offer/login links on new site point to `members.juliebale.com`
- [ ] TTL lowered to 60 s at least 48 hours before cutover
- [ ] GA4 verified receiving hits on staging
- [ ] Google Search Console property verified for new site
- [ ] Kajabi left live in read-only for 30 days post-cutover

**Exit criteria:**
- All five sprints' pages pass Lighthouse ≥ 90
- sitemap.xml submitted to Google Search Console
- Full 301 redirect map tested with `curl -I`; all return correct status codes
- Cookie consent banner appears on first visit; analytics fire only after consent
- Client sign-off on DNS cutover checklist

**Status:** PENDING
