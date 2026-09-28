import { describe, it, expect } from "vitest";
import worker from "../src/index";
import { fakeEnv, homeFixture, siteFixture, authed, anon } from "./helpers";

const ctx = {} as any;
const call = (env: any, req: Request) => worker.fetch(req, env, ctx);
const body = async (r: Response) => JSON.parse(await r.text());
const newEnv = () => fakeEnv({ "pages/home": homeFixture(), "pages/about": { title: "About", sections: [{ type: "statement", statement: "Hi" }] }, "site/config": siteFixture() });
const post = (url: string, data: unknown) => authed(url, { method: "POST", body: JSON.stringify(data) });
const doc = (env: any, c: string, id: string) =>
  JSON.parse((env.DB.raw.prepare("SELECT data FROM documents WHERE collection=? AND id=?").get(c, id) as any).data);

async function create(env: any, id = "home-stage", base = "home") {
  const r = await call(env, post(`/api/pages/${base}/variants`, { id, label: "Stage" }));
  return { status: r.status, json: await body(r) };
}

describe("authentication and caching of variant routes", () => {
  it.each([
    ["GET", "/api/pages/home/variants"],
    ["POST", "/api/pages/home/variants"],
    ["POST", "/api/variants/home-stage/publish"],
    ["GET", "/api/presentation-options"],
    ["GET", "/api/variants/home-stage"],
  ])("%s %s rejects unauthenticated requests without leaking data", async (method, url) => {
    const env = newEnv();
    await create(env);
    const r = await call(env, anon(url, { method, body: method === "POST" ? "{}" : undefined }));
    expect(r.status).toBe(401);
    const text = await r.text();
    expect(text).not.toMatch(/preview|token|Stage/);
  });
  it("sends no-store on API responses", async () => {
    const env = newEnv();
    for (const url of ["/api/pages/home/variants", "/api/presentation-options", "/api/pages/home"]) {
      expect((await call(env, authed(url))).headers.get("cache-control")).toBe("no-store");
    }
  });
});

