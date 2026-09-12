import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { renderPage, render404, pageFromDoc, renderLanding } from "./render";
import { renderEditorPage, editorResource } from "./editor";
import { renderUploadPage } from "./admin";

// Base URL used to build MCP-UI editor links. Update at custom-domain cutover.
const SITE_BASE = "https://juliebale-mcp.singing-bridge.workers.dev";

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
  MEDIA: R2Bucket;
  MCP_OBJECT: DurableObjectNamespace;
  API_KEY?: string;
  STREAM_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
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

// Merge fields into an existing document (never strips fields you don't send).
async function mergeDoc(env: Env, collection: string, id: string, patch: Record<string, unknown>) {
  const prevStr = await readDoc(env, collection, id);
  const prev = prevStr ? JSON.parse(prevStr) : {};
  const merged = { ...prev, ...patch };
  await writeDoc(env, collection, id, JSON.stringify(merged));
  return { existed: prevStr !== null };
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

function slugify(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

// Promote a calendar date into a full event (own page), then remove the date.
async function convertDateToEvent(env: Env, dateId: string, eventId?: string) {
  const raw = await readDoc(env, "dates", dateId);
  if (!raw) return { ok: false, error: `no date at dates/${dateId}` };
  const date = JSON.parse(raw);
  let base = eventId || slugify(date.title || dateId) || dateId;
  let finalId = base, n = 2;
  while (await readDoc(env, "events", finalId)) { finalId = `${base}-${n}`; n++; }
  const event = {
    title: date.title || "Untitled event",
    starts_at: date.date || "",
    ends_at: "",
    location: "",
    description: date.note || "",
    images: [] as string[],
    links: date.link ? [{ label: "Details", href: date.link }] : [],
    details: "",
    availability: "open",
    status: "published",
  };
  await writeDoc(env, "events", finalId, JSON.stringify(event));
  await deleteDoc(env, "dates", dateId);
  return { ok: true, event: `events/${finalId}`, url: `/events/${finalId}`, removedDate: `dates/${dateId}` };
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
  server = new McpServer({ name: "juliebale-content", version: "0.6.0" });

  async init() {
    this.server.tool(
      "list_content",
      "List the ids of documents in a collection. WHEN: use first to discover what already exists before creating or editing (e.g. list 'pages' for every page slug, 'events' for existing events). Does NOT return the documents themselves, follow up with read_content. Collections: pages, posts, events, courses, dates, landing, site, context.",
      { collection: z.string() },
      async ({ collection }) => {
        const ids = await listDocs(this.env, collection);
        return { content: [{ type: "text", text: ids.length ? ids.join("\n") : `(collection '${collection}' is empty)` }] };
      }
    );

    this.server.tool(
      "read_content",
      "Read one document and return its full JSON. WHEN: ALWAYS read a document before you change it, so you edit from its real current state and keep the fields you are not changing. Also read Julie's context first (collection 'context', ids: voice, brand, offers, content-model) before writing any copy. Returns a not-found note if it does not exist.",
      { collection: z.string(), id: z.string() },
      async ({ collection, id }) => {
        const v = await readDoc(this.env, collection, id);
        return { content: [{ type: "text", text: v ?? `(no document at ${collection}/${id})` }] };
      }
    );

    this.server.tool(
      "write_content",
      "REPLACE an entire document with exactly the JSON you send. WARNING: any field you leave out is DELETED. WHEN: only to create a brand-new document, or to deliberately rewrite one in full (then include EVERY field). DO NOT use this to change or add a single field on an existing document, it will wipe the rest, use update_content instead. Previous state is kept for undo, but prefer update_content.",
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
      "update_content",
      "PREFERRED WAY TO EDIT. Merge one or more fields into an existing document, keeping every field you do not mention. WHEN: almost all edits, such as changing a page's copy, an event's description or date, or a price. `data` is a JSON string of ONLY the fields to change (for example, just the description field). Safe: omitted fields are untouched and the previous state is kept for undo. DO NOT paste the whole document here unless you intend to. Descriptive text fields (body, description, details, excerpt) support Markdown, so write them in Markdown (headings, bold, lists, links).",
      { collection: z.string(), id: z.string(), data: z.string() },
      async ({ collection, id, data }) => {
        let patch: Record<string, unknown>;
        try {
          patch = JSON.parse(data);
        } catch {
          return { content: [{ type: "text", text: "Error: `data` must be valid JSON." }], isError: true };
        }
        const { existed } = await mergeDoc(this.env, collection, id, patch);
        return { content: [{ type: "text", text: `${existed ? "Updated" : "Created"} ${collection}/${id} (merged ${Object.keys(patch).length} field(s)).` }] };
      }
    );

    this.server.tool(
      "delete_content",
      "Permanently remove a document (previous state kept, so it is undoable). WHEN: only when something should genuinely no longer exist, and confirm with Julie first for pages or anything client-facing. DO NOT use delete to clear a single field or empty a value, use update_content to set that field instead.",
      { collection: z.string(), id: z.string() },
      async ({ collection, id }) => {
        const ok = await deleteDoc(this.env, collection, id);
        return { content: [{ type: "text", text: ok ? `Deleted ${collection}/${id}.` : `(nothing at ${collection}/${id})` }] };
      }
    );

    this.server.tool(
      "undo_content",
      "Revert a document to its state before the last change (step back one edit). WHEN: Julie says undo that or put it back, or a change went wrong. Each call steps back one more change, so call again to go further. Tell Julie what was restored.",
      { collection: z.string(), id: z.string() },
      async ({ collection, id }) => {
        const r = await revertDoc(this.env, collection, id);
        return { content: [{ type: "text", text: r.ok ? `Reverted: ${r.restored}` : `Could not revert: ${r.error}` }] };
      }
    );

    this.server.tool(
      "request_feature",
      "Log a request to the developer team for something the website cannot do yet: a new kind of section/block, a new layout, a new content type, or a bug. WHEN: use this INSTEAD of improvising a workaround that breaks the design or content model, whenever Julie wants something the existing block types cannot express. Give a clear title, what it should do and look like (detail) and where on the site (context). Then tell Julie it is logged and offer the closest thing possible now. DO NOT use for ordinary content edits you can already make.",
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
      "List logged feature/element requests and their status (open, planned, done, declined). WHEN: check what has already been requested before logging a new one, or when Julie asks what is outstanding. Optionally filter by status.",
      { status: z.enum(["open", "planned", "done", "declined"]).optional() },
      async ({ status }) => {
        const rows = await listFeatureRequests(this.env, status);
        return { content: [{ type: "text", text: rows.length ? JSON.stringify(rows, null, 2) : "(no requests)" }] };
      }
    );

    // Interactive editors (MCP-UI). Rendered as a form widget in hosts that
    // support interactive UI (e.g. Claude). Saving posts an update_content call.
    const editor = (collection: string, label: string) =>
      this.server.tool(
        `edit_${label}`,
        `Open an interactive editor (a form widget) to visually edit a ${label} by hand instead of dictating each change. WHEN: the person wants to see and edit the ${label}'s fields directly. Saving from the widget updates the ${label} (a merge, so nothing else is lost). Requires a host that supports interactive MCP UI, such as Claude; in a plain text client it will just show a link. Pass the ${label} id (use list_content on '${collection}' if unsure).`,
        { id: z.string() },
        async ({ id }) => ({ content: [editorResource(SITE_BASE, collection, id)] })
      );
    editor("events", "event");
    editor("dates", "date");
    editor("posts", "post");
    editor("courses", "course");

    this.server.tool(
      "convert_date_to_event",
      "Promote a simple calendar date into a full event that has its own page (description, location, running order, availability, images). WHEN: a date in the 'dates' collection has grown into a proper event people should be able to open, not just a line in the calendar. It creates an event from the date's title and date, then removes the date (both are kept for undo). Pass the date id; optionally an event id/slug. After converting, edit the new event to add its description, location and details.",
      { id: z.string(), eventId: z.string().optional() },
      async ({ id, eventId }) => {
        const r = await convertDateToEvent(this.env, id, eventId);
        return {
          content: [
            { type: "text", text: r.ok ? `Converted dates/${id} into ${r.event}. Now edit that event to add its description, location and details.` : `Could not convert: ${r.error}` },
          ],
        };
      }
    );
  }
}

/* ------------------------------ REST adapter ------------------------------ */

// Accept a { data: "<json string>" } wrapper (how a ChatGPT Action reliably
// sends arbitrary content) OR a raw JSON object body (direct API use).
async function parseBody(request: Request): Promise<{ jsonString: string; object: any } | { error: string }> {
  const text = await request.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "request body must be valid JSON" };
  }
  if (parsed && typeof parsed === "object" && typeof parsed.data === "string") {
    let inner: any;
    try {
      inner = JSON.parse(parsed.data);
    } catch {
      return { error: "`data` must be a JSON string containing the document (or fields to change)" };
    }
    return { jsonString: parsed.data, object: inner };
  }
  return { jsonString: text, object: parsed };
}

