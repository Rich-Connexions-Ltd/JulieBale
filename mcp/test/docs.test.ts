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
      .filter((sel) => !/^(html\.js|:where\(html\.js\))|@keyframes|^from|\.nav-toggle|dateswitch/.test(sel.split("\n").pop()!.trim()));
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

