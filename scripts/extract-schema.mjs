import fs from "node:fs";

const db = fs.readFileSync("src/lib/db.ts", "utf8");
const start = db.indexOf("db.exec(`");
if (start < 0) {
  console.error("db.exec not found");
  process.exit(1);
}
const open = start + "db.exec(`".length;
const close = db.indexOf("`);", open);
if (close < 0) {
  console.error("closing not found");
  process.exit(1);
}
const sql = db.slice(open, close).trim() + "\n";
fs.writeFileSync("scripts/schema-clean.sql", sql);
console.log("wrote", sql.length, "chars, starts:", JSON.stringify(sql.slice(0, 40)));
