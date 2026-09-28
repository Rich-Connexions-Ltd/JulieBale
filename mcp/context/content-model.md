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

- **hero** — cinematic top. `{kicker, heading, intro, image, cta:{label,href}}`
- **statement** — a big quiet line. `{eyebrow?, statement, sub?}`
- **showcase** — flagship band. `{heading, sub, facts, image?, caption?, cta:{label,href}}`
- **feature** — image + copy. `{eyebrow?, heading, body, image, caption?, reverse?, cta?}`
- **panels** — up to three cards. `{heading?, items:[{title,line,href,image}]}`
- **duo** — two tiles side by side. `{heading?, items:[{kicker,title,href,image,caption?}]}`
- **pullquote** — a testimonial. `{quote, cite}`
- **cta** — teal call-to-action band. `{eyebrow?, heading, note?, cta:{label,href}}`
- **doorway** — email sign-up. `{heading, body, note}`
- **richtext** — prose. `{heading?, body}` (blank lines become paragraphs)
- **listing** — auto-list a collection. `{heading?, collection, empty?}`
- **accordion** — grouped lists (Diva Hub). `{items:[{title,collection,empty?}]}`
- **form** — a simple form. `{heading?, fields:[...], submit}`

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
| `focus` | hero | focal point `"<x>% <y>%"`, e.g. `"60% 20%"` |
| `sequence` | hero | `true`: kicker, heading, intro, button appear in turn |
| `image_side` | showcase, feature, duo | `left`, `right` (wide screens) |
| `crop` | showcase, feature, duo | `portrait`, `landscape`, `bleed` |
| `overlap` | showcase, feature | `true`: copy overlaps the image (wide screens) |
| `grid` | showcase, feature | `balanced`, `asymmetric` |
| `size` | pullquote | `standard`, `oversized` |
| `image_escape` | showcase, feature, duo | `side`, `up`, `down`, `both`, `side-up`, `side-down`: the image breaks out of its frame (sideways toward the page edge, and/or into the section above/below) |
| `overshoot` | showcase, feature, duo | `subtle`, `medium` (default), `bold`: how far it escapes |
| `layer` | showcase, feature, duo | `above` (default), `below`: over or under neighbouring sections |
| `shape` | showcase, feature, duo | `arch`, `circle`, `soft`, `slant`: clip shape of the image |

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

Page `design`: `concept` = `stage` | `editorial` | `journey`; `progress` = `true`
(slim reading-progress line).

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
   live section's style (it is not merged).
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
- **Gallery** — `design: {concept: "editorial"}`; feature `{image_escape: "side-up", overshoot: "bold", shape: "arch", transition: "overlap"}`; pullquote `{theme: "night", size: "oversized", transition: "hold", intensity: "gentle"}`; showcase `{image_escape: "down", shape: "slant", transition: "wipe"}`; duo `{image_escape: "side", shape: "soft", transition: "divider"}`; cta `{theme: "teal", transition: "crossfade"}`.
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
