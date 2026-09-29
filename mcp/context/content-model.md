# Content model

How the website is stored, so you can edit it correctly. Everything is documents
in collections, addressed by `collection` and `id`. Read before you write.

## Collections
- **site** — global config. `site/config` holds `nav`, `cta`, `footer`, `brand`.
- **pages** — the pages. id is the slug (`home`, `about`, `mentorship`, ...).
- **posts** — blog posts. id is the slug. Rendered at `/blog/{id}`.
- **events** — events and retreats. Rendered at `/events/{id}`, listed on /events.
- **courses** — courses. Rendered at `/courses/{id}`.
- **dates** — calendar entries. `{title, date, note, link}`.
- **landing** — standalone landing pages served at `/l/{id}`. `{title, html}`.
- **variants** — unpublished design variants of a page (see *Page variants*).
- **assets** — the photo, video and audio library, with consent (see *Assets and consent*).
- **testimonials** — singers' quotes and stories, with consent (see *Testimonials*).
- **context** — this pack (brand/voice/offers/content-model). Read, don't publish.

## A page document
```
{
  "title": "About Julie Bale",
  "placement": "menu" | "footer" | "hidden",   // where it appears in navigation
  "nav_label": "About",
  "order": 2,
  "noindex": false,
  "seo": { "description": "..." },
  "design": { ... },                             // optional page-level presentation
  "sections": [ <block>, <block>, ... ]         // the page, top to bottom
}
```
`hidden` pages exist only at their permalink (good for landing/enquiry pages).

## Blocks (the vocabulary you compose pages from)
Each block is `{ "type": "...", ...fields }`. Use these types only. If you need a
kind of section that does not exist, do NOT invent markup: raise a **feature
request** (see below) describing it.

- **hero** — cinematic top. `{kicker, heading, intro, image, image_2?, cta:{label,href}}`
- **statement** — a big quiet line. `{eyebrow?, statement, sub?, images?}`
- **showcase** — flagship band. `{heading, sub, facts, image?, image_2?, images?, caption?, cta:{label,href}}`
- **feature** — image + copy. `{eyebrow?, heading, body, image, image_2?, images?, caption?, reverse?, cta?}`
- **panels** — up to three cards. `{heading?, items:[{title,line,href,image}]}`
- **duo** — two tiles side by side. `{heading?, items:[{kicker,title,href,image,caption?}]}`
- **pullquote** — a testimonial. `{quote, cite}`
- **cta** — teal call-to-action band. `{eyebrow?, heading, note?, cta:{label,href}}`
- **doorway** — email sign-up. `{heading, body, note}`
- **richtext** — prose. `{heading?, body}` (blank lines become paragraphs)
- **listing** — auto-list a collection. `{heading?, collection, empty?}`
- **accordion** — grouped lists (Diva Hub). `{items:[{title,collection,empty?}]}`
- **form** — a simple form. `{heading?, fields:[...], submit}`
- **testimonials** — singers' words from the testimonials collection. `{heading?, items?:[ids], tag?, limit?}` (no items = all, newest id order; only consented ones appear)
- **media** — a performance moment. `{heading?, video?, audio?, poster?, caption?, transcript?, loop?}` (video: asset ref or Stream id; audio: asset ref or media key; transcript is Markdown)

`image` is a filename served from /assets (e.g. "about-julie.jpeg").

Every section also has a **`key`** (e.g. `hero-1`, `feature-2`) that the server
assigns. **Keep it unchanged when you edit**, including when you rewrite the
`sections` array: page variants refer to sections by key.

## Presentation: `style` and `design`
Glossary:
- **style** — optional object on a section: how it looks, never what it says.
- **design** — optional object on a page (or variant): page-level look.
- **concept** — `design.concept`, one of three whole-page looks.
- **presentation warning** — returned when you save a value not listed below;
  that value is ignored, nothing else is affected.

Use only these values (call `presentation_options` for the same list with
examples). Anything else is ignored and reported back as a warning.

