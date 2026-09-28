import { describe, it, expect } from "vitest";
import {
  PRESENTATION_OPTIONS, resolveSection, resolveDesign, presentationWarnings, sanitizePresentation, presentationJsonSchema,
} from "../src/presentation";

const HOSTILE: unknown[] = [
  'teal" onmouseover="x', "x;background:url(y)", "<script>", "teal teal", " teal", "TEAL",
  42, {}, [], ["teal"], null, "true", 1,
];

describe("resolveSection", () => {
  it("maps every allowlisted value to exactly one class", () => {
    for (const [key, opt] of Object.entries(PRESENTATION_OPTIONS.style)) {
      if (opt.pattern) continue;
      const type = opt.blocks?.[0] ?? "statement";
      for (const v of Object.keys(opt.values!)) {
        const value = v === "true" ? true : v;
        const r = resolveSection({ type, style: { [key]: value } });
        const expected = value === true ? `s-${key.replace(/_/g, "-")}` : `s-${key.replace(/_/g, "-")}-${v}`;
        expect(r.classes).toEqual([expected]);
      }
    }
  });

  it.each(HOSTILE)("never turns a hostile value into a class or style: %j", (value) => {
    for (const key of Object.keys(PRESENTATION_OPTIONS.style)) {
      const r = resolveSection({ type: "hero", style: { [key]: value } });
      expect(r.classes).toEqual([]);
      expect(r.imgStyle).toBeUndefined();
    }
  });

  it("ignores prototype keys and non-object styles", () => {
    expect(resolveSection({ type: "hero", style: JSON.parse('{"__proto__": {"theme": "teal"}, "constructor": "x"}') }).classes).toEqual([]);
    for (const style of ["teal", 1, null, ["theme"], true]) expect(resolveSection({ type: "hero", style }).classes).toEqual([]);
  });

  it("applies block-specific keys only to their blocks", () => {
    expect(resolveSection({ type: "statement", style: { hero: "split" } }).classes).toEqual([]);
    expect(resolveSection({ type: "hero", style: { hero: "split" } }).classes).toEqual(["s-hero-split"]);
    expect(resolveSection({ type: "pullquote", style: { overlap: true } }).classes).toEqual([]);
  });

  it("parses focus into a clamped object-position and rejects other shapes", () => {
    expect(resolveSection({ type: "hero", style: { focus: "60% 20%" } }).imgStyle).toBe("object-position:60% 20%");
    expect(resolveSection({ type: "hero", style: { focus: "150% 999%" } }).imgStyle).toBe("object-position:100% 100%");
    for (const bad of ["60%20%", "60% 20", "-1% 5%", "60% 20%;color:red", "1000% 1%", "a% b%", 60])
      expect(resolveSection({ type: "hero", style: { focus: bad } }).imgStyle).toBeUndefined();
    expect(resolveSection({ type: "feature", style: { focus: "50% 50%" } }).imgStyle).toBeUndefined();
  });

  it("reports theme, motion and chapter flags", () => {
    const r = resolveSection({ type: "statement", style: { theme: "night", motion: "rise", chapter: true } });
    expect(r).toMatchObject({ hasTheme: true, motion: true, chapter: true });
    expect(resolveSection({ type: "statement", style: { chapter: false } }).chapter).toBe(false);
  });
});

describe("resolveDesign", () => {
  it("maps concept and progress", () => {
    expect(resolveDesign({ concept: "journey", progress: true })).toEqual({ bodyClasses: ["d-concept-journey"], progress: true });
    expect(resolveDesign({ concept: "x", progress: "yes" })).toEqual({ bodyClasses: [], progress: false });
    expect(resolveDesign("stage")).toEqual({ bodyClasses: [], progress: false });
  });
});

describe("presentationWarnings", () => {
  it("is empty for clean documents and documents without presentation", () => {
    expect(presentationWarnings({ sections: [{ type: "hero" }] })).toEqual([]);
    expect(presentationWarnings({ design: { concept: "stage" }, sections: [{ type: "hero", key: "hero-1", style: { hero: "split", chapter: false } }] })).toEqual([]);
  });
  it("names the key, the rejected value and the allowed values", () => {
    const w = presentationWarnings({
      design: { concept: "loud", colour: "red" },
      sections: [{ type: "statement", key: "statement-1", style: { theme: "pink", hero: "split", sparkle: 1 } }, { from: "feature-1", style: "x" }],
    });
    expect(w).toEqual([
      'page: design.concept = "loud" is not allowed (use stage | editorial | journey); ignored.',
      'page: unknown design key "colour" ignored.',
      'section 1 (statement-1): style.theme = "pink" is not allowed (use cream | ivory | teal | night); ignored.',
      "section 1 (statement-1): style.hero only applies to hero; ignored.",
      'section 1 (statement-1): unknown style key "sparkle" ignored.',
      "section 2 (feature-1): style must be an object; ignored.",
    ]);
  });
  it("truncates very long rejected values", () => {
    const [w] = presentationWarnings({ sections: [{ type: "hero", style: { theme: "x".repeat(200) } }] });
    expect(w.length).toBeLessThan(160);
  });
});

describe("sanitizePresentation", () => {
  it("keeps only allowlisted pairs", () => {
    expect(sanitizePresentation({ theme: "teal", hero: "split", evil: "<x>", rule: "yes", focus: "10% 10%" }, "style", "hero"))
      .toEqual({ theme: "teal", hero: "split", focus: "10% 10%" });
    expect(sanitizePresentation({ hero: "split" }, "style", "feature")).toBeUndefined();
    expect(sanitizePresentation({ concept: "stage", x: 1 }, "design")).toEqual({ concept: "stage" });
    expect(sanitizePresentation("teal", "style")).toBeUndefined();
  });
});

describe("presentationJsonSchema", () => {
  it("is generated from the allowlist", () => {
    const s = presentationJsonSchema("style") as any;
    expect(s.properties.theme.enum).toEqual(Object.keys(PRESENTATION_OPTIONS.style.theme.values!));
    expect(s.properties.rule.type).toBe("boolean");
    expect(s.properties.focus.pattern).toBeTruthy();
    expect(Object.keys(s.properties)).toEqual(Object.keys(PRESENTATION_OPTIONS.style));
  });
});
