# Julie Bale — content MCP (test surface)

A minimal remote **MCP server on Cloudflare Workers** to validate the read/write
round-trip before we build the real thing. Storage is **KV** (throwaway); the
real build moves to **D1** (see [`../ARCHITECTURE.md`](../ARCHITECTURE.md)).

> **TEST ONLY — no authentication yet.** Anyone with the URL can read and write.
> Do not put real or sensitive content here. OAuth/token auth comes before any
> production use.

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
