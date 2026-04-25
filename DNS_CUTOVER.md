# juliebale.com — DNS Cutover Checklist

Complete all tasks in order. Do not proceed to DNS changes until every pre-cutover item is ticked.

---

## Pre-Cutover (Complete at least 48 hours before)

### Azure Setup
- [ ] Azure Static Web Apps custom domain `www.juliebale.com` configured
- [ ] SSL certificate provisioned and active on Azure (takes up to 15 min after CNAME)
- [ ] Verify the staging URL (azurestaticapps.net) shows the correct site with no console errors

### Kajabi Subdomain
- [ ] Kajabi site assigned to `members.juliebale.com`
- [ ] `members.juliebale.com` CNAME → `ssl.kajabi.com` added in DNS
- [ ] Kajabi custom domain SSL provisioned and verified
- [ ] Login at `https://members.juliebale.com/login` works correctly
- [ ] Checkout links on new site all point to `members.juliebale.com/…`

### Content Checks
- [ ] All Kajabi form embeds tested (contact, opt-in, self-hypnosis, newsletter)
- [ ] All Wistia embeds play (BRAVO for Speakers audio player)
- [ ] All pricing / Kajabi offer links resolve to correct Kajabi checkout pages
- [ ] Blog: all 25 posts live, images loading, tag pages working
- [ ] Podcast: all 3 episode pages accessible
- [ ] `/MindTrainingforSingers` (mixed-case slug) resolves correctly
- [ ] `/thank-you` and variant thank-you pages load
- [ ] 301 redirects verified with `curl -IL`:
  - [ ] `/login` → `https://members.juliebale.com/login`
  - [ ] `/store` → `/workwithme`
  - [ ] `/library` → `https://members.juliebale.com/library`
  - [ ] `/a/anything` → `https://members.juliebale.com/a/anything`
  - [ ] `/blog/Howtonailauditionswithhypnosis` → `/blog/howtonailauditionswithhypnosis`

### Analytics
- [ ] GA4 DebugView shows PageView events on staging URL
- [ ] Cookie consent banner appears on first visit (incognito/private window)
- [ ] Accepting consent fires GA4, Google Ads, and Meta Pixel
- [ ] Declining consent fires no analytics scripts
- [ ] Meta Pixel Helper browser extension confirms PageView on acceptance

### SEO
- [ ] `sitemap.xml` accessible at staging URL and contains all public pages
- [ ] `robots.txt` accessible and has `Sitemap:` directive
- [ ] Each page has correct `<title>`, `<meta description>`, and OG tags (inspect source on 3–4 key pages)
- [ ] Google Search Console property verified (DNS TXT record or HTML file method)

### Performance
- [ ] Lighthouse ≥ 90 on Performance, Accessibility, SEO for homepage
- [ ] Lighthouse ≥ 90 for a representative blog post
- [ ] Core Web Vitals in PageSpeed Insights: LCP < 2.5 s, CLS < 0.1

---

## TTL Reduction (48 hours before cutover)

- [ ] Lower TTL on `www.juliebale.com` A/CNAME record to **60 seconds**
  - Note: this makes rollback faster if needed
- [ ] Confirm TTL reduction is live: `dig www.juliebale.com | grep ttl`

---

## Cutover

1. **Update `www.juliebale.com` DNS:**
   - Remove the existing A record / CNAME pointing to Kajabi
   - Add CNAME `www` → `<your-app>.azurestaticapps.net` (or the Azure-provided alias record)
   - If registrar requires an A record at apex, use Azure Traffic Manager IP or a redirect to `www`

2. **Monitor propagation:**
   - `watch -n 10 dig +short www.juliebale.com`
   - Expect propagation in < 5 min globally (given 60 s TTL)

3. **Verify HTTPS on new site:**
   - Browse `https://www.juliebale.com` in a fresh private window
   - Confirm SSL padlock and correct content

4. **Verify `members.juliebale.com`:**
   - Login, checkout flow, and course library all working

---

## Post-Cutover (within 24 hours)

- [ ] Submit sitemap in Google Search Console: `https://www.juliebale.com/sitemap-index.xml`
- [ ] Request indexing of homepage and key pages in Search Console
- [ ] GA4 Realtime shows live traffic on `www.juliebale.com`
- [ ] Check for crawl errors in Search Console after 48 hours
- [ ] Raise TTL back to 3600 seconds once site is confirmed stable

---

## Rollback Plan

If the new site has a critical issue within the first 30 minutes:

1. Revert `www.juliebale.com` DNS to the original Kajabi CNAME (`ssl.kajabi.com`)
2. Because TTL is 60 s, old site returns within ~2 minutes worldwide
3. Kajabi remains in read-only mode for **30 days** post-cutover as a safety net — do not delete content

---

## 30-Day Post-Cutover Review

- [ ] No increase in crawl errors or rank drops in Search Console
- [ ] GA4 sessions comparable to Kajabi baseline
- [ ] All form submissions reaching Julie's inbox
- [ ] Client comfortable with Decap CMS for blog posts
- [ ] Schedule Kajabi cancellation date (after 30-day safety window)
