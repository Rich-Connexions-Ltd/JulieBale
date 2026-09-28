/**
 * Test helpers: a D1-compatible wrapper over Node's built-in SQLite, loaded with
 * the real schema, plus page fixtures. Each call to fakeDb() is an isolated
 * in-memory database, so tests never share state.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// node:sqlite is loaded via require because this Vite version does not treat it as a builtin.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
type DatabaseSync = any;

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export const API_KEY = "test-key";

class Stmt {
  constructor(private db: DatabaseSync, private sql: string, private args: unknown[] = []) {}
  bind(...args: unknown[]) { return new Stmt(this.db, this.sql, args); }
  async first<T>() { return (this.db.prepare(this.sql).get(...(this.args as any[])) as T) ?? null; }
  async all<T>() { return { results: this.db.prepare(this.sql).all(...(this.args as any[])) as T[] }; }
  async run() {
    const r = this.db.prepare(this.sql).run(...(this.args as any[]));
    return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
  }
}

export function fakeDb(docs: Record<string, unknown> = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(here("../schema.sql"), "utf8"));
  const ins = db.prepare("INSERT INTO documents (collection, id, data, status, updated_at) VALUES (?,?,?,'published','t')");
  for (const [key, doc] of Object.entries(docs)) {
    const [collection, id] = key.split("/");
    ins.run(collection, id, typeof doc === "string" ? doc : JSON.stringify(doc));
  }
  return { prepare: (sql: string) => new Stmt(db, sql), raw: db } as any;
}

export function fakeEnv(docs: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return { DB: fakeDb(docs), API_KEY, ...extra } as any;
}

export const fixture = (name: string) => JSON.parse(readFileSync(here(`fixtures/${name}`), "utf8"));
export const homeFixture = () => fixture("pages-home.json");
export const siteFixture = () => fixture("site-config.json");
export const pageWith = (sections: unknown[]) => ({ title: "Test page", sections });

export const authed = (url: string, init: RequestInit = {}) =>
  new Request(`https://x.test${url}`, { ...init, headers: { ...(init.headers as any), authorization: `Bearer ${API_KEY}`, "content-type": "application/json" } });
export const anon = (url: string, init: RequestInit = {}) => new Request(`https://x.test${url}`, init);
