/**
 * In-place PRO schema cutover. Preserves users + settings.
 * Run from repo root: node scripts/migrate-pro.mjs
 * Prefer stopping `next dev` first if you see SQLITE_BUSY.
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

const root = process.cwd();
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "pos.sqlite");
const schemaPath = path.join(root, "scripts", "schema-clean.sql");

fs.mkdirSync(dataDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
if (fs.existsSync(dbPath)) {
  fs.copyFileSync(dbPath, path.join(dataDir, `pos.sqlite.bak-${stamp}`));
  console.log("Copied backup pos.sqlite.bak-" + stamp);
}

const schema = fs.readFileSync(schemaPath, "utf8");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 8000;");
db.exec(schema);

for (const table of ["sale_items", "stock_movements", "sales", "products"]) {
  db.exec(`DROP TABLE IF EXISTS ${table}`);
}

const now = new Date().toISOString();

const settings = db.prepare("SELECT id FROM settings WHERE id = 1").get();
if (!settings) {
  db.prepare(
    `INSERT INTO settings (id, shop_name, currency_symbol, address, phone, low_stock_threshold, print_terms, operator_name, created_at)
     VALUES (1, 'New College Book Depot and Stationers', 'Rs.', '', '', 10, 'Goods once sold are not returnable unless defective.', '', ?)`,
  ).run(now);
} else {
  // Ensure PRO columns exist (schema CREATE IF NOT EXISTS won't alter)
  const cols = db.prepare("PRAGMA table_info(settings)").all().map((c) => c.name);
  const have = new Set(cols);
  const add = (name, ddl) => {
    if (!have.has(name)) db.exec(`ALTER TABLE settings ADD COLUMN ${ddl}`);
  };
  add("address", "address TEXT NOT NULL DEFAULT ''");
  add("phone", "phone TEXT NOT NULL DEFAULT ''");
  add("low_stock_threshold", "low_stock_threshold INTEGER NOT NULL DEFAULT 10");
  add(
    "print_terms",
    "print_terms TEXT NOT NULL DEFAULT 'Goods once sold are not returnable unless defective.'",
  );
  add("operator_name", "operator_name TEXT NOT NULL DEFAULT ''");
}

let users = db.prepare("SELECT id, name, username, role FROM users").all();
if (users.length === 0) {
  db.prepare(
    `INSERT INTO users (name, username, password_hash, role, active, created_at) VALUES (?, ?, ?, 'manager', 1, ?)`,
  ).run("Manager", "admin", hashPassword("admin123"), now);
  users = [{ name: "Manager", username: "admin", role: "manager" }];
  console.log("Seeded default admin / admin123");
}

const opCount = db.prepare("SELECT COUNT(*) AS n FROM operators").get().n;
if (Number(opCount) === 0) {
  const opIns = db.prepare(`INSERT OR IGNORE INTO operators (name, active, created_at) VALUES (?, 1, ?)`);
  for (const u of users) opIns.run(u.name, now);
  opIns.run("Counter", now);
}

const walkIn = db.prepare("SELECT id FROM customers WHERE id = 1").get();
if (!walkIn) {
  db.prepare(
    `INSERT INTO customers (id, name, phone, type, balance_cents, opening_dues_cents, balance_manual, active, created_at, updated_at)
     VALUES (1, 'Walk-in Customer', 'N/A', 'Regular', 0, 0, 0, 1, ?, ?)`,
  ).run(now, now);
}

const openAll = db.prepare("SELECT period_key FROM cash_book_openings WHERE period_key = 'all'").get();
if (!openAll) {
  db.prepare(`INSERT INTO cash_book_openings (period_key, amount_cents, updated_at) VALUES ('all', 0, ?)`).run(now);
}

db.close();
console.log("PRO schema ready at", dbPath);
