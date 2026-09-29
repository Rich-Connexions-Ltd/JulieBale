/**
 * Sprint 18 (#26): editorial video — web MP4 on refresh, validated URLs,
 * ambient/background playback markup, CSS and contrast guards.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import worker from "../src/index";
import { renderPage } from "../src/render";
import { isStreamMp4, applyStreamDownload, streamThumbnail, streamIframe, replaceAssetMedia } from "../src/assets";
import { PRESENTATION_OPTIONS, presentationWarnings } from "../src/presentation";
import { fakeEnv, fakeMedia, authed, siteFixture, pageWith } from "./helpers";

const UID = "0123456789abcdef0123456789abcdef";
const OTHER = "fedcba9876543210fedcba9876543210";
const MP4 = `https://customer-abc123.cloudflarestream.com/${UID}/downloads/default.mp4`;
const css = readFileSync(fileURLToPath(new URL("../public/styles.css", import.meta.url)), "utf8");
const appJs = readFileSync(fileURLToPath(new URL("../public/app.js", import.meta.url)), "utf8");

afterEach(() => vi.unstubAllGlobals());

describe("Stream URL builders", () => {
  it("accepts only this video's own web MP4", () => {
    expect(isStreamMp4(MP4, UID)).toBe(true);
    const hostile = [
      `https://customer-abc123.cloudflarestream.com/${OTHER}/downloads/default.mp4`,
      `http://customer-abc123.cloudflarestream.com/${UID}/downloads/default.mp4`,
      `https://customer-abc123.evil.com/${UID}/downloads/default.mp4`,
      `https://evil.com/customer-abc123.cloudflarestream.com/${UID}/downloads/default.mp4`,
      `${MP4}?x=1`,
      `${MP4}#t=1`,
      `https://user@customer-abc123.cloudflarestream.com/${UID}/downloads/default.mp4`,
      `https://customer-abc123.cloudflarestream.com:8443/${UID}/downloads/default.mp4`,
      `//customer-abc123.cloudflarestream.com/${UID}/downloads/default.mp4`,
      `https://customer-ABC.cloudflarestream.com/${UID}/downloads/default.mp4`,
      `https://customer-abc123.cloudflarestream.com/${UID}/downloads/audio.m4a`,
      `javascript:alert(1)//${MP4}`,
      ` ${MP4}`,
      `${MP4}\n`,
    ];
    for (const h of hostile) expect(isStreamMp4(h, UID), h).toBe(false);
    for (const u of [`${UID}"`, `${UID} x`, `../${UID}`, "javascript:alert(1)", "", 5]) expect(isStreamMp4(MP4, u as any)).toBe(false);
  });
  it("builds thumbnails and iframes only from a valid uid", () => {
    expect(streamThumbnail(UID)).toBe(`https://videodelivery.net/${UID}/thumbnails/thumbnail.jpg`);
    expect(streamIframe(UID)).toBe(`https://iframe.videodelivery.net/${UID}`);
    for (const bad of [`${UID}"onerror=x`, "a b", "//evil.com", "javascript:x"]) {
      expect(streamThumbnail(bad)).toBeUndefined();
      expect(streamIframe(bad)).toBeUndefined();
    }
  });
});

describe("applyStreamDownload", () => {
  const asset = { type: "video", file: UID, status: "ready", mp4: "stale" };
  it("keeps a valid ready URL", () => expect(applyStreamDownload(asset, { status: "ready", url: MP4 })).toMatchObject({ mp4: MP4, mp4_status: "ready" }));
  it("maps in-progress and errors, and never keeps an invalid URL", () => {
    expect(applyStreamDownload(asset, { status: "inprogress", url: MP4 })).toEqual({ type: "video", file: UID, status: "ready", mp4_status: "processing" });
    expect(applyStreamDownload(asset, { status: "error" })).toMatchObject({ mp4_status: "error" });
    expect(applyStreamDownload(asset, { error: "refused" })).toMatchObject({ mp4_status: "error" });
    const hostile = applyStreamDownload(asset, { status: "ready", url: MP4.replace(UID, OTHER) });
    expect(hostile).toMatchObject({ mp4_status: "error" });
    expect(hostile).not.toHaveProperty("mp4");
  });
  it("replacing a placeholder's media drops the old MP4", () => {
    const next = replaceAssetMedia({ ...asset, mp4: MP4, mp4_status: "ready", title: "T" }, { type: "video", file: OTHER, status: "processing" } as any);
    expect(next).not.toHaveProperty("mp4");
    expect(next).not.toHaveProperty("mp4_status");
    expect(next.title).toBe("T");
  });
});

describe("refresh prepares the web MP4", () => {
  const call = (env: any, req: Request) => worker.fetch(req, env, {} as any);
  const post = (url: string) => authed(url, { method: "POST", body: "{}" });
  const doc = (env: any, id: string) => JSON.parse((env.DB.raw.prepare("SELECT data FROM documents WHERE collection='assets' AND id=?").get(id) as any).data);
  const envWith = (asset: Record<string, unknown>) =>
    fakeEnv({ "site/config": siteFixture(), "assets/clip": { type: "video", file: UID, consent: "granted", ...asset } }, { MEDIA: fakeMedia(), STREAM_TOKEN: "secret-stream-token", CF_ACCOUNT_ID: "acct" });
  function stub(ready: boolean, download: () => Response) {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method || "GET"} ${u}`);
      if (u.endsWith(`/stream/${UID}/downloads`)) return download();
      if (u.endsWith(`/stream/${UID}`)) return Response.json({ success: true, result: { readyToStream: ready, input: { width: 1080, height: 1920 }, status: { state: ready ? "ready" : "inprogress" } } });
      return new Response("nope", { status: 404 });
    });
    return calls;
  }
  const dl = (d: unknown) => () => Response.json({ success: true, result: { default: d } });

  it("asks for the MP4 once the video is ready and stores the validated URL", async () => {
    const env = envWith({ status: "processing" });
    const calls = stub(true, dl({ status: "ready", url: MP4, percentComplete: 100 }));
    const r = await (await call(env, post("/api/media/refresh/clip"))).json<any>();
    expect(r).toMatchObject({ ok: true, status: "ready", mp4_status: "ready", orientation: "portrait" });
    expect(calls).toContain(`POST https://api.cloudflare.com/client/v4/accounts/acct/stream/${UID}/downloads`);
    expect(doc(env, "clip")).toMatchObject({ mp4: MP4, mp4_status: "ready" });
    // already prepared: no further downloads call
    const again = stub(true, dl({ status: "ready", url: MP4 }));
    await call(env, post("/api/media/refresh/clip"));
    expect(again.some((c) => c.includes("/downloads"))).toBe(false);
  });
  it("does not ask while the video is still processing", async () => {
    const env = envWith({ status: "processing" });
    const calls = stub(false, dl({ status: "ready", url: MP4 }));
    const r = await (await call(env, post("/api/media/refresh/clip"))).json<any>();
    expect(r.status).toBe("processing");
    expect(calls.some((c) => c.includes("/downloads"))).toBe(false);
  });
  it("reports an MP4 still being prepared", async () => {
    const env = envWith({});
    stub(true, dl({ status: "inprogress", url: MP4, percentComplete: 40 }));
    const r = await (await call(env, post("/api/media/refresh/clip"))).json<any>();
    expect(r).toMatchObject({ ok: true, mp4_status: "processing" });
    expect(r.note).toMatch(/still being prepared/);
  });
  it("a downloads failure never fails the refresh, and never leaks the token", async () => {
    const env = envWith({});
    stub(true, () => Response.json({ success: false, errors: [{ code: 10000, message: "bad token=secret-stream-token" }] }, { status: 403 }));
    const res = await call(env, post("/api/media/refresh/clip"));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({ ok: true, status: "ready", mp4_status: "error" });
    expect(text).not.toContain("secret-stream-token");
  });
  it("rejects an invalid poster_at instead of guessing", async () => {
    const env = envWith({});
    stub(true, dl({ status: "ready", url: MP4 }));
    for (const poster_at of ["50", -1, 101, true]) {
      const res = await call(env, authed("/api/media/refresh/clip", { method: "POST", body: JSON.stringify({ poster_at }) }));
      expect(res.status, String(poster_at)).toBe(400);
    }
    expect((await call(env, authed("/api/media/refresh/clip", { method: "POST", body: JSON.stringify({ poster_at: null }) }))).status).toBe(200);
  });
  it("discards a hostile download URL", async () => {
    const env = envWith({});
    stub(true, dl({ status: "ready", url: "https://evil.example/x.mp4" }));
    await call(env, post("/api/media/refresh/clip"));
    expect(doc(env, "clip")).toMatchObject({ mp4_status: "error" });
    expect(doc(env, "clip")).not.toHaveProperty("mp4");
  });
});

describe("editorial playback markup", () => {
  const ready = { file: UID, type: "video", consent: "granted", alt: "Julie singing \"Vissi\" <live>", mp4: MP4, mp4_status: "ready" };
  const r = (block: any, asset: any = ready) => renderPage(fakeEnv({ "assets/clip": asset }), pageWith([{ type: "media", video: "asset:clip", ...block }]), siteFixture());

  it("offers the playback vocabulary on media only, with wide ratio, shape and focus", () => {
    expect(Object.keys(PRESENTATION_OPTIONS.style.playback.values!)).toEqual(["player", "ambient", "background"]);
    expect(PRESENTATION_OPTIONS.style.playback.blocks).toEqual(["media"]);
    expect(PRESENTATION_OPTIONS.style.media_ratio.values).toHaveProperty("wide");
    expect(PRESENTATION_OPTIONS.style.shape.blocks).toContain("media");
    expect(PRESENTATION_OPTIONS.style.focus.blocks).toContain("media");
    expect(presentationWarnings({ sections: [{ type: "hero", style: { playback: "ambient" } }] }).join()).toMatch(/playback/);
  });

  it("ambient: a cropped, muted, looping <video> with native controls until JS, and a labelled toggle", async () => {
    const html = await r({ caption: "Live", style: { playback: "ambient", media_ratio: "portrait", shape: "arch", focus: "30% 20%", phone: { focus: "50% 10%" } } });
    expect(html).toContain(
      `<video class="media-video" muted playsinline loop preload="none" poster="https://videodelivery.net/${UID}/thumbnails/thumbnail.jpg" controls aria-label="Julie singing &quot;Vissi&quot; &lt;live&gt;" style="object-position:30% 20%;--fp:50% 10%"><source src="${MP4}" type="video/mp4"></video>`
    );
    expect(html).toContain('<button type="button" class="media-toggle" data-video-toggle data-label="video: Julie singing &quot;Vissi&quot; &lt;live&gt;" aria-label="Play video: Julie singing &quot;Vissi&quot; &lt;live&gt;" hidden>');
    expect(html).toMatch(/class="section media-scene[^"]*s-playback-ambient[^"]*"/);
    expect(html).toMatch(/s-media-ratio-portrait/);
    expect(html).toMatch(/s-shape-arch/);
    expect(html).toContain('<figcaption class="caption">Live</figcaption>');
    expect(html).not.toContain("media-play");
  });

  it("ambient label falls back to caption, then heading", async () => {
    const html = await r({ caption: "Live at the hall", style: { playback: "ambient" } }, { ...ready, alt: "" });
    expect(html).toContain('aria-label="Pause video: Live at the hall"'.replace("Pause", "Play"));
  });

  it("background: decorative video; heading and caption once, on the panel; toggle after the words", async () => {
    const html = await r({ heading: "Find your *voice*", caption: "A quiet room", transcript: "Words", style: { playback: "background" } });
    expect(html).toContain('<video class="media-video" muted playsinline loop preload="none"');
    expect(html).toMatch(/<video [^>]*aria-hidden="true" tabindex="-1"/);
    expect(html).not.toMatch(/<video [^>]*controls/);
    expect(html.match(/Find your/g)).toHaveLength(1);
    expect(html.match(/A quiet room/g)).toHaveLength(1);
    expect(html).not.toContain("<figcaption");
    const [panel, toggle] = [html.indexOf('class="media-overlay"'), html.indexOf("data-video-toggle")];
    expect(panel).toBeGreaterThan(html.indexOf("<video"));
    expect(toggle).toBeGreaterThan(html.indexOf("Transcript"));
    expect(html).toContain('data-label="background video" aria-label="Play background video"');
  });

  it("falls back to today's player when no valid MP4 is available", async () => {
    const cases = [
      { ...ready, mp4_status: "processing" },
      { ...ready, mp4: MP4.replace(UID, OTHER) },
      { ...ready, mp4: `${MP4}?x=1` },
      { ...ready, mp4: "javascript:alert(1)" },
      { ...ready, mp4: undefined },
    ];
    for (const a of cases) {
      const html = await r({ style: { playback: "ambient" } }, a);
      expect(html).toContain(`data-stream="${UID}"`);
      expect(html).not.toMatch(/<video|<source|javascript|evil/);
    }
    // a raw uid (no asset) has no MP4 either
    const raw = await renderPage(fakeEnv({}), pageWith([{ type: "media", video: UID, style: { playback: "background" } }]), siteFixture());
    expect(raw).toContain(`data-stream="${UID}"`);
    expect(raw).not.toContain("<video");
  });

  it("ignores author-supplied playback data and unconsented assets", async () => {
    const spoof = await renderPage(fakeEnv({ "assets/clip": { ...ready, mp4: undefined, mp4_status: undefined } }), pageWith([{ type: "media", video: "asset:clip", video_mp4: MP4, mp4: MP4, style: { playback: "ambient" } }]), siteFixture());
    expect(spoof).not.toContain("<video");
    const pending = await r({ heading: "Hidden?", style: { playback: "ambient" } }, { ...ready, consent: "pending" });
    expect(pending).not.toMatch(/<video|data-stream/);
  });

  it("rejected focus values produce no style attribute", async () => {
    for (const focus of ["50% 50%; background:url(x)", "50%  20%", "-5% 20%", "a b", 5]) {
      const html = await r({ style: { playback: "ambient", focus } });
      expect(html).toMatch(/<video [^>]*><source/);
      expect(html).not.toMatch(/<video [^>]*style=/);
    }
    // out-of-range values are clamped, never passed through
    expect(await r({ style: { playback: "ambient", focus: "150% 20%" } })).toMatch(/<video [^>]*style="object-position:100% 20%"/);
  });

  it("player mode (the default) is unchanged apart from the focal point on the poster", async () => {
    const html = await r({ caption: "Live" });
    expect(html).toContain(`<button type="button" class="media-play" data-stream="${UID}" aria-label="Play video: Live"><img src="https://videodelivery.net/${UID}/thumbnails/thumbnail.jpg" alt="" loading="lazy"><span class="media-play__icon" aria-hidden="true"></span></button>`);
    const focused = await r({ caption: "Live", style: { focus: "10% 90%" } });
    expect(focused).toContain('loading="lazy" style="object-position:10% 90%">');
  });
});

describe("editorial video CSS and script guards", () => {
  it("crops video to the frame, never letterboxes", () => {
    expect(css).toMatch(/\.media-video \{[^}]*object-fit: cover;/);
    expect(css).not.toMatch(/object-fit:\s*contain/);
    expect(css).toMatch(/:is\(img, video\)\[style\*="--fp"\] \{ object-position: var\(--fp\) !important; \}/);
    for (const sh of ["arch", "circle", "soft", "slant"]) expect(css).toContain(`.s-shape-${sh} :is(.feature__media .frame, .showcase__media, .duo__media, .media-frame__visual)`);
    expect(css).toMatch(/\.s-media-ratio-wide \.media-frame__visual \{ aspect-ratio: 21 \/ 9; \}/);
  });
  it("positions the video and toggle absolutely (no layout shift) with a 44px target", () => {
    expect(css).toMatch(/\.media-video \{ position: absolute; inset: 0;/);
    expect(css).toMatch(/\.media-toggle \{\s*position: absolute;[^}]*width: 2\.75rem; height: 2\.75rem;/);
    expect(css).toMatch(/\.media-bg \{ position: absolute; inset: 0; \}/);
  });
  it("stays within the CSS budget", () => {
    const start = css.indexOf(".s-media-ratio-wide");
    const end = css.indexOf("/* testimonial video button sits inline in cards */");
    expect(end - start).toBeLessThanOrEqual(2560);
  });
  it("never autoplays under reduced motion; plays only in view; the visitor's pause sticks", () => {
    expect(appJs).toMatch(/var paused = prefersReduced;/);
    expect(appJs).toMatch(/if \(editorial\.length && "IntersectionObserver" in window\)/);
    expect(appJs).toMatch(/entry\.isIntersecting && !prefersReduced && !e\.isPaused\(\)/);
    expect(appJs).toMatch(/!entry\.isIntersecting && !e\.video\.paused\) e\.video\.pause\(\)/);
    expect(appJs).toMatch(/paused = true; video\.pause\(\)/);
  });
});

