import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PRESENTATION_OPTIONS } from "../src/presentation";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

describe("content-model.md stays in step with the allowlist", () => {
  const doc = read("../context/content-model.md");
  for (const group of ["style", "design"] as const) {
    for (const [key, opt] of Object.entries(PRESENTATION_OPTIONS[group])) {
      it(`documents ${group}.${key} and its values`, () => {
        expect(doc).toContain(`\`${key}\``);
        for (const v of Object.keys(opt.values || {})) expect(doc).toContain(`\`${v}\``);
        for (const [sk, so] of Object.entries(opt.sub || {})) {
          expect(doc).toContain(`"${sk}"`);
          for (const v of Object.keys(so.values || {})) expect(doc).toContain(`\`${v}\``);
        }
      });
    }
  }
});

describe("styles.css keeps content visible without JavaScript", () => {
  const css = read("../public/styles.css");
  it("scopes every hidden start state under html.js", () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").split("}");
    const offenders = rules
      .filter((r) => /opacity:\s*0\s*;|clip-path:\s*inset\(0 0 100% 0\)|scaleX\(0\)/.test(r))
      .map((r) => r.slice(0, r.indexOf("{")).trim())
      .filter((sel) => !/^(html\.js|:where\(html\.js\))|@keyframes|^from|\.nav-toggle|dateswitch/.test(sel.split("\n").pop()!.trim()))
      // Deliberately hidden, never page content: the dissolve target duplicates a
      // visible photograph; nav labels appear on hover/focus or when a chapter is current.
      .filter((sel) => !/^(\.scene-img-2|\.scene-nav--rail \.scene-nav__label|\.scene-nav--label(-narrow)?:not\(\.is-active\))$/.test(sel.split("\n").pop()!.trim()));
    expect(offenders).toEqual([]);
  });
  it("lets .is-visible win: hidden states are :where(html.js) (no specificity) or exclude .is-visible", () => {
    // `html.js .reveal` (0,2,1) would beat `.reveal.is-visible` (0,2,0) and hide content forever.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").split("}");
    const hiding = rules
      .filter((r) => /opacity:\s*0\s*;|width:\s*0\s*;|clip-path:\s*inset\(0 0 100%|scaleX\(0\)/.test(r.slice(r.indexOf("{"))))
      .map((r) => r.slice(0, r.indexOf("{")).split("\n").pop()!.trim())
      .filter((sel) => /(^|[^(])html\.js\b/.test(sel) && !sel.includes(":not(.is-visible)"));
    expect(hiding).toEqual([]);
  });
  it("has reduced-motion handling for presentation motion and hides the progress line", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*html\.js \[data-motion\]:not\(\.is-visible\) > \*/);
    expect(css).toMatch(/\.progress-line \{ display: none; \}/);
  });
});

describe("Sprint 11 CSS safety", () => {
  const css = read("../public/styles.css");
  it("never allows horizontal page scroll from escaped images", () => {
    expect(css).toMatch(/main \{ overflow-x: clip; \}/);
  });
  it("keeps escaped images from blocking clicks", () => {
    expect(css).toMatch(/pointer-events: none/);
  });
  it("has static fallbacks for every reveal-driven transition under reduced motion", () => {
    const rm = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    for (const t of ["wipe", "divider"]) expect(rm).toContain(`.s-transition-${t}`);
  });
  it("only runs hold, depth and settle when motion is allowed", () => {
    for (const t of ["hold", "depth", "settle"]) {
      const i = css.indexOf(`.s-transition-${t}`, css.indexOf("Section transitions (#11)"));
      const before = css.slice(0, i);
      expect(before.lastIndexOf("prefers-reduced-motion: no-preference")).toBeGreaterThan(before.lastIndexOf("}\n}"));
    }
  });
});

describe("Sprint 12 CSS safety", () => {
  const css = read("../public/styles.css");
  const scenes = css.slice(css.indexOf("SCENES (Sprint 12)"), css.indexOf("Scene navigation (#21)"));
  it("puts every scene animation inside reduced-motion and scroll-timeline guards", () => {
    const guarded = scenes.slice(scenes.indexOf("@supports (animation-timeline: view())"));
    const unguarded = scenes.slice(0, scenes.indexOf("@supports (animation-timeline: view())"));
    expect(unguarded).not.toMatch(/animation-timeline: --scene/);
    expect(guarded).toMatch(/animation-timeline: --scene/);
    expect(unguarded.indexOf("prefers-reduced-motion: no-preference")).toBeGreaterThan(-1);
    expect(unguarded.indexOf("position: sticky")).toBeGreaterThan(unguarded.indexOf("prefers-reduced-motion: no-preference"));
  });
  it("keeps the dissolve image hidden by default so unsupported browsers show the first photograph", () => {
    expect(scenes).toMatch(/\.scene-img-2 \{ opacity: 0; \}/);
  });
  it("lets unpinned text scenes finish by the time the section is fully on screen (never stuck dim at the foot of a page)", () => {
    expect(scenes).toMatch(/\[class\*="s-scene-text-"\] \{ --scene-text-range: entry 0% contain 0%; \}/);
    expect(scenes).not.toMatch(/scene-text-range: var\(--scene-phase\)/);
  });
});

describe("Sprint 14 CSS guards", () => {
  const css = read("../public/styles.css");
  const block = css.slice(css.indexOf("COMPOSITION AND ORNAMENT (Sprint 14)"), css.lastIndexOf("/* --- Reduced motion"));
  it("never uses negative z-index for decoration", () => {
    expect(block).not.toMatch(/z-index:\s*-/);
  });
  it("only outlines or rotates decoration, never real headings or body text", () => {
    const rules = block.replace(/\/\*[\s\S]*?\*\//g, "").split("}");
    for (const r of rules) {
      if (!/text-stroke|rotate:\s*(?!0)|writing-mode/.test(r)) continue;
      const sel = r.slice(0, r.indexOf("{"));
      expect(sel).toMatch(/s-deco__ghost|collage/);
    }
  });
  it("keeps edges static and off the first section", () => {
    expect(block).toMatch(/main > section:first-child:is\(\.s-edge-wave, \.s-edge-curve\) \{ margin-top: 0;/);
    expect(block.slice(block.indexOf("Top edges"), block.indexOf("--- Collage"))).not.toMatch(/animation|transition/);
  });
  it("phone collage rules out-rank the desktop nth-child presets (found in browser check)", () => {
    expect(block).toMatch(/@media \(max-width: 48rem\) \{[\s\S]*:is\(\.collage--stack, \.collage--scatter\) \.collage__item:nth-child\(n\) \{ position: static; width: auto; \}/);
  });
});


describe("media import docs", () => {
  it("name every public term and tool", () => {
    const doc = read("../context/content-model.md");
    const section = doc.slice(doc.indexOf("## Importing video and audio"));
    for (const t of ["pending", "granted", "not-needed", "processing", "ready", "error", "master", "previous_files", "poster_at", "importMedia", "import_media_from_url", "refresh_media_asset", "alt", "transcript"])
      expect(section, t).toContain(t);
  });
});
