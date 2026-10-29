import "server-only";

import { isWalkIn, WALK_IN_ID } from "@/lib/domain/ledger";
import { allRows, getDb, getRow, run, withTransaction } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";
import { roundCents } from "@/lib/money";
import { inRange } from "@/lib/period";

export async function listReceipts(opts: { from: string | null; to: string | null; q?: string; mode?: string }) {
  const db = await getDb();
  let rows = allRows<{
    id: number;
    receipt_number: string;
    customer_id: number;
    customer_name: string;
    amount_cents: number;
    mode: string;
    prev_balance_cents: number;
    new_balance_cents: number;
    operator_name: string;
    iso_date: string;
    note: string | null;
  }>(db, "SELECT * FROM receipts ORDER BY iso_date DESC, id DESC");
  rows = rows.filter((r) => inRange(r.iso_date, opts.from, opts.to));
  if (opts.mode) rows = rows.filter((r) => r.mode === opts.mode);
  if (opts.q?.trim()) {
    const q = opts.q.trim().toLowerCase();
    rows = rows.filter(
      (r) => r.customer_name.toLowerCase().includes(q) || r.receipt_number.toLowerCase().includes(q),
    );
  }
  return rows.map((r) => ({
    id: Number(r.id),
    receiptNumber: r.receipt_number,
    customerId: Number(r.customer_id),
    customerName: r.customer_name,
    amountCents: Number(r.amount_cents),
    mode: r.mode as "Cash" | "Bank·Easypaisa",
    prevBalanceCents: Number(r.prev_balance_cents),
    newBalanceCents: Number(r.new_balance_cents),
    operatorName: r.operator_name,
    isoDate: r.iso_date,
    note: r.note,
  }));
}

export async function createReceipt(input: {
  customerId: number;
  amountCents: number;
  mode: "Cash" | "Bank·Easypaisa";
  operatorName: string;
  note?: string;
  isoDate?: string;
}) {
  if (input.customerId === WALK_IN_ID) throw new ActionError("Walk-in does not use cash receipts.");
  const db = await getDb();
  return withTransaction(db, () => {
    const c = getRow<{ id: number; name: string; balance_cents: number }>(
      db,
      "SELECT id, name, balance_cents FROM customers WHERE id=?",
      [input.customerId],
    );
    if (!c) throw new ActionError("Customer not found.");
    const amount = Math.max(0, roundCents(input.amountCents));
    if (amount <= 0) throw new ActionError("Enter a receipt amount.");
    const prev = Number(c.balance_cents);
    let next = roundCents(prev - amount);
    // over-receipt creates surplus for registered customers
    const when = nowIso();
    const iso = input.isoDate || when.slice(0, 10);
    const count = getRow<{ n: number }>(db, "SELECT COUNT(*) AS n FROM receipts");
    const receiptNumber = `RCP-${1000 + Number(count?.n || 0) + 1}`;
    run(
      db,
      `INSERT INTO receipts (receipt_number, customer_id, customer_name, amount_cents, mode, prev_balance_cents, new_balance_cents, operator_name, iso_date, note, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [receiptNumber, c.id, c.name, amount, input.mode, prev, next, input.operatorName, iso, input.note || null, when],
    );
    run(db, "UPDATE customers SET balance_cents=?, updated_at=? WHERE id=?", [next, when, c.id]);
    return receiptNumber;
  });
}

export async function deleteReceipt(id: number) {
  const db = await getDb();
  return withTransaction(db, () => {
    const r = getRow<{
      id: number;
      customer_id: number;
      amount_cents: number;
      receipt_number: string;
      customer_name: string;
      mode: string;
      prev_balance_cents: number;
      new_balance_cents: number;
      operator_name: string;
      iso_date: string;
      note: string | null;
    }>(db, "SELECT * FROM receipts WHERE id=?", [id]);
    if (!r) throw new ActionError("Receipt not found.");
    const c = getRow<{ balance_cents: number }>(db, "SELECT balance_cents FROM customers WHERE id=?", [
      r.customer_id,
    ]);
    if (c) {
      const next = Number(c.balance_cents) + Number(r.amount_cents);
      run(db, "UPDATE customers SET balance_cents=?, updated_at=? WHERE id=?", [next, nowIso(), r.customer_id]);
    }
    run(db, "DELETE FROM receipts WHERE id=?", [id]);
    return r;
  });
}
