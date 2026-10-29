/**
 * One-shot import from Flask NCBD Contracts SQLite into data/pos.sqlite ct_* tables.
 * Converts rupee amounts → integer cents. Leaves retail tables untouched.
 *
 *   node scripts/import-contracts.mjs
 *   node scripts/import-contracts.mjs --src "D:/NCBD CONTRACTS/data/ncbd_contracts.db"
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = process.cwd();
const DEST = path.join(ROOT, "data", "pos.sqlite");
const DEFAULT_SRC = "D:/NCBD CONTRACTS/data/ncbd_contracts.db";

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

const SRC = argValue("--src") || DEFAULT_SRC;

function rupeesToCents(n) {
  const x = Number(String(n ?? 0).replace(/,/g, "").trim());
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100);
}

function qtyToMilli(q) {
  const x = Number(q);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1000);
}

function bool01(v) {
  return v === true || v === 1 || v === "1" ? 1 : 0;
}

function isoTs(v) {
  if (!v) return new Date().toISOString();
  const s = String(v).trim().replace(" ", "T");
  return s.includes("T") ? s : `${s}T00:00:00`;
}

function ensureCtSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ct_firms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      legal_name TEXT,
      address TEXT,
      phone TEXT,
      email TEXT,
      gstin TEXT,
      vendor_number TEXT,
      bank_name TEXT,
      account_holder TEXT,
      account_number TEXT,
      branch_name TEXT,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS ct_contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firm_id INTEGER NOT NULL REFERENCES ct_firms(id),
      office_name TEXT NOT NULL,
      contract_head TEXT NOT NULL,
      contract_number TEXT,
      start_date TEXT,
      end_date TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','suspended','cancelled')),
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (office_name, contract_head, firm_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS ct_boq_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL REFERENCES ct_contracts(id) ON DELETE CASCADE,
      serial_number INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      unit TEXT,
      comparative_cents INTEGER NOT NULL DEFAULT 0,
      comparative_listed INTEGER NOT NULL DEFAULT 1 CHECK (comparative_listed IN (0, 1)),
      ncbd_cents INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (contract_id, serial_number)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS ct_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL REFERENCES ct_contracts(id),
      invoice_number TEXT NOT NULL,
      iso_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','billed')),
      notes TEXT,
      billed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (contract_id, invoice_number)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS ct_supply_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL REFERENCES ct_contracts(id),
      invoice_id INTEGER REFERENCES ct_invoices(id) ON DELETE CASCADE,
      boq_item_id INTEGER REFERENCES ct_boq_items(id),
      entry_date TEXT NOT NULL,
      item_name TEXT NOT NULL,
      unit TEXT,
      qty_milli INTEGER NOT NULL DEFAULT 1000,
      comparative_cents INTEGER NOT NULL DEFAULT 0,
      comparative_total_cents INTEGER NOT NULL DEFAULT 0,
      comparative_serial INTEGER,
      comparative_listed INTEGER NOT NULL DEFAULT 1 CHECK (comparative_listed IN (0, 1)),
      demand_no TEXT,
      ncbd_cents INTEGER NOT NULL DEFAULT 0,
      ncbd_total_cents INTEGER NOT NULL DEFAULT 0,
      sale_mode TEXT NOT NULL DEFAULT 'unit' CHECK (sale_mode IN ('unit','pieces')),
      packet_comparative_cents INTEGER,
      packet_ncbd_cents INTEGER,
      pcs_per_packet_milli INTEGER,
      pcs_sold_milli INTEGER,
      entry_kind TEXT NOT NULL DEFAULT 'normal' CHECK (entry_kind IN ('normal','cash_alternate')),
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS ct_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL REFERENCES ct_contracts(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL,
      iso_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    ) STRICT;
  `);
}

function clearCt(db) {
  db.exec(`
    DELETE FROM ct_payments;
    DELETE FROM ct_supply_entries;
    DELETE FROM ct_invoices;
    DELETE FROM ct_boq_items;
    DELETE FROM ct_contracts;
    DELETE FROM ct_firms;
  `);
}

function setSeq(db, table, maxId) {
  db.prepare("DELETE FROM sqlite_sequence WHERE name = ?").run(table);
  if (maxId > 0) {
    db.prepare("INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)").run(table, maxId);
  }
}

if (!fs.existsSync(SRC)) {
  console.error(`Source DB not found: ${SRC}`);
  process.exit(1);
}
if (!fs.existsSync(DEST)) {
  console.error(`Destination DB not found: ${DEST} — start the app once to create it.`);
  process.exit(1);
}

const src = new DatabaseSync(SRC, { readOnly: true });
const dest = new DatabaseSync(DEST);

ensureCtSchema(dest);
dest.exec("BEGIN");
try {
  clearCt(dest);

  const firms = src.prepare("SELECT * FROM firms ORDER BY id").all();
  const insFirm = dest.prepare(`
    INSERT INTO ct_firms (
      id, name, legal_name, address, phone, email, gstin, vendor_number,
      bank_name, account_holder, account_number, branch_name, notes, active, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  let maxFirm = 0;
  for (const f of firms) {
    const notesParts = [];
    if (f.notes) notesParts.push(String(f.notes));
    if (f.ifsc_code) notesParts.push(`IFSC: ${f.ifsc_code}`);
    insFirm.run(
      f.id,
      f.name,
      f.legal_name || null,
      f.address || null,
      f.phone || null,
      f.email || null,
      f.gstin || null,
      f.vendor_number || null,
      f.bank_name || null,
      f.account_holder || null,
      f.account_number || null,
      f.branch_name || null,
      notesParts.length ? notesParts.join("\n") : null,
      bool01(f.is_active),
      isoTs(f.created_at),
      isoTs(f.updated_at),
    );
    maxFirm = Math.max(maxFirm, Number(f.id));
  }

  const contracts = src.prepare("SELECT * FROM contracts ORDER BY id").all();
  const insContract = dest.prepare(`
    INSERT INTO ct_contracts (
      id, firm_id, office_name, contract_head, contract_number, start_date, end_date,
      status, notes, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `);
  let maxContract = 0;
  for (const c of contracts) {
    const status = ["active", "completed", "suspended", "cancelled"].includes(c.status)
      ? c.status
      : "active";
    insContract.run(
      c.id,
      c.firm_id,
      c.office_name,
      c.contract_head,
      c.contract_number || null,
      c.start_date || null,
      c.end_date || null,
      status,
      c.notes || null,
      isoTs(c.created_at),
      isoTs(c.updated_at),
    );
    maxContract = Math.max(maxContract, Number(c.id));
  }

  const boq = src.prepare("SELECT * FROM boq_items ORDER BY id").all();
  const insBoq = dest.prepare(`
    INSERT INTO ct_boq_items (
      id, contract_id, serial_number, item_name, unit, comparative_cents, comparative_listed,
      ncbd_cents, active, notes, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  let maxBoq = 0;
  for (const b of boq) {
    insBoq.run(
      b.id,
      b.contract_id,
      b.serial_number,
      b.item_name,
      b.unit || null,
      rupeesToCents(b.comparative_price),
      bool01(b.comparative_listed),
      rupeesToCents(b.ncbd_price),
      bool01(b.is_active),
      b.notes || null,
      isoTs(b.created_at),
      isoTs(b.updated_at),
    );
    maxBoq = Math.max(maxBoq, Number(b.id));
  }

  const invoices = src.prepare("SELECT * FROM invoices ORDER BY id").all();
  const insInv = dest.prepare(`
    INSERT INTO ct_invoices (
      id, contract_id, invoice_number, iso_date, status, notes, billed_at, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?)
  `);
  let maxInv = 0;
  for (const inv of invoices) {
    const status = inv.status === "billed" ? "billed" : "draft";
    insInv.run(
      inv.id,
      inv.contract_id,
      inv.invoice_number,
      String(inv.invoice_date).slice(0, 10),
      status,
      inv.notes || null,
      inv.billed_at ? isoTs(inv.billed_at) : null,
      isoTs(inv.created_at),
      isoTs(inv.updated_at),
    );
    maxInv = Math.max(maxInv, Number(inv.id));
  }

  const entries = src.prepare("SELECT * FROM supply_entries ORDER BY id").all();
  const insEnt = dest.prepare(`
    INSERT INTO ct_supply_entries (
      id, contract_id, invoice_id, boq_item_id, entry_date, item_name, unit, qty_milli,
      comparative_cents, comparative_total_cents, comparative_serial, comparative_listed, demand_no,
      ncbd_cents, ncbd_total_cents, sale_mode, packet_comparative_cents, packet_ncbd_cents,
      pcs_per_packet_milli, pcs_sold_milli, entry_kind, notes, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  let maxEnt = 0;
  for (const e of entries) {
    const saleMode = e.sale_mode === "pieces" ? "pieces" : "unit";
    const entryKind = e.entry_kind === "cash_alternate" ? "cash_alternate" : "normal";
    insEnt.run(
      e.id,
      e.contract_id,
      e.invoice_id ?? null,
      e.boq_item_id ?? null,
      String(e.entry_date).slice(0, 10),
      e.item_name,
      e.unit || null,
      qtyToMilli(e.qty),
      rupeesToCents(e.comparative_price),
      rupeesToCents(e.comparative_total),
      e.comparative_serial ?? null,
      bool01(e.comparative_listed),
      e.demand_no || null,
      rupeesToCents(e.ncbd_price),
      rupeesToCents(e.ncbd_total),
      saleMode,
      e.packet_comparative_price != null ? rupeesToCents(e.packet_comparative_price) : null,
      e.packet_ncbd_price != null ? rupeesToCents(e.packet_ncbd_price) : null,
      e.pcs_per_packet != null ? qtyToMilli(e.pcs_per_packet) : null,
      e.pcs_sold != null ? qtyToMilli(e.pcs_sold) : null,
      entryKind,
      e.notes || null,
      isoTs(e.created_at),
      isoTs(e.updated_at),
    );
    maxEnt = Math.max(maxEnt, Number(e.id));
  }

  const payments = src.prepare("SELECT * FROM payments ORDER BY id").all();
  const insPay = dest.prepare(`
    INSERT INTO ct_payments (id, contract_id, amount_cents, iso_date, notes, created_at)
    VALUES (?,?,?,?,?,?)
  `);
  let maxPay = 0;
  for (const p of payments) {
    insPay.run(
      p.id,
      p.contract_id,
      rupeesToCents(p.amount),
      String(p.payment_date).slice(0, 10),
      p.notes || null,
      isoTs(p.created_at),
    );
    maxPay = Math.max(maxPay, Number(p.id));
  }

  try {
    setSeq(dest, "ct_firms", maxFirm);
    setSeq(dest, "ct_contracts", maxContract);
    setSeq(dest, "ct_boq_items", maxBoq);
    setSeq(dest, "ct_invoices", maxInv);
    setSeq(dest, "ct_supply_entries", maxEnt);
    setSeq(dest, "ct_payments", maxPay);
  } catch {
    // sqlite_sequence may be missing until first AUTOINCREMENT insert
  }

  dest.exec("COMMIT");
  console.log("Import complete:");
  console.log(`  firms=${firms.length} contracts=${contracts.length} boq=${boq.length}`);
  console.log(`  invoices=${invoices.length} entries=${entries.length} payments=${payments.length}`);
  console.log(`  → ${DEST}`);
} catch (err) {
  dest.exec("ROLLBACK");
  console.error("Import failed:", err);
  process.exit(1);
} finally {
  src.close();
  dest.close();
}
