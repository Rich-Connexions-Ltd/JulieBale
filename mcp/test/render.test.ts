import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderPage, MOTION_GUARD } from "../src/render";
import { ensureSectionKeys } from "../src/variants";
import { fakeEnv, homeFixture, siteFixture, fixture, pageWith } from "./helpers";

const golden = (name: string) => readFileSync(fileURLToPath(new URL(`fixtures/${name}.golden.html`, import.meta.url)), "utf8");
// The one intended change to unstyled pages: the no-JS motion guard in <head>.
const withoutGuard = (html: string) => html.replace(`\n  ${MOTION_GUARD}`, "");
const env = () => fakeEnv({ "posts/p1": { title: "Post", excerpt: "Ex" } });
const render = (page: any, opts?: any) => renderPage(env(), page, siteFixture(), opts);

describe("regression: pages without presentation", () => {
  it("home renders exactly as before this sprint (apart from the head guard)", async () => {
    const html = await render(homeFixture());
    expect(html).toContain(MOTION_GUARD);
    expect(withoutGuard(html)).toBe(golden("home"));
  });
  it("every block type renders exactly as before", async () => {
    expect(withoutGuard(await render(fixture("all-blocks.json")))).toBe(golden("all-blocks"));
  });
  it("adding section keys does not change the HTML", async () => {
    expect(withoutGuard(await render(ensureSectionKeys(homeFixture()).page))).toBe(golden("home"));
  });
});

describe("presentation in markup", () => {
  it("adds classes to the outer section and replaces the automatic ground", async () => {
    const html = await render(pageWith([
      { type: "statement", statement: "A" },
      { type: "richtext", body: "B", style: { theme: "night", spacing: "generous", motion: "rise" } },
      { type: "richtext", body: "C" },
      { type: "cta", heading: "D", style: { theme: "cream" } },
    ]));
    expect(html).toContain('<section class="section s-theme-night s-spacing-generous s-motion-rise" data-motion>');
    expect(html).toContain(`<section class="section cta-band cta-band--final s-theme-cream">`);
    // an unstyled section keeps the automatic alternation (index 2: no ground)
    expect(html).toMatch(/<section class="section"><div class="container--reading reveal">\s*\s*<div class="prose"><p>C/);
  });
  it("numbers chapters sequentially over chapter sections only", async () => {
    const html = await render(pageWith([
      { type: "statement", statement: "a", style: { chapter: true } },
      { type: "statement", statement: "b" },
      { type: "statement", statement: "c", style: { chapter: true, theme: "teal" } },
    ]));
    const marks = [...html.matchAll(/<span class="chapter-mark" aria-hidden="true">(\d+)<\/span>/g)].map((m) => m[1]);
    expect(marks).toEqual(["01", "02"]);
  });
  it("applies the hero focal point to the image only", async () => {
    const html = await render(pageWith([{ type: "hero", heading: "H", image: "p.jpeg", style: { focus: "30% 70%", hero: "split" } }]));
    expect(html).toContain('<img src="/assets/p.jpeg" alt="H" style="object-position:30% 70%">');
    expect(html).toContain("s-hero-split");
  });
  it("escapes captions and never emits rejected values", async () => {
    const html = await render(pageWith([
      { type: "feature", heading: "F", image: "f.jpeg", caption: "<b>x</b>", style: { theme: 'teal" onload="x', image_side: "left" } },
      { type: "duo", items: [{ title: "T", image: "t.jpeg", caption: "Cap & co" }] },
    ]));
    expect(html).toContain('<figcaption class="caption">&lt;b&gt;x&lt;/b&gt;</figcaption>');
    expect(html).toContain('<p class="caption">Cap &amp; co</p>');
    expect(html).not.toContain("onload");
    expect(html).toContain("s-image-side-left");
  });
  it("renders design classes, progress line and preview banner", async () => {
    const html = await render({ title: "T", design: { concept: "journey", progress: true }, sections: [] }, { preview: { label: "Stage <1>" } });
    expect(html).toContain('<body class="d-concept-journey">');
    expect(html).toContain('<div class="progress-line" aria-hidden="true"></div>');
    expect(html).toContain('<div class="preview-banner" role="note">Preview · Stage &lt;1&gt; · not live</div>');
    expect(html).toContain('<meta name="robots" content="noindex">');
  });
});

