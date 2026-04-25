# Design System — juliebale.com

Tokens live in `site/src/styles/tokens.css`. Global resets and utility classes in `site/src/styles/global.css`.

---

## Colour Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--color-gold` | `#c19b33` | Primary brand; CTA buttons, accents, audio player |
| `--color-teal` | `#66bcbc` | Secondary; borders, section highlights, secondary buttons |
| `--color-pink` | `#e65cb4` | Accent; opt-in headings, special CTAs |
| `--color-charcoal` | `#2c3e50` | Primary text, dark headings, header/footer backgrounds |
| `--color-teal-muted` | `#608082` | Soft accent text, eyebrow labels |
| `--color-olive` | `#556542` | Animated word highlights |
| `--color-off-white` | `#ecf0f1` | Text on dark backgrounds |
| `--color-grey` | `#444444` | Secondary body text |

---

## Typography

| Role | Font | CSS token |
|------|------|-----------|
| Body & navigation | Raleway 400/700 | `--font-body` |
| Editorial headings | Playfair Display 400/700 | `--font-editorial` |
| Decorative script (`<h6>`) | Licorice | `--font-script` |
| Accent display | Allison | `--font-accent-1` |
| Accent display | Comforter | `--font-accent-2` |
| Icons | Font Awesome 5 Free | loaded via CDN |

All fonts loaded via Google Fonts in `BaseLayout.astro`. Font Awesome 5.15.4 via CDN.

### Type Scale

| Token | rem | px |
|-------|-----|----|
| `--text-xs` | 0.75 | 12 |
| `--text-sm` | 0.875 | 14 |
| `--text-base` | 1 | 16 |
| `--text-lg` | 1.125 | 18 |
| `--text-xl` | 1.25 | 20 |
| `--text-2xl` | 1.563 | 25 |
| `--text-3xl` | 1.953 | 31 |
| `--text-4xl` | 2.441 | 39 |
| `--text-5xl` | 3.052 | 49 |

---

## Buttons

Apply classes directly to `<a>` or `<button>` elements.

```html
<a href="…" class="btn btn--primary btn--md">Primary CTA</a>
```

### Variants

| Class | Background | Use case |
|-------|-----------|---------|
| `btn--primary` | Gold `#c19b33` | Main CTA |
| `btn--secondary` | Teal `#66bcbc` | Alternative CTA |
| `btn--accent` | Pink `#e65cb4` | Opt-in / special offer |
| `btn--outline` | Transparent / gold border | Secondary action |
| `btn--outline-white` | Transparent / white border | On dark backgrounds |
| `btn--dark` | Charcoal | On light backgrounds needing contrast |

### Sizes

| Class | Padding | Font size |
|-------|---------|-----------|
| `btn--sm` | 8px 16px | 14px |
| `btn--md` | 12px 24px | 16px |
| `btn--lg` | 16px 32px | 18px |

Add `btn--full` to make a button 100% width.

---

## Layout Utilities

| Class | Effect |
|-------|--------|
| `.container` | Max-width 1200px, centred, 24px horizontal padding |
| `.section` | 64px vertical padding |
| `.section--sm` | 40px vertical padding |
| `.section--lg` | 96px vertical padding |
| `.sr-only` | Visually hidden, screen-reader accessible |

---

## Navigation

**Primary nav items** (in order):
1. Home → `/homepage`
2. About → `/about`
3. Work With Me → `/workwithme`
4. Diva Energy Live Events → `/divaenergylive`
5. BRAVO for Speakers → `/bravoforspeakers`
6. Blog → `/blog`
7. Login → `https://members.juliebale.com/login`

Commerce links (checkout, courses, member area) point to `members.juliebale.com`.

---

## Logo Assets

| File | Usage |
|------|-------|
| `public/images/logo-wordmark.png` | Primary header and footer logo |
| `public/images/logo-mark.png` | Symbol/icon variant |
| `public/images/favicon-heart.png` | Favicon (gold heart) |

The footer logo uses `filter: brightness(0) invert(1)` to render white on the dark charcoal background. Adjust this once the final brand assets are confirmed.

---

## Component Library

Built across sprints. File locations:

| Component | File | Sprint |
|-----------|------|--------|
| `BaseLayout` | `src/layouts/BaseLayout.astro` | 1 |
| `Header` | `src/components/Header.astro` | 1 |
| `Footer` | `src/components/Footer.astro` | 1 |
| `Hero` | `src/components/Hero.astro` | 2 |
| `TextImage` | `src/components/TextImage.astro` | 2 |
| `FeatureGrid` | `src/components/FeatureGrid.astro` | 2 |
| `Testimonial` | `src/components/Testimonial.astro` | 2 |
| `PricingCard` | `src/components/PricingCard.astro` | 2 |
| `VideoEmbed` | `src/components/VideoEmbed.astro` | 2 |
| `FormEmbed` | `src/components/FormEmbed.astro` | 2 |
| `CTABanner` | `src/components/CTABanner.astro` | 2 |
| `BlogCard` | `src/components/BlogCard.astro` | 2 |
| `AudioPlayer` | `src/components/AudioPlayer.astro` | 3 |
| `PricingTable` | `src/components/PricingTable.astro` | 3 |
| `ThankYou` | `src/components/ThankYou.astro` | 3 |
| `EventCard` | `src/components/EventCard.astro` | 3 |
