# Changes

## Sprint 5: Podcast Pages, SEO, Analytics & DNS Cutover — 2026-04-25

**Files changed:**
- `site/astro.config.mjs` — added `@astrojs/sitemap` integration with admin/thank-you/homepage filters
- `site/public/robots.txt` — created: allow all, disallow /admin/, sitemap pointer
- `site/src/components/CookieConsent.astro` — UK GDPR cookie consent banner; gates GA4, Google Ads, and Meta Pixel behind explicit consent; `jb_consent` cookie (365-day)
- `site/src/layouts/BaseLayout.astro` — removed unconditional analytics scripts; added `<CookieConsent />`; fixed double-suffix `pageTitle` bug; updated default OG image to Kajabi CDN portrait URL
- `site/src/pages/blog/[...slug].astro` — removed manual `| Julie Bale` suffix from title prop (BaseLayout now handles it)
- `site/src/pages/podcasts/change-your-mind-change-your-life-mindset-for-singers/index.astro` — podcast show hub page with episode list
- `site/src/pages/podcasts/change-your-mind-change-your-life-mindset-for-singers/episodes/[id].astro` — static episode pages for IDs 2147844748, 2147847399, 2147850457; Kajabi iframe embed; prev/next navigation
- `DNS_CUTOVER.md` — client DNS cutover checklist (pre-cutover, TTL, cutover steps, rollback plan, 30-day review)
- `SPRINTS.md` — Sprint 5 marked COMPLETE

**Build:** 53 pages, clean build, sitemap-index.xml generated
