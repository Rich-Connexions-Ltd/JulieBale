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

describe("imported media helpers (Sprint 16)", async () => {
  const { buildImportedAsset, replaceAssetMedia, applyStreamDetails, cleanText } = await import("../src/assets");
  const media = { type: "video" as const, file: "a".repeat(32), master: "masters/x/r/f.mp4", status: "processing" as const, size: 10, source: { kind: "url" as const, name: "f.mp4" } };
  it("defaults consent to pending and requires a note for granted", () => {
    expect(buildImportedAsset(media, {}).doc.consent).toBe("pending");
    const g = buildImportedAsset(media, { consent: "granted" });
    expect(g.doc.consent).toBe("pending");
    expect(g.warnings[0]).toMatch(/consent_note/);
    expect(buildImportedAsset(media, { consent: "granted", consent_note: "Signed form, 2026-09-29" }).doc.consent).toBe("granted");
  });
  it("cleans and caps text, and filters usage/roles to the vocabulary", () => {
    const { doc } = buildImportedAsset(media, { title: "A\u0000b".padEnd(200, "x"), usage: ["concert", "party"], roles: ["poster", 5] });
    expect((doc.title as string).length).toBe(120);
    expect(doc.title).not.toContain("\u0000");
    expect(doc.usage).toEqual(["concert"]);
    expect(doc.roles).toEqual(["poster"]);
    expect(cleanText(5, 10)).toBeUndefined();
  });
  it("replacement keeps non-media fields and caps history at 5", () => {
    let prev: any = { title: "T", consent: "granted", consent_note: "n", caption: "c", file: "old0", master: "m0", status: "ready", width: 1 };
    for (let i = 1; i <= 7; i++) prev = replaceAssetMedia(prev, { ...media, file: `f${i}` });
    expect(prev).toMatchObject({ title: "T", consent: "granted", caption: "c", file: "f7" });
    expect(prev.width).toBeUndefined();
    expect(prev.previous_files).toHaveLength(5);
    expect(prev.previous_files[0].file).toBe("f6");
  });
  it("applies only validated Stream numbers", () => {
    const out = applyStreamDetails({ file: "a".repeat(32) }, { duration: -1, size: "big", input: { width: 720, height: 1280 }, readyToStream: false, status: { state: "inprogress" } });
    expect(out).toMatchObject({ width: 720, height: 1280, orientation: "portrait", status: "processing" });
    expect(out.duration).toBeUndefined();
    expect(out.size).toBeUndefined();
    expect(applyStreamDetails({ file: "not-a-uid" }, {}).thumbnail).toBeUndefined();
  });
});
