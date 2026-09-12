import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Julie Bale — minimal content MCP server (test surface).
 *
 * A generic read/write store over Cloudflare KV, exposed as MCP tools so we can
 * validate the end-to-end round-trip (connector auth -> read -> write) from the
 * MCP Inspector, Claude or ChatGPT. Storage is KV for speed; the real build
 * moves to D1 (see ARCHITECTURE.md / SPRINTS.md). No auth yet — TEST ONLY.
 */

interface Env {
  CONTENT: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace;
}

const key = (collection: string, id: string) => `${collection}:${id}`;

export class ContentMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "juliebale-content",
    version: "0.1.0",
  });

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
              text: ids.length
                ? ids.join("\n")
                : `(collection '${collection}' is empty)`,
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
          content: [
            {
              type: "text",
              text: value ?? `(no document at ${collection}/${id})`,
            },
          ],
        };
      }
    );

    this.server.tool(
      "write_content",
      "Create or replace a document. `data` must be a JSON string; it is stored verbatim.",
      {
        collection: z.string().describe("Collection name, e.g. 'pages'"),
        id: z.string().describe("Document id / slug, e.g. 'home'"),
        data: z
          .string()
          .describe("The document as a JSON string, e.g. '{\"title\":\"Home\"}'"),
      },
      async ({ collection, id, data }) => {
        try {
          JSON.parse(data);
        } catch {
          return {
            content: [
              { type: "text", text: "Error: `data` must be valid JSON." },
            ],
            isError: true,
          };
        }
        await this.env.CONTENT.put(key(collection, id), data);
        return {
          content: [{ type: "text", text: `Saved ${collection}/${id}.` }],
        };
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
        return {
          content: [{ type: "text", text: `Deleted ${collection}/${id}.` }],
        };
      }
    );
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const { pathname } = new URL(request.url);
    if (pathname === "/mcp") {
      return ContentMCP.serve("/mcp").fetch(request, env, ctx);
    }
    if (pathname === "/sse" || pathname === "/sse/message") {
      return ContentMCP.serveSSE("/sse").fetch(request, env, ctx);
    }
    if (pathname === "/") {
      return new Response(
        "Julie Bale content MCP (test). Endpoints: /mcp (Streamable HTTP), /sse (SSE).",
        { headers: { "content-type": "text/plain" } }
      );
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
