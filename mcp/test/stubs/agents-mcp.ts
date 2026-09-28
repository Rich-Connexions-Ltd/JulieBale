// Minimal stand-in for `agents/mcp` so src/index.ts can be imported under Node.
export class McpAgent<E = unknown> {
  env!: E;
  static serve() { return { fetch: () => new Response("mcp stub", { status: 200 }) }; }
  static serveSSE() { return { fetch: () => new Response("sse stub", { status: 200 }) }; }
}