Section `style`, any block:
| key | values |
|---|---|
| `theme` | `cream`, `ivory`, `teal`, `night` (near-black) |
| `width` | `contained`, `full` (full-bleed, edge to edge) |
| `spacing` | `compact`, `standard`, `generous` |
| `rule` | `true`: fine antique-gold line at the top |
| `chapter` | `true`: section takes the next chapter number (01, 02, ...) |
| `motion` | `none`, `fade`, `rise`, `scale`, `mask` (image wipe), `drift` (image moves gently on scroll) |
| `speed` | `gentle`, `standard` |

Section `style`, particular blocks:
| key | blocks | values |
|---|---|---|
| `hero` | hero | `cinematic` (default), `split`, `portrait` |
| `align` | hero | `left`, `centre` |
| `measure` | hero | `narrow`, `wide` |
| `treatment` | hero | `teal` (default), `cream`, `none` (split/portrait: plain ivory copy panel; cinematic: lighter overlay kept for legibility) |
| `focus` | hero, showcase, feature, media | focal point `"<x>% <y>%"`, e.g. `"60% 20%"` |
| `focus_end` | hero, showcase, feature | where the focal point ends up with `scene_image: "reframe"` |
| `sequence` | hero | `true`: kicker, heading, intro, button appear in turn |
| `image_side` | showcase, feature, duo | `left`, `right` (wide screens) |
| `crop` | showcase, feature, duo | `portrait`, `landscape`, `bleed` |
| `overlap` | showcase, feature | `true`: copy overlaps the image (wide screens) |
| `grid` | showcase, feature | `balanced`, `asymmetric` |
| `size` | pullquote | `standard`, `oversized` |
| `testimonial_layout` | testimonials | `quote`, `portrait`, `cards` (default), `before-after`, `carousel` (visitors move through it themselves; it never advances on its own) |
| `media_ratio` | media | `landscape` (default), `portrait` (4:5), `cinematic` (16:9), `square`, `wide` (21:9; 16:9 on phones) |
| `playback` | media | `player` (default), `ambient`, `background`: how a video plays (see Performance media) |
| `image_escape` | showcase, feature, duo | `side`, `up`, `down`, `both`, `side-up`, `side-down`: the image breaks out of its frame (sideways toward the page edge, and/or into the section above/below) |
| `overshoot` | showcase, feature, duo | `subtle`, `medium` (default), `bold`: how far it escapes |
| `layer` | showcase, feature, duo | `above` (default), `below`: over or under neighbouring sections |
| `shape` | showcase, feature, duo, media | `arch`, `circle`, `soft`, `slant`: clip shape of the image (or video frame) |

On narrow screens (phones) sideways escape is switched off and vertical escape
is kept small, so nothing ever causes sideways scrolling. Escaping images never
block links in neighbouring sections.

Section transitions (any block): how a section **arrives** from the one before.
| key | values |
|---|---|
| `transition` | `overlap` (slides up over the previous section), `wipe` (revealed top to bottom), `crossfade` (its background colour fades in), `depth` (settles from slightly smaller as it scrolls in), `hold` (holds in place for a moment while scrolling continues), `carry` (its image is carried up into the previous section), `divider` (full-width gold line draws across the boundary), `settle` (scrolling gently settles at its start when close, wide screens only) |
| `intensity` | `gentle`, `standard`, `strong` |

One transition per section; combine across neighbouring sections for a
sequence of scenes. None of them take over scrolling: `hold` uses normal
scrolling with the content pinned briefly, and `settle` only nudges when the
visitor is already close. Phones get lighter versions, and visitors who prefer
reduced motion see clean static boundaries. Use `hold` sparingly (one or two per
page): it makes that section taller.