describe("variant lifecycle", () => {
  it("creates a variant, persisting section keys without changing the live page's HTML", async () => {
    const env = newEnv();
    const before = await (await call(env, anon("/"))).text();
    const { status, json } = await create(env);
    expect(status).toBe(200);
    expect(json.previewUrl).toMatch(/^https:\/\/x\.test\/preview\/home-stage\/[A-Za-z0-9_-]{24}$/);
    expect(json.sections[0]).toEqual({ key: "hero-1", type: "hero", heading: "It's never too late to sing." });
    expect(doc(env, "pages", "home").sections.every((s: any) => typeof s.key === "string")).toBe(true);
    expect(await (await call(env, anon("/"))).text()).toBe(before);
  });
  it("previews through the normal renderer with private headers", async () => {
    const env = newEnv();
    const { json } = await create(env);
    await call(env, authed("/api/variants/home-stage", { method: "PATCH", body: JSON.stringify({ design: { concept: "stage" }, sections: [{ from: "statement-1", style: { theme: "night" } }, { from: "hero-1" }, { from: "gone-1" }] }) }));
    const r = await call(env, anon(new URL(json.previewUrl).pathname));
    expect(r.status).toBe(200);
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    const html = await r.text();
    expect(html).toContain("Preview · Stage · not live");
    expect(html).toContain('<body class="d-concept-stage">');
    expect(html.indexOf("Perhaps you've always wanted to sing.")).toBeLessThan(html.indexOf("<h1>It's never too late to sing."));
    expect(html).not.toContain("gone-1");
    expect(html).not.toContain("From First Note"); // omitted section
    expect(html).not.toMatch(/token|statement-1|hero-1/);
  });
  it.each([
    "/preview/home-stage/AAAAAAAAAAAAAAAAAAAAAAAA",
    "/preview/home-stage/short",
    "/preview/home-stage",
    "/preview/Home-Stage/AAAAAAAAAAAAAAAAAAAAAAAA",
    "/preview/nope/AAAAAAAAAAAAAAAAAAAAAAAA",
    "/preview/home-stage/AAAAAAAAAAAAAAAAAAAAAAAA/extra",
    "/preview/%E0%A4%A/AAAAAAAAAAAAAAAAAAAAAAAA",
  ])("404s bad previews with the same private headers: %s", async (path) => {
    const env = newEnv();
    await create(env);
    const r = await call(env, anon(path));
    expect(r.status).toBe(404);
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("preserves the token across PUT, PATCH and undo", async () => {
    const env = newEnv();
    await create(env);
    const token = doc(env, "variants", "home-stage").token;
    await call(env, authed("/api/variants/home-stage", { method: "PUT", body: JSON.stringify({ base: "about", label: "X", token: "A".repeat(24), sections: [] }) }));
    expect(doc(env, "variants", "home-stage")).toMatchObject({ token, base: "home" });
    await call(env, authed("/api/variants/home-stage", { method: "PATCH", body: JSON.stringify({ token: null }) }));
    expect(doc(env, "variants", "home-stage").token).toBe(token);
    await call(env, post("/api/undo/variants/home-stage", {}));
    await call(env, post("/api/undo/variants/home-stage", {}));
    expect(doc(env, "variants", "home-stage").token).toBe(token);
  });
  it("returns presentation warnings on writes", async () => {
    const env = newEnv();
    await create(env);
    const r = await body(await call(env, authed("/api/variants/home-stage", { method: "PATCH", body: JSON.stringify({ sections: [{ from: "hero-1", style: { theme: "pink" } }] }) })));
    expect(r.warnings).toEqual(['section 1 (hero-1): style.theme = "pink" is not allowed (use cream | ivory | teal | night); ignored.']);
  });
  it("lists variants with unresolved references", async () => {
    const env = newEnv();
    await create(env);
    await call(env, authed("/api/variants/home-stage", { method: "PATCH", body: JSON.stringify({ sections: [{ from: "hero-1" }, { from: "gone-1" }] }) }));
    const r = await body(await call(env, authed("/api/pages/home/variants")));
    expect(r.variants).toHaveLength(1);
    expect(r.variants[0]).toMatchObject({ id: "home-stage", label: "Stage", unresolved: ["gone-1"] });
  });
  it("enforces the limit, duplicate ids, missing base and id rules", async () => {
    const env = newEnv();
    const ids = ["v-a", "v-b", "v-c", "v-d", "v-e", "v-f"];
    for (const id of ids) expect((await create(env, id)).status).toBe(200);
    expect((await create(env, "v-g")).json.error).toMatch(/limit is 6/);
    expect((await create(env, "v-a", "about")).json.error).toMatch(/already exists/);
    expect((await create(env, "v-x", "missing")).json.error).toMatch(/no page/);
    for (const bad of ["V", "a/b", "a%2fb", "a?b", "a#b", "a b", "a\u0001", "a".repeat(65), "' OR 1=1 --"]) {
      const r = await create(env, bad, "about");
      expect(r.status).toBe(400);
    }
    for (const base of ["%27%20OR%201%3D1%20--", "a%2fb", "HOME"]) {
      const r = await call(env, authed(`/api/pages/${base}/variants`));
      expect(r.status).toBe(400);
      expect((await body(r)).variants).toBeUndefined();
    }
  });
  it("publishes (sanitised, reporting dropped sections) and undo restores the live page", async () => {
    const env = newEnv();
    await create(env);
    const live = doc(env, "pages", "home");
    await call(env, authed("/api/variants/home-stage", { method: "PATCH", body: JSON.stringify({ design: { concept: "editorial", x: 1 }, sections: [{ from: "hero-1", style: { hero: "split", evil: "<x>" } }, { from: "cta-1" }] }) }));
    const r = await body(await call(env, post("/api/variants/home-stage/publish", {})));
    expect(r.ok).toBe(true);
    expect(r.dropped).toHaveLength(7);
    expect(r.stripped).toHaveLength(2);
    const published = doc(env, "pages", "home");
    expect(published.design).toEqual({ concept: "editorial" });
    expect(published.sections.map((s: any) => s.key)).toEqual(["hero-1", "cta-1"]);
    expect(published.sections[0].style).toEqual({ hero: "split" });
    await call(env, post("/api/undo/pages/home", {}));
    expect(doc(env, "pages", "home")).toEqual(live);
  });
  it("refuses to publish unresolved references", async () => {
    const env = newEnv();
    await create(env);
    await call(env, authed("/api/variants/home-stage", { method: "PATCH", body: JSON.stringify({ sections: [{ from: "gone-1" }] }) }));
    const r = await call(env, post("/api/variants/home-stage/publish", {}));
    expect(r.status).toBe(400);
    expect((await body(r)).unresolved).toEqual(["gone-1"]);
  });
});

describe("site", () => {
  it("robots.txt disallows previews", async () => {
    expect(await (await call(newEnv(), anon("/robots.txt"))).text()).toContain("Disallow: /preview/");
  });
  it("presentation options come from the allowlist", async () => {
    const r = await body(await call(newEnv(), authed("/api/presentation-options")));
    expect(Object.keys(r.style.theme.values)).toEqual(["cream", "ivory", "teal", "night"]);
    expect(r.examples.journey.design.progress).toBe(true);
  });
  it("OpenAPI exposes the new operations and generated enums", async () => {
    const r = await body(await call(newEnv(), anon("/openapi.json")));
    expect(r.info.version).toBe("0.7.1");
    expect(r.paths["/api/pages/{base}/variants"].post.operationId).toBe("createPageVariant");
    expect(r.components.schemas.SectionStyle.properties.theme.enum).toEqual(["cream", "ivory", "teal", "night"]);
    expect(r.components.schemas.Section.properties.key.pattern).toBeTruthy();
  });
});

describe("OpenAPI passes the ChatGPT Actions validator rules", () => {
  it("keeps descriptions within 300 characters and gives every object schema properties", async () => {
    const spec = await body(await call(newEnv(), anon("/openapi.json")));
    const problems: string[] = [];
    for (const [path, ops] of Object.entries<any>(spec.paths))
      for (const [method, op] of Object.entries<any>(ops)) {
        if ((op.description || "").length > 300) problems.push(`${method} ${path}: description ${op.description.length}`);
        for (const [code, res] of Object.entries<any>(op.responses || {})) {
          const schema = res.content?.["application/json"]?.schema;
          if (schema && schema.type === "object" && !schema.properties) problems.push(`${method} ${path} ${code}: object schema missing properties`);
        }
      }
    expect(problems).toEqual([]);
  });
});

describe("listing before any variant exists", () => {
  it("reports the section keys the page will get, without writing", async () => {
    const env = newEnv();
    const r = await body(await call(env, authed("/api/pages/home/variants")));
    expect(r.variants).toEqual([]);
    expect(r.sections.map((s: any) => s.key)).toEqual(["hero-1", "statement-1", "showcase-1", "pullquote-1", "panels-1", "feature-1", "duo-1", "cta-1", "doorway-1"]);
    expect(doc(env, "pages", "home").sections[0].key).toBeUndefined();
    // and create persists exactly those keys
    await create(env);
    expect(doc(env, "pages", "home").sections.map((s: any) => s.key)).toEqual(r.sections.map((s: any) => s.key));
  });
});

describe("feature requests carry the developer's resolution", () => {
  it("lists status and resolution", async () => {
    const env = newEnv();
    await call(env, post("/api/feature-requests", { title: "Carousel" }));
    env.DB.raw.prepare("UPDATE feature_requests SET status='declined', resolution='Superseded by #18' WHERE id=1").run();
    const r = await body(await call(env, authed("/api/feature-requests")));
    expect(r.requests[0]).toMatchObject({ id: 1, title: "Carousel", status: "declined", resolution: "Superseded by #18" });
  });
});
