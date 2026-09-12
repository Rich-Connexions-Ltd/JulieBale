import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Julie Bale — content backbone.
 *
 * One Cloudflare Worker, backed by D1, serving two front doors over the same
 * store, plus a feature-request round-trip:
 *   - REST (/api/...)   for a ChatGPT Custom GPT Action on Plus (Julie).
 *   - MCP  (/mcp,/sse)  for MCP clients (Enterprise ChatGPT, Claude, RCNX).
 *
 * Content is a generic document store (collection + id + JSON), every change is
 * versioned (so edits are reversible), and chat can raise feature/element
 * requests for the dev side. Typed event/date tables and the server-rendered
 * site come next (see ../ARCHITECTURE.md, ../SPRINTS.md).
 */

interface Env {
  DB: D1Database;
  MCP_OBJECT: DurableObjectNamespace;
  API_KEY?: string;
}

const now = () => new Date().toISOString();
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });

/* --------------------------- D1 content helpers --------------------------- */

async function readDoc(env: Env, collection: string, id: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT data FROM documents WHERE collection=? AND id=?")
    .bind(collection, id)
    .first<{ data: string }>();
  return row ? row.data : null;
}

async function listDocs(env: Env, collection: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT id FROM documents WHERE collection=? ORDER BY id"
  )
    .bind(collection)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

async function snapshot(env: Env, collection: string, id: string, prev: string | null, op: string) {
  await env.DB.prepare(
    "INSERT INTO versions (collection, doc_id, data, op, at) VALUES (?,?,?,?,?)"
  )
    .bind(collection, id, prev, op, now())
    .run();
}

async function writeDoc(env: Env, collection: string, id: string, data: string, status = "published") {
  const prev = await readDoc(env, collection, id);
  await snapshot(env, collection, id, prev, "write");
  await env.DB.prepare(
    "INSERT INTO documents (collection, id, data, status, updated_at) VALUES (?,?,?,?,?) " +
      "ON CONFLICT(collection, id) DO UPDATE SET data=excluded.data, status=excluded.status, updated_at=excluded.updated_at"
  )
    .bind(collection, id, data, status, now())
    .run();
  return { created: prev === null };
}

async function deleteDoc(env: Env, collection: string, id: string): Promise<boolean> {
  const prev = await readDoc(env, collection, id);
  if (prev === null) return false;
  await snapshot(env, collection, id, prev, "delete");
  await env.DB.prepare("DELETE FROM documents WHERE collection=? AND id=?").bind(collection, id).run();
  return true;
}

async function revertDoc(env: Env, collection: string, id: string) {
  const v = await env.DB.prepare(
    "SELECT data FROM versions WHERE collection=? AND doc_id=? ORDER BY id DESC LIMIT 1"
  )
    .bind(collection, id)
    .first<{ data: string | null }>();
  if (!v) return { ok: false, error: "no version history for this document" };
  const cur = await readDoc(env, collection, id);
  await snapshot(env, collection, id, cur, "revert");
  if (v.data === null) {
    await env.DB.prepare("DELETE FROM documents WHERE collection=? AND id=?").bind(collection, id).run();
    return { ok: true, restored: `${collection}/${id} removed (previous state was none)` };
  }
  await env.DB.prepare(
    "INSERT INTO documents (collection, id, data, status, updated_at) VALUES (?,?,?,?,?) " +
      "ON CONFLICT(collection, id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at"
  )
    .bind(collection, id, v.data, "published", now())
    .run();
  return { ok: true, restored: `${collection}/${id}` };
}

/* --------------------------- Feature requests ----------------------------- */

async function createFeatureRequest(
  env: Env,
  r: { kind?: string; title: string; detail?: string; context?: string }
) {
  const res = await env.DB.prepare(
    "INSERT INTO feature_requests (kind, title, detail, context, status, created_at, updated_at) " +
      "VALUES (?,?,?,?, 'open', ?, ?)"
  )
    .bind(r.kind || "feature", r.title, r.detail ?? null, r.context ?? null, now(), now())
    .run();
  return res.meta.last_row_id;
}

async function listFeatureRequests(env: Env, status?: string) {
  const stmt = status
    ? env.DB.prepare("SELECT * FROM feature_requests WHERE status=? ORDER BY id DESC").bind(status)
    : env.DB.prepare("SELECT * FROM feature_requests ORDER BY id DESC");
  const { results } = await stmt.all();
  return results;
}

/* ------------------------------ MCP adapter ------------------------------- */

export class ContentMCP extends McpAgent<Env> {
  server = new McpServer({ name: "juliebale-content", version: "0.3.0" });