### Scenes (a section takes the screen for a moment and changes as you scroll)
| key | blocks | values |
|---|---|---|
| `scene_length` | any | `short`, `medium`, `long`: the section's content stays pinned while the visitor scrolls on (phones: much shorter) |
| `scene_timing` | any | `enter`, `hold` (default), `release`: when the effects below play (text always finishes by the time it is fully readable; `release` applies to photographs and backgrounds) |
| `scene_text` | any | `fade`, `rise`, `stagger` (lines appear one after another), `spotlight` (text brightens from dim) |
| `scene_image` | hero, showcase, feature | `zoom`, `pan`, `reframe` (focal point moves from `focus` to `focus_end`), `dissolve` (into the block's `image_2`), `carry` (the photograph travels on into the next section as the scene ends) |
| `scene_background` | any | `deepen` (dark sections only), `warm` (light sections only), `glow` (soft gold edges) |

Everything is driven by the visitor's own scrolling; nothing is scrolled for
them. Effects appear in browsers that support scroll-linked animation (Chrome,
Edge, Safari); elsewhere, and for visitors who prefer reduced motion, the
section simply shows its finished state (and does not pin). `dissolve` needs a
second photograph in the block's `image_2` field on the live page (it has no
effect there until a dissolve scene uses it). Use at most two or three
scenes per page, and `long` once at most.

**Scene navigation** (`design.scene_nav`) lists the sections marked
`chapter: true`, labelled with their own eyebrow or heading: `rail` is a slim
numbered rail at the side on wide screens, `label` a small label naming the
current chapter, `both` shows the rail on wide screens and the label on phones.
It needs at least two chapter sections.

Page `design`: `concept` = `stage` | `editorial` | `journey`; `progress` = `true`
(slim reading-progress line); `scene_nav` = `rail` | `label` | `both` (see Scenes).

Motion always respects visitors who ask for reduced motion, and content is never
hidden if scripts fail. Without a `motion` value, sections keep the site's usual
gentle fade-in.

## Page variants (trying a new look without touching the live page)
A **variant** is an unpublished version of a page's *presentation*. It shares the
live page's copy: it stores only which sections appear, in what order, with
what `style`, plus a `design`. Copy edits are still made on the live page, and
every variant picks them up.

1. `create_page_variant` (base `home`, a new id such as `home-stage`, a label).
   It starts as the live page as-is and returns a **private preview link** for
   Julie. Up to six variants per page.
2. Edit it with `update_content` on collection `variants`:
   ```
   { "design": { "concept": "stage" },
     "sections": [
       { "from": "hero-1", "style": { "hero": "split", "theme": "night" } },
       { "from": "statement-1", "style": { "theme": "teal", "rule": true } }
     ] }
   ```
   `from` is a section key of the live page (`list_page_variants` shows them).
   Leave a section out to hide it. A variant section's `style` **replaces** the
   live section's style (it is not merged), and a variant section **without**
   `style` is shown **unstyled**: it does not inherit the live style. If you
   styled the live page after making a variant, copy those styles into the
   variant (list_page_variants and write warnings name such sections, and the
   preview banner counts them). A section may also choose different
   photographs or media with `"media": {"image": "asset:…", "image_2": "asset:…",
   "poster": "asset:…", "video": "asset:…", "audio": "asset:…"}` (asset references
   only), so a concept can use its own photography without touching the live page.
3. Julie opens the preview link to compare concepts.
4. When she chooses one, `publish_page_variant`. This writes the variant's order,
   styles and design into the live page. **Sections the variant leaves out are
   removed from the live page** (the result lists them), so confirm first. It is
   undoable: `undo_content` on `pages/home`.

If `list_page_variants` reports an **unresolved reference**, a `from` key no
longer matches a live section (usually because a section's `key` was dropped
while editing the page). Point it at the right key or remove it; publishing is
refused until then.

Worked examples (home page keys):
- **Stage** — `design: {concept: "stage"}`; hero `{hero: "cinematic", align: "left", sequence: true}`; showcase `{theme: "night", grid: "asymmetric", motion: "mask"}`; statement `{theme: "teal", rule: true, spacing: "generous"}`; pullquote `{size: "oversized"}`.
- **Editorial** — `design: {concept: "editorial"}`; hero `{hero: "portrait", treatment: "cream", measure: "narrow"}`; feature `{image_side: "left", crop: "portrait", overlap: true}`; pullquote `{theme: "ivory", size: "oversized", rule: true}`.
- **Gallery** — `design: {concept: "editorial", scene_nav: "rail"}`; feature `{image_escape: "side-up", overshoot: "bold", shape: "arch", transition: "overlap"}`; pullquote `{theme: "night", size: "oversized", transition: "hold", intensity: "gentle"}`; showcase `{image_escape: "down", shape: "slant", transition: "wipe"}`; duo `{image_escape: "side", shape: "soft", transition: "divider"}`; cta `{theme: "teal", transition: "crossfade"}`.
- **Journey** — `design: {concept: "journey", progress: true}`; hero `{hero: "split", treatment: "none"}`; then statement, feature, showcase and cta each with `{chapter: true}`, e.g. showcase `{chapter: true, theme: "teal", motion: "drift"}`.

