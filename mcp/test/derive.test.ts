/**
 * Sprint 19 (#27): video derivatives — derive_video validation and Stream
 * clip call, live consent inheritance, render-time crop/speed, frames.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import worker from "../src/index";
import { renderPage } from "../src/render";
import { parseEdit, parseCrop, consentOk, linkMasters, describeAsset, streamFrame, assetWarnings, MASTER_CONSENT } from "../src/assets";
import { fakeEnv, fakeMedia, authed, siteFixture, pageWith } from "./helpers";

const MASTER_UID = "0123456789abcdef0123456789abcdef";
const CLIP_UID = "c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1";
const MP4 = `https://customer-abc123.cloudflarestream.com/${CLIP_UID}/downloads/default.mp4`;
const css = readFileSync(fileURLToPath(new URL("../public/styles.css", import.meta.url)), "utf8");
const appJs = readFileSync(fileURLToPath(new URL("../public/app.js", import.meta.url)), "utf8");
const master = { type: "video", file: MASTER_UID, status: "ready", duration: 94.8, width: 576, height: 1024, title: "WhatsApp clip", alt: "Julie at the piano", usage: ["julie-singing", "bogus"], people: ["Julie", 5], consent: "granted", consent_note: "Julie" };

afterEach(() => vi.unstubAllGlobals());

const call = (env: any, req: Request) => worker.fetch(req, env, {} as any);
const derive = (env: any, body: unknown) => call(env, authed("/api/media/derive", { method: "POST", body: JSON.stringify(body) }));
const doc = (env: any, id: string) => { const r = env.DB.raw.prepare("SELECT data FROM documents WHERE collection='assets' AND id=?").get(id) as any; return r && JSON.parse(r.data); };
const envWith = (docs: Record<string, unknown> = {}) =>
  fakeEnv({ "site/config": siteFixture(), "assets/master": master, ...docs }, { MEDIA: fakeMedia(), STREAM_TOKEN: "secret-stream-token", CF_ACCOUNT_ID: "acct" });
function stubClip(respond: () => Response = () => Response.json({ success: true, result: { uid: CLIP_UID, clippedFrom: MASTER_UID } })) {
  const calls: Array<{ url: string; body: any }> = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return String(url).endsWith("/stream/clip") ? respond() : new Response("nope", { status: 404 });
  });
  return calls;
}

describe("edit validation", () => {
  it("accepts a valid excerpt, crop and speed", () => {
    expect(parseEdit({ start: 12, end: 20.04, crop: { x: 0, y: 30, w: 100, h: 40 }, speed: 0.75 }, 94.8)).toEqual({ start: 12, end: 20, crop: { x: 0, y: 30, w: 100, h: 40 }, speed: 0.75 });
    expect(parseEdit({ start: 0, end: 60, speed: 1 })).toEqual({ start: 0, end: 60 });
  });
  it("rejects every bad value with a precise message", () => {
    const bad: Array<[any, RegExp]> = [
      [{ start: -1, end: 5 }, /start/], [{ start: "1", end: 5 }, /start/], [{ start: 5, end: 5 }, /end/], [{ start: 0, end: NaN }, /end/],
      [{ start: 0, end: 0.5 }, /1-60/], [{ start: 0, end: 61 }, /1-60/], [{ start: 90, end: 99 }, /after the end/],
      [{ start: 0, end: 5, speed: 2 }, /speed/], [{ start: 0, end: 5, speed: "0.5" }, /speed/],
      [{ start: 0, end: 5, crop: { x: 0, y: 0, w: 5, h: 50 } }, /10-100/], [{ start: 0, end: 5, crop: { x: 60, y: 0, w: 50, h: 50 } }, /inside the frame/],
      [{ start: 0, end: 5, crop: { x: 1.5, y: 0, w: 50, h: 50 } }, /whole numbers/], [{ start: 0, end: 5, crop: "0 0 50 50" }, /object/],
    ];
    for (const [e, re] of bad) expect(parseEdit(e, 94.8), JSON.stringify(e)).toMatch(re);
    expect(parseCrop({ x: 0, y: 0, w: 100, h: 100 })).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
});

describe("derive_video", () => {
  it("clips from the master and writes an inheriting derivative with re-validated metadata", async () => {
    const env = envWith();
    const calls = stubClip();
    const r = await (await derive(env, { from: "master", start: 12, end: 20, crop: { x: 0, y: 30, w: 100, h: 40 }, speed: 0.75, poster_at: 50 })).json<any>();
    expect(r).toMatchObject({ ok: true, asset: "master-cut", ref: "asset:master-cut", status: "processing", derived_from: "master", replaced: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/stream/clip");
    expect(calls[0].body).toEqual({ clippedFromVideoUID: MASTER_UID, startTimeSeconds: 12, endTimeSeconds: 20, thumbnailTimestampPct: 0.5, meta: { name: "WhatsApp clip", asset: "master-cut" } });
    const d = doc(env, "master-cut");
    expect(d).toEqual({
      type: "video", file: CLIP_UID, status: "processing", title: "WhatsApp clip (excerpt)", alt: "Julie at the piano", people: ["Julie"], usage: ["julie-singing"],
      derived_from: "master", edit: { start: 12, end: 20, crop: { x: 0, y: 30, w: 100, h: 40 }, speed: 0.75 }, muted: true, consent: "inherit",
    });
    expect(doc(env, "master")).toEqual(master);
    // a second derive picks the next free id
    await derive(env, { from: "master", start: 30, end: 36 });
    expect(doc(env, "master-cut-2")).toMatchObject({ derived_from: "master", edit: { start: 30, end: 36 } });
  });

  it("validates before calling Stream (no cost for bad requests)", async () => {
    const env = envWith({
      "assets/photo": { type: "image", file: "x.jpeg", consent: "granted" },
      "assets/busy": { ...master, status: "processing" },
      "assets/child": { ...master, derived_from: "master", consent: "inherit" },
    });
    const calls = stubClip();
    const cases: Array<[any, number, RegExp]> = [
      [{ from: "' OR 1=1 --", start: 0, end: 5 }, 400, /from must be/],
      [{ from: "nope", start: 0, end: 5 }, 404, /no asset/],
      [{ from: "photo", start: 0, end: 5 }, 400, /imported video/],
      [{ from: "busy", start: 0, end: 5 }, 400, /not ready/],
      [{ from: "child", start: 0, end: 5 }, 400, /itself a derivative/],
      [{ from: "master", start: 0, end: 90 }, 400, /1-60/],
      [{ from: "master", start: 0, end: 5, crop: { x: 90, y: 0, w: 20, h: 20 } }, 400, /inside the frame/],
      [{ from: "master", start: 0, end: 5, poster_at: "10" }, 400, /poster_at/],
      [{ from: "master", start: 0, end: 5, id: "Bad Id" }, 400, /id must be/],
      [{ from: "master", start: 0, end: 5, title: { x: 1 } }, 400, /title must be text/],
      ...["../site/config", "' OR 1=1 --", "<script>", "a".repeat(65), "Moment", 5].map((id): [any, number, RegExp] => [{ from: "master", start: 0, end: 5, id }, 400, /id must be/]),
      [{ from: "master", start: 0, end: 5, id: "photo" }, 409, /not a derivative of master/],
    ];
    for (const [b, status, re] of cases) {
      const res = await derive(env, b);
      expect(res.status, JSON.stringify(b)).toBe(status);
      expect((await res.json<any>()).error).toMatch(re);
    }
    expect(calls).toHaveLength(0);
    expect(doc(env, "photo")).toMatchObject({ type: "image" });
  });

  it("re-derives into an existing derivative, keeping its details and history", async () => {
    const env = envWith({ "assets/moment": { type: "video", file: "d".repeat(32), status: "ready", mp4: "x", mp4_status: "ready", width: 576, height: 1024, derived_from: "master", edit: { start: 1, end: 5 }, consent: "inherit", title: "Moment", alt: "Custom alt" } });
    stubClip();
    const r = await (await derive(env, { from: "master", id: "moment", start: 40, end: 48 })).json<any>();
    expect(r).toMatchObject({ ok: true, asset: "moment", replaced: true });
    const d = doc(env, "moment");
    expect(d).toMatchObject({ file: CLIP_UID, status: "processing", title: "Moment", alt: "Custom alt", consent: "inherit", derived_from: "master", edit: { start: 40, end: 48 } });
    expect(d).not.toHaveProperty("mp4");
    expect(d.previous_files[0].file).toBe("d".repeat(32));
  });

  it("caps derivatives per master", async () => {
    const docs: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) docs[`assets/cut-${i}`] = { type: "video", file: CLIP_UID, derived_from: "master", consent: "inherit" };
    const env = envWith(docs);
    const calls = stubClip();
    const res = await derive(env, { from: "master", start: 0, end: 5 });
    expect(res.status).toBe(409);
    expect(calls).toHaveLength(0);
  });

  it("reports Stream refusals redacted, writing nothing", async () => {
    const env = envWith();
    stubClip(() => Response.json({ success: false, errors: [{ code: 10005, message: "bad token=secret-stream-token" }] }, { status: 400 }));
    const res = await derive(env, { from: "master", start: 0, end: 5 });
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(text).not.toContain("secret-stream-token");
    expect(doc(env, "master-cut")).toBeUndefined();
  });

  it("rejects a hostile clip uid from Stream", async () => {
    const env = envWith();
    stubClip(() => Response.json({ success: true, result: { uid: '"><script>' } }));
    expect((await derive(env, { from: "master", start: 0, end: 5 })).status).toBe(502);
  });
});

describe("consent follows the master, live", () => {
  it("honours inherit only through a live master flag that JSON cannot set", () => {
    const d: any = { consent: "inherit", derived_from: "m" };
    expect(consentOk(d)).toBe(false);
    expect(consentOk(JSON.parse('{"consent":"inherit","derived_from":"m","masterConsent":true}'))).toBe(false);
    linkMasters([d], new Map([["m", { consent: "granted" }]]));
    expect(d[MASTER_CONSENT]).toBe(true);
    expect(consentOk(d)).toBe(true);
    for (const m of [{ consent: "pending" }, { consent: "refused" }, { consent: "granted", consent_expires: "2020-01-01" }, { consent: "inherit", derived_from: "x" }, undefined]) {
      const x: any = { consent: "inherit", derived_from: "m" };
      linkMasters([x], new Map(m ? [["m", m]] : []));
      expect(consentOk(x), JSON.stringify(m)).toBe(false);
    }
    const expired: any = { consent: "inherit", derived_from: "m", consent_expires: "2020-01-01" };
    linkMasters([expired], new Map([["m", { consent: "granted" }]]));
    expect(consentOk(expired)).toBe(false);
    expect(consentOk({ consent: "inherit" })).toBe(false);
  });

  const derived = { type: "video", file: CLIP_UID, status: "ready", width: 576, height: 1024, mp4: MP4, mp4_status: "ready", derived_from: "master", consent: "inherit", alt: "Julie at the piano", edit: { start: 12, end: 20, crop: { x: 0, y: 30, w: 100, h: 40 }, speed: 0.75 } };
  const render = (m: any, d: any = derived, style: any = { playback: "ambient", media_ratio: "wide" }) =>
    renderPage(fakeEnv({ ...(m ? { "assets/master": m } : {}), "assets/moment": d }), pageWith([{ type: "media", heading: "Moment", video: "asset:moment", style }]), siteFixture());

  it("shows a derivative only while its master may be shown", async () => {
    expect(await render(master)).toContain("<video");
    for (const m of [{ ...master, consent: "pending" }, { ...master, consent: "refused" }, { ...master, consent_expires: "2020-01-01" }, null]) {
      const html = await render(m);
      expect(html, JSON.stringify(m?.consent)).not.toMatch(/<video|data-stream|Moment/);
    }
  });

  it("search reports the effective consent", async () => {
    const env = fakeEnv({ "site/config": siteFixture(), "assets/master": { ...master, consent: "pending" }, "assets/moment": derived });
    const r = await (await call(env, authed("/api/assets/search?usable=true"))).json<any>();
    expect(r.assets.map((a: any) => a.ref)).not.toContain("asset:moment");
    const all = await (await call(env, authed("/api/assets/search?q=moment"))).json<any>();
    expect(all.assets).toEqual([expect.objectContaining({ ref: "asset:moment", usable: false, derived_from: "master", consent: "inherit" })]);
    const env2 = fakeEnv({ "site/config": siteFixture(), "assets/master": master, "assets/moment": derived });
    const ok = await (await call(env2, authed("/api/assets/search?usable=true"))).json<any>();
    expect(ok.assets.map((a: any) => a.ref)).toContain("asset:moment");
  });

  it("applies the crop as integer custom properties and the speed as data-speed", async () => {
    const html = await render(master);
    // 576x1024 source; crop x0 y30 w100 h40 → centre (288, 512), size 576x410
    expect(html).toMatch(/<video [^>]*data-speed="0.75" style="--sw:576;--sh:1024;--cx:288;--cy:512;--cw:576;--ch:410">/);
    expect(html).not.toMatch(/object-position/);
  });

  it("ignores a hostile or invalid stored edit, and needs dimensions for a crop", async () => {
    for (const edit of [{ start: 0, end: 5, crop: { x: "0;background:url(x)", y: 0, w: 50, h: 50 } }, { start: 0, end: 5, speed: 3 }, { start: 5, end: 1 }, "x"]) {
      const html = await render(master, { ...derived, edit });
      expect(html, JSON.stringify(edit)).toContain("<video");
      expect(html).not.toMatch(/--cw|data-speed|background:url/);
    }
    const noDims = await render(master, { ...derived, width: undefined });
    expect(noDims).not.toContain("--cw");
    expect(noDims).toContain('data-speed="0.75"');
    const hugeDims = await render(master, { ...derived, width: 1e9 });
    expect(hugeDims).not.toContain("--cw");
  });

  it("a crop on a non-derivative is ignored; player mode is unchanged", async () => {
    const plain = await render(null, { ...derived, derived_from: undefined, consent: "granted" });
    expect(plain).not.toMatch(/--cw|data-speed/);
    const player = await render(master, derived, {});
    expect(player).toContain(`data-stream="${CLIP_UID}"`);
    expect(player).not.toMatch(/<video|--cw/);
  });
});

describe("video_frames", () => {
  const get = (env: any, path: string) => call(env, authed(path));
  it("returns frames on the asset's own timeline, clamped to its duration", async () => {
    const env = envWith();
    const r = await (await get(env, "/api/media/frames/master?times=0,2.5,500,-1,x")).json<any>();
    expect(r).toMatchObject({ ok: true, width: 576, height: 1024, duration: 94.8 });
    expect(r.frames).toEqual([
      { time: 0, url: `https://videodelivery.net/${MASTER_UID}/thumbnails/thumbnail.jpg?time=0s&height=480` },
      { time: 2.5, url: `https://videodelivery.net/${MASTER_UID}/thumbnails/thumbnail.jpg?time=2.5s&height=480` },
      { time: 94.7, url: `https://videodelivery.net/${MASTER_UID}/thumbnails/thumbnail.jpg?time=94.7s&height=480` },
    ]);
    const all = await (await get(env, "/api/media/frames/master")).json<any>();
    expect(all.frames).toHaveLength(8);
  });
  it("refuses non-videos and bad ids; builds URLs only from a valid uid", async () => {
    const env = envWith({ "assets/photo": { type: "image", file: "x.jpeg" } });
    expect((await get(env, "/api/media/frames/photo")).status).toBe(400);
    expect((await get(env, "/api/media/frames/Bad%20Id")).status).toBe(400);
    for (const hostile of ["'%20OR%201%3D1%20--", "..%2Fsite%2Fconfig", "%3Cscript%3E", "a".repeat(65)]) expect((await get(env, `/api/media/frames/${hostile}`)).status, hostile).toBe(400);
    expect(streamFrame(`${MASTER_UID}"`, 1)).toBeUndefined();
    expect(streamFrame(MASTER_UID, -1)).toBeUndefined();
  });
  it("derive and frames are not reachable without the key", async () => {
    const env = envWith();
    expect((await call(env, new Request("https://x/api/media/frames/master"))).status).toBe(401);
    expect((await call(env, new Request("https://x/api/media/derive", { method: "POST", body: "{}" }))).status).toBe(401);
  });
});

describe("metadata normaliser and warnings", () => {
  it("re-validates copied fields", () => {
    expect(describeAsset({ alt: " a\u0000b ", people: ["x".repeat(200), 3, "Julie"], usage: ["concert", "evil"], roles: "hero", tone: Array(20).fill("warm") })).toEqual({
      alt: "ab", people: ["x".repeat(80), "Julie"], usage: ["concert"], tone: Array(12).fill("warm"),
    });
  });
  it("warns about inherit on a non-derivative and explicit consent on a derivative", () => {
    expect(assetWarnings({ file: "x", type: "video", alt: "a", consent: "inherit" }).join()).toMatch(/only for derivatives/);
    expect(assetWarnings({ file: "x", type: "video", alt: "a", consent: "granted", consent_note: "n", derived_from: "m" }).join()).toMatch(/keep consent "inherit"/);
    expect(assetWarnings({ file: "x", type: "video", alt: "a", consent: "inherit", derived_from: "m", edit: { start: 0, end: 5 } })).toEqual([]);
  });
});

describe("CSS and script", () => {
  it("crop rule uses container units and stays within budget", () => {
    const start = css.indexOf("/* derivative crop"), end = css.indexOf("/* background: a full-bleed loop");
    expect(end - start).toBeLessThanOrEqual(1024);
    expect(css).toContain(".media-frame__visual, .media-bg { container-type: size; }");
    expect(css).toMatch(/\.media-video\[style\*="--cw"\] \{[^}]*--u: max\(calc\(100cqw \/ var\(--cw\)\), calc\(100cqh \/ var\(--ch\)\)\);/);
  });
  it("observes the frame, so a scaled (cropped) video still counts as on screen", () => {
    expect(appJs).toMatch(/frame: video\.parentElement \|\| video/);
    expect(appJs).toMatch(/videoIo\.observe\(e\.frame\)/);
  });
  it("speed is allowlisted and only slows", () => {
    expect(appJs).toMatch(/if \(speed === 0\.5 \|\| speed === 0\.75\) \{ video\.defaultPlaybackRate = speed; video\.playbackRate = speed; \}/);
  });
});
