import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = process.argv[2] || "https://juliebale-mcp.singing-bridge.workers.dev";
const transport = new StreamableHTTPClientTransport(new URL(base + "/mcp"));
const client = new Client({ name: "probe", version: "0.0.0" }, { capabilities: {} });

await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

const write = await client.callTool({
  name: "write_content",
  arguments: {
    collection: "pages",
    id: "home",
    data: JSON.stringify({ title: "Home", hero: "It's never too late to sing." }),
  },
});
console.log("WRITE:", write.content[0].text);

const read = await client.callTool({
  name: "read_content",
  arguments: { collection: "pages", id: "home" },
});
console.log("READ :", read.content[0].text);

const list = await client.callTool({
  name: "list_content",
  arguments: { collection: "pages" },
});
console.log("LIST :", list.content[0].text);

await client.close();
