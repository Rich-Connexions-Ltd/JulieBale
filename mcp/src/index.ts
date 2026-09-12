import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Julie Bale — content server (test surface).
 *
 * One store, two front doors over the same Cloudflare KV:
 *   - MCP  (/mcp, /sse)  — for MCP clients (Enterprise ChatGPT, Claude, RCNX).
 *   - REST (/api/...)    — for a ChatGPT Custom GPT Action on Plus (Julie).
 *
 * REST is protected by a bearer API key (the API_KEY secret). MCP is currently
 * authless (test only). Storage is KV for speed; the real build moves to D1.
 * See ARCHITECTURE.md / SPRINTS.md.
 */

interface Env {
  CONTENT: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace;
  API_KEY?: string;
}

const key = (collection: string, id: string) => `${collection}:${id}`;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });

/* ----------------------------- MCP adapter ----------------------------- */

export class ContentMCP extends McpAgent<Env> {
  server = new McpServer({ name: "juliebale-content", version: "0.2.0" });

  async init() {
    this.server.tool(
      "list_content",
      "List the document ids in a collection (e.g. 'pages', 'posts', 'events').",
      { collection: z.string().describe("Collection name, e.g. 'pages'") },
      async ({ collection }) => {
        const list = await this.env.CONTENT.list({ prefix: `${collection}:` });
        const ids = list.keys.map((k) => k.name.slice(collection.length + 1));
        return {
          content: [
            {
              type: "text",
              text: ids.length ? ids.join("\n") : `(collection '${collection}' is empty)`,
            },
          ],
        };
      }
    );

    this.server.tool(
      "read_content",
      "Read one document by collection and id. Returns its stored JSON, or a not-found note.",
      {
        collection: z.string().describe("Collection name, e.g. 'pages'"),
        id: z.string().describe("Document id / slug, e.g. 'home'"),
      },
      async ({ collection, id }) => {
        const value = await this.env.CONTENT.get(key(collection, id));
        return {
          content: [{ type: "text", text: value ?? `(no document at ${collection}/${id})` }],
        };
      }
    );

    this.server.tool(
      "write_content",
      "Create or replace a document. `data` must be a JSON string; it is stored verbatim.",
      {
        collection: z.string().describe("Collection name, e.g. 'pages'"),
        id: z.string().describe("Document id / slug, e.g. 'home'"),
        data: z.string().describe("The document as a JSON string, e.g. '{\"title\":\"Home\"}'"),
      },
      async ({ collection, id, data }) => {
        try {
          JSON.parse(data);
        } catch {
          return {
            content: [{ type: "text", text: "Error: `data` must be valid JSON." }],
            isError: true,
          };
        }
        await this.env.CONTENT.put(key(collection, id), data);
        return { content: [{ type: "text", text: `Saved ${collection}/${id}.` }] };
      }
    );

    this.server.tool(
      "delete_content",
      "Delete a document by collection and id.",
      {
        collection: z.string().describe("Collection name"),
        id: z.string().describe("Document id / slug"),
      },
      async ({ collection, id }) => {
        await this.env.CONTENT.delete(key(collection, id));
        return { content: [{ type: "text", text: `Deleted ${collection}/${id}.` }] };
      }
    );
  }
}

/* ----------------------------- REST adapter ---------------------------- */

async function handleApi(request: Request, env: Env, pathname: string): Promise<Response> {
  // Bearer auth (enforced when API_KEY is configured)
  if (env.API_KEY) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${env.API_KEY}`) return json({ error: "unauthorized" }, 401);
  }

  const parts = pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = request.method.toUpperCase();

  // /api/{collection}  -> list
  if (parts.length === 1) {
    const collection = parts[0];
    if (method === "GET") {
      const list = await env.CONTENT.list({ prefix: `${collection}:` });
      const ids = list.keys.map((k) => k.name.slice(collection.length + 1));
      return json({ collection, ids });
    }
    return json({ error: "method not allowed" }, 405);
  }

  // /api/{collection}/{id}  -> read / write / delete
  if (parts.length === 2) {
    const [collection, id] = parts;
    const k = key(collection, id);

    if (method === "GET") {
      const value = await env.CONTENT.get(k);
      if (value === null) return json({ error: "not found" }, 404);
      return new Response(value, { headers: { "content-type": "application/json" } });
    }
    if (method === "PUT" || method === "POST") {
      const body = await request.text();
      try {
        JSON.parse(body);
      } catch {
        return json({ error: "request body must be valid JSON" }, 400);
      }
      await env.CONTENT.put(k, body);
      return json({ ok: true, saved: `${collection}/${id}` });
    }
    if (method === "DELETE") {
      await env.CONTENT.delete(k);
      return json({ ok: true, deleted: `${collection}/${id}` });
    }
    return json({ error: "method not allowed" }, 405);
  }

  return json({ error: "not found" }, 404);
}

/* ----------------------------- OpenAPI --------------------------------- */

function openApiSchema(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Julie Bale content API",
      description:
        "Read and write Julie Bale's website content (pages, posts, events, courses, dates). Documents are JSON stored by collection and id.",
      version: "0.2.0",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/{collection}": {
        get: {
          operationId: "listContent",
          summary: "List document ids in a collection",
          parameters: [
            {
              name: "collection",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Collection name, e.g. 'pages'",
            },
          ],
          responses: { "200": { description: "The ids in the collection" } },
        },
      },
      "/api/{collection}/{id}": {
        get: {
          operationId: "readContent",
          summary: "Read one document",
          parameters: [
            { name: "collection", in: "path", required: true, schema: { type: "string" } },
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "The document JSON" }, "404": { description: "Not found" } },
        },
        put: {
          operationId: "writeContent",
          summary: "Create or replace a document",
          parameters: [
            { name: "collection", in: "path", required: true, schema: { type: "string" } },
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", description: "The document to store" },
              },
            },
          },
          responses: { "200": { description: "Saved" } },
        },
        delete: {
          operationId: "deleteContent",
          summary: "Delete a document",
          parameters: [
            { name: "collection", in: "path", required: true, schema: { type: "string" } },
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "Deleted" } },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
    security: [{ bearerAuth: [] }],
  };
}

/* ------------------------------ Router --------------------------------- */

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/openapi.json") return json(openApiSchema(url.origin));
    if (pathname.startsWith("/api")) return handleApi(request, env, pathname);
    if (pathname === "/mcp") return ContentMCP.serve("/mcp").fetch(request, env, ctx);
    if (pathname === "/sse" || pathname === "/sse/message")
      return ContentMCP.serveSSE("/sse").fetch(request, env, ctx);
    if (pathname === "/") {
      return new Response(
        "Julie Bale content server (test).\n" +
          "REST:     /api/{collection}/{id}  (GET/PUT/DELETE, Bearer auth)\n" +
          "OpenAPI:  /openapi.json  (import into a ChatGPT Custom GPT Action)\n" +
          "MCP:      /mcp (Streamable HTTP), /sse (SSE)\n",
        { headers: { "content-type": "text/plain" } }
      );
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
