import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// The Worker entry imports the Cloudflare `agents` runtime, which cannot load in
// Node. Tests exercise the REST/router/pure code, so the MCP agent is stubbed.
export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"] },
  resolve: {
    alias: { "agents/mcp": fileURLToPath(new URL("./test/stubs/agents-mcp.ts", import.meta.url)) },
  },
});
