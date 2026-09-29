# Julie Bale — content MCP (test surface)

The **content backbone for juliebale.com** on Cloudflare Workers: it renders the
site from **D1** documents, stores media in **R2** (`MEDIA`) and video in
**Cloudflare Stream**, and exposes the same content to chat assistants through a
REST/OpenAPI door (Julie's Custom GPT) and an MCP door (Claude and other MCP
clients). Bindings and secrets: `DB` (D1), `MEDIA` (R2), `MCP_OBJECT` (Durable
Object), `API_KEY` (required: bearer key for `/api` and `/mcp`, also the root of
the media signing key), `STREAM_TOKEN` and `CF_ACCOUNT_ID` (video).

> The REST API and the MCP endpoints are protected by a bearer API key (the
> `API_KEY` Worker secret). Storage is D1 (documents + version history).

## Two front doors (same D1 store)

- **REST + OpenAPI** — for a **ChatGPT Custom GPT Action** (works on Plus).
  - `GET /api/{collection}` — list ids
  - `GET /api/{collection}/{id}` — read a document
  - `PUT /api/{collection}/{id}` — create/replace (JSON body)
  - `DELETE /api/{collection}/{id}` — delete
  - `GET /openapi.json` — the schema to import into a Custom GPT (public)
  - Auth: `Authorization: Bearer <API_KEY>` on all `/api/*`.
- **MCP** (`/mcp`, `/sse`) — for MCP clients (Enterprise/Team ChatGPT, Claude,
  RCNX tooling). Plus plans cannot add custom MCP connectors, which is why the
  REST/Actions door exists.

## Build the Custom GPT (Plus)

1. ChatGPT → **Explore GPTs → Create → Configure → Actions → Create new action**.
2. **Import from URL:** `https://juliebale-mcp.singing-bridge.workers.dev/openapi.json`
3. **Authentication:** API Key · **Auth Type: Bearer** · paste the `API_KEY`.
4. Save. Ask the GPT to write then read a document to confirm the round-trip.

## Manage the API key

```bash
# rotate / set the REST bearer key
printf '%s' "<new-key>" | npx wrangler secret put API_KEY
```

## Tools

| Tool | Args | Does |
|---|---|---|
| `list_content` | `collection` | List document ids in a collection |
| `read_content` | `collection`, `id` | Read one document (JSON) |
| `write_content` | `collection`, `id`, `data` (JSON string) | Create/replace a document |
| `update_content` | `collection`, `id`, `data` (JSON string) | Merge fields into a document (preferred) |
| `delete_content` | `collection`, `id` | Delete a document |
| `undo_content` | `collection`, `id` | Step a document back one change |
| `presentation_options` | — | Allowed `style`/`design` values, with examples |
| `create_page_variant` | `base`, `id`, `label`, `note?` | Unpublished variant of a page + private preview link |
| `list_page_variants` | `base` | Variants, preview links, section keys, unresolved refs |
| `publish_page_variant` | `id` | Write a variant into its live page (undoable) |

Writes to `pages` and `variants` return presentation `warnings` for any
`style`/`design` value outside the allowlist (the value is ignored).

## Presentation and page variants (0.7.0)

- **Presentation** — sections take an optional `style`, pages an optional
  `design`. The vocabulary lives in `src/presentation.ts` (`PRESENTATION_OPTIONS`)
  and is the single source for rendering, warnings, publish-time sanitising, the
  OpenAPI enums and the `presentation_options` tool. Values become CSS classes
  (`s-<key>-<value>`, `d-<key>-<value>`) styled in `public/styles.css`.
  Documented for assistants in `context/content-model.md`.
- **Section keys** — every write to `pages` gives sections a stable `key`
  (`hero-1`, ...), never changing an existing one.
- **Variants** (`variants` collection, `src/variants.ts`) reference a base page's
  sections by key; copy always comes from the live page. Max 6 per page.
