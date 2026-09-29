import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../src/index";
import { checkFetchUrl, normaliseSources, mediaKind, safeName, slugForAsset, signMasterUrl, verifyMasterSig, MAX_SOURCES } from "../src/media-import";
import { fakeEnv, fakeMedia, authed, anon, siteFixture, API_KEY } from "./helpers";

const UID = "0123456789abcdef0123456789abcdef";
const ctx = {} as any;
const call = (env: any, req: Request) => worker.fetch(req, env, ctx);
const body = async (r: Response) => JSON.parse(await r.text());
const post = (url: string, data: unknown) => authed(url, { method: "POST", body: JSON.stringify(data) });
const doc = (env: any, c: string, id: string) => { const r = env.DB.raw.prepare("SELECT data FROM documents WHERE collection=? AND id=?").get(c, id) as any; return r && JSON.parse(r.data); };
const envWith = (docs: Record<string, unknown> = {}) => fakeEnv({ "site/config": siteFixture(), ...docs }, { MEDIA: fakeMedia(), STREAM_TOKEN: "secret-stream-token", CF_ACCOUNT_ID: "acct" });
const bytes = (n: number) => new Uint8Array(n).fill(7);

/** fetch router: sources by URL, Stream API calls recorded. */
function stubFetch(routes: Record<string, () => Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u.endsWith("/stream/copy")) return Response.json({ success: true, result: { uid: UID } });
    if (u.includes(`/stream/${UID}`) && init?.method === "POST") return Response.json({ success: true, result: {} });
    if (u.includes(`/stream/${UID}`)) return Response.json({ success: true, result: { readyToStream: true, duration: 42.47, size: 123, input: { width: 1920, height: 1080 }, thumbnail: "javascript:evil", status: { state: "ready" } } });
    const h = routes[u];
    return h ? h() : new Response("nope", { status: 404 });
  });
  return calls;
}
const mp4 = (n = 1000, headers: Record<string, string> = {}) => () => new Response(bytes(n), { headers: { "content-type": "video/mp4", "content-length": String(n), ...headers } });
const CHAT = "https://files.oaiusercontent.com/file-abc?sig=1";
const ref = (over: any = {}) => ({ name: "Aria Rehearsal.mp4", id: "file-abc", mime_type: "video/mp4", download_link: CHAT, ...over });

afterEach(() => vi.unstubAllGlobals());

describe("fetch policy", () => {
  it.each([
    ["http://files.oaiusercontent.com/x", "url"], ["https://127.0.0.1/x", "url"], ["https://[::1]/x", "url"], ["https://localhost/x", "url"],
    ["https://nas.local/x", "url"], ["https://svc.internal/x", "url"], ["https://intranet/x", "url"], ["https://u:p@example.com/x", "url"],
    ["https://example.com:8443/x", "url"], ["data:video/mp4;base64,AAAA", "url"], ["https://example.com/x.mp4", "chatgpt"],
    ["https://oaiusercontent.com.evil.example/x", "chatgpt"], ["not a url", "url"],
  ])("rejects %s (%s)", (url, kind) => expect(checkFetchUrl(url, kind as any)).not.toBeNull());
  it("accepts public https and ChatGPT file storage", () => {
    expect(checkFetchUrl("https://cdn.example.com/a.mp4", "url")).toBeNull();
    expect(checkFetchUrl(CHAT, "chatgpt")).toBeNull();
    expect(checkFetchUrl("https://xn--bcher-kva.example/a.mp4", "url")).toBeNull();
  });
});

