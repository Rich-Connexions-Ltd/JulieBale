import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { assetWarnings, testimonialWarnings } from "../src/assets";
it("seed data has no warnings (other than recommendations)", () => {
  const d = JSON.parse(readFileSync(new URL("../seed/sprint13-assets.json", import.meta.url), "utf8"));
  for (const a of Object.values<any>(d.assets)) expect(assetWarnings(a)).toEqual([]);
  for (const t of Object.values<any>(d.testimonials)) expect(testimonialWarnings(t)).toEqual([]);
});
