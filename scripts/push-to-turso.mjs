/**
 * Push local data/pos.sqlite into a Turso database (schema + rows).
 *
 *   set TURSO_DATABASE_URL=...
 *   set TURSO_AUTH_TOKEN=...
 *   node scripts/push-to-turso.mjs
 *
 * WARNING: clears matching tables on Turso first, then copies from local file.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { DatabaseSync } from "node:sqlite";

const ROOT = process.cwd();
const LOCAL = path.join(ROOT, "data", "pos.sqlite");
const url = process.env.TURSO_DATABASE_URL?.trim();
const token = process.env.TURSO_AUTH_TOKEN?.trim();

if (!url) {
  console.error("Set TURSO_DATABASE_URL");
  process.exit(1);
}
if (!fs.existsSync(LOCAL)) {
  console.error("Missing", LOCAL);
  process.exit(1);
}

const schemaPath = path.join(ROOT, "src/lib/schema-sql.ts");
const schemaMod = fs.readFileSync(schemaPath, "utf8");
const m = schemaMod.match(/export const SCHEMA_SQL = `([\s\S]*?)`;/);
if (!m) {
  console.error("Could not read SCHEMA_SQL");
  process.exit(1);
}
const SCHEMA_SQL = m[1];

const TABLES = [
  "settings",
  "users",
  "operators",
  "batches",
  "customers",
  "invoices",
  "invoice_lines",
  "invoice_allocations",
  "sale_drafts",
  "cart_reservations",
  "receipts",
  "surplus_logs",
  "suppliers",
  "purchases",
  "purchase_lines",
  "payables",
  "payable_payments",
  "cash_book_openings",
  "cash_book_entries",
  "arrivals",
  "undo_stack",
  "ct_firms",
  "ct_contracts",
  "ct_boq_items",
  "ct_invoices",
  "ct_supply_entries",
  "ct_payments",
];

function splitStatements(sql) {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

const local = new DatabaseSync(LOCAL, { readOnly: true });
const remote = createClient({ url, authToken: token });

console.log("Applying schema…");
for (const stmt of splitStatements(SCHEMA_SQL)) {
  await remote.execute(stmt);
}

console.log("Clearing remote tables…");
for (const table of [...TABLES].reverse()) {
  try {
    await remote.execute(`DELETE FROM ${table}`);
  } catch {
    // table may not exist yet on first push
  }
}

console.log("Copying tables…");
for (const table of TABLES) {
  let rows;
  try {
    rows = local.prepare(`SELECT * FROM ${table}`).all();
  } catch {
    console.log("  skip missing", table);
    continue;
  }
  if (!rows.length) {
    console.log(`  ${table}: 0`);
    continue;
  }
  const cols = Object.keys(rows[0]);
  const placeholders = cols.map(() => "?").join(",");
  const sql = `INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`;
  let n = 0;
  for (const row of rows) {
    await remote.execute({
      sql,
      args: cols.map((c) => {
        const v = row[c];
        return typeof v === "bigint" ? Number(v) : v;
      }),
    });
    n++;
  }
  console.log(`  ${table}: ${n}`);
}

local.close();
remote.close();
console.log("Done. Set the same TURSO_* vars on Netlify and redeploy.");
