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