## Markdown
Descriptive text fields render **Markdown**: a page/post `body`, an event
`description` and `details`, a post `excerpt`, a course/lesson `description` and
`body`. Write these in Markdown, headings (`##`), **bold**, *italic*, lists,
`> quotes`, and `[links](/path)`. Short label fields (titles, `sub`, `line`,
`facts`, button labels) are plain text.

## Editing safely
- **To change a field, use update (merge), not replace.** `updateContent` /
  `update_content` merges the fields you send and keeps everything else. Only use
  `writeContent` / `write_content` (replace) when you are deliberately rewriting a
  whole document, and then send the COMPLETE document, not just the changed field.
  (Replacing with a partial object wipes the missing fields.)
- Small edits (copy, an event's details, dates) can be saved directly.
- Bigger changes (creating or deleting a page, changing a price, changing
  navigation) should be confirmed with the person first.
- Every change is versioned. To reverse the last change to a document, use undo.

## Courses, lessons and media
- A course document has `title`, `description` and `lessons` (an array). Each
  lesson is `{ title, body, video?, audio? }`.
- `video` is a Cloudflare Stream video id (uploaded video). `audio` is an R2
  media key (e.g. "courses/lesson1.mp3"). These render as a player automatically.
- You cannot upload a media file through chat. Media is uploaded separately (an
  upload page / the media endpoints), which returns a Stream id or an R2 key; you
  then set that id/key on the lesson's `video` / `audio` field.

## Interactive editors (Claude)
For events, dates, blog posts and courses there are `edit_*` tools that open a
form widget to edit fields by hand. These render in hosts that support
interactive MCP UI (Claude). Saving from the widget performs an update (merge).

## Raising a feature request
When asked for something the blocks above cannot do (a new kind of section, a new
layout, a new content type, a bug), call `createFeatureRequest` /
`request_feature` with a clear title, what it should do, and where. Tell the
person it has been logged for the dev team. Do not fake it with a workaround that
breaks the design.

**Always list requests first** (`list_feature_requests` / `listFeatureRequests`).
Each has a `status` and a `resolution` note from the developers: `planned` means
it is scheduled (the note says which sprint), and a `declined` request says what
superseded it. Do not log something that is already open or planned.

### Current development focus (from 28 September 2026)
- **Pause on new art-direction requests.** There are five homepage concepts
  (Stage, Studio, Journey, Gallery, Atelier) and a large planned backlog. The
  priority now is helping Julie **compare the concepts and choose one**. Build
  with the tools that exist; do not log new layout, motion or styling requests
  until she has chosen. Bugs, and content Julie genuinely needs, can still be
  logged.
- **Planned, in order:**
  - Sprint 12, *Scenes*: scroll-progress scenes (#12, including the
    photographic storytelling in #16) and scene navigation (#21).
  - Sprint 13, *Trust content*: a visual asset library starting with
    rights/consent and usage metadata (#23), testimonials and singer stories
    (#18, which supersedes #1), and performance media (#19).
  - Sprint 14, *Composition and ornament*: organic backgrounds and decorative
    elements (#13 with #17), multi-image collage (#15), display typography
    (#14), hover interactions (#22), and phone-only overrides (#20, narrowed).
- Do not feature photographs or testimonials of real singers prominently until
  their consent is recorded (Sprint 13).

## Assets and consent
The **assets** collection describes each photograph, video and audio file for
design use. Find them with `search_assets` / `searchAssets` (filters: words,
type, usage, role, orientation, consent, usable). Use an asset anywhere an
image, second image, poster, video or audio is expected by writing its
reference, e.g. `"image": "asset:vip-diva-day"`; its alt text and focal point
come with it.

An asset document: `{file, type, title, alt, people:[…], setting, orientation,
focus, tone:[…], usage:[…], roles:[…], suits:[…], consent, consent_note,
consent_expires, date, lighting, crop_zones, notes}`.
- `type`: `image`, `video`, `audio`. `orientation`: `portrait`, `landscape`, `square`.
- `usage`: `julie-portrait`, `julie-singing`, `teaching`, `singer`, `community`,
  `backstage`, `concert`, `venue`, `atmosphere`.
- `roles` (good for): `hero`, `background`, `collage`, `testimonial-portrait`,
  `poster`, `tile`. `suits`: `desktop`, `mobile`.
- `consent`: `granted` (everyone identifiable agreed; say who/when/how in
  `consent_note`), `not-needed` (no identifiable people other than Julie),
  `pending`, `refused`.

**The rule:** an asset reference is shown only when its consent is `granted`
or `not-needed` and `consent_expires` has not passed. Otherwise it is simply left
out. Never change consent to `granted` unless Julie confirms that the people
shown agreed. Photographs referenced by plain filename (as on the current live
pages) are not checked, so prefer asset references for anything new.

## Testimonials
The **testimonials** collection: `{name, role?, quote, story? (Markdown),
before?, after?, portrait? ("asset:…"), video? ("asset:…" or Stream id),
tags?:[…], consent, consent_note?, consent_expires?}`. `consent` is `granted`,
`pending` or `refused`; **only `granted` testimonials appear**, and a portrait or
video appears only if its asset is consented too. Show them with a
`testimonials` block and choose a `testimonial_layout`. `before-after` shows only
testimonials that have both `before` and `after`. If nothing is consented, the
block shows nothing.

## Performance media
The **media** block shows a video with a poster frame: nothing heavy loads until
the visitor presses play. `loop: true` makes it a muted atmospheric loop that
starts when on screen (never for visitors who prefer reduced motion; the player
can always be paused). Add a `caption`, and a `transcript` for anything with
speech or lyrics. Audio plays with standard controls and only loads on demand.

### Video as moving photography (`playback`)
`style.playback` chooses how the block's video behaves:

| `playback` | What it does |
|---|---|
| `player` (default) | Poster first; the player loads when the visitor presses play. Has sound. |
| `ambient` | The video fills its frame like a photograph: cropped to the frame, never letterboxed or black-barred, muted, looping only while on screen, pausing when scrolled away. A small pause/play button sits in the corner. |
| `background` | A full-bleed muted loop behind the heading and caption, which sit on a dark panel so they stay readable. |

Framing uses the options you already know: `media_ratio`, `shape`, `focus`
(where the subject sits in the crop) and `phone` `focus`/`crop`. Recipes:
- **Moving portrait:** `{"playback": "ambient", "media_ratio": "portrait", "shape": "arch", "focus": "50% 30%"}`
- **Cinematic band:** `{"playback": "ambient", "media_ratio": "wide", "width": "full"}`
- **Atmospheric background:** `{"playback": "background"}` with a short `heading` and `caption`.

Rules worth knowing:
- `ambient` and `background` are **muted**. Use `player` for anything that
  should be heard (a performance, a spoken message).
- They need an **imported video asset** (`video: "asset:<id>"`) whose web
  MP4 is ready: `refresh_media_asset` prepares it once the video is ready and
  reports `mp4_status` (`processing` → `ready`; `error` means try refreshing
  again later). Until then, or for a bare Stream id, the block quietly shows the
  normal player, so nothing breaks.
- Visitors who prefer reduced motion see the still poster (they can press
  play); nothing ever plays off screen, and a visitor's pause is respected.
- **Accessibility:** the asset's `alt` names the video (it is read out and
  labels the pause button); `caption` is the visible text; add a `transcript`
  if the video has speech or lyrics. A `background` video is decorative, so put
  the meaning in the heading and caption.

## Composition and ornament (Sprint 14)

### Heading markup
In headings and statements (hero heading, statement, section headings,
showcase/feature/cta headings) two marks are allowed, and nothing else:
- `|` starts a new line: `"It's never too late | to sing."`
- `*word*` sets words in display italic: `"It's never too late to *sing*."`
Screen readers and page titles read the same words without the marks.

### Backgrounds, ornaments and ghost headings (not on the hero)
| key | values |
|---|---|
| `edge` | `wave`, `curve`: the section's top edge curves over the section above (not on the first section) |
| `field` | `ellipse`, `halo`, `spotlight`, `blob`, `wash`: a large soft shape of colour behind the content |
| `field_colour` | `teal` (default), `gold`, `cream`, `ivory`, `night` |
| `field_position` | `left`, `centre` (default), `right` |
| `ornament` | `arc`, `contour`, `quote-mark`, `stave`: fine gold line drawing behind the content |
| `ornament_position` | `top-left`, `top-right` (default), `bottom-left`, `bottom-right` |
| `ghost` | `true`: a huge outline echo of the heading behind the section (statement, showcase, feature, cta) |

Decoration always sits behind the words and is hidden from screen readers.
Fields are automatically kept faint enough that text stays readable, so any
colour can go on any section; on dark sections a `cream` or `ivory` field is
kept very faint, so prefer `gold`, `teal` or `night` there. On light sections
with decoration, small labels switch to teal for legibility. Do not combine `edge` with
`transition: "overlap"` (both reshape the top boundary; the edge wins).

### Collage
`images` on a feature, showcase or statement: 2–4 images, each `"asset:<id>"`
(preferred; consent applies) or a plain filename like `"photo.jpeg"`. With
`collage` = `stack` (overlapping cascade, the default), `scatter` (prints on a
table) or `mosaic` (asymmetric grid). Unconsented or invalid images are left
out; with fewer than two left, the section shows its single `image` instead. In
a variant, `"media": {"images": ["asset:a", "asset:b", "asset:c"]}` gives one
concept its own collage. Phones show a tidy two-column grid.

### Display type and hover
| key | blocks | values |
|---|---|---|
| `type_scale` | hero, statement, showcase, feature, cta | `display`, `monumental` (short headings only) |
| `hover` | any | `shift` (photographs ease closer), `draw` (link underlines draw across); pointer devices only, and keyboard focus gets the same |

### Phones
The `phone` key in a section's `style` changes two things on phones only:
`{"phone": {"focus": "50% 30%", "crop": "portrait"}}`. Phone `crop` is
`portrait`, `landscape` or `square` (note: `square` instead of the main `crop`'s
`bleed`); phone `focus` works like `focus`. "Phones" means screens up to 48rem
(about 770px) wide. Everything else adapts automatically.

### Not available yet (deferred)
Bottom edges and other edge shapes, shapes that spill into neighbouring
sections, moving decoration, vertical labels, per-line text animation, ghost
text running off the page, magnetic buttons, custom cursors and other phone
overrides. Please do not log these again; they are recorded.

## Landing pages
Landing pages (collection `landing`, served at `/l/<id>`) are standalone HTML:
`{title, html}`. The site shows the contents of `<main>` (or `<body>`) and
your `<style>` blocks inside its own header and footer, after **making them
safe**. Anything outside the rules below is removed when the page is shown, and
saving returns warnings that say what will be removed. Nothing can run scripts
or load content from other websites.

**Tags:** `section`, `header`, `footer`, `aside`, `div`, `span`, `p`, `h1`, `h2`, `h3`, `h4`, `strong`, `em`, `br`, `ul`, `ol`, `li`, `a`, `img`, `form`, `label`, `input`, `button`.
Removed with their contents: scripts, styles inside the body, iframes, embeds,
objects, SVG and MathML.

**Attributes:** on any tag `class`, `id`, `title`, `lang`, `aria-label`, `aria-hidden`, `style`; plus
`a`: `href`; `img`: `src`, `alt`, `width`, `height`, `loading`; `form`:
`action`, `method`; `input`: `type`, `name`, `value`, `placeholder`,
`required`, `checked`, `autocomplete`; `label`: `for`; `button`: `type`. No
event handlers, `data-*`, `target` or other attributes.

**Addresses (the same three rules everywhere below: in-page anchor, site path, or full https: address):**
- `href`: an in-page `#anchor`, a site path like `/about`, `mailto:`, `tel:`,
  or a full `https:` address. `http:` addresses are removed (use `https:`).
- Images (`src`): only site files under `/assets/` or `/media/` (upload media
  first). No images from other websites, and no `asset:` references here.
- Forms (`action`): an in-page `#anchor` or a site path only.
- Input `type`: `text`, `email`, `tel`, `number`, `radio`, `checkbox`, `submit` (no passwords, files or
  hidden fields). `autocomplete`: `name`, `given-name`, `family-name`, `email`, `tel`, `off`.

**Ids:** every `id` is given an `l-` prefix (`step1` becomes `l-step1`), and
`#step1` links and `label for` are rewritten to match, so they keep working and
cannot clash with the site's own ids.

**CSS:** only plain rules and `@media` blocks. Every selector is scoped to the
landing content (`.landing`); `:root`, `html` and `body` mean the landing area,
so landing styles never change the site header or footer. No url() of any kind
(use gradients for backgrounds), no `@import` or fonts, no `\` escapes,
`position` only `static`, `relative`, `absolute` or `sticky` (no `fixed`), and
`z-index` 0–20 (landing content has its own layer and can never cover the site
header). Allowed properties: `align-items`, `backdrop-filter`, `background`, `border`, `border-bottom`, `border-color`, `border-left`, `border-radius`, `border-top`, `bottom`, `box-shadow`, `box-sizing`, `color`, `content`, `cursor`, `display`, `filter`, `flex-wrap`, `font`, `font-family`, `font-size`, `font-weight`, `gap`, `grid-template-columns`, `height`, `justify-content`, `letter-spacing`, `line-height`, `margin`, `margin-bottom`, `margin-right`, `margin-top`, `max-width`, `min-height`, `outline`, `overflow`, `padding`, `padding-bottom`, `padding-top`, `position`, `right`, `scroll-behavior`, `scroll-margin-top`, `text-decoration`, `text-transform`, `top`, `transform`, `transition`, `width`, `z-index`, `text-align`, `font-style`, `opacity`, `left`, `margin-left`, `padding-left`, `padding-right`, `background-color`, `flex`, `flex-direction`, `list-style`, `white-space`, `min-width`, `grid-column`, and custom
properties such as `--gold`.

**Accessibility:** keep text contrast at least 4.5:1 against its background
(set heading colours explicitly on coloured panels, because site headings
default to dark ink), never remove focus outlines (`outline: none` without a
replacement), and give every input a `label`.

**Instead of blocked content:** for video, audio or embeds use a `media` block
on a normal page (or link to one); for images upload them to `/media/` or use
files in `/assets/`; for interactive widgets or scripts, request a feature.

## Cutting a moving photograph from a longer video
Terms: the **master** is an imported video asset; a **derivative** is a short
excerpt cut from it with `derive_video` (REST `deriveVideo`). The master is
never changed.

1. **Look first:** `video_frames` (REST `videoFrames`) gives still-frame links
   at the times you ask for (seconds in that asset's own timeline; for a
   derivative, 0 is the start of the excerpt), or 8 evenly spaced. Look at them
   to pick the moment and where the subject is.
2. **Cut:** `derive_video` with `from` (the master's id), `start` and `end`
   (seconds into the master; 1–60 s long), and optionally:
   - `crop` `{x, y, w, h}`: a rectangle in whole-number percent of the full
     frame (x, y = top-left corner; w, h at least 10; it must stay inside the
     frame). The rectangle is scaled to fill the section's frame, centred on
     it; if the frame's shape differs, the rectangle's edges are trimmed a
     little rather than letterboxed.
   - `speed`: `0.5`, `0.75` or `1` (it can only slow a clip).
   - `poster_at` (percent through the excerpt), `title`, `id`.
   The result is a new asset (`asset:<id>`, default `<master>-cut`).
3. **Refresh** the new asset with `refresh_media_asset` until `status` and
   `mp4_status` are `ready`.
4. **Use** it in a media block with `style.playback` `ambient` or `background`.
   Crop and speed apply only there; in `player` mode the whole clip plays with
   the normal player. A crop replaces `focus`. The file itself keeps the full
   frame (its width/height and thumbnail are the whole picture); the tools
   report the shown crop as `crop_size`. So judge a crop on the page, not from
   the thumbnail, video_frames or a variant preview without that style.

Rules worth knowing:
- Derivatives are **muted** moving photography (the sound is never heard).
  There is no separate loop setting: ambient/background always loop, so
  choose a start and end that look alike for a smooth loop.
- **Consent is inherited, live:** a derivative's `consent` is `inherit`. It
  is shown only while its master may be shown; if the master's consent
  changes, every derivative follows at once. Do not set its consent yourself.
- **Re-cut** by calling `derive_video` again with the derivative's `id`: its
  title, alt and other details are kept and every page using it updates. To
  change only the crop or speed, edit `edit.crop` / `edit.speed` on the asset
  (changing `edit.start`/`end` there does nothing: re-cut instead).
- Limits: up to 60 s per excerpt and 20 derivatives per master; a derivative
  cannot be cut from another derivative (cut from its master).
- **Resolution:** a crop can only be as sharp as the pixels it contains. A
  tight crop of a small video (for example a landscape window inside a phone
  clip) will look soft in a large frame: ask Julie for the original footage
  for anything prominent.

## Importing video and audio (Sprint 16)
Two doors, the same result: an asset you can use as `asset:<id>` in a `media`
block (`video`, `audio` or `poster`) or a testimonial.
- **Files uploaded in a ChatGPT chat:** call `importMedia`; ChatGPT attaches the
  files for you (up to 10 at once).
- **Claude / MCP clients:** `import_media_from_url` with a public https link.
- Images still go through the upload page.

Limits: video mp4, mov or webm up to 200 MB; audio mp3, m4a, wav or ogg up to
50 MB. Anything else is refused with a reason.

**Terms:**
- `master` — the exact original file, kept privately.
- `status` — `processing` (video still being prepared), `ready`, or `error`.
- `source` — where the file came from (`chatgpt` or `url`) and its name.
- `previous_files` — earlier versions after a replacement (up to 5).
- `poster_at` — where the poster frame is taken, as a percent through the
  video (0–100, default 10).

**Details to give:** `title`; `alt` for videos — what the poster/video shows,
used as the poster image's alternative text (recommended: the import succeeds
without it but returns a warning); `transcript` for anything with speech or
lyrics (recommended, same warning); optionally `caption` (visible text shown
under the player), `usage`, `roles`. Images, by contrast, *require* `alt`.

**Consent:** new imports are `pending`, so they are **not shown or even
downloadable** until consent is `granted` (with a `consent_note`: who agreed,
when and how) or `not-needed` (no identifiable people other than Julie, e.g. a
placeholder clip). Never set `granted` without Julie's confirmation.

**Video takes a while:** after importing, call `refresh_media_asset` (or
`refreshMedia`) until `status` is `ready`; it fills in duration, size,
dimensions and orientation. Pass `poster_at` to move the poster frame. Once the
video is ready, refresh also prepares its web MP4 for `ambient`/`background`
playback: the asset gains `mp4_status` (`processing`, `ready` or `error`) and,
when ready, `mp4`. These are set by refresh; do not edit them (an edited or
invalid `mp4` is ignored and the player is shown instead).

**Replacing a placeholder:** import the new file with `asset` set to the
placeholder's id. Only the media changes (file, master, status, size, duration,
dimensions, orientation, thumbnail, source, mp4, mp4_status); refresh the asset
again afterwards; the title, alt, consent, usage,
roles, caption, transcript and notes are kept, and every page using
`asset:<id>` shows the new file. The old file is listed in `previous_files`, and
`undo_content` on `assets/<id>` puts it back.

