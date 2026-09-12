# Julie Bale — content MCP (test surface)

A minimal remote **MCP server on Cloudflare Workers** to validate the read/write
round-trip before we build the real thing. Storage is **KV** (throwaway); the
real build moves to **D1** (see [`../ARCHITECTURE.md`](../ARCHITECTURE.md)).

> **TEST surface.** The REST API is protected by a bearer API key (the `API_KEY`
> Worker secret). The MCP endpoints are still authless (test only). Storage is
> throwaway KV. Do not put real or sensitive content here yet.

## Two front doors (same KV store)

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
| `delete_content` | `collection`, `id` | Delete a document |

## Deploy (one-time)

From `mcp/`:

```bash
npm install

# Authenticate wrangler to the Cloudflare account (interactive, in your terminal):
#   npx wrangler login

# Create the KV namespace and copy the id into wrangler.jsonc (CONTENT binding):
npx wrangler kv namespace create CONTENT

# Deploy:
npx wrangler deploy
```

`wrangler deploy` prints the public URL, e.g.
`https://juliebale-mcp.<subdomain>.workers.dev`.

- **Streamable HTTP endpoint:** `<url>/mcp`
- **SSE endpoint:** `<url>/sse`

## Test it

**Fastest — MCP Inspector** (no ChatGPT/Claude needed):

```bash
npx @modelcontextprotocol/inspector
```

Connect to `<url>/mcp` (Streamable HTTP), list tools, then call
`write_content` then `read_content`.

**Claude** (reliable custom-connector client): Settings -> Connectors -> add a
custom connector with the `<url>/mcp` URL, then ask it to write and read a
document.

**ChatGPT** (Plus caveat): Settings -> Connectors / developer mode -> add the
same URL. This is also the empirical check for whether Plus allows a
write-capable custom connector (see ARCHITECTURE.md section 6).

## Next

- Swap KV for D1 with a real `pages` schema (Sprint 1).
- Add auth (OAuth via `@cloudflare/workers-oauth-provider`) before production.
- Replace generic tools with typed content tools (pages/posts/events/…).