describe("normalising and naming", () => {
  it("accepts both doors and enforces the file limit", () => {
    expect(normaliseSources({ openaiFileIdRefs: [ref()] })).toEqual({ sources: [{ kind: "chatgpt", url: CHAT, name: "Aria Rehearsal.mp4", mime: "video/mp4" }] });
    expect(normaliseSources({ urls: ["https://cdn.example.com/v/clip%201.mov"] })).toEqual({ sources: [{ kind: "url", url: "https://cdn.example.com/v/clip%201.mov", name: "clip 1.mov" }] });
    expect(normaliseSources({ openaiFileIdRefs: ["file-abc"] })).toHaveProperty("error"); // the OpenAPI string form never arrives at runtime
    expect(normaliseSources({})).toHaveProperty("error");
    expect(normaliseSources({ urls: Array(MAX_SOURCES + 1).fill("https://a.example/x.mp4") })).toHaveProperty("error");
  });
  it("matches MIME types to extensions", () => {
    expect(mediaKind("video/mp4", "a.mp4")).toBe("video");
    expect(mediaKind("audio/mpeg", "a.mp3")).toBe("audio");
    expect(mediaKind("video/mp4", "a.mp3")).toBeNull();
    expect(mediaKind("text/html", "a.mp4")).toBeNull();
    expect(mediaKind("image/png", "a.png")).toBeNull();
  });
  it("makes safe keys and ids", () => {
    expect(safeName("../../Aria Rehearsal (final).MP4")).toBe("aria-rehearsal-final-.mp4");
    expect(slugForAsset("Aria Rehearsal.mp4")).toBe("aria-rehearsal");
    expect(slugForAsset("2024 gala.mov")).toBe("media-2024-gala");
  });
});

describe("signed master URLs", () => {
  it("verify only when valid, unexpired and untampered", async () => {
    const now = Date.UTC(2026, 8, 29);
    const u = new URL(await signMasterUrl("https://x.test", "masters/a/r/f.mp4", API_KEY, now));
    const exp = u.searchParams.get("exp"), sig = u.searchParams.get("sig");
    expect(await verifyMasterSig("masters/a/r/f.mp4", exp, sig, API_KEY, now)).toBe(true);
    expect(await verifyMasterSig("masters/a/r/g.mp4", exp, sig, API_KEY, now)).toBe(false);
    expect(await verifyMasterSig("masters/a/r/f.mp4", exp, sig!.replace(/.$/, "A"), API_KEY, now)).toBe(false);
    expect(await verifyMasterSig("masters/a/r/f.mp4", exp, sig, API_KEY, now + 16 * 60 * 1000)).toBe(false);
    expect(await verifyMasterSig("masters/a/r/f.mp4", exp, sig, "other-key", now)).toBe(false);
  });
});