describe("image overflow and transitions (Sprint 11)", () => {
  it("renders escape, shape, layer and transition classes on the outer section only", async () => {
    const html = await render(pageWith([
      { type: "feature", heading: "F", image: "f.jpeg", style: { image_escape: "side-up", overshoot: "bold", layer: "below", shape: "arch", transition: "overlap", intensity: "strong" } },
      { type: "statement", statement: "S", style: { transition: "hold", image_escape: "up" } },
    ]));
    expect(html).toContain('<section class="section s-image-escape-side-up s-overshoot-bold s-layer-below s-shape-arch s-transition-overlap s-intensity-strong">');
    // image_escape is ignored on a block without an image
    expect(html).toContain('<section class="section quiet ground-ivory s-transition-hold">');
  });
});

describe("scenes (Sprint 12)", () => {
  it("adds a spacer only to pinned scenes and renders image_2 only when present", async () => {
    const html = await render(pageWith([
      { type: "feature", heading: "F", image: "a.jpeg", image_2: "b.jpeg", style: { scene_length: "medium", scene_image: "dissolve", focus: "20% 30%", focus_end: "80% 40%" } },
      { type: "showcase", heading: "S", image: "c.jpeg", style: { scene_text: "stagger" } },
      { type: "hero", heading: "H", image: "h.jpeg" },
    ]));
    expect(html.match(/class="scene-spacer"/g)).toHaveLength(1);
    expect(html).toContain('<img src="/assets/b.jpeg" alt="" class="scene-img-2" loading="lazy" style="object-position:20% 30%;--f0:20% 30%;--f1:80% 40%">');
    expect(html.match(/scene-img-2/g)).toHaveLength(1);
    expect(html).toMatch(/<\/div><div class="scene-spacer" aria-hidden="true"><\/div><\/section>/);
  });
  it("ignores image_2 unless the dissolve scene is chosen", async () => {
    const html = await render(pageWith([{ type: "feature", heading: "F", image: "a.jpeg", image_2: "b.jpeg", style: { scene_image: "zoom" } }]));
    expect(html).not.toContain("b.jpeg");
  });
  it("builds chapter anchors and a scene nav from chapter sections", async () => {
    const page = { title: "T", design: { scene_nav: "both" }, sections: [
      { type: "statement", eyebrow: "It starts with one note", statement: "x", style: { chapter: true } },
      { type: "feature", heading: "I'm a singer <first>", style: { chapter: true } },
      { type: "cta", heading: "Go" },
    ] };
    const html = await render(page);
    expect(html).toContain('id="chapter-01"');
    expect(html).toContain('id="chapter-02"');
    expect(html).toContain('<nav class="scene-nav scene-nav--rail scene-nav--label-narrow" aria-label="Chapters">');
    expect(html).toContain('<a href="#chapter-01" data-chapter="chapter-01"><span class="scene-nav__no">01</span><span class="scene-nav__label">It starts with one note</span></a>');
    expect(html).toContain("I&#39;m a singer &lt;first&gt;".replace("&#39;", "'"));
  });
  it("omits the nav with fewer than two chapters or an unknown mode", async () => {
    expect(await render({ title: "T", design: { scene_nav: "rail" }, sections: [{ type: "statement", statement: "a", style: { chapter: true } }] })).not.toContain("scene-nav");
    expect(await render({ title: "T", design: { scene_nav: "dots" }, sections: [
      { type: "statement", statement: "a", style: { chapter: true } }, { type: "statement", statement: "b", style: { chapter: true } }] })).not.toContain("<nav class=\"scene-nav");
  });
});