describe("contrast over video", () => {
  const token = (name: string) => {
    const m = new RegExp(`--colour-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    if (!m) throw new Error(`missing token ${name}`);
    return m[1];
  };
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const mix = (top: number[], bottom: number[], a: number) => top.map((t, i) => t * a + bottom[i] * (1 - a));
  const ratio = (a: number[], b: number[]) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const pct = (re: RegExp) => { const m = re.exec(css); if (!m) throw new Error(`not found: ${re}`); return Number(m[1]) / 100; };
  const frames = { white: [1, 1, 1], black: [0, 0, 0], gold: rgb(token("gold-soft")) };

  it("panel text stays >= 4.5:1 over any frame", () => {
    const op = pct(/\.media-overlay \{[^}]*background: color-mix\(in srgb, var\(--colour-ink\) (\d+)%, transparent\)/);
    expect(op).toBeGreaterThanOrEqual(0.85);
    const ivory = rgb(token("ivory"));
    for (const [name, frame] of Object.entries(frames)) {
      const ground = mix(rgb(token("ink")), frame, op);
      const texts = { ivory, "ivory 86%": mix(ivory, ground, 0.86), "gold-soft": rgb(token("gold-soft")) };
      for (const [label, t] of Object.entries(texts)) expect(ratio(t, ground), `${label} over ${name}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("play controls stay >= 3:1 over any frame", () => {
    const toggleOp = pct(/\.media-toggle \{[^}]*background: color-mix\(in srgb, var\(--colour-ink\) (\d+)%, transparent\)/);
    const iconOp = pct(/\.media-play__icon \{[^}]*background: color-mix\(in srgb, var\(--colour-ivory\) (\d+)%, transparent\)/);
    for (const [name, frame] of Object.entries(frames)) {
      expect(ratio(rgb(token("ivory")), mix(rgb(token("ink")), frame, toggleOp)), `toggle over ${name}`).toBeGreaterThanOrEqual(3);
      expect(ratio(rgb(token("primary")), mix(rgb(token("ivory")), frame, iconOp)), `play icon over ${name}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("markdown links (council code review)", () => {
  it("keeps only safe link targets", async () => {
    const html = await renderPage(fakeEnv({}), pageWith([{ type: "media", video: UID, transcript: "[ok](https://a.example/x) [mail](mailto:a@b.c) [rel](/about) [hash](#top) [bad](javascript:alert(1)) [data](data:text/html,x) [proto](//evil.example) [vb](JaVaScRiPt:x)" }]), siteFixture());
    expect(html).toContain('<a href="https://a.example/x">ok</a>');
    expect(html).toContain('<a href="mailto:a@b.c">mail</a>');
    expect(html).toContain('<a href="/about">rel</a>');
    expect(html).toContain('<a href="#top">hash</a>');
    expect(html).not.toMatch(/href="(javascript|data|\/\/|JaVa)/i);
    expect(html).toContain(" bad) ");
  });
});