describe("POST /api/media/import", () => {
  it("imports a chat video: private master in R2, Stream copies from a signed URL, pending consent", async () => {
    const env = envWith();
    const calls = stubFetch({ [CHAT]: mp4(1000) });
    const r = await body(await call(env, post("/api/media/import", { openaiFileIdRefs: [ref()], title: "Aria rehearsal", alt: "Julie at the piano", poster_at: 30 })));
    expect(r.results).toEqual([{ ok: true, asset: "aria-rehearsal", ref: "asset:aria-rehearsal", type: "video", status: "processing", replaced: false, warnings: ["add a transcript if the video has speech or lyrics."] }]);
    const a = doc(env, "assets", "aria-rehearsal");
    expect(a).toMatchObject({ type: "video", file: UID, status: "processing", size: 1000, consent: "pending", title: "Aria rehearsal", alt: "Julie at the piano", source: { kind: "chatgpt", name: "Aria Rehearsal.mp4" } });
    expect(a.master).toMatch(/^masters\/aria-rehearsal\/[a-z0-9_-]{24}\/aria-rehearsal\.mp4$/);
    expect(env.MEDIA.objects.get(a.master).data.length).toBe(1000);
    const copy = calls.find((c) => c.url.endsWith("/stream/copy"))!;
    const sent = JSON.parse(String(copy.init!.body));
    expect(sent.url).toMatch(new RegExp(`^https://x\\.test/media/${a.master}\\?exp=\\d+&sig=`));
    expect(sent.thumbnailTimestampPct).toBe(0.3);
    expect(env.DB.raw.prepare("SELECT count(*) n FROM versions WHERE collection='assets'").get().n).toBe(1);
  });
  it("imports audio as a consent-gated playable file", async () => {
    const env = envWith();
    stubFetch({ "https://cdn.example.com/song.mp3": () => new Response(bytes(500), { headers: { "content-type": "audio/mpeg", "content-length": "500" } }) });
    const r = await body(await call(env, post("/api/media/import", { urls: ["https://cdn.example.com/song.mp3"] })));
    expect(r.results[0]).toMatchObject({ ok: true, type: "audio", status: "ready" });
    const a = doc(env, "assets", "song");
    expect(a.file).toMatch(/^imports\/song\//);
    expect(a.master).toBe(a.file);
    // pending consent: not served; once not-needed: served, never cached
    expect((await call(env, anon(`/media/${a.file}`))).status).toBe(404);
    env.DB.raw.prepare("UPDATE documents SET data=json_set(data,'$.consent','not-needed') WHERE collection='assets' AND id='song'").run();
    const ok = await call(env, anon(`/media/${a.file}`));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store, private");
    env.DB.raw.prepare("UPDATE documents SET data=json_set(data,'$.consent','granted','$.consent_expires','2020-01-01') WHERE collection='assets' AND id='song'").run();
    expect((await call(env, anon(`/media/${a.file}`))).status).toBe(404);
  });
  it("serves masters only with a valid signature, uncached", async () => {
    const env = envWith();
    await env.MEDIA.put("masters/a/r/f.mp4", new Uint8Array([1, 2]));
    expect((await call(env, anon("/media/masters/a/r/f.mp4"))).status).toBe(404);
    const signed = new URL(await signMasterUrl("https://x.test", "masters/a/r/f.mp4", API_KEY));
    const r = await call(env, anon(signed.pathname + signed.search));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store, private");
  });
  it("replaces a placeholder keeping its details", async () => {
    const env = envWith({ "assets/aria": { type: "video", file: "f".repeat(32), master: "masters/aria/old/x.mp4", title: "Aria", alt: "Kept alt", consent: "not-needed", usage: ["concert"], caption: "Kept caption" } });
    stubFetch({ [CHAT]: mp4(800) });
    const r = await body(await call(env, post("/api/media/import", { openaiFileIdRefs: [ref()], asset: "aria", title: "Ignored on replace" })));
    expect(r.results[0]).toMatchObject({ ok: true, asset: "aria", replaced: true });
    const a = doc(env, "assets", "aria");
    expect(a).toMatchObject({ file: UID, title: "Aria", alt: "Kept alt", consent: "not-needed", usage: ["concert"], caption: "Kept caption" });
    expect(a.previous_files[0]).toMatchObject({ file: "f".repeat(32), master: "masters/aria/old/x.mp4" });
  });
  it.each([
    ["oversized", { [CHAT]: mp4(201 * 1024 * 1024) }, /too large/],
    ["no length", { [CHAT]: () => new Response(bytes(10), { headers: { "content-type": "video/mp4" } }) }, /did not say how big the file is/],
    ["wrong type", { [CHAT]: () => new Response(bytes(10), { headers: { "content-type": "text/html", "content-length": "10" } }) }, /type does not match/],
    ["expired chat link", { [CHAT]: () => new Response("x", { status: 403 }) }, /chat file's download link has expired/],
    ["off-host redirect", { [CHAT]: () => new Response(null, { status: 302, headers: { location: "https://evil.example/x.mp4" } }) }, /redirected to a link that is not allowed/],
    ["body longer than declared", { [CHAT]: () => new Response(bytes(2000), { headers: { "content-type": "video/mp4", "content-length": "1000" } }) }, /interrupted|incomplete/],
  ])("fails cleanly: %s", async (_name, routes, message) => {
    const env = envWith();
    stubFetch(routes as any);
    const r = await body(await call(env, post("/api/media/import", { openaiFileIdRefs: [ref()] })));
    expect(r.results[0].ok).toBe(false);
    expect(r.results[0].error).toMatch(message as RegExp);
    expect(env.MEDIA.objects.size).toBe(0);
    expect(doc(env, "assets", "aria-rehearsal")).toBeUndefined();
  });
  it("follows allowed redirects within ChatGPT storage", async () => {
    const env = envWith();
    stubFetch({ [CHAT]: () => new Response(null, { status: 302, headers: { location: "https://blob.oaiusercontent.com/y" } }), "https://blob.oaiusercontent.com/y": mp4(10) });
    expect((await body(await call(env, post("/api/media/import", { openaiFileIdRefs: [ref()] })))).results[0].ok).toBe(true);
  });
  it("rejects bad requests and unauthenticated calls, and never leaks the Stream token", async () => {
    const env = envWith();
    stubFetch({ [CHAT]: mp4(10) });
    expect((await call(env, anon("/api/media/import", { method: "POST", body: "{}" }))).status).toBe(401);
    expect((await call(env, post("/api/media/import", { openaiFileIdRefs: [ref(), ref()], asset: "x" }))).status).toBe(400);
    const texts = await Promise.all([
      call(env, post("/api/media/import", { openaiFileIdRefs: [ref()] })).then((r) => r.text()),
      call(env, post("/api/media/refresh/aria-rehearsal", { poster_at: 50 })).then((r) => r.text()),
    ]);
    for (const t of texts) expect(t).not.toContain("secret-stream-token");
  });
  it("needs Stream for video and says so", async () => {
    const env = fakeEnv({}, { MEDIA: fakeMedia() });
    stubFetch({ [CHAT]: mp4(10) });
    const r = await body(await call(env, post("/api/media/import", { openaiFileIdRefs: [ref()] })));
    expect(r.results[0].error).toMatch(/Stream to be configured/);
  });
});

describe("POST /api/media/refresh", () => {
  it("fills in validated Stream details and derives the thumbnail from the uid", async () => {
    const env = envWith({ "assets/clip": { type: "video", file: UID, status: "processing", consent: "pending" } });
    const calls = stubFetch({});
    const r = await body(await call(env, post("/api/media/refresh/clip", { poster_at: 50 })));
    expect(r).toMatchObject({ ok: true, status: "ready", duration: 42.5, width: 1920, height: 1080, orientation: "landscape", size: 123, thumbnail: `https://videodelivery.net/${UID}/thumbnails/thumbnail.jpg` });
    expect(JSON.parse(String(calls.find((c) => c.init?.method === "POST")!.init!.body))).toEqual({ thumbnailTimestampPct: 0.5 });
    expect(JSON.stringify(doc(env, "assets", "clip"))).not.toContain("javascript");
  });
  it("refuses non-video assets", async () => {
    const env = envWith({ "assets/song": { type: "audio", file: "imports/song/x/a.mp3" } });
    stubFetch({});
    expect((await call(env, post("/api/media/refresh/song", {}))).status).toBe(400);
  });
});

describe("hardening from code review", () => {
  it("fails closed when no API key is configured", async () => {
    const env = { ...envWith(), API_KEY: undefined };
    expect((await call(env, anon("/api/pages/home"))).status).toBe(503);
    expect((await call(env, authed("/api/pages/home"))).status).toBe(503);
    expect((await call(env, anon("/mcp", { method: "POST" }))).status).toBe(503);
  });
  it("protects the direct media write API", async () => {
    const env = envWith();
    expect((await call(env, anon("/api/media/x.mp3", { method: "PUT", body: "x" }))).status).toBe(401);
    expect((await call(env, anon("/api/media/x.mp3", { method: "DELETE" }))).status).toBe(401);
  });
  it("rejects bodies shorter than declared and enforces the exact cap", async () => {
    const { MEDIA_TYPES } = await import("../src/media-import");
    const cap = MEDIA_TYPES.audio.cap;
    MEDIA_TYPES.audio.cap = 100;
    try {
      const src = (n: number, declared = n) => () => new Response(bytes(n), { headers: { "content-type": "audio/mpeg", "content-length": String(declared) } });
      const run = async (h: () => Response) => {
        const env = envWith();
        stubFetch({ "https://cdn.example.com/a.mp3": h });
        return { r: (await body(await call(env, post("/api/media/import", { urls: ["https://cdn.example.com/a.mp3"] })))).results[0], env };
      };
      expect((await run(src(100))).r.ok).toBe(true); // exactly the cap
      const over = await run(src(101));
      expect(over.r.error).toMatch(/too large/);
      const short = await run(src(50, 60));
      expect(short.r.ok).toBe(false);
      expect(short.env.MEDIA.objects.size).toBe(0);
    } finally {
      MEDIA_TYPES.audio.cap = cap;
    }
  });
  it("warns about missing alt text and transcripts", async () => {
    const env = envWith();
    stubFetch({ [CHAT]: mp4(10) });
    const r = await body(await call(env, post("/api/media/import", { openaiFileIdRefs: [ref()] })));
    expect(r.results[0].warnings.join(" ")).toMatch(/add alt[\s\S]*transcript/);
  });
});

describe("copyToR2 failure paths", () => {
  it("cleans up when R2 rejects the write", async () => {
    const env = envWith();
    env.MEDIA.put = async () => { throw new Error("R2 down"); };
    stubFetch({ [CHAT]: mp4(10) });
    const r = await body(await call(env, post("/api/media/import", { openaiFileIdRefs: [ref()] })));
    expect(r.results[0]).toMatchObject({ ok: false, error: expect.stringMatching(/interrupted/) });
    expect(env.MEDIA.deleted.length).toBe(1);
    expect(doc(env, "assets", "aria-rehearsal")).toBeUndefined();
  });
  it("cleans up when the source stream fails midway", async () => {
    const env = envWith();
    const failing = () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(5)); c.error(new Error("connection reset")); } }), { headers: { "content-type": "video/mp4", "content-length": "100" } });
    stubFetch({ [CHAT]: failing });
    const r = await body(await call(env, post("/api/media/import", { openaiFileIdRefs: [ref()] })));
    expect(r.results[0].ok).toBe(false);
    expect(env.MEDIA.objects.size).toBe(0);
    expect(env.MEDIA.deleted.length).toBe(1);
  });
  it("removes the master when Stream refuses the video", async () => {
    const env = envWith();
    vi.stubGlobal("fetch", async (url: string) =>
      String(url).endsWith("/stream/copy") ? Response.json({ success: false, errors: [{ code: 10005, message: "quota exceeded token=secret-stream-token" }] }, { status: 400 }) : mp4(10)());
    const r = await body(await call(env, post("/api/media/import", { openaiFileIdRefs: [ref()] })));
    expect(r.results[0].error).toBe("Cloudflare Stream refused the request (400, code 10005): quota exceeded [redacted]");
    expect(r.results[0].error).not.toContain("secret-stream-token");
    expect(env.MEDIA.objects.size).toBe(0);
  });
  it("one bad file does not fail the others", async () => {
    const env = envWith();
    stubFetch({ [CHAT]: mp4(10), "https://files.oaiusercontent.com/bad": () => new Response("x", { status: 403 }) });
    const r = await body(await call(env, post("/api/media/import", { openaiFileIdRefs: [ref(), ref({ name: "b.mp4", download_link: "https://files.oaiusercontent.com/bad" })] })));
    expect(r.results.map((x: any) => x.ok)).toEqual([true, false]);
  });
});

