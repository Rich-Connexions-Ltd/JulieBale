/**
 * Sprint 14 contrast guarantee: a decorative field at its capped opacity must
 * keep every text colour used on that ground at >= 4.5:1 (WCAG AA), for every
 * allowed field colour. Colours are read from the stylesheet's tokens.
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

const cap = (selector: RegExp) => Number(selector.exec(css)![1]);
const LIGHT_CAP = cap(/\.s-has-deco \{ --field-op: ([0-9.]+);/);
const DARK_CAP = cap(/\.s-has-deco:is\(\.s-theme-teal, \.s-theme-night, \.showcase, \.ground-teal\) \{ --field-op: ([0-9.]+); \}/);
const fieldTokens: Record<string, string> = { teal: "primary", gold: "gold", cream: "cream", ivory: "ivory", night: "ink" };

describe("decorative fields keep text readable", () => {
  it("covers every allowed field colour", () => {
    expect(Object.keys(fieldTokens).sort()).toEqual(Object.keys(PRESENTATION_OPTIONS.style.field_colour.values!).sort());
  });
  it("uses the tested caps", () => {
    expect(LIGHT_CAP).toBe(0.1);
    expect(DARK_CAP).toBe(0.12);
  });
  const light = { grounds: ["cream", "ivory"], texts: [token("ink"), token("ink-soft")].map(rgb), cap: LIGHT_CAP };
  // dark grounds: body copy is ivory at 86% (the muted colour) and full ivory
  const dark = { grounds: ["primary", "ink", "primary-dark"], cap: DARK_CAP };
  for (const [name, t] of Object.entries(fieldTokens)) {
    it(`${name} field on light grounds`, () => {
      for (const g of light.grounds) {
        const ground = mix(rgb(token(t)), rgb(token(g)), light.cap);
        for (const text of light.texts) expect(ratio(text, ground)).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${name} field on dark grounds`, () => {
      for (const g of dark.grounds) {
        const ground = mix(rgb(token(t)), rgb(token(g)), dark.cap);
        const ivory = rgb(token("ivory"));
        for (const text of [ivory, mix(ivory, ground, 0.86)]) expect(ratio(text, ground)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
