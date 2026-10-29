/**
 * Import NCBD PRO catalog + customer dues CSVs into data/pos.sqlite
 * Sources (from D:\NCBD Project):
 *   Book1-ncbd-products.csv
 *   customer_dues_import.csv
 *
 * Run from repo root: node scripts/import-pro-data.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, "data", "pos.sqlite");
const PROD_CSV = "D:/NCBD Project/Book1-ncbd-products.csv";
const CUST_CSV = "D:/NCBD Project/customer_dues_import.csv";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let q = false;
  const pushCell = () => {
    row.push(cur);
    cur = "";
  };
  const pushRow = () => {
    if (row.length === 1 && row[0] === "" && rows.length === 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (q && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
      continue;
    }
    if (ch === "," && !q) {
      pushCell();
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !q) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushCell();
      pushRow();
      continue;
    }
    cur += ch;
  }
  if (cur.length || row.length) {
    pushCell();
    pushRow();
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

function rupeesToCents(n) {
  const x = Number(String(n).replace(/,/g, "").trim());
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100);
}

function slugName(name) {
  return (
    String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

function guessCategory(name = "") {
  const n = name.toLowerCase();
  if (/pen|pencil|marker|pointer|ball|fineliner|clipper/.test(n)) return "Pens";
  if (/register|notebook|copy|diary/.test(n)) return "Notebooks";
  if (/paper|ream|a4|sheet/.test(n)) return "Paper";
  if (/book|guide|text/.test(n)) return "Books";
  if (/color|crayon|paint|brush/.test(n)) return "Art";
  if (/stapler|clip|file|tape|glue/.test(n)) return "Office";
  return "General";
}

function normName(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ");
}

function mapType(t) {
  const x = String(t || "Regular").trim();
  if (["Regular", "Office", "School", "Wholesale"].includes(x)) return x;
  return "Regular";
}

if (!fs.existsSync(DB_PATH)) {
  console.error("Missing", DB_PATH, "— run migrate-pro.mjs first");
  process.exit(1);
}
if (!fs.existsSync(PROD_CSV) || !fs.existsSync(CUST_CSV)) {
  console.error("Missing PRO CSV files in D:\\NCBD Project");
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 10000;");

const now = new Date().toISOString();
const stamp = now.replace(/[:.]/g, "-");
fs.copyFileSync(DB_PATH, path.join(ROOT, "data", `pos.sqlite.pre-import-${stamp}`));
console.log("Backup copied before import");

db.exec("BEGIN IMMEDIATE");
try {
  // Clear transactional data that depends on batches/customers (empty shop OK)
  for (const t of [
    "cart_reservations",
    "sale_drafts",
    "invoice_allocations",
    "invoice_lines",
    "invoices",
    "receipts",
    "surplus_logs",
    "payable_payments",
    "payables",
    "purchase_lines",
    "purchases",
    "arrivals",
    "batches",
  ]) {
    db.exec(`DELETE FROM ${t}`);
  }
  db.exec("DELETE FROM customers WHERE id != 1");
  db.prepare(
    "UPDATE customers SET balance_cents=0, opening_dues_cents=0, balance_manual=0, active=1, name='Walk-in Customer', phone='N/A', type='Regular', updated_at=? WHERE id=1",
  ).run(now);

  // --- Products ---
  const prodRows = parseCsv(fs.readFileSync(PROD_CSV, "utf8").replace(/^\uFEFF/, ""));
  const prodHeader = prodRows[0].map((h) => h.trim().toLowerCase());
  const pi = (name) => prodHeader.indexOf(name);
  const nameI = pi("name");
  const stockI = pi("stock");
  const costI = pi("basecost") >= 0 ? pi("basecost") : pi("buy");
  const freightI = pi("freightcost") >= 0 ? pi("freightcost") : pi("freight");
  const priceI = pi("defaultprice") >= 0 ? pi("defaultprice") : pi("retail");
  const catI = pi("category");
  const packI = pi("packsize") >= 0 ? pi("packsize") : pi("pack_size");

  const insBatch = db.prepare(
    `INSERT INTO batches (
      name, batch_no, batch_key, category, pack_size, stock_pcs,
      buy_cents, freight_cents, landed_cents, wholesale_cents, retail_cents,
      packing_label, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, 1, ?, ?)`,
  );

  // Track name+buy → batch_no like PRO
  const byName = new Map(); // nameKey -> [{buy, batchNo}]
  let products = 0;
  let skippedProd = 0;

  for (const cols of prodRows.slice(1)) {
    const name = normName(cols[nameI] || cols[0]);
    if (!name) {
      skippedProd++;
      continue;
    }
    let category, stock, cost, freight, price, packSize;
    if (catI >= 0 && cols[catI] && Number.isNaN(Number(cols[catI]))) {
      category = cols[catI] || "General";
      stock = Number(cols[stockI] ?? cols[2]) || 0;
      cost = cols[costI] ?? cols[3];
      freight = cols[freightI] ?? cols[4] ?? 0;
      price = cols[priceI] ?? cols[5];
      packSize = packI >= 0 ? Math.max(1, Number(cols[packI]) || 1) : 1;
    } else {
      // name,stock,baseCost,freightCost,defaultPrice
      stock = Number(cols[stockI >= 0 ? stockI : 1]) || 0;
      cost = cols[costI >= 0 ? costI : 2];
      freight = cols[freightI >= 0 ? freightI : 3] ?? 0;
      price = cols[priceI >= 0 ? priceI : 4];
      category = guessCategory(name);
      packSize = 1;
    }
    const buyCents = rupeesToCents(cost);
    const freightCents = rupeesToCents(freight);
    let retailCents = rupeesToCents(price);
    if (retailCents <= 0) retailCents = Math.round(buyCents * 1.3) || buyCents;
    const landedCents = buyCents + freightCents;
    const stockPcs = Math.max(0, Math.round(stock));

    const nk = name.toLowerCase();
    const list = byName.get(nk) || [];
    let same = list.find((b) => b.buy === buyCents);
    let batchNo;
    if (same) {
      batchNo = same.batchNo;
      // restock existing row instead of duplicate
      db.prepare(
        `UPDATE batches SET stock_pcs = stock_pcs + ?, freight_cents = ?, landed_cents = ?, retail_cents = ?, updated_at = ?
         WHERE batch_key = ?`,
      ).run(stockPcs, freightCents, landedCents, retailCents, now, `${slugName(name)}::${batchNo}`);
      products++;
      continue;
    }
    batchNo = list.length ? Math.max(...list.map((b) => b.batchNo)) + 1 : 1;
    list.push({ buy: buyCents, batchNo });
    byName.set(nk, list);
    const batchKey = `${slugName(name)}::${batchNo}`;
    try {
      insBatch.run(
        name,
        batchNo,
        batchKey,
        category || "General",
        packSize,
        stockPcs,
        buyCents,
        freightCents,
        landedCents,
        retailCents,
        now,
        now,
      );
      products++;
    } catch (e) {
      skippedProd++;
      console.warn("skip product", name, e.message);
    }
  }

  // --- Customers ---
  const custRows = parseCsv(fs.readFileSync(CUST_CSV, "utf8").replace(/^\uFEFF/, ""));
  const ch = custRows[0].map((h) => h.trim().toLowerCase());
  const cName = ch.findIndex((h) => h === "customer" || h === "name");
  const cDues = ch.findIndex((h) => h.includes("due") || h === "balance" || h === "total dues");
  const cPhone = ch.findIndex((h) => h === "phone");
  const cType = ch.findIndex((h) => h === "type");

  const insCust = db.prepare(
    `INSERT INTO customers (name, phone, type, balance_cents, opening_dues_cents, balance_manual, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );

  let customers = 0;
  let skippedCust = 0;
  for (const cols of custRows.slice(1)) {
    const name = normName(cols[cName >= 0 ? cName : 0]);
    if (!name || name.toLowerCase() === "walk-in customer") {
      skippedCust++;
      continue;
    }
    const duesRupees = Number(String(cols[cDues >= 0 ? cDues : 1] || "0").replace(/,/g, ""));
    // CSV uses positive dues in rupees; Excel sometimes uses negatives — flip if needed
    const duesCents = rupeesToCents(Math.abs(duesRupees));
    const phone = (cPhone >= 0 ? cols[cPhone] : "N/A") || "N/A";
    const type = mapType(cType >= 0 ? cols[cType] : "Regular");
    try {
      insCust.run(name, phone, type, duesCents, duesCents, duesCents > 0 ? 1 : 0, now, now);
      customers++;
    } catch (e) {
      skippedCust++;
      console.warn("skip customer", name, e.message);
    }
  }

  // Operators from staff names commonly used in PRO
  const opIns = db.prepare(`INSERT OR IGNORE INTO operators (name, active, created_at) VALUES (?, 1, ?)`);
  for (const name of ["M. Akif", "Akif", "Sohaib Alam", "Counter"]) {
    opIns.run(name, now);
  }

  db.exec("COMMIT");
  console.log({
    products,
    skippedProd,
    customers,
    skippedCust,
    batchCount: db.prepare("SELECT COUNT(*) AS c FROM batches").get().c,
    customerCount: db.prepare("SELECT COUNT(*) AS c FROM customers").get().c,
  });
} catch (e) {
  db.exec("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  db.close();
}
