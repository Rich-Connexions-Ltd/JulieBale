// Capture golden HTML from the renderer: `CAPTURE_GOLDEN=1 npx vitest run test/capture-golden.test.ts`
// ONLY before intentional renderer changes (see PLAN_Sprint10.md, Regression guards).
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderPage } from "../src/render";
import { fakeEnv, homeFixture, siteFixture, fixture } from "./helpers";

it.skipIf(!process.env.CAPTURE_GOLDEN)("captures golden files", async () => {
  const env = fakeEnv({ "posts/p1": { title: "Post", excerpt: "Ex" } });
  for (const [name, page] of [["home", homeFixture()], ["all-blocks", fixture("all-blocks.json")]] as const) {
    writeFileSync(fileURLToPath(new URL(`fixtures/${name}.golden.html`, import.meta.url)), await renderPage(env, page, siteFixture()));
  }
});
