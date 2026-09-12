import fs from "node:fs";

const html = fs.readFileSync("../julie_bale_singing_story_audit_fixed.html", "utf8");
const doc = {
  title: "Who Told You You Couldn't Sing? | Julie Bale",
  slug: "singing-story-audit",
  source: "julie_bale_singing_story_audit_fixed.html",
  html,
};
const esc = (s) => String(s).replace(/'/g, "''");
const now = new Date().toISOString();
const sql =
  `INSERT INTO documents (collection,id,data,status,updated_at) VALUES ` +
  `('landing','singing-story-audit','${esc(JSON.stringify(doc))}','published','${now}') ` +
  `ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at;`;
fs.writeFileSync("landing.generated.sql", sql);
console.log("wrote landing.generated.sql,", sql.length, "bytes");