  async init() {
    this.server.tool(
      "list_content",
      "List the document ids in a collection (e.g. 'pages', 'posts', 'events').",
      { collection: z.string() },
      async ({ collection }) => {
        const ids = await listDocs(this.env, collection);
        return { content: [{ type: "text", text: ids.length ? ids.join("\n") : `(collection '${collection}' is empty)` }] };
      }
    );

    this.server.tool(
      "read_content",
      "Read one document by collection and id. Returns its stored JSON, or a not-found note.",
      { collection: z.string(), id: z.string() },
      async ({ collection, id }) => {
        const v = await readDoc(this.env, collection, id);
        return { content: [{ type: "text", text: v ?? `(no document at ${collection}/${id})` }] };
      }
    );

    this.server.tool(
      "write_content",
      "Create or replace a document. `data` must be a JSON string. The previous state is kept for undo.",
      { collection: z.string(), id: z.string(), data: z.string() },
      async ({ collection, id, data }) => {
        try {
          JSON.parse(data);
        } catch {
          return { content: [{ type: "text", text: "Error: `data` must be valid JSON." }], isError: true };
        }
        const { created } = await writeDoc(this.env, collection, id, data);
        return { content: [{ type: "text", text: `${created ? "Created" : "Updated"} ${collection}/${id}.` }] };
      }
    );

    this.server.tool(
      "delete_content",
      "Delete a document. The previous state is kept for undo.",
      { collection: z.string(), id: z.string() },
      async ({ collection, id }) => {
        const ok = await deleteDoc(this.env, collection, id);
        return { content: [{ type: "text", text: ok ? `Deleted ${collection}/${id}.` : `(nothing at ${collection}/${id})` }] };
      }
    );

    this.server.tool(
      "undo_content",
      "Revert a document to its previous version (undo the last change to it).",
      { collection: z.string(), id: z.string() },
      async ({ collection, id }) => {
        const r = await revertDoc(this.env, collection, id);
        return { content: [{ type: "text", text: r.ok ? `Reverted: ${r.restored}` : `Could not revert: ${r.error}` }] };
      }
    );

    this.server.tool(
      "request_feature",
      "Raise a request to the dev team for something the site can't do yet (a new feature, page element, layout, or content type). Use when Julie asks for something not yet supported.",
      {
        title: z.string().describe("Short summary of what's wanted"),
        detail: z.string().optional().describe("What it should do / look like"),
        context: z.string().optional().describe("Where on the site, e.g. 'about page'"),
        kind: z.enum(["feature", "element", "content", "bug"]).optional(),
      },
      async ({ title, detail, context, kind }) => {
        const id = await createFeatureRequest(this.env, { title, detail, context, kind });
        return { content: [{ type: "text", text: `Logged request #${id}: ${title}. The dev team will pick this up.` }] };
      }
    );

    this.server.tool(
      "list_feature_requests",
      "List feature/element requests and their status.",
      { status: z.enum(["open", "planned", "done", "declined"]).optional() },
      async ({ status }) => {
        const rows = await listFeatureRequests(this.env, status);
        return { content: [{ type: "text", text: rows.length ? JSON.stringify(rows, null, 2) : "(no requests)" }] };
      }
    );
  }
}

/* ------------------------------ REST adapter ------------------------------ */

