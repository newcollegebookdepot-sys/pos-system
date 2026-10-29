import "server-only";

import { WALK_IN_ID, WALK_IN_NAME, type CustomerType } from "@/lib/domain/ledger";
import { allRows, getDb, getRow, run, withTransaction } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";
import { roundCents } from "@/lib/money";
import type { Customer } from "@/lib/types";

type Row = {
  id: number;
  name: string;
  phone: string;
  type: CustomerType;
  balance_cents: number;
  opening_dues_cents: number;
  balance_manual: number;
  active: number;
};

function map(row: Row): Customer {
  return {
    id: Number(row.id),
    name: row.name,
    phone: row.phone,
    type: row.type,
    balanceCents: Number(row.balance_cents),
    openingDuesCents: Number(row.opening_dues_cents),
    balanceManual: Number(row.balance_manual) === 1,
    active: Number(row.active) === 1,
  };
}

export async function listCustomers(opts: { q?: string; type?: string; duesOnly?: boolean } = {}) {
  const db = await getDb();
  let rows = allRows<Row>(
    db,
    "SELECT * FROM customers WHERE active = 1 ORDER BY CASE id WHEN 1 THEN 0 ELSE 1 END, name COLLATE NOCASE",
  ).map(map);
  if (opts.type) rows = rows.filter((c) => c.type === opts.type);
  if (opts.duesOnly) rows = rows.filter((c) => c.balanceCents > 0);
  if (opts.q?.trim()) {
    const tokens = opts.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    rows = rows.filter((c) => {
      const hay = `${c.name} ${c.phone} ${c.type}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }
  // Walk-in first already; prefix ranking for query
  if (opts.q?.trim()) {
    const q = opts.q.trim().toLowerCase();
    rows.sort((a, b) => {
      if (a.id === WALK_IN_ID) return -1;
      if (b.id === WALK_IN_ID) return 1;
      const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return ap - bp || a.name.localeCompare(b.name);
    });
  }
  const totalDues = rows.reduce((s, c) => s + Math.max(0, c.balanceCents), 0);
  const totalSurplus = rows.reduce((s, c) => s + Math.max(0, -c.balanceCents), 0);
  return { customers: rows, totalDues, totalSurplus, count: rows.length };
}

export async function getCustomer(id: number) {
  const db = await getDb();
  const row = getRow<Row>(db, "SELECT * FROM customers WHERE id = ?", [id]);
  return row ? map(row) : null;
}

export async function createCustomer(input: {
  name: string;
  phone?: string;
  type: CustomerType;
  openingBalanceCents?: number;
}) {
  const db = await getDb();
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new ActionError("Customer name is required.");
  if (name.toLowerCase() === WALK_IN_NAME.toLowerCase()) throw new ActionError("Walk-in Customer already exists.");
  const opening = roundCents(input.openingBalanceCents || 0);
  const when = nowIso();
  const inserted = run(
    db,
    `INSERT INTO customers (name, phone, type, balance_cents, opening_dues_cents, balance_manual, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [name, input.phone?.trim() || "N/A", input.type, opening, opening, opening !== 0 ? 1 : 0, when, when],
  );
  return inserted.id;
}

export async function updateCustomer(input: {
  id: number;
  name: string;
  phone: string;
  type: CustomerType;
  balanceCents: number;
}) {
  const db = await getDb();
  const existing = await getCustomer(input.id);
  if (!existing) throw new ActionError("Customer not found.");
  const name = input.id === WALK_IN_ID ? WALK_IN_NAME : input.name.trim().replace(/\s+/g, " ");
  let balance = roundCents(input.balanceCents);
  if (input.id === WALK_IN_ID) balance = Math.max(0, balance);
  run(
    db,
    `UPDATE customers SET name=?, phone=?, type=?, balance_cents=?, balance_manual=1, updated_at=? WHERE id=?`,
    [name, input.phone.trim() || "N/A", input.type, balance, nowIso(), input.id],
  );
}

export async function deleteCustomer(id: number) {
  if (id === WALK_IN_ID) throw new ActionError("Walk-in Customer cannot be deleted.");
  const db = await getDb();
  const snap = await getCustomer(id);
  if (!snap) throw new ActionError("Customer not found.");
  run(db, "UPDATE customers SET active = 0, updated_at = ? WHERE id = ?", [nowIso(), id]);
  return snap;
}

export async function restoreCustomer(customer: Customer) {
  const db = await getDb();
  run(
    db,
    `UPDATE customers SET active=1, name=?, phone=?, type=?, balance_cents=?, opening_dues_cents=?, balance_manual=?, updated_at=? WHERE id=?`,
    [
      customer.name,
      customer.phone,
      customer.type,
      customer.balanceCents,
      customer.openingDuesCents,
      customer.balanceManual ? 1 : 0,
      nowIso(),
      customer.id,
    ],
  );
}

export async function writeOffAllDues() {
  const db = await getDb();
  const before = allRows<Row>(db, "SELECT * FROM customers WHERE balance_cents > 0 AND id != 1").map(map);
  run(db, "UPDATE customers SET balance_cents = 0, updated_at = ? WHERE balance_cents > 0 AND id != 1", [nowIso()]);
  return before;
}

export async function clearSalesHistoryKeepOpeningDues() {
  const db = await getDb();
  withTransaction(db, () => {
    run(db, "DELETE FROM invoice_allocations");
    run(db, "DELETE FROM invoice_lines");
    run(db, "DELETE FROM invoices");
    run(db, "DELETE FROM receipts");
    run(db, "DELETE FROM surplus_logs");
    run(db, "DELETE FROM sale_drafts");
    run(db, "DELETE FROM cart_reservations");
    const customers = allRows<Row>(db, "SELECT * FROM customers");
    for (const c of customers) {
      if (Number(c.id) === WALK_IN_ID) {
        run(db, "UPDATE customers SET balance_cents=0, opening_dues_cents=0, balance_manual=0, updated_at=? WHERE id=1", [
          nowIso(),
        ]);
        continue;
      }
      const opening = Number(c.opening_dues_cents) || 0;
      run(db, "UPDATE customers SET balance_cents=?, balance_manual=1, updated_at=? WHERE id=?", [
        opening,
        nowIso(),
        c.id,
      ]);
    }
  });
}

export async function setCustomerBalance(id: number, balanceCents: number) {
  const db = await getDb();
  let bal = roundCents(balanceCents);
  if (id === WALK_IN_ID) bal = Math.max(0, bal);
  run(db, "UPDATE customers SET balance_cents=?, updated_at=? WHERE id=?", [bal, nowIso(), id]);
}

export async function adjustSurplus(customerId: number, newSurplusCents: number, note: string, operatorName: string) {
  if (customerId === WALK_IN_ID) throw new ActionError("Walk-in cannot hold surplus.");
  const db = await getDb();
  return withTransaction(db, () => {
    const c = getRow<Row>(db, "SELECT * FROM customers WHERE id = ?", [customerId]);
    if (!c) throw new ActionError("Customer not found.");
    const prev = Number(c.balance_cents);
    if (prev >= 0) throw new ActionError("Customer has no surplus credit.");
    const prevSurplus = Math.abs(prev);
    const nextSurplus = Math.max(0, roundCents(newSurplusCents));
    const newBalance = -nextSurplus;
    const when = nowIso();
    const iso = when.slice(0, 10);
    const count = getRow<{ n: number }>(db, "SELECT COUNT(*) AS n FROM surplus_logs");
    const logNumber = `SUR-${1000 + Number(count?.n || 0) + 1}`;
    run(
      db,
      `INSERT INTO surplus_logs (log_number, customer_id, customer_name, prev_surplus_cents, new_surplus_cents, note, operator_name, iso_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [logNumber, customerId, c.name, prevSurplus, nextSurplus, note || null, operatorName, iso, when],
    );
    run(db, "UPDATE customers SET balance_cents=?, updated_at=? WHERE id=?", [newBalance, when, customerId]);
    return logNumber;
  });
}
