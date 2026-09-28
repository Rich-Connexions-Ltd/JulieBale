/**
 * Sprint 14 contrast guarantee: a decorative field at its capped opacity must
 * keep every text colour used on that ground at >= 4.5:1 (WCAG AA), for every
 * allowed field colour. Colours and caps are read from the stylesheet.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PRESENTATION_OPTIONS } from "../src/presentation";

const css = readFileSync(fileURLToPath(new URL("../public/styles.css", import.meta.url)), "utf8");
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
const num = (re: RegExp) => { const m = re.exec(css); if (!m) throw new Error(`cap not found: ${re}`); return Number(m[1]); };

const DARK = String.raw`\.s-has-deco:is\(\.s-theme-teal, \.s-theme-night, \.showcase, \.ground-teal\)`;
const LIGHT_CAP = num(/\.s-has-deco \{ --field-op: ([0-9.]+);/);
const DARK_CAP = num(new RegExp(`${DARK} \\{ --field-op: ([0-9.]+); \\}`));
const DARK_GOLD_CAP = num(new RegExp(`${DARK}\\.s-field-colour-gold \\{ --field-op: ([0-9.]+); \\}`));
const DARK_LIGHT_CAP = num(new RegExp(`${DARK}:is\\(\\.s-field-colour-cream, \\.s-field-colour-ivory\\) \\{ --field-op: ([0-9.]+); \\}`));
const fieldTokens: Record<string, string> = { teal: "primary", gold: "gold", cream: "cream", ivory: "ivory", night: "ink" };
const darkCap = (colour: string) => (colour === "gold" ? DARK_GOLD_CAP : colour === "cream" || colour === "ivory" ? DARK_LIGHT_CAP : DARK_CAP);

describe("decorative fields keep text readable", () => {
  it("covers every allowed field colour", () => {
    expect(Object.keys(fieldTokens).sort()).toEqual(Object.keys(PRESENTATION_OPTIONS.style.field_colour.values!).sort());
  });
  it("uses the tested caps", () => {
    expect([LIGHT_CAP, DARK_CAP, DARK_GOLD_CAP, DARK_LIGHT_CAP]).toEqual([0.1, 0.12, 0.08, 0.03]);
  });
  it("switches small labels to primary on light decorated sections", () => {
    expect(css).toMatch(/\.s-has-deco:not\(\.s-theme-teal, \.s-theme-night, \.showcase, \.ground-teal, \.hero-stage\) :is\(\.eyebrow, \.kicker\) \{ color: var\(--colour-primary\); \}/);
  });
  // text colours actually used on each ground (body, muted body, labels/links)
  const lightTexts = ["ink", "ink-soft", "primary"];
  for (const [name, t] of Object.entries(fieldTokens)) {
    it(`${name} field on light grounds`, () => {
      for (const g of ["cream", "ivory"]) {
        const ground = mix(rgb(token(t)), rgb(token(g)), LIGHT_CAP);
        for (const text of lightTexts) expect(ratio(rgb(token(text)), ground), `${text} on ${g}`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${name} field on dark grounds`, () => {
      for (const g of ["primary", "ink", "primary-dark"]) {
        const ground = mix(rgb(token(t)), rgb(token(g)), darkCap(name));
        const ivory = rgb(token("ivory"));
        const texts = { ivory, "ivory 86%": mix(ivory, ground, 0.86), "gold-soft": rgb(token("gold-soft")) };
        for (const [label, text] of Object.entries(texts)) expect(ratio(text, ground), `${label} on ${g}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
  it("kickers on the teal ground use gold-soft (>= 4.5:1), not antique gold", () => {
    expect(css).toMatch(/\.ground-teal \.kicker \{ color: var\(--colour-gold-soft\); \}/);
    expect(ratio(rgb(token("gold-soft")), rgb(token("primary")))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(rgb(token("gold")), rgb(token("primary")))).toBeLessThan(4.5);
  });
});

