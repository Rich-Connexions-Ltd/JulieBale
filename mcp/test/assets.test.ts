import { describe, it, expect } from "vitest";
import { consentOk, testimonialConsentOk, assetWarnings, testimonialWarnings, searchAssets, assetIdOf } from "../src/assets";

const today = new Date("2026-09-28T12:00:00Z");

describe("consent", () => {
  it("shows only granted or not-needed assets that have not expired", () => {
    expect(consentOk({ consent: "granted" }, today)).toBe(true);
    expect(consentOk({ consent: "not-needed" }, today)).toBe(true);
    for (const c of ["pending", "refused", undefined, "yes", true]) expect(consentOk({ consent: c }, today)).toBe(false);
    expect(consentOk({ consent: "granted", consent_expires: "2026-09-28" }, today)).toBe(true);
    expect(consentOk({ consent: "granted", consent_expires: "2026-09-27" }, today)).toBe(false);
    expect(consentOk(null, today)).toBe(false);
  });
  it("requires explicit agreement for testimonials", () => {
    expect(testimonialConsentOk({ consent: "granted" }, today)).toBe(true);
    expect(testimonialConsentOk({ consent: "not-needed" }, today)).toBe(false);
    expect(testimonialConsentOk({ consent: "granted", consent_expires: "2020-01-01" }, today)).toBe(false);
  });
  it("parses asset references strictly", () => {
    expect(assetIdOf("asset:vip-diva-day")).toBe("vip-diva-day");
    for (const bad of ["vip-diva-day", "asset:", "asset:Bad", "asset:a/b", "asset:' OR 1=1", 5]) expect(assetIdOf(bad)).toBeNull();
  });
});

describe("warnings", () => {
  it("flags missing essentials and unknown vocabulary", () => {
    expect(assetWarnings({ type: "image" })).toEqual([
      "file is required (a filename in /assets, a media key, or a Stream video id).",
      "alt text is required for images (what the photograph shows).",
      "consent is required (granted | not-needed | pending | refused); until set, the asset is not shown.",
    ]);
    const w = assetWarnings({ file: "a.jpeg", type: "photo", alt: "x", consent: "maybe", usage: ["concert", "party"], focus: "middle", consent_expires: "soon" });
    expect(w.join("\n")).toMatch(/type: "photo"/);
    expect(w.join("\n")).toMatch(/consent: "maybe"/);
    expect(w.join("\n")).toMatch(/usage: "party"/);
    expect(w.join("\n")).toMatch(/focus must/);
    expect(w.join("\n")).toMatch(/consent_expires/);
    expect(assetWarnings({ file: "a.jpeg", type: "image", alt: "x", consent: "not-needed" })).toEqual([]);
  });
  it("checks testimonials", () => {
    expect(testimonialWarnings({ name: "A", quote: "Q", consent: "granted", portrait: "a.jpeg" })).toEqual(['portrait must be an asset reference like "asset:eve-portrait".']);
    expect(testimonialWarnings({ name: "A", quote: "Q", consent: "granted", portrait: "asset:a" })).toEqual([]);
  });
});

describe("searchAssets", () => {
  const rows = [
    { id: "julie", doc: { title: "Julie portrait", type: "image", usage: ["julie-portrait"], roles: ["hero"], orientation: "portrait", consent: "not-needed", people: ["Julie Bale"] } },
    { id: "group", doc: { title: "Diva Day group", type: "image", usage: ["community"], roles: ["collage"], orientation: "landscape", consent: "pending", setting: "country house steps" } },
    { id: "clip", doc: { title: "Aria", type: "video", usage: ["concert"], roles: ["poster"], consent: "granted" } },
  ];
  it("filters by words, fields and usability", () => {
    expect(searchAssets(rows, { q: "house steps" }).map((a) => a.ref)).toEqual(["asset:group"]);
    expect(searchAssets(rows, { usage: "julie-portrait" }).map((a) => a.ref)).toEqual(["asset:julie"]);
    expect(searchAssets(rows, { type: "video" }).map((a) => a.ref)).toEqual(["asset:clip"]);
    expect(searchAssets(rows, { usable: true }).map((a) => a.ref)).toEqual(["asset:julie", "asset:clip"]);
    expect(searchAssets(rows, {}).find((a) => a.ref === "asset:group")!.usable).toBe(false);
  });
});
