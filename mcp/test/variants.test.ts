import { describe, it, expect } from "vitest";
import {
  ensureSectionKeys, variantToPage, publishedPage, newVariant, generateToken, tokensEqual, prepareVariantWrite,
  TOKEN_RE, previewPath, isValidId,
} from "../src/variants";
import { homeFixture } from "./helpers";

const keyed = () => ensureSectionKeys(homeFixture()).page;

describe("ensureSectionKeys", () => {
  it("assigns <type>-<n> in order", () => {
    const p = ensureSectionKeys({ sections: [{ type: "hero" }, { type: "feature" }, { type: "feature" }] });
    expect(p.changed).toBe(true);
    expect(p.page.sections.map((s: any) => s.key)).toEqual(["hero-1", "feature-1", "feature-2"]);
  });
  it("never changes a valid existing key and is idempotent", () => {
    const once = keyed();
    const twice = ensureSectionKeys(once);
    expect(twice.changed).toBe(false);
    expect(twice.page).toBe(once);
  });
  it("keeps existing keys when a section of the same type is inserted before or sections are reordered", () => {
    const page = ensureSectionKeys({ sections: [{ type: "feature", heading: "A" }, { type: "feature", heading: "B" }] }).page;
    const inserted = ensureSectionKeys({ sections: [{ type: "feature", heading: "New" }, ...page.sections] }).page;
    expect(inserted.sections.map((s: any) => `${s.heading}:${s.key}`)).toEqual(["New:feature-3", "A:feature-1", "B:feature-2"]);
    const reordered = ensureSectionKeys({ sections: [...page.sections].reverse() }).page;
    expect(reordered.sections.map((s: any) => `${s.heading}:${s.key}`)).toEqual(["B:feature-2", "A:feature-1"]);
    const variant = { sections: [{ from: "feature-2" }, { from: "feature-1" }] };
    expect(variantToPage(inserted, variant).unresolved).toEqual([]);
  });
  it("replaces invalid and duplicate keys and reports them", () => {
    const r = ensureSectionKeys({ sections: [{ type: "hero", key: "hero-1" }, { type: "hero", key: "hero-1" }, { type: "cta", key: "Bad Key!" }, { type: "X-y", key: 5 }] });
    expect(r.page.sections.map((s: any) => s.key)).toEqual(["hero-1", "hero-2", "cta-1", "section-1"]);
    expect(r.replaced).toEqual(["hero-1", "Bad Key!", "5"]);
  });
  it("leaves non-pages untouched", () => {
    expect(ensureSectionKeys({ title: "x" }).changed).toBe(false);
    expect(ensureSectionKeys(null).changed).toBe(false);
  });
});

describe("variantToPage", () => {
  it("uses variant order, base copy, and replaces style", () => {
    const base = keyed();
    base.sections[1].style = { theme: "teal", rule: true };
    const { page, unresolved, dropped } = variantToPage(base, {
      design: { concept: "stage" },
      sections: [{ from: "statement-1" }, { from: "hero-1", style: { hero: "split" }, heading: "IGNORED COPY" }],
    });
    expect(unresolved).toEqual([]);
    expect(page.design).toEqual({ concept: "stage" });
    expect(page.sections.map((s: any) => s.key)).toEqual(["statement-1", "hero-1"]);
    expect(page.sections[0].style).toBeUndefined(); // base style replaced (by nothing)
    expect(page.sections[1].style).toEqual({ hero: "split" });
    expect(page.sections[1].heading).toBe(base.sections[0].heading);
    expect(dropped).toContain("feature-1");
    expect(page.title).toBe(base.title);
  });
  it("lists unresolved, repeated and malformed references", () => {
    const { page, unresolved } = variantToPage(keyed(), { sections: [{ from: "hero-1" }, { from: "hero-1" }, { from: "gone-9" }, "x", { style: {} }] });
    expect(page.sections).toHaveLength(1);
    expect(unresolved).toEqual(["hero-1 (repeated)", "gone-9", "(entry without a 'from' key)", "(entry without a 'from' key)"]);
  });
  it("drops the base design when the variant has none", () => {
    const base = { ...keyed(), design: { concept: "journey" } };
    expect(variantToPage(base, { sections: [] }).page.design).toBeUndefined();
  });
});

describe("publishedPage", () => {
  it("refuses while references are unresolved", () => {
    expect(publishedPage(keyed(), { sections: [{ from: "nope-1" }] })).toEqual({ ok: false, unresolved: ["nope-1"] });
  });
  it("persists only sanitised presentation and reports stripped values", () => {
    const r = publishedPage(keyed(), {
      design: { concept: "stage", evil: "<x>" },
      sections: [{ from: "hero-1", style: { hero: "split", theme: 'teal" onload="x', focus: "1% 2%" } }, { from: "cta-1", style: { sparkle: true } }],
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.page.design).toEqual({ concept: "stage" });
    expect(r.page.sections[0].style).toEqual({ hero: "split", focus: "1% 2%" });
    expect(r.page.sections[1].style).toBeUndefined();
    expect(r.stripped).toHaveLength(3);
    expect(r.dropped.length).toBe(7);
  });
});

describe("tokens", () => {
  it("are 24-char base64url and unique", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const t = generateToken();
      expect(t).toMatch(TOKEN_RE);
      seen.add(t);
    }
    expect(seen.size).toBe(1000);
  });
  it("compare only well-formed equal tokens", () => {
    const t = generateToken();
    expect(tokensEqual(t, t)).toBe(true);
    expect(tokensEqual(generateToken(), t)).toBe(false);
    expect(tokensEqual(t.slice(0, 23), t)).toBe(false);
    expect(tokensEqual(t, undefined)).toBe(false);
    expect(tokensEqual(t, 5 as any)).toBe(false);
  });
  it("cannot be set, changed, removed or nulled by a client write; base is immutable", () => {
    const prev = { base: "home", token: generateToken(), sections: [] };
    for (const patch of [{ token: "A".repeat(24) }, { token: null }, { token: undefined }, {}, { token: 5 }]) {
      const next = prepareVariantWrite(prev, { ...prev, ...patch, base: "about" });
      expect(next.token).toBe(prev.token);
      expect(next.base).toBe("home");
    }
    const created = prepareVariantWrite(null, { base: "home", token: "A".repeat(24) });
    expect(created.token).not.toBe("A".repeat(24));
    expect(created.token).toMatch(TOKEN_RE);
  });
});

describe("newVariant and ids", () => {
  it("references every keyed base section in order, unstyled", () => {
    const v = newVariant(keyed(), { base: "home", label: "Stage" });
    expect(v.sections).toEqual(keyed().sections.map((s: any) => ({ from: s.key })));
    expect(v.token).toMatch(TOKEN_RE);
  });
  it("validates ids and encodes preview paths", () => {
    for (const bad of ["", "Home", "home/x", "home%2fx", "a?b", "a#b", "a b", "a\nb", "a\u0000", "1home", "a".repeat(65), "' OR 1=1 --"])
      expect(isValidId(bad)).toBe(false);
    expect(isValidId("home-stage")).toBe(true);
    expect(isValidId("a".repeat(64))).toBe(true);
    expect(previewPath("home-stage", "ab_-")).toBe("/preview/home-stage/ab_-");
  });
});