async function handleApi(request: Request, env: Env, pathname: string): Promise<Response> {
  if (env.API_KEY) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${env.API_KEY}`) return json({ error: "unauthorized" }, 401);
  }

  const parts = pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = request.method.toUpperCase();

  // List media in R2: GET /api/media
  if (parts[0] === "media" && parts.length === 1 && method === "GET") {
    const list = await env.MEDIA.list({ limit: 1000 });
    return json({ objects: list.objects.map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded })) });
  }

  // Media (audio/images) in R2: /api/media/{key...}
  if (parts[0] === "media" && parts.length >= 2) {
    const key = parts.slice(1).map(decodeURIComponent).join("/");
    if (method === "PUT" || method === "POST") {
      await env.MEDIA.put(key, request.body, {
        httpMetadata: { contentType: request.headers.get("content-type") || "application/octet-stream" },
      });
      return json({ ok: true, key, url: `/media/${key}` });
    }
    if (method === "DELETE") {
      await env.MEDIA.delete(key);
      return json({ ok: true, deleted: key });
    }
    return json({ error: "method not allowed" }, 405);
  }

  // Video: request a one-time Cloudflare Stream upload URL. /api/video/direct-upload
  if (parts[0] === "video" && parts[1] === "direct-upload") {
    if (method !== "POST") return json({ error: "method not allowed" }, 405);
    if (!env.STREAM_TOKEN || !env.CF_ACCOUNT_ID)
      return json({ error: "Cloudflare Stream is not configured. Set the STREAM_TOKEN and CF_ACCOUNT_ID secrets." }, 501);
    const meta = (await request.json().catch(() => ({}))) as any;
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/direct_upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.STREAM_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ maxDurationSeconds: meta.maxDurationSeconds || 3600, requireSignedURLs: false, meta: meta.meta || {} }),
    });
    const j = (await res.json()) as any;
    if (!j.success) return json({ error: "stream error", detail: j.errors }, 502);
    return json({ ok: true, uploadURL: j.result.uploadURL, uid: j.result.uid });
  }

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

  // Convert a date to an event: POST /api/dates/{id}/convert-to-event
  if (parts[0] === "dates" && parts.length === 3 && parts[2] === "convert-to-event") {
    if (method !== "POST") return json({ error: "method not allowed" }, 405);
    const body = (await request.json().catch(() => ({}))) as any;
    const r = await convertDateToEvent(env, decodeURIComponent(parts[1]), body && body.eventId);
    return json(r, r.ok ? 200 : 400);
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
      const parsed = await parseBody(request);
      if ("error" in parsed) return json({ error: parsed.error }, 400);
      const { created } = await writeDoc(env, collection, id, parsed.jsonString);
      return json({ ok: true, saved: `${collection}/${id}`, created });
    }
    if (method === "PATCH") {
      const parsed = await parseBody(request);
      if ("error" in parsed) return json({ error: parsed.error }, 400);
      const { existed } = await mergeDoc(env, collection, id, parsed.object as Record<string, unknown>);
      return json({ ok: true, merged: `${collection}/${id}`, existed });
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
  const bodyContent = { "application/json": { schema: { $ref: "#/components/schemas/ContentBody" } } };

  return {
    openapi: "3.1.0",
    info: {
      title: "Julie Bale content API",
      description: "Read and write Julie Bale's website content, undo changes, and raise feature requests. Documents are JSON stored by collection and id. IMPORTANT: to edit, read the document first, then use updateContent (merge) so you never lose fields; use writeContent only to create or fully rewrite a document.",
      version: "0.6.0",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/{collection}": {
        get: { operationId: "listContent", summary: "List document ids in a collection", description: "Use first to discover what already exists before creating or editing. Returns the ids in a collection; read a specific one with readContent.", parameters: [collectionParam], responses: { "200": { description: "The ids", content: { "application/json": { schema: { $ref: "#/components/schemas/IdList" } } } } } },
      },
      "/api/{collection}/{id}": {
        get: { operationId: "readContent", summary: "Read one document", description: "ALWAYS read a document before changing it, and read the context collection (ids voice, brand, offers, content-model) before writing copy. Returns the full JSON.", parameters: [collectionParam, idParam], responses: { "200": { description: "The document", content: docContent }, "404": { description: "Not found" } } },
        put: { operationId: "writeContent", summary: "Replace a whole document.", description: "REPLACES the entire document with the JSON you send; any field you omit is DELETED. Use only to create a new document or deliberately rewrite one in full (send EVERY field). To change or add a field on an existing document, use updateContent instead, never this.", parameters: [collectionParam, idParam], requestBody: { required: true, content: bodyContent }, responses: { "200": { description: "Saved", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } } } },
        patch: { operationId: "updateContent", summary: "Merge fields into a document (preferred for editing).", description: "PREFERRED for edits. Merges only the fields you send and keeps everything else, so nothing is lost. Send a JSON body of just the fields to change. Use for almost all edits: copy, an event description or date, a price.", parameters: [collectionParam, idParam], requestBody: { required: true, content: bodyContent }, responses: { "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } } } },
        delete: { operationId: "deleteContent", summary: "Delete a document.", description: "Permanently removes a document (undoable). Only when it should genuinely no longer exist; confirm first for pages/client-facing content. To clear a field, use updateContent, not delete.", parameters: [collectionParam, idParam], responses: { "200": { description: "Deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } } } },
      },
      "/api/undo/{collection}/{id}": {
        post: { operationId: "undoContent", summary: "Undo the last change to a document", description: "Reverts a document to its state before the last change. Call again to step further back. Use when asked to undo or put something back.", parameters: [collectionParam, idParam], responses: { "200": { description: "Reverted", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } } } },
      },
      "/api/dates/{id}/convert-to-event": {
        post: { operationId: "convertDateToEvent", summary: "Convert a date into a full event.", description: "Promotes a calendar date into an event with its own page (description, location, details). Creates the event from the date's title and date, then removes the date (both undoable). After converting, edit the event to add its description, location and details.", parameters: [{ name: "id", in: "path", required: true, description: "The date id", schema: { type: "string" } }], responses: { "200": { description: "Converted", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } } } },
      },
      "/api/feature-requests": {
        get: { operationId: "listFeatureRequests", summary: "List feature/element requests", description: "Check what has already been requested before logging a new one, or when asked what is outstanding.", parameters: [{ name: "status", in: "query", required: false, schema: { type: "string" } }], responses: { "200": { description: "Requests", content: { "application/json": { schema: { $ref: "#/components/schemas/FeatureRequestList" } } } } } },
        post: {
          operationId: "createFeatureRequest",
          summary: "Raise a feature/element request.", description: "Log something the site cannot do yet (new block/section, layout, content type, or bug) INSTEAD of improvising a workaround that breaks the design. Include a clear title, what it should do (detail) and where (context).",
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/FeatureRequest" } } } },
          responses: { "200": { description: "Logged", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } } },
        },
      },
    },
    components: {
      schemas: {
        ContentDocument: { type: "object", description: "A content document. Any JSON fields are allowed.", properties: { title: { type: "string", description: "Optional title" } }, additionalProperties: true },
        ContentBody: { type: "object", required: ["data"], properties: { data: { type: "string", description: "The content as a JSON string. For writeContent, the COMPLETE document. For updateContent, ONLY the fields to change. Put every field you want inside this one string, e.g. a JSON object with a description field. This is a string, not an object. Descriptive text fields (body, description, details, excerpt) support Markdown, so use Markdown for headings, bold, lists and links." } } },
        IdList: { type: "object", properties: { collection: { type: "string" }, ids: { type: "array", items: { type: "string" } } } },
        WriteResult: { type: "object", properties: { ok: { type: "boolean" }, saved: { type: "string" }, merged: { type: "string" }, deleted: { type: "string" }, id: { type: "integer" }, restored: { type: "string" }, created: { type: "boolean" }, existed: { type: "boolean" }, event: { type: "string" }, url: { type: "string" }, removedDate: { type: "string" }, error: { type: "string" } } },
        FeatureRequest: { type: "object", required: ["title"], properties: { title: { type: "string" }, detail: { type: "string" }, context: { type: "string" }, kind: { type: "string", enum: ["feature", "element", "content", "bug"] } } },
        FeatureRequestList: { type: "object", properties: { requests: { type: "array", items: { $ref: "#/components/schemas/FeatureRequest" } } } },
      },
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    },
    security: [{ bearerAuth: [] }],
  };
}

/* -------------------------------- Router ---------------------------------- */

const htmlResponse = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

async function handleMediaGet(env: Env, pathname: string): Promise<Response> {
  const key = decodeURIComponent(pathname.replace(/^\/media\/?/, ""));
  if (!key) return new Response("Not found", { status: 404 });
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
}

async function handleEditor(env: Env, pathname: string): Promise<Response> {
  const parts = pathname.replace(/^\/ui\/edit\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length < 2) return new Response("Not found", { status: 404 });
  const [collection, id] = parts;
  const raw = await readDoc(env, collection, id);
  const doc = raw ? JSON.parse(raw) : {};
  return new Response(renderEditorPage(collection, id, doc), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

async function handleSite(env: Env, pathname: string): Promise<Response> {
  const siteRaw = await readDoc(env, "site", "config");
  const site = siteRaw ? JSON.parse(siteRaw) : {};

  // Landing pages at /l/{slug} — raw HTML wrapped in the site header/footer.
  if (pathname.startsWith("/l/")) {
    const slug = decodeURIComponent(pathname.slice(3).replace(/\/+$/, ""));
    const raw = await readDoc(env, "landing", slug);
    if (raw) {
      const doc = JSON.parse(raw);
      if (typeof doc.html === "string") return htmlResponse(renderLanding(doc, site));
    }
    return htmlResponse(await render404(site), 404);
  }

  const clean = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  const segs = clean ? clean.split("/") : [];

  // Detail routes: /events/{id}, /courses/{id}, /blog/{id}
  const detailMap: Record<string, string> = { events: "events", courses: "courses", blog: "posts" };
  if (segs.length === 2 && detailMap[segs[0]]) {
    const coll = detailMap[segs[0]];
    const raw = await readDoc(env, coll, decodeURIComponent(segs[1]));
    if (!raw) return htmlResponse(await render404(site), 404);
    return htmlResponse(await renderPage(env, pageFromDoc(coll, JSON.parse(raw)), site));
  }

  // Courses index
  if (segs.length === 1 && segs[0] === "courses") {
    return htmlResponse(
      await renderPage(
        env,
        {
          title: "Courses",
          seo: { description: "Learn with Julie Bale, in your own time." },
          sections: [
            { type: "statement", statement: "Courses", sub: "Learn with Julie, in your own time." },
            { type: "listing", collection: "courses", empty: "Courses are on their way." },
          ],
        },
        site
      )
    );
  }

  // Blog index
  if (segs.length === 1 && segs[0] === "blog") {
    return htmlResponse(
      await renderPage(
        env,
        {
          title: "Finding Your Voice",
          seo: { description: "Musings by Julie Bale." },
          sections: [
            { type: "statement", statement: "Finding Your Voice", sub: "Musings by Julie Bale." },
            { type: "listing", collection: "posts", empty: "Posts coming soon." },
          ],
        },
        site
      )
    );
  }

  const slug = clean === "" ? "home" : decodeURIComponent(clean);
  if (slug.includes("/")) return htmlResponse(await render404(site), 404);
  const pageRaw = await readDoc(env, "pages", slug);
  if (!pageRaw) return htmlResponse(await render404(site), 404);
  return htmlResponse(await renderPage(env, JSON.parse(pageRaw), site));
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/openapi.json")
      return new Response(JSON.stringify(openApiSchema(url.origin), null, 2), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    if (pathname.startsWith("/api")) return handleApi(request, env, pathname);
    if (pathname === "/mcp" || pathname === "/sse" || pathname === "/sse/message") {
      // Gate the MCP door with the same bearer key as the REST API.
      if (env.API_KEY) {
        const auth = request.headers.get("authorization") || "";
        if (auth !== `Bearer ${env.API_KEY}`)
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
          });
      }
      if (pathname === "/mcp") return ContentMCP.serve("/mcp").fetch(request, env, ctx);
      return ContentMCP.serveSSE("/sse").fetch(request, env, ctx);
    }
    if (pathname === "/robots.txt")
      return new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain" } });
    if (pathname.startsWith("/ui/edit/")) return handleEditor(env, pathname);
    if (pathname === "/admin/upload")
      return new Response(renderUploadPage(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    if (pathname.startsWith("/media/")) return handleMediaGet(env, pathname);

    return handleSite(env, pathname);
  },
} satisfies ExportedHandler<Env>;
