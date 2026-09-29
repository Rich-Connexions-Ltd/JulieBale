import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { renderPage, render404, pageFromDoc, renderLanding, MOTION_GUARD } from "./render";
import { landingWarnings } from "./sanitize";
import { normaliseSources, storeSource, streamConfigured, streamDetails, streamSetPoster, posterPercent, slugForAsset } from "./media-import";
import { buildImportedAsset, replaceAssetMedia, applyStreamDetails, consentOk as assetConsentOk } from "./assets";
import { PRESENTATION_OPTIONS, CONCEPT_EXAMPLES, presentationWarnings, presentationJsonSchema } from "./presentation";
import { ASSET_OPTIONS, CONSENT_MEANINGS, assetWarnings, testimonialWarnings, searchAssets, type AssetQuery } from "./assets";
import {
  ensureSectionKeys, prepareVariantWrite, variantToPage, publishedPage, newVariant, sectionSummaries,
  tokensEqual, isValidId, previewPath, TOKEN_RE, MAX_VARIANTS_PER_BASE,
} from "./variants";
import { renderEditorPage, editorResource } from "./editor";
import { renderUploadPage } from "./admin";

// Collections with an MCP-UI editor (all public content).
const EDITABLE_COLLECTIONS = ["events", "dates", "posts", "courses"];

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
// API responses are never cached: they can carry unpublished variant data.
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
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

/**
 * Collection-specific invariants applied on EVERY write path (MCP, REST,
 * variant tools, undo), so no caller can bypass them:
 *   - pages:    every section gets a stable `key` (variants reference these).
 *   - variants: the server-held preview `token` and the `base` are preserved.
 */
function applyWriteRules(collection: string, prev: string | null, data: string): string {
  if (collection !== "pages" && collection !== "variants") return data;
  let doc: any;
  try {
    doc = JSON.parse(data);
  } catch {
    return data;
  }
  if (collection === "pages") {
    const r = ensureSectionKeys(doc);
    return r.changed ? JSON.stringify(r.page) : data;
  }
  let prevDoc: any = null;
  try {
    prevDoc = prev ? JSON.parse(prev) : null;
  } catch {}
  return JSON.stringify(prepareVariantWrite(prevDoc, doc));
}

/** Write warnings: presentation (pages, variants), asset and testimonial checks. */
function warningsFor(collection: string, data: string): string[] {
  const check =
    collection === "pages" || collection === "variants" ? presentationWarnings
    : collection === "assets" ? assetWarnings
    : collection === "testimonials" ? testimonialWarnings
    : collection === "landing" ? landingWarnings
    : null;
  if (!check) return [];
  try {
    return check(JSON.parse(data));
  } catch {
    return [];
  }
}

/** Search the asset library (one bound query for the collection, filtered in memory). */
async function findAssets(env: Env, query: AssetQuery) {
  const { results } = await env.DB.prepare("SELECT id, data FROM documents WHERE collection=? ORDER BY id").bind("assets").all<{ id: string; data: string }>();
  const rows = results.map((r) => ({ id: r.id, doc: parse(r.data) }));
  return { assets: searchAssets(rows, query), vocabulary: ASSET_OPTIONS, consent: CONSENT_MEANINGS };
}

async function writeDoc(env: Env, collection: string, id: string, data: string, status = "published") {
  const prev = await readDoc(env, collection, id);
  data = applyWriteRules(collection, prev, data);
  await snapshot(env, collection, id, prev, "write");
  await env.DB.prepare(
    "INSERT INTO documents (collection, id, data, status, updated_at) VALUES (?,?,?,?,?) " +
      "ON CONFLICT(collection, id) DO UPDATE SET data=excluded.data, status=excluded.status, updated_at=excluded.updated_at"
  )
    .bind(collection, id, data, status, now())
    .run();
  return { created: prev === null, warnings: warningsFor(collection, data) };
}