describe("review round 3", () => {
  it("the media write API also fails closed without an API key", async () => {
    const env = { ...envWith(), API_KEY: undefined };
    for (const method of ["PUT", "POST", "DELETE"]) expect((await call(env, anon("/api/media/x.mp3", { method, body: method === "DELETE" ? undefined : "x" }))).status).toBe(503);
    expect(env.MEDIA.objects.size).toBe(0);
  });
  it("slugForAsset handles awkward titles", () => {
    expect(slugForAsset("")).toBe("media-file");
    expect(slugForAsset("!!! ???")).toBe("media-file");
    expect(slugForAsset("Chanson d'été.mp3")).toBe("chanson-d-ete");
    expect(slugForAsset("Élan")).toBe("elan");
    expect(slugForAsset("a".repeat(200))).toHaveLength(56);
    expect(slugForAsset("clip.final.mov")).toBe("clip-final");
    for (const t of ["", "x", "Ümlaut ÄÖ", "1234", "--a--"]) expect(slugForAsset(t)).toMatch(/^[a-z][a-z0-9-]{0,63}$/);
  });
  it("de-duplicates ids for repeated names", async () => {
    const env = envWith({ "assets/clip": { type: "video", file: "x" }, "assets/clip-2": { type: "video", file: "y" } });
    stubFetch({ "https://cdn.example.com/clip.mp4": mp4(10) });
    const r = await body(await call(env, post("/api/media/import", { urls: ["https://cdn.example.com/clip.mp4"] })));
    expect(r.results[0].asset).toBe("clip-3");
  });
});

describe("download refusal messages depend on the source", () => {
  it("says a URL is private or gone, not expired", async () => {
    const env = envWith();
    stubFetch({ "https://storage.example.com/private.mp4": () => new Response("AccessDenied", { status: 403 }) });
    const r = await body(await call(env, post("/api/media/import", { urls: ["https://storage.example.com/private.mp4"] })));
    expect(r.results[0].error).toMatch(/refused the download \(HTTP 403\): the file is private/);
    expect(r.results[0].error).not.toMatch(/expired/);
  });
});