- **Preview** — `GET /preview/{id}/{token}`. Unauthenticated so Julie can open
  it in a browser, but guarded by a server-generated 144-bit token that clients
  cannot set or change; responses (including 404s) are `noindex`, `no-store`,
  `no-referrer`. `robots.txt` also disallows `/preview/` (advisory only). The
  page shows only the variant's label and the already-public copy.
- **Motion** — progressive enhancement: hidden start states apply only under
  `html.js`, which an inline `<head>` guard removes after 2.5 s if `app.js` has
  not started. Reduced motion is honoured throughout.

## Composition and ornament (0.9.0)

- **Decoration** (`field`, `ornament`, `ghost`, `edge`) is rendered by
  `renderDecorations()` in `src/render.ts` into one aria-hidden `.s-deco` layer
  per section, from allowlisted values and static SVG only. Field opacity is
  capped by the section's ground so text contrast stays at least 4.5:1
  (`test/contrast.test.ts` computes every case from the colour tokens).
- **Collage**: `images` (2–4) on feature/showcase/statement, resolved in the same
  single asset query as everything else and consent-gated.
- **Heading markup**: `headline()` escapes first, then allows only `|` (line
  break) and `*word*` (display italic); `plainHeadline()` strips it.
- **Phones**: `style.phone.focus` / `style.phone.crop` only.

## Landing pages (Sprint 15)

Landing HTML/CSS is sanitised on every render by `src/sanitize.ts` (allowlist, scoped CSS, no URLs in CSS, namespaced ids) and served with a strict CSP; the rules for authors live in `context/content-model.md` ("Landing pages").

## Media import (0.10.0)

`POST /api/media/import` (ChatGPT `openaiFileIdRefs` or `urls`) and MCP
`import_media_from_url` copy each file's original into R2 (`masters/…`, private;
served only with a 15-minute HMAC signature derived from `API_KEY`), keep audio as
the playable file (`imports/…`, served only while the asset's consent allows),
and hand video to Cloudflare Stream (`STREAM_TOKEN`, `CF_ACCOUNT_ID`) from the
signed master URL. `POST /api/media/refresh/{id}` / `refresh_media_asset` pulls
Stream's details. Old Stream videos listed in an asset's `previous_files` are not
deleted automatically: remove them in the Stream dashboard when no longer needed.

## Tests

```bash
npm test            # Vitest: presentation, variants, renderer goldens, routes, docs
npm run typecheck
```

D1 is simulated with Node's built-in SQLite using `schema.sql`. Golden files in
`test/fixtures/*.golden.html` pin the output of pages with no presentation; only
regenerate them (`CAPTURE_GOLDEN=1 npx vitest run test/capture-golden.test.ts`)
for an intentional change to unstyled rendering.

## Deploy

From `mcp/` (bindings are already in `wrangler.jsonc`: D1 `juliebale`, R2
`juliebale-media`):

```bash
npm install
npx wrangler login                                  # interactive, once
printf '%s' "<key>" | npx wrangler secret put API_KEY        # required
printf '%s' "<token>" | npx wrangler secret put STREAM_TOKEN # video
npm test && npx wrangler deploy
```

After a schema change, apply it with `npx wrangler d1 execute juliebale --remote
--file schema.sql` (statements are `IF NOT EXISTS`; column additions are run as
one-off `ALTER TABLE`s and recorded in CHANGES.md). After changing
`context/content-model.md`, update the D1 copy (`context/content-model`) too.

`wrangler deploy` prints the public URL (`https://juliebale-mcp.<subdomain>.workers.dev`):
Streamable HTTP MCP at `<url>/mcp`, SSE at `<url>/sse`, OpenAPI at
`<url>/openapi.json` (re-import it in the Custom GPT after any version change).

## Test it

```bash
npm test          # unit and route tests (Node SQLite stands in for D1)
npx wrangler dev --local --port 8799   # with API_KEY in .dev.vars
```

For MCP, `npx @modelcontextprotocol/inspector` against `<url>/mcp` with the
bearer key.