describe("assets, testimonials and media (Sprint 13)", () => {
  const assets = {
    "assets/julie": { file: "julie-portrait.jpeg", type: "image", alt: "Julie Bale smiling", focus: "40% 20%", consent: "not-needed" },
    "assets/group": { file: "diva-days.jpeg", type: "image", alt: "Singers on the steps", consent: "pending" },
    "assets/old": { file: "old.jpeg", type: "image", alt: "Old", consent: "granted", consent_expires: "2020-01-01" },
    "assets/eve": { file: "eve.jpeg", type: "image", alt: "Eve at the piano", consent: "granted" },
    "assets/clip": { file: "0123456789abcdef0123456789abcdef", type: "video", consent: "granted" },
  };
  const env2 = (extra: Record<string, unknown> = {}) => fakeEnv({ ...assets, ...extra });
  const r = (page: any, extra?: any) => renderPage(env2(extra), page, siteFixture());

  it("resolves consented asset references with their alt text and focal point", async () => {
    const html = await r(pageWith([{ type: "feature", heading: "F", image: "asset:julie" }]));
    expect(html).toContain('<img src="/assets/julie-portrait.jpeg" alt="Julie Bale smiling" style="object-position:40% 20%">');
  });
  it("never shows pending, refused, expired or unknown assets", async () => {
    const html = await r(pageWith([
      { type: "feature", heading: "F", image: "asset:group" },
      { type: "panels", items: [{ title: "A", image: "asset:old" }, { title: "B", image: "asset:missing" }] },
    ]));
    expect(html).not.toMatch(/diva-days|old\.jpeg|missing/);
  });
  it("lets a variant swap in an asset (asset references only)", async () => {
    const { variantToPage } = await import("../src/variants");
    const base = { sections: [{ key: "feature-1", type: "feature", heading: "F", image: "about-julie.jpeg" }] };
    const { page } = variantToPage(base, { sections: [{ from: "feature-1", media: { image: "asset:julie", image_2: "plain.jpeg", heading: "asset:x" } }] });
    expect(page.sections[0].image).toBe("asset:julie");
    expect(page.sections[0].image_2).toBeUndefined();
    expect(page.sections[0].heading).toBe("F");
  });

  const testimonials = {
    "testimonials/eve": { name: "Eve", role: "Diva Energy singer", quote: "Julie unlocked something", story: "**Long** story", before: "Afraid", after: "Singing", portrait: "asset:eve", video: "asset:clip", consent: "granted" },
    "testimonials/sam": { name: "Sam", quote: "Pending words", consent: "pending" },
    "testimonials/kit": { name: "Kit", quote: "Refused words", consent: "refused" },
    "testimonials/ann": { name: "Ann", quote: "Ann's words", consent: "granted", portrait: "asset:group" },
  };
  it("shows only consented testimonials, and only consented portraits", async () => {
    const html = await r(pageWith([{ type: "testimonials", heading: "Stories" }]), testimonials);
    expect(html).toContain("Julie unlocked something");
    expect(html).toContain("Ann&#39;s words".replace("&#39;", "'"));
    expect(html).not.toMatch(/Pending words|Refused words|diva-days/);
    expect(html).toContain('<img src="/assets/eve.jpeg" alt="Eve at the piano" loading="lazy">');
    expect(html).toContain('<summary>Read Eve&#39;s story</summary>'.replace("&#39;", "'"));
    expect(html).toContain('data-stream="0123456789abcdef0123456789abcdef"');
  });
  it("respects explicit items order, before-after filtering and the carousel markup", async () => {
    const ordered = await r(pageWith([{ type: "testimonials", items: ["ann", "eve"], style: { testimonial_layout: "quote" } }]), testimonials);
    expect(ordered.indexOf("Ann")).toBeLessThan(ordered.indexOf("Julie unlocked"));
    const ba = await r(pageWith([{ type: "testimonials", style: { testimonial_layout: "before-after" } }]), testimonials);
    expect(ba).toContain("Afraid");
    expect(ba).not.toContain("Ann");
    const car = await r(pageWith([{ type: "testimonials", style: { testimonial_layout: "carousel" } }]), testimonials);
    expect(car).toContain('aria-roledescription="carousel"');
    expect(car).toContain('aria-label="1 of 2"');
    expect(car).toContain('class="carousel__count" aria-live="polite">1 / 2<');
  });
  it("omits the block entirely when nothing is consented", async () => {
    const html = await r(pageWith([{ type: "testimonials", heading: "Stories", items: ["sam", "kit"] }]), testimonials);
    expect(html).not.toContain("Stories");
  });
  it("renders media poster-first with transcript and on-demand audio; ignores bad video ids", async () => {
    const html = await r(pageWith([{ type: "media", heading: "Aria", video: "asset:clip", poster: "asset:julie", caption: "Live", transcript: "Words", audio: "clips/aria.mp3", loop: true, style: { media_ratio: "cinematic" } }]));
    expect(html).toContain('<button type="button" class="media-play" data-stream="0123456789abcdef0123456789abcdef" data-loop="1" aria-label="Play atmospheric video: Live">');
    expect(html).toContain('<audio class="media-audio" controls preload="none" src="/media/clips/aria.mp3"></audio>');
    expect(html).toContain("<details class=\"transcript\"><summary>Transcript</summary>");
    expect(html).toContain("s-media-ratio-cinematic");
    const bad = await r(pageWith([{ type: "media", video: "javascript:alert(1)" }]));
    expect(bad).not.toMatch(/media-play|javascript/);
  });
});