async function handleApi(request: Request, env: Env, pathname: string): Promise<Response> {
  if (env.API_KEY) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${env.API_KEY}`) return json({ error: "unauthorized" }, 401);
  }

  const parts = pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = request.method.toUpperCase();

  // Feature requests: /api/feature-requests
  if (parts[0] === "feature-requests" && parts.length === 1) {
    if (method === "GET") {
      const status = new URL(request.url).searchParams.get("status") || undefined;
      return json({ requests: await listFeatureRequests(env, status) });
    }
    if (method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      if (!body.title) return json({ error: "title is required" }, 400);
      const id = await createFeatureRequest(env, body);
      return json({ ok: true, id });
    }
    return json({ error: "method not allowed" }, 405);
  }

  // Undo: /api/undo/{collection}/{id}
  if (parts[0] === "undo" && parts.length === 3) {
    if (method !== "POST") return json({ error: "method not allowed" }, 405);
    return json(await revertDoc(env, parts[1], parts[2]));
  }

  // Content: /api/{collection}
  if (parts.length === 1) {
    const collection = parts[0];
    if (method === "GET") return json({ collection, ids: await listDocs(env, collection) });
    return json({ error: "method not allowed" }, 405);
  }

  // Content: /api/{collection}/{id}
  if (parts.length === 2) {
    const [collection, id] = parts;
    if (method === "GET") {
      const v = await readDoc(env, collection, id);
      if (v === null) return json({ error: "not found" }, 404);
      return new Response(v, { headers: { "content-type": "application/json" } });
    }
    if (method === "PUT" || method === "POST") {
      const body = await request.text();
      try {
        JSON.parse(body);
      } catch {
        return json({ error: "request body must be valid JSON" }, 400);
      }
      const { created } = await writeDoc(env, collection, id, body);
      return json({ ok: true, saved: `${collection}/${id}`, created });
    }
    if (method === "DELETE") {
      const ok = await deleteDoc(env, collection, id);
      return json({ ok, deleted: ok ? `${collection}/${id}` : null });
    }
    return json({ error: "method not allowed" }, 405);
  }

  return json({ error: "not found" }, 404);
}

/* -------------------------------- OpenAPI --------------------------------- */

function openApiSchema(origin: string) {
  const collectionParam = { name: "collection", in: "path", required: true, description: "Collection name, e.g. 'pages'", schema: { type: "string" } };
  const idParam = { name: "id", in: "path", required: true, description: "Document id / slug, e.g. 'home'", schema: { type: "string" } };
  const docContent = { "application/json": { schema: { $ref: "#/components/schemas/ContentDocument" } } };

  return {
    openapi: "3.1.0",
    info: {
      title: "Julie Bale content API",
      description: "Read and write Julie Bale's website content, undo changes, and raise feature requests. Documents are JSON stored by collection and id.",
      version: "0.3.0",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/{collection}": {
        get: { operationId: "listContent", summary: "List document ids in a collection", parameters: [collectionParam], responses: { "200": { description: "The ids", content: { "application/json": { schema: { $ref: "#/components/schemas/IdList" } } } } } },
      },
      "/api/{collection}/{id}": {
        get: { operationId: "readContent", summary: "Read one document", parameters: [collectionParam, idParam], responses: { "200": { description: "The document", content: docContent }, "404": { description: "Not found" } } },
        put: { operationId: "writeContent", summary: "Create or replace a document (previous state kept for undo)", parameters: [collectionParam, idParam], requestBody: { required: true, content: docContent }, responses: { "200": { description: "Saved", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } } } },
        delete: { operationId: "deleteContent", summary: "Delete a document (previous state kept for undo)", parameters: [collectionParam, idParam], responses: { "200": { description: "Deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } } } },
      },
      "/api/undo/{collection}/{id}": {
        post: { operationId: "undoContent", summary: "Revert a document to its previous version", parameters: [collectionParam, idParam], responses: { "200": { description: "Reverted", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } } } },
      },
      "/api/feature-requests": {
        get: { operationId: "listFeatureRequests", summary: "List feature/element requests", parameters: [{ name: "status", in: "query", required: false, schema: { type: "string" } }], responses: { "200": { description: "Requests", content: { "application/json": { schema: { $ref: "#/components/schemas/FeatureRequestList" } } } } } },
        post: {
          operationId: "createFeatureRequest",
          summary: "Raise a request for a new feature, page element, layout or content type the site can't do yet",
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/FeatureRequest" } } } },
          responses: { "200": { description: "Logged", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } } },
        },
      },
    },
    components: {
      schemas: {
        ContentDocument: { type: "object", description: "A content document. Any JSON fields are allowed.", properties: { title: { type: "string", description: "Optional title" } }, additionalProperties: true },
        IdList: { type: "object", properties: { collection: { type: "string" }, ids: { type: "array", items: { type: "string" } } } },
        WriteResult: { type: "object", properties: { ok: { type: "boolean" }, saved: { type: "string" }, deleted: { type: "string" }, id: { type: "integer" }, restored: { type: "string" } } },
        FeatureRequest: { type: "object", required: ["title"], properties: { title: { type: "string" }, detail: { type: "string" }, context: { type: "string" }, kind: { type: "string", enum: ["feature", "element", "content", "bug"] } } },
        FeatureRequestList: { type: "object", properties: { requests: { type: "array", items: { $ref: "#/components/schemas/FeatureRequest" } } } },
      },
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    },
    security: [{ bearerAuth: [] }],
  };
}

/* -------------------------------- Router ---------------------------------- */

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/openapi.json") return json(openApiSchema(url.origin));
    if (pathname.startsWith("/api")) return handleApi(request, env, pathname);
    if (pathname === "/mcp") return ContentMCP.serve("/mcp").fetch(request, env, ctx);
    if (pathname === "/sse" || pathname === "/sse/message") return ContentMCP.serveSSE("/sse").fetch(request, env, ctx);
    if (pathname === "/") {
      return new Response(
        "Julie Bale content backbone.\n" +
          "REST:     /api/{collection}/{id} (GET/PUT/DELETE), /api/undo/{collection}/{id}, /api/feature-requests\n" +
          "OpenAPI:  /openapi.json\n" +
          "MCP:      /mcp, /sse\n",
        { headers: { "content-type": "text/plain" } }
      );
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
