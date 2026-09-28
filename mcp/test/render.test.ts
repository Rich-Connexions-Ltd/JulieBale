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