describe("composition and ornament (Sprint 14)", () => {
  it("heading markup: escapes first, then only <br> and display italic", async () => {
    const { headline, plainHeadline } = await import("../src/render");
    expect(headline("It's never | too late to *sing*.")).toBe('It&#39;s never<br>too late to <em class="display-em">sing</em>.'.replace("&#39;", "'"));
    expect(headline('<img src=x onerror="a"> *<b>x</b>*')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt; <em class="display-em">&lt;b&gt;x&lt;/b&gt;</em>');
    expect(headline("a * b")).toBe("a * b");
    expect(headline("Plain words")).toBe("Plain words");
    expect(plainHeadline("It's | *fine*")).toBe("It's fine");
  });
  it("renders a consented collage, dropping hostile and unconsented entries", async () => {
    const env = fakeEnv({
      "assets/a": { file: "a.jpeg", type: "image", alt: "A \"quoted\" <alt>", consent: "granted" },
      "assets/b": { file: "b.jpeg", type: "image", alt: "B", consent: "not-needed" },
      "assets/p": { file: "p.jpeg", type: "image", alt: "P", consent: "pending" },
    });
    const html = await renderPage(env, pageWith([{ type: "feature", heading: "F", image: "f.jpeg", style: { collage: "scatter" },
      images: ["asset:a", "asset:p", "../x.jpg", "/x.jpg", "https://x/y.jpg", "x.jpg?y", "%2e%2e/x.jpg", "x.svg", "ok.webp", "asset:b"] }]), siteFixture());
    expect(html).toContain('<div class="collage collage--scatter collage--n3">');
    expect(html).toContain('<img src="/assets/a.jpeg" alt="A &quot;quoted&quot; &lt;alt&gt;">');
    expect(html).toContain('<img src="/assets/ok.webp" alt="" loading="lazy">');
    expect(html).not.toMatch(/p\.jpeg|x\.jpg|y\.jpg|x\.svg|f\.jpeg/);
    // every asset reference on the page is fetched in ONE query
    expect(env.DB.queries.filter((q: string) => q.includes("collection='assets'"))).toHaveLength(1);
  });
  it("falls back to the single image when fewer than two collage images survive", async () => {
    const env = fakeEnv({ "assets/p": { file: "p.jpeg", type: "image", alt: "P", consent: "pending" } });
    const html = await renderPage(env, pageWith([{ type: "feature", heading: "F", image: "f.jpeg", images: ["asset:p", "one.jpeg"] }]), siteFixture());
    expect(html).not.toContain("collage");
    expect(html).toContain('src="/assets/f.jpeg"');
  });
  it("renders one aria-hidden decoration layer from allowlisted values and escaped plain ghost text", async () => {
    const html = await render(pageWith([{ type: "statement", statement: '*Sing* | <b onmouseover="x">', style: { field: "blob", field_colour: "gold", ornament: "stave", ghost: true, edge: "wave" } }]));
    const deco = /<div class="s-deco" aria-hidden="true">([\s\S]*?)<\/div><\/div>/.exec(html);
    expect(html).toMatch(/<section class="section quiet s-edge-wave s-field-blob s-field-colour-gold s-ornament-stave s-ghost s-has-deco"><div class="s-deco" aria-hidden="true">/);
    expect(html).toContain('<div class="s-deco__ghost">Sing &lt;b onmouseover=&quot;x&quot;&gt;</div>');
    expect(deco).not.toBeNull();
    expect(html.match(/class="s-deco"/g)).toHaveLength(1);
    // decoration not offered on the hero
    expect(await render(pageWith([{ type: "hero", heading: "H", style: { field: "halo" } }]))).not.toContain("s-deco");
  });
  it("emits the phone focal point only from clamped integers", async () => {
    const { resolveSection } = await import("../src/presentation");
    expect(resolveSection({ type: "feature", style: { phone: { focus: "120% 30%", crop: "portrait" } } })).toMatchObject({ imgStyle: "--fp:100% 30%", classes: ["p-crop-portrait"] });
    for (const bad of ["50%;color:red", "url(x)", "calc(1% + 2%)", "var(--x)", "/*x*/50% 50%", "50px 50px", "-5% 5%", "5000% 5%", { x: 1 }, ["50% 50%"]])
      expect(resolveSection({ type: "feature", style: { phone: { focus: bad } } }).imgStyle).toBeUndefined();
    expect(resolveSection({ type: "feature", style: { phone: "portrait" } }).classes).toEqual([]);
    expect(resolveSection({ type: "feature", style: { phone: { crop: "wide", colour: "red" } } }).classes).toEqual([]);
  });
});
