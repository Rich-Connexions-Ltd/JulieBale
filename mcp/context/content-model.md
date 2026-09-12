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
- **showcase** — flagship band. `{heading, sub, facts, image?, cta:{label,href}}`
- **feature** — image + copy. `{eyebrow?, heading, body, image, reverse?, cta?}`
- **panels** — up to three cards. `{heading?, items:[{title,line,href,image}]}`
- **duo** — two tiles side by side. `{heading?, items:[{kicker,title,href,image}]}`
- **pullquote** — a testimonial. `{quote, cite}`
- **cta** — teal call-to-action band. `{eyebrow?, heading, note?, cta:{label,href}}`
- **doorway** — email sign-up. `{heading, body, note}`
- **richtext** — prose. `{heading?, body}` (blank lines become paragraphs)
- **listing** — auto-list a collection. `{heading?, collection, empty?}`
- **accordion** — grouped lists (Diva Hub). `{items:[{title,collection,empty?}]}`
- **form** — a simple form. `{heading?, fields:[...], submit}`

`image` is a filename served from /assets (e.g. "about-julie.jpeg").

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

## Raising a feature request
When asked for something the blocks above cannot do (a new kind of section, a new
layout, a new content type, a bug), call `createFeatureRequest` /
`request_feature` with a clear title, what it should do, and where. Tell the
person it has been logged for the dev team. Do not fake it with a workaround that
breaks the design.