// Merge fields into an existing document (never strips fields you don't send).
async function mergeDoc(env: Env, collection: string, id: string, patch: Record<string, unknown>) {
  const prevStr = await readDoc(env, collection, id);
  const prev = prevStr ? JSON.parse(prevStr) : {};
  const merged = { ...prev, ...patch };
  const { warnings } = await writeDoc(env, collection, id, JSON.stringify(merged));
  return { existed: prevStr !== null, warnings };
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
  // Restores obey the same invariants as writes (keys; variant token/base).
  const restored = applyWriteRules(collection, cur, v.data);
  await env.DB.prepare(
    "INSERT INTO documents (collection, id, data, status, updated_at) VALUES (?,?,?,?,?) " +
      "ON CONFLICT(collection, id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at"
  )
    .bind(collection, id, restored, "published", now())
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

/* ------------------------------ Page variants ----------------------------- */

const parse = (raw: string | null): any => {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

async function variantsFor(env: Env, base: string): Promise<Array<{ id: string; doc: any }>> {
  // One bound query for the whole collection (it holds at most a handful of docs).
  const { results } = await env.DB.prepare("SELECT id, data FROM documents WHERE collection=? ORDER BY id")
    .bind("variants")
    .all<{ id: string; data: string }>();
  return results.map((r) => ({ id: r.id, doc: parse(r.data) })).filter((v) => v.doc && v.doc.base === base);
}

type Result = { ok: true; [k: string]: unknown } | { ok: false; error: string; [k: string]: unknown };

/** Create an unpublished variant of pages/{base} referencing all its sections. */
async function createVariant(env: Env, origin: string, a: { base: unknown; id: unknown; label: unknown; note?: unknown }): Promise<Result> {
  if (!isValidId(a.base)) return { ok: false, error: "base must be a page id like 'home' (lowercase letters, digits, hyphens)" };
  if (!isValidId(a.id)) return { ok: false, error: "id must be lowercase letters, digits and hyphens, starting with a letter (max 64), e.g. 'home-stage'" };
  if (typeof a.label !== "string" || !a.label.trim() || a.label.length > 80) return { ok: false, error: "label is required (max 80 characters)" };
  if (a.note !== undefined && (typeof a.note !== "string" || a.note.length > 500)) return { ok: false, error: "note must be text (max 500 characters)" };
  const baseRaw = await readDoc(env, "pages", a.base);
  if (!parse(baseRaw)) return { ok: false, error: `no page at pages/${a.base}` };
  if (await readDoc(env, "variants", a.id)) return { ok: false, error: `variants/${a.id} already exists; edit it with update_content or choose another id` };
  const existing = await variantsFor(env, a.base);
  if (existing.length >= MAX_VARIANTS_PER_BASE)
    return { ok: false, error: `pages/${a.base} already has ${existing.length} variants (${existing.map((v) => v.id).join(", ")}); the limit is ${MAX_VARIANTS_PER_BASE}. Delete one first.` };
  // Persist stable section keys on the base page first. This write only adds
  // `key` fields, which are never rendered, so the live page looks the same.
  const keyed = ensureSectionKeys(parse(baseRaw));
  if (keyed.changed) await writeDoc(env, "pages", a.base, JSON.stringify(keyed.page));
  const variant = newVariant(keyed.page, { base: a.base, label: a.label.trim(), note: a.note as string | undefined });
  await writeDoc(env, "variants", a.id, JSON.stringify(variant));
  const saved = parse(await readDoc(env, "variants", a.id));
  return { ok: true, variant: `variants/${a.id}`, previewUrl: origin + previewPath(a.id, saved.token), sections: sectionSummaries(keyed.page) };
}

async function listVariants(env: Env, origin: string, base: unknown): Promise<Result> {
  if (!isValidId(base)) return { ok: false, error: "base must be a page id like 'home'" };
  const stored = parse(await readDoc(env, "pages", base));
  if (!stored) return { ok: false, error: `no page at pages/${base}` };
  // Report the keys the page has, or will get on its first write (the same
  // deterministic assignment create_page_variant persists), so assistants can
  // see them before any variant exists. Read-only: nothing is written here.
  const basePage = ensureSectionKeys(stored).page;
  const variants = (await variantsFor(env, base)).map(({ id, doc }) => {
    const { unresolved } = variantToPage(basePage, doc);
    return {
      id, label: doc.label, note: doc.note,
      previewUrl: typeof doc.token === "string" ? origin + previewPath(id, doc.token) : null,
      unresolved, warnings: presentationWarnings(doc),
    };
  });
  return { ok: true, base, limit: MAX_VARIANTS_PER_BASE, variants, sections: sectionSummaries(basePage) };
}

/** Write a variant's order/style/design into its base page (undoable). */
async function publishVariant(env: Env, id: unknown): Promise<Result> {
  if (!isValidId(id)) return { ok: false, error: "id must be a variant id like 'home-stage'" };
  const variant = parse(await readDoc(env, "variants", id));
  if (!variant) return { ok: false, error: `no variant at variants/${id}` };
  if (!isValidId(variant.base)) return { ok: false, error: `variants/${id} has no valid base page` };
  const base = parse(await readDoc(env, "pages", variant.base));
  if (!base) return { ok: false, error: `no page at pages/${variant.base}` };
  const r = publishedPage(base, variant);
  if (!r.ok)
    return { ok: false, error: `not published: these references no longer match a section of pages/${variant.base}: ${r.unresolved.join(", ")}. Fix or remove them in variants/${id}.`, unresolved: r.unresolved };
  await writeDoc(env, "pages", variant.base, JSON.stringify(r.page));
  return { ok: true, published: `variants/${id} -> pages/${variant.base}`, dropped: r.dropped, stripped: r.stripped, undo: `undo_content pages/${variant.base}` };
}

const presentationOptions = () => ({
  style: PRESENTATION_OPTIONS.style,
  design: PRESENTATION_OPTIONS.design,
  rules: [
    "style and design are presentation only; they never change copy.",
    "Values outside these lists are ignored and reported as warnings.",
    "In a variant, a section's style REPLACES the base section's style (it is not merged).",
    "Keep every section's `key` when editing pages; variants reference sections by key.",
  ],
  examples: CONCEPT_EXAMPLES,
});

/* --------------------------- Media import (#24) --------------------------- */

/**
 * Import 1-10 files (ChatGPT openaiFileIdRefs or https urls) as assets.
 * Top-level metadata are defaults for every file; `asset` (replace a
 * placeholder) needs exactly one file. Per-file results: one bad file does not
 * fail the others.
 */
async function importMedia(env: Env, origin: string, body: any) {
  const n = normaliseSources(body);
  if ("error" in n) return { status: 400, body: { ok: false, error: n.error } };
  if (body?.asset !== undefined && (!isValidId(body.asset) || n.sources.length !== 1))
    return { status: 400, body: { ok: false, error: "asset (to replace or name one file) must be an id like 'aria-rehearsal', with exactly one file" } };
  const posterAt = posterPercent(body?.poster_at);
  const results: unknown[] = [];
  for (const src of n.sources) {
    // Replace: the given id. Otherwise: from the title (single file) or the real file name.
    const idFor = async (resolvedName: string) => {
      if (body?.asset) return body.asset as string;
      const base = slugForAsset(typeof body?.title === "string" && n.sources.length === 1 ? body.title : resolvedName);
      let id = base;
      for (let i = 2; await readDoc(env, "assets", id); i++) id = `${base}-${i}`;
      return id;
    };
    const stored = await storeSource(env, src, idFor, posterAt);
    if ("error" in stored) {
      results.push({ ok: false, name: src.name.slice(0, 120), error: stored.error });
      continue;
    }
    const id = stored.assetId;
    const prev = parse(await readDoc(env, "assets", id));
    let doc: Record<string, unknown>;
    let warnings: string[] = [];
    if (prev) doc = replaceAssetMedia(prev, stored.media);
    else ({ doc, warnings } = buildImportedAsset(stored.media, body || {}));
    const w = await writeDoc(env, "assets", id, JSON.stringify(doc));
    results.push({ ok: true, asset: id, ref: `asset:${id}`, type: stored.media.type, status: stored.media.status, replaced: !!prev, warnings: [...warnings, ...w.warnings] });
  }
  return { status: 200, body: { results } };
}

/** Fill in Stream's details for a video asset (and optionally move its poster frame). */
async function refreshMedia(env: Env, id: unknown, posterAt: unknown) {
  if (!isValidId(id)) return { status: 400, body: { ok: false, error: "id must be an asset id" } };
  const asset = parse(await readDoc(env, "assets", id));
  if (!asset) return { status: 404, body: { ok: false, error: `no asset at assets/${id}` } };
  if (asset.type !== "video" || !/^[a-f0-9]{32}$/.test(String(asset.file || ""))) return { status: 400, body: { ok: false, error: "only imported videos can be refreshed" } };
  if (!streamConfigured(env)) return { status: 501, body: { ok: false, error: "Cloudflare Stream is not configured" } };
  if (posterAt !== undefined) {
    const r = await streamSetPoster(env, asset.file, posterPercent(posterAt));
    if (r !== true) return { status: 502, body: { ok: false, error: r.error } };
  }
  const d = await streamDetails(env, asset.file);
  if (d && "error" in d) return { status: 502, body: { ok: false, error: d.error } };
  const updated = applyStreamDetails(asset, d);
  await writeDoc(env, "assets", id, JSON.stringify(updated));
  const { status, duration, width, height, orientation, size, thumbnail } = updated as any;
  return { status: 200, body: { ok: true, asset: id, ref: `asset:${id}`, status, duration, width, height, orientation, size, thumbnail } };
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
  server = new McpServer({ name: "juliebale-content", version: "0.10.0" });

  async init() {
    this.server.tool(
      "list_content",
      "List the ids of documents in a collection. WHEN: use first to discover what already exists before creating or editing (e.g. list 'pages' for every page slug, 'events' for existing events). Does NOT return the documents themselves, follow up with read_content. Collections: pages, posts, events, courses, dates, landing, variants, assets, testimonials, site, context.",
      { collection: z.string() },
      async ({ collection }) => {
        const ids = await listDocs(this.env, collection);
        return { content: [{ type: "text", text: ids.length ? ids.join("\n") : `(collection '${collection}' is empty)` }] };
      }
    );

    this.server.tool(
      "read_content",
      "Read one document and return its full JSON. WHEN: ALWAYS read a document before you change it, so you edit from its real current state and keep the fields you are not changing. Also read Julie's context first (collection 'context', ids: voice, brand, offers, content-model) before writing any copy. Page sections carry a `key` (e.g. hero-1): keep it unchanged when you edit, because page variants refer to sections by key. Returns a not-found note if it does not exist.",
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
        const { created, warnings } = await writeDoc(this.env, collection, id, data);
        return { content: [{ type: "text", text: `${created ? "Created" : "Updated"} ${collection}/${id}.${warningText(warnings)}` }] };
      }
    );

    this.server.tool(
      "update_content",
      "PREFERRED WAY TO EDIT. Merge one or more fields into an existing document, keeping every field you do not mention. WHEN: almost all edits, such as changing a page's copy, an event's description or date, or a price. `data` is a JSON string of ONLY the fields to change (for example, just the description field). Safe: omitted fields are untouched and the previous state is kept for undo. DO NOT paste the whole document here unless you intend to. Descriptive text fields (body, description, details, excerpt) support Markdown, so write them in Markdown (headings, bold, lists, links). Layout and motion go in a section's `style` object and a page's `design` object, using ONLY values from presentation_options; anything else is ignored and reported back as a warning. When replacing a page's `sections` array, keep each section's `key`. Headings accept two marks only: | for a line break and *a word or phrase* (paired asterisks, no | inside) for display italic. Landing pages (collection landing) are sanitised: see the content model's Landing pages rules; warnings list what will be removed. A feature, showcase or statement may carry `images` (2-4 asset refs or plain filenames) for a collage.",
      { collection: z.string(), id: z.string(), data: z.string() },
      async ({ collection, id, data }) => {
        let patch: Record<string, unknown>;
        try {
          patch = JSON.parse(data);
        } catch {
          return { content: [{ type: "text", text: "Error: `data` must be valid JSON." }], isError: true };
        }
        const { existed, warnings } = await mergeDoc(this.env, collection, id, patch);
        return { content: [{ type: "text", text: `${existed ? "Updated" : "Created"} ${collection}/${id} (merged ${Object.keys(patch).length} field(s)).${warningText(warnings)}` }] };
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
      "Log a request to the developer team for something the website cannot do yet: a new kind of section/block, a new layout, a new content type, or a bug. FIRST call list_feature_requests: if something similar is already open or planned, do not log it again (its resolution says where it is scheduled). WHEN: use this INSTEAD of improvising a workaround that breaks the design or content model, whenever Julie wants something the existing block types cannot express. Give a clear title, what it should do and look like (detail) and where on the site (context). Then tell Julie it is logged and offer the closest thing possible now. DO NOT use for ordinary content edits you can already make.",
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
      "List logged feature/element requests with their status (open, planned, done, declined) and resolution (the developer's note: which sprint it is planned for, what it was merged into, or why it was declined). WHEN: always before logging a new request, or when Julie asks what is outstanding. Optionally filter by status.",
      { status: z.enum(["open", "planned", "done", "declined"]).optional() },
      async ({ status }) => {
        const rows = await listFeatureRequests(this.env, status);
        return { content: [{ type: "text", text: rows.length ? JSON.stringify(rows, null, 2) : "(no requests)" }] };
      }
    );

    this.server.tool(
      "search_assets",
      "Find photographs, video and audio in the asset library, with what each shows, how it can be used, and whether it may be shown (consent). WHEN: choosing an image for a section, testimonial portrait or video poster. Use the result's ref (asset:<id>) in image/image_2/poster/video/audio fields or a testimonial portrait. Only assets with usable: true are ever shown on the site. All filters optional.",
      {
        q: z.string().optional().describe("Words to match in title, description, people, setting, tone"),
        type: z.enum(["image", "video", "audio"]).optional(),
        usage: z.string().optional().describe("e.g. julie-singing, concert, community, venue"),
        role: z.string().optional().describe("e.g. hero, background, collage, testimonial-portrait, poster, tile"),
        orientation: z.enum(["portrait", "landscape", "square"]).optional(),
        usable: z.boolean().optional().describe("true = only assets that may be shown now"),
      },
      async (args) => ({ content: [{ type: "text", text: JSON.stringify(await findAssets(this.env, args), null, 2) }] })
    );

    this.server.tool(
      "import_media_from_url",
      "Import a video (mp4, mov, webm; up to 200 MB) or audio file (mp3, m4a, wav, ogg; up to 50 MB) from a public https link into the asset library, returning asset:<id> for media blocks. WHEN: you have a link to the file (files uploaded in a ChatGPT chat use the importMedia action instead). Video processes for a while: call refresh_media_asset later. Consent defaults to pending; granted needs consent_note. Give asset to replace a placeholder (its title, consent and other details are kept).",
      {
        url: z.string(),
        asset: z.string().optional().describe("Existing asset id to replace, or the id to create"),
        title: z.string().optional(), alt: z.string().optional().describe("What the video's poster shows"),
        consent: z.enum(["granted", "not-needed", "pending", "refused"]).optional(), consent_note: z.string().optional(),
        usage: z.array(z.string()).optional(), roles: z.array(z.string()).optional(),
        poster_at: z.number().optional().describe("Poster frame: percent 0-100 through the video (default 10)"),
      },
      async ({ url, ...rest }) => {
        const r = await importMedia(this.env, SITE_BASE, { urls: [url], ...rest });
        return { content: [{ type: "text", text: JSON.stringify(r.body, null, 2) }], isError: r.status !== 200 };
      }
    );

    this.server.tool(
      "refresh_media_asset",
      "Update an imported video asset with Cloudflare Stream's details (ready/processing, duration, size, dimensions, orientation, poster). WHEN: after importing a video, until status is ready. Optionally move the poster frame with poster_at (percent 0-100).",
      { id: z.string(), poster_at: z.number().optional() },
      async ({ id, poster_at }) => {
        const r = await refreshMedia(this.env, id, poster_at);
        return { content: [{ type: "text", text: JSON.stringify(r.body, null, 2) }], isError: r.status !== 200 };
      }
    );

    this.server.tool(
      "presentation_options",
      "List every allowed layout, theme and motion option for a page section's `style` and a page's `design`, with what each does and a worked example for each homepage concept (stage, editorial, journey). WHEN: before setting any style or design value, so you never guess. Presentation never changes copy.",
      {},
      async () => ({ content: [{ type: "text", text: JSON.stringify(presentationOptions(), null, 2) }] })
    );

    this.server.tool(
      "create_page_variant",
      `Create an unpublished design variant of a page (e.g. a homepage concept) that Julie can preview without changing the live page. WHEN: exploring different looks for a page. The variant shares the live page's copy: it only stores which sections appear, in what order, and each section's style, plus a page design. Copy edits are still made on the live page. It starts as the page as-is (every section, in order, no style); then edit variants/{id} with update_content: reorder or remove entries in \`sections\` (each is { from: <section key>, style: {...} }; a variant section's style REPLACES the live section's style) and set \`design\`. Returns a private preview link to give Julie. Up to ${MAX_VARIANTS_PER_BASE} variants per page. DO NOT use for one-off copy changes.`,
      {
        base: z.string().describe("Page id to vary, e.g. 'home'"),
        id: z.string().describe("New variant id, e.g. 'home-stage' (lowercase, digits, hyphens)"),
        label: z.string().describe("Short name Julie will see, e.g. 'Stage'"),
        note: z.string().optional().describe("What this concept is going for"),
      },
      async (args) => {
        const r = await createVariant(this.env, SITE_BASE, args);
        return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: !r.ok };
      }
    );

    this.server.tool(
      "list_page_variants",
      "List a page's unpublished variants with their preview links, plus the live page's section keys (what each variant's `from` can refer to). Also reports, per variant, unresolved references (a `from` key that no longer matches a live section, usually because a section's key was dropped while editing the page) and presentation warnings. WHEN: to find a preview link again, before editing a variant, or before publishing.",
      { base: z.string().describe("Page id, e.g. 'home'") },
      async ({ base }) => {
        const r = await listVariants(this.env, SITE_BASE, base);
        return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: !r.ok };
      }
    );

    this.server.tool(
      "publish_page_variant",
      "Make a variant live: writes its section order, styles and design into the live page. Sections the variant leaves out are REMOVED from the live page (they are listed in the result), and only allowed presentation values are kept (others are listed as stripped). Refused if any `from` reference no longer matches a live section. Undoable: undo_content on pages/{base} restores the previous live page. The variant itself is kept. WHEN: only after Julie has chosen this concept and confirmed she wants it live.",
      { id: z.string().describe("Variant id, e.g. 'home-stage'") },
      async ({ id }) => {
        const r = await publishVariant(this.env, id);
        return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: !r.ok };
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

const warningText = (w: string[]) => (w.length ? `\nPresentation warnings (these values were ignored):\n- ${w.join("\n- ")}` : "");

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

const safeDecode = (s: string): string | null => {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
};

async function handleApi(request: Request, env: Env, pathname: string): Promise<Response> {
  // Fail closed: without a configured key, nothing under /api is reachable.
  if (!env.API_KEY) return json({ error: "the API is not configured" }, 503);
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${env.API_KEY}`) return json({ error: "unauthorized" }, 401);

  const parts = pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = request.method.toUpperCase();

  // Media import (#24): POST /api/media/import, POST /api/media/refresh/{id}
  if (parts[0] === "media" && parts[1] === "import" && parts.length === 2) {
    if (method !== "POST") return json({ error: "method not allowed" }, 405);
    const r = await importMedia(env, new URL(request.url).origin, await request.json().catch(() => ({})));
    return json(r.body, r.status);
  }
  if (parts[0] === "media" && parts[1] === "refresh" && parts.length === 3) {
    if (method !== "POST") return json({ error: "method not allowed" }, 405);
    const b = (await request.json().catch(() => ({}))) as any;
    const r = await refreshMedia(env, safeDecode(parts[2]), b?.poster_at);
    return json(r.body, r.status);
  }

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

  // Asset library search: GET /api/assets/search?q=&type=&usage=&role=&orientation=&consent=&usable=true
  if (parts[0] === "assets" && parts[1] === "search" && parts.length === 2) {
    if (method !== "GET") return json({ error: "method not allowed" }, 405);
    const sp = new URL(request.url).searchParams;
    const get = (k: string) => sp.get(k) || undefined;
    return json(await findAssets(env, { q: get("q"), type: get("type"), usage: get("usage"), role: get("role"), orientation: get("orientation"), consent: get("consent"), suits: get("suits"), usable: sp.get("usable") === "true" }));
  }

  // Presentation vocabulary: GET /api/presentation-options
  if (parts[0] === "presentation-options" && parts.length === 1) {
    if (method !== "GET") return json({ error: "method not allowed" }, 405);
    return json(presentationOptions());
  }

  // Page variants: /api/pages/{base}/variants (GET list, POST create)
  if (parts[0] === "pages" && parts.length === 3 && parts[2] === "variants") {
    const origin = new URL(request.url).origin;
    const base = safeDecode(parts[1]);
    if (method === "GET") {
      const r = await listVariants(env, origin, base);
      return json(r, r.ok ? 200 : 400);
    }
    if (method === "POST") {
      const body = (await request.json().catch(() => ({}))) as any;
      const r = await createVariant(env, origin, { base, id: body?.id, label: body?.label, note: body?.note });
      return json(r, r.ok ? 200 : 400);
    }
    return json({ error: "method not allowed" }, 405);
  }

  // Publish a variant: POST /api/variants/{id}/publish
  if (parts[0] === "variants" && parts.length === 3 && parts[2] === "publish") {
    if (method !== "POST") return json({ error: "method not allowed" }, 405);
    const r = await publishVariant(env, safeDecode(parts[1]));
    return json(r, r.ok ? 200 : 400);
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
      return new Response(v, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    if (method === "PUT" || method === "POST") {
      const parsed = await parseBody(request);
      if ("error" in parsed) return json({ error: parsed.error }, 400);
      const { created, warnings } = await writeDoc(env, collection, id, parsed.jsonString);
      return json({ ok: true, saved: `${collection}/${id}`, created, warnings });
    }
    if (method === "PATCH") {
      const parsed = await parseBody(request);
      if ("error" in parsed) return json({ error: parsed.error }, 400);
      const { existed, warnings } = await mergeDoc(env, collection, id, parsed.object as Record<string, unknown>);
      return json({ ok: true, merged: `${collection}/${id}`, existed, warnings });
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
  const bodyContent = {
    "application/json": {
      schema: { $ref: "#/components/schemas/ContentBody" },
      examples: {
        restyleSection: { summary: "Restyle a variant (updateContent on variants/home-stage)", value: { data: JSON.stringify({ design: { concept: "stage" }, sections: [{ from: "hero-1", style: { hero: "split", theme: "night" } }, { from: "statement-1", style: { theme: "teal", rule: true } }] }) } },
        caption: { summary: "A page section with its key kept and a caption", value: { data: JSON.stringify({ sections: [{ key: "feature-1", type: "feature", heading: "I'm a singer first.", image: "about-julie.jpeg", caption: "On stage in 2024", style: { image_side: "left" } }] }) } },
      },
    },
  };
  const baseParam = { name: "base", in: "path", required: true, description: "Page id, e.g. 'home'", schema: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$" } };

  return {
    openapi: "3.1.0",
    info: {
      title: "Julie Bale content API",
      description: "Read and write Julie Bale's website content, undo changes, explore unpublished page variants, and raise feature requests. Documents are JSON stored by collection and id. IMPORTANT: to edit, read the document first, then use updateContent (merge) so you never lose fields; use writeContent only to create or fully rewrite a document. Page sections carry a `key`; keep it when editing. Layout/motion go in a section's `style` and a page's `design` using only values from presentationOptions.",
      version: "0.10.0",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/{collection}": {
        get: { operationId: "listContent", summary: "List document ids in a collection", description: "Use first to discover what already exists before creating or editing. Returns the ids in a collection; read a specific one with readContent.", parameters: [collectionParam], responses: { "200": { description: "The ids", content: { "application/json": { schema: { $ref: "#/components/schemas/IdList" } } } } } },
      },
      "/api/{collection}/{id}": {
        get: { operationId: "readContent", summary: "Read one document", description: "ALWAYS read a document before changing it, and read the context collection (ids voice, brand, offers, content-model) before writing copy. Returns the full JSON.", parameters: [collectionParam, idParam], responses: { "200": { description: "The document", content: docContent }, "404": { description: "Not found" } } },
        put: { operationId: "writeContent", summary: "Replace a whole document.", description: "REPLACES the entire document with the JSON you send; any field you omit is DELETED. Use only to create a new document or deliberately rewrite one in full (send EVERY field). To change or add a field on an existing document, use updateContent instead, never this.", parameters: [collectionParam, idParam], requestBody: { required: true, content: bodyContent }, responses: { "200": { description: "Saved", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } } } },
        patch: { operationId: "updateContent", summary: "Merge fields into a document (preferred for editing).", description: "PREFERRED for edits. Merges only the fields you send; nothing else is lost. Headings accept | (line break) and *word* (display italic). Feature/showcase/statement may take images (2-4, asset:<id> or photo.jpeg) for a collage. Returns warnings for disallowed values.", parameters: [collectionParam, idParam], requestBody: { required: true, content: bodyContent }, responses: { "200": { description: "Updated", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } } } },
        delete: { operationId: "deleteContent", summary: "Delete a document.", description: "Permanently removes a document (undoable). Only when it should genuinely no longer exist; confirm first for pages/client-facing content. To clear a field, use updateContent, not delete.", parameters: [collectionParam, idParam], responses: { "200": { description: "Deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } } } },
      },
      "/api/undo/{collection}/{id}": {
        post: { operationId: "undoContent", summary: "Undo the last change to a document", description: "Reverts a document to its state before the last change. Call again to step further back. Use when asked to undo or put something back.", parameters: [collectionParam, idParam], responses: { "200": { description: "Reverted", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } } } },
      },
      "/api/dates/{id}/convert-to-event": {
        post: { operationId: "convertDateToEvent", summary: "Convert a date into a full event.", description: "Promotes a calendar date into an event with its own page (description, location, details). Creates the event from the date's title and date, then removes the date (both undoable). After converting, edit the event to add its description, location and details.", parameters: [{ name: "id", in: "path", required: true, description: "The date id", schema: { type: "string" } }], responses: { "200": { description: "Converted", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } } } },
      },
      "/api/assets/search": {
        get: {
          operationId: "searchAssets", summary: "Search the photo/video/audio library",
          description: "Find assets by words and filters. Use a result's ref (asset:<id>) in image, image_2, poster, video or audio fields or as a testimonial portrait. Only assets with usable: true are shown on the site (consent granted or not needed).",
          parameters: ["q", "type", "usage", "role", "orientation", "consent"].map((name) => ({ name, in: "query", required: false, schema: { type: "string" } })).concat([{ name: "usable", in: "query", required: false, schema: { type: "string", enum: ["true"] } } as any]),
          responses: { "200": { description: "Matching assets", content: { "application/json": { schema: { $ref: "#/components/schemas/AssetList" } } } } },
        },
      },
      "/api/media/import": {
        post: {
          operationId: "importMedia", summary: "Import chat-uploaded video/audio as assets",
          description: "Attach video (mp4/mov/webm, 200 MB) or audio (mp3/m4a/wav/ogg, 50 MB) in the chat and call this. Returns asset:<id> per file. Consent defaults to pending. Give asset to replace a placeholder. Videos process: call refreshMedia later.",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: {
            openaiFileIdRefs: { type: "array", items: { type: "string" }, description: "Files uploaded in the chat (filled in by ChatGPT)." },
            urls: { type: "array", items: { type: "string" }, description: "Public https links (instead of chat files)." },
            asset: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$", description: "Asset id (the part after asset: — e.g. aria-rehearsal for asset:aria-rehearsal). An existing id replaces that asset's media; a new id names the new asset. One file only." },
            title: { type: "string" }, alt: { type: "string", description: "What the video poster shows (recommended; a warning is returned if missing). Images require alt." }, transcript: { type: "string", description: "Speech or lyrics (recommended)." }, caption: { type: "string" },
            consent: { type: "string", enum: ["granted", "not-needed", "pending", "refused"] }, consent_note: { type: "string" },
            usage: { type: "array", items: { type: "string" } }, roles: { type: "array", items: { type: "string" } },
            poster_at: { type: "integer", minimum: 0, maximum: 100, description: "Poster frame, percent through the video (default 10)." },
          } } } } },
          responses: { "200": { description: "Per-file results", content: { "application/json": { schema: { $ref: "#/components/schemas/ImportResults" } } } }, "400": { description: "Nothing to import or invalid request" } },
        },
      },
      "/api/media/refresh/{id}": {
        post: {
          operationId: "refreshMedia", summary: "Update an imported video's details",
          description: "Fill in Stream's details for an imported video (ready/processing, duration, size, dimensions, orientation). Call after importMedia until status is ready. Optional poster_at (percent 0-100) moves the poster frame.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { required: false, content: { "application/json": { schema: { type: "object", properties: { poster_at: { type: "integer", minimum: 0, maximum: 100 } } } } } },
          responses: { "200": { description: "Asset summary", content: { "application/json": { schema: { $ref: "#/components/schemas/MediaSummary" } } } } },
        },
      },
      "/api/presentation-options": {
        get: { operationId: "presentationOptions", summary: "List allowed style/design values", description: "Every allowed layout, theme and motion value for a section's `style` and a page's `design`, with meanings and a worked example per homepage concept. Call before setting any style/design value; never guess.", responses: { "200": { description: "The vocabulary", content: { "application/json": { schema: { $ref: "#/components/schemas/PresentationOptions" } } } } } },
      },
      "/api/pages/{base}/variants": {
        get: { operationId: "listPageVariants", summary: "List a page's unpublished variants", description: "Variants of a page with their private preview links, the live page's section keys (what a variant's `from` can refer to), and per-variant unresolved references and presentation warnings.", parameters: [baseParam], responses: { "200": { description: "Variants", content: { "application/json": { schema: { $ref: "#/components/schemas/VariantList" } } } }, "400": { description: "Invalid or unknown base page" } } },
        post: {
          operationId: "createPageVariant", summary: "Create an unpublished variant of a page",
          description: `Create an unpublished variant of a page, sharing its copy. Then updateContent on variants/{id}: reorder/remove \`sections\` ({from: section key, style}) and set \`design\`. A variant style replaces the live style. Returns a private preview link. Max ${MAX_VARIANTS_PER_BASE} per page.`,
          parameters: [baseParam],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["id", "label"], properties: { id: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$", description: "New variant id" }, label: { type: "string", maxLength: 80 }, note: { type: "string", maxLength: 500 } } }, example: { id: "home-stage", label: "Stage", note: "Concert-programme feel" } } } },
          responses: { "200": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } }, "400": { description: "Invalid id, unknown base, duplicate id or variant limit reached" } },
        },
      },
      "/api/variants/{id}/publish": {
        post: { operationId: "publishPageVariant", summary: "Make a variant live", description: "Write the variant's order, styles and design into the live page. Sections it omits are REMOVED (see `dropped`); disallowed values are dropped (`stripped`). Refused if any reference is unresolved. Undo with undoContent on pages/{base}. Only after Julie confirms.", parameters: [{ name: "id", in: "path", required: true, description: "Variant id, e.g. 'home-stage'", schema: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$" } }], responses: { "200": { description: "Published", content: { "application/json": { schema: { $ref: "#/components/schemas/WriteResult" } } } }, "400": { description: "Unknown variant or unresolved references" } } },
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
        WriteResult: { type: "object", properties: { ok: { type: "boolean" }, saved: { type: "string" }, merged: { type: "string" }, deleted: { type: "string" }, id: { type: "integer" }, restored: { type: "string" }, created: { type: "boolean" }, existed: { type: "boolean" }, event: { type: "string" }, url: { type: "string" }, removedDate: { type: "string" }, error: { type: "string" }, warnings: { type: "array", items: { type: "string" }, description: "Presentation values that are not allowed and were ignored" }, variant: { type: "string" }, previewUrl: { type: "string", description: "Private preview link to give Julie" }, published: { type: "string" }, unresolved: { type: "array", items: { type: "string" }, description: "Variant `from` keys that match no live section" }, dropped: { type: "array", items: { type: "string" }, description: "Section keys removed from the live page by publishing" }, stripped: { type: "array", items: { type: "string" }, description: "Values not kept when publishing" }, undo: { type: "string" } } },
        Section: { type: "object", description: "One page section (block). `type` picks the block; other fields are its copy. Headings accept | (line break) and *word* (display italic).", required: ["type"], properties: { type: { type: "string" }, images: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" }, description: "Collage (feature, showcase, statement): asset:<id> or a plain filename like photo.jpeg." }, key: { type: "string", pattern: "^[a-z][a-z0-9-]{0,39}$", description: "Stable section id assigned by the server (e.g. hero-1). KEEP IT UNCHANGED when editing; variants refer to sections by key." }, caption: { type: "string", description: "Optional image caption (showcase, feature; duo items take `caption` per item)." }, style: { $ref: "#/components/schemas/SectionStyle" } }, additionalProperties: true },
        SectionStyle: { ...presentationJsonSchema("style"), description: "Presentation only. Values outside these enums are ignored and returned as warnings." },
        PageDesign: { ...presentationJsonSchema("design"), description: "Page-level presentation (on a page or a variant)." },
        PresentationOptions: { type: "object", description: "Allowed presentation values with meanings and examples.", properties: { style: { type: "object", description: "Section style keys: each has values (value -> meaning), optional blocks it applies to, or a pattern.", additionalProperties: true }, design: { type: "object", description: "Page design keys, same shape as style.", additionalProperties: true }, rules: { type: "array", items: { type: "string" } }, examples: { type: "object", description: "One worked variant per concept (stage, editorial, journey).", additionalProperties: true } } },
        VariantList: { type: "object", properties: { ok: { type: "boolean" }, base: { type: "string" }, limit: { type: "integer" }, error: { type: "string" }, variants: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, note: { type: "string" }, previewUrl: { type: "string" }, unresolved: { type: "array", items: { type: "string" } }, warnings: { type: "array", items: { type: "string" } } } } }, sections: { type: "array", description: "The live page's section keys", items: { type: "object", properties: { key: { type: "string" }, type: { type: "string" }, heading: { type: "string" } } } } } },
        ImportResults: { type: "object", properties: { results: { type: "array", items: { type: "object", properties: { ok: { type: "boolean" }, asset: { type: "string", description: "Asset id" }, ref: { type: "string", description: "Use in pages, e.g. asset:aria-rehearsal" }, type: { type: "string" }, status: { type: "string", enum: ["processing", "ready", "error"] }, replaced: { type: "boolean" }, warnings: { type: "array", items: { type: "string" }, description: "Things to fix on the new asset (it was still saved): missing alt text or transcript, consent kept as pending because granted had no consent_note, or values outside the asset vocabulary." }, name: { type: "string" }, error: { type: "string", description: "Why this file was not imported (type, size, link, or Stream's reason)." } } } }, ok: { type: "boolean" }, error: { type: "string" } } },
        MediaSummary: { type: "object", properties: { ok: { type: "boolean" }, asset: { type: "string" }, ref: { type: "string" }, status: { type: "string" }, duration: { type: "number" }, width: { type: "integer" }, height: { type: "integer" }, orientation: { type: "string" }, size: { type: "integer" }, thumbnail: { type: "string" }, error: { type: "string" } } },
        AssetList: { type: "object", properties: { assets: { type: "array", items: { type: "object", properties: { ref: { type: "string" }, title: { type: "string" }, type: { type: "string" }, file: { type: "string" }, orientation: { type: "string" }, usage: { type: "array", items: { type: "string" } }, roles: { type: "array", items: { type: "string" } }, people: { type: "array", items: { type: "string" } }, consent: { type: "string" }, usable: { type: "boolean" } } } }, vocabulary: { type: "object", additionalProperties: true }, consent: { type: "object", additionalProperties: true } } },
        Asset: { type: "object", description: "Collection 'assets'. Refer to one as asset:<id>. Shown only when consent is granted or not-needed (and not expired).", properties: { file: { type: "string", description: "Filename in /assets, media key, or Stream video id" }, type: { type: "string", enum: [...ASSET_OPTIONS.type] }, title: { type: "string" }, alt: { type: "string" }, people: { type: "array", items: { type: "string" } }, setting: { type: "string" }, orientation: { type: "string", enum: [...ASSET_OPTIONS.orientation] }, focus: { type: "string", description: "Default focal point, e.g. 60% 20%" }, tone: { type: "array", items: { type: "string" } }, usage: { type: "array", items: { type: "string", enum: [...ASSET_OPTIONS.usage] } }, roles: { type: "array", items: { type: "string", enum: [...ASSET_OPTIONS.roles] } }, suits: { type: "array", items: { type: "string", enum: [...ASSET_OPTIONS.suits] } }, consent: { type: "string", enum: [...ASSET_OPTIONS.consent] }, consent_note: { type: "string" }, consent_expires: { type: "string" }, date: { type: "string" }, lighting: { type: "string" }, crop_zones: { type: "string" }, notes: { type: "string" } } },
        Testimonial: { type: "object", description: "Collection 'testimonials'. Shown only when consent is granted.", properties: { name: { type: "string" }, role: { type: "string" }, quote: { type: "string" }, story: { type: "string", description: "Markdown" }, before: { type: "string" }, after: { type: "string" }, portrait: { type: "string", description: "asset:<id>" }, video: { type: "string", description: "asset:<id> or Stream id" }, tags: { type: "array", items: { type: "string" } }, consent: { type: "string", enum: ["granted", "pending", "refused"] }, consent_note: { type: "string" }, consent_expires: { type: "string" } } },
        Variant: { type: "object", description: "An unpublished variant (collection 'variants'). Copy comes from the live base page; only order and presentation live here. `token` and `base` are managed by the server.", properties: { base: { type: "string", readOnly: true }, label: { type: "string" }, note: { type: "string" }, token: { type: "string", readOnly: true }, design: { $ref: "#/components/schemas/PageDesign" }, sections: { type: "array", items: { type: "object", required: ["from"], properties: { from: { type: "string", description: "Section key on the live page" }, style: { $ref: "#/components/schemas/SectionStyle" } } } } } },
        FeatureRequest: { type: "object", required: ["title"], properties: { id: { type: "integer", readOnly: true }, title: { type: "string" }, detail: { type: "string" }, context: { type: "string" }, kind: { type: "string", enum: ["feature", "element", "content", "bug"] }, status: { type: "string", readOnly: true, enum: ["open", "planned", "done", "declined"] }, resolution: { type: "string", readOnly: true, description: "Developer note: planned sprint, merged-into, or reason declined" }, created_at: { type: "string", readOnly: true }, updated_at: { type: "string", readOnly: true } } },
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

/**
 * Public media, with two protected areas (Sprint 16):
 *   masters/<asset>/...  private originals: never served
 *   imports/<asset>/...  imported audio: only while that asset's consent allows it
 * Protected responses are never cached (signatures expire, consent can be revoked).
 */
async function handleMediaGet(env: Env, url: URL): Promise<Response> {
  const key = safeDecode(url.pathname.replace(/^\/media\/?/, "")) ?? "";
  const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  if (!key || key.includes("..")) return notFound();
  let protectedArea = false;
  // Originals are never served: video goes to Stream directly from the Worker.
  if (key.startsWith("masters/")) return notFound();
  if (key.startsWith("imports/")) {
    const assetId = key.split("/")[1];
    const asset = isValidId(assetId) ? parse(await readDoc(env, "assets", assetId)) : null;
    if (!asset || asset.file !== key || !assetConsentOk(asset)) return notFound();
    protectedArea = true;
  }
  const obj = await env.MEDIA.get(key);
  if (!obj) return notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", protectedArea ? "no-store, private" : "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
}

async function handleEditor(env: Env, pathname: string): Promise<Response> {
  const parts = pathname.replace(/^\/ui\/edit\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length < 2) return new Response("Not found", { status: 404 });
  const [collection, id] = parts;
  // Only the public collections that have an editor; nothing else is ever read here
  // (this route is unauthenticated so MCP-UI hosts can load it in an iframe).
  if (!EDITABLE_COLLECTIONS.includes(collection)) return new Response("Not found", { status: 404 });
  const raw = await readDoc(env, collection, id);
  const doc = raw ? JSON.parse(raw) : {};
  return new Response(renderEditorPage(collection, id, doc), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

const PREVIEW_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "x-robots-tag": "noindex, nofollow",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
};

/**
 * GET /preview/{variantId}/{token}: an unpublished variant rendered through the
 * normal page renderer. Unauthenticated (Julie opens it in a browser) but
 * guarded by a 144-bit token; every response, including 404s, is noindex and
 * uncached. Nothing about the variant beyond its label is exposed.
 */
async function handlePreview(env: Env, pathname: string): Promise<Response> {
  const siteRaw = await readDoc(env, "site", "config");
  const site = parse(siteRaw) || {};
  const notFound = async () => new Response(await render404(site), { status: 404, headers: PREVIEW_HEADERS });
  const segs = pathname.replace(/^\/preview\/?/, "").split("/");
  if (segs.length !== 2) return notFound();
  const [id, token] = segs.map(safeDecode);
  if (!isValidId(id) || token === null || !TOKEN_RE.test(token)) return notFound();
  const variant = parse(await readDoc(env, "variants", id));
  if (!variant || !tokensEqual(token, variant.token) || !isValidId(variant.base)) return notFound();
  const base = parse(await readDoc(env, "pages", variant.base));
  if (!base) return notFound();
  const { page } = variantToPage(base, variant);
  const label = typeof variant.label === "string" ? variant.label.slice(0, 80) : id;
  return new Response(await renderPage(env, page, site, { preview: { label } }), { headers: PREVIEW_HEADERS });
}

// The only inline script a landing page may run is the motion guard, by hash.
let guardHash: Promise<string> | null = null;
export function motionGuardHash(): Promise<string> {
  const body = MOTION_GUARD.replace(/^<script>/, "").replace(/<\/script>$/, "");
  guardHash ??= crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)).then((d) => btoa(String.fromCharCode(...new Uint8Array(d))));
  return guardHash;
}
export async function landingCsp(origin: string): Promise<string> {
  return [
    "default-src 'none'",
    `script-src 'sha256-${await motionGuardHash()}' ${origin}/app.js`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
  ].join("; ");
}

async function handleSite(env: Env, pathname: string, origin = SITE_BASE): Promise<Response> {
  const siteRaw = await readDoc(env, "site", "config");
  const site = siteRaw ? JSON.parse(siteRaw) : {};

  // Landing pages at /l/{slug}: sanitised HTML inside the site header/footer,
  // served with a strict CSP as a second layer of defence.
  if (pathname.startsWith("/l/")) {
    const slug = safeDecode(pathname.slice(3).replace(/\/+$/, "")) ?? "";
    const raw = await readDoc(env, "landing", slug);
    const doc = parse(raw);
    if (doc && typeof doc.html === "string")
      return new Response(renderLanding(doc, site), {
        headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": await landingCsp(origin) },
      });
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
      // Gate the MCP door with the same bearer key as the REST API (fail closed).
      const auth = request.headers.get("authorization") || "";
      if (!env.API_KEY || auth !== `Bearer ${env.API_KEY}`)
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: env.API_KEY ? 401 : 503,
          headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
        });
      if (pathname === "/mcp") return ContentMCP.serve("/mcp").fetch(request, env, ctx);
      return ContentMCP.serveSSE("/sse").fetch(request, env, ctx);
    }
    // Advisory only: previews are protected by their token and noindex headers.
    if (pathname === "/robots.txt")
      return new Response("User-agent: *\nDisallow: /preview/\nAllow: /\n", { headers: { "content-type": "text/plain" } });
    if (pathname.startsWith("/preview/")) return handlePreview(env, pathname);
    if (pathname.startsWith("/ui/edit/")) return handleEditor(env, pathname);
    if (pathname === "/admin/upload")
      return new Response(renderUploadPage(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    if (pathname.startsWith("/media/")) return handleMediaGet(env, url);

    return handleSite(env, pathname, url.origin);
  },
} satisfies ExportedHandler<Env>;
