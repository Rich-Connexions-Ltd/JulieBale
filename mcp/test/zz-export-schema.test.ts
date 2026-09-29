// Writes openapi.json (the schema the Custom GPT imports) when EXPORT_SCHEMA=1.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import worker from "../src/index";
it.skipIf(!process.env.EXPORT_SCHEMA)("export openapi.json", async () => {
  const r = await worker.fetch(new Request("https://juliebale-mcp.singing-bridge.workers.dev/openapi.json"), { API_KEY: "x" } as any, {} as any);
  writeFileSync(fileURLToPath(new URL("../openapi.json", import.meta.url)), await r.text());
});
