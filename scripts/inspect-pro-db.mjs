import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const dbPath = "D:/NCBD Project/pos_database.db";
const d = new DatabaseSync(dbPath, { readOnly: true });
const tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY 1").all();
console.log("tables:", tables.map((t) => t.name));
for (const t of tables) {
  try {
    const n = d.prepare(`SELECT COUNT(*) AS c FROM ${t.name}`).get().c;
    console.log(t.name, n);
  } catch (e) {
    console.log(t.name, e.message);
  }
}
// sample schema
for (const name of ["products", "batches", "customers", "invoices", "sales", "stock"]) {
  try {
    const cols = d.prepare(`PRAGMA table_info(${name})`).all();
    if (cols.length) console.log("\n", name, cols.map((c) => c.name).join(", "));
  } catch {}
}
d.close();

const prodCsv = "D:/NCBD Project/Book1-ncbd-products.csv";
const custCsv = "D:/NCBD Project/customer_dues_import.csv";
console.log("\nprod csv head:\n", fs.readFileSync(prodCsv, "utf8").split(/\r?\n/).slice(0, 4).join("\n"));
console.log("\ncust csv head:\n", fs.readFileSync(custCsv, "utf8").split(/\r?\n/).slice(0, 6).join("\n"));
