import "server-only";

import { addCashEntry } from "@/lib/repo/cashbook";
import { allRows, getDb, getRow, run, withTransaction } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";
import { roundCents } from "@/lib/money";

export async function listSuppliers(q = "") {
  const db = await getDb();
  let rows = await allRows<{ id: number; name: string; phone: string }>(
    db,
    "SELECT id, name, phone FROM suppliers ORDER BY name COLLATE NOCASE",
  );
  if (q.trim()) {
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    rows = rows.filter((s) => {
      const hay = `${s.name} ${s.phone}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }
  return rows.map((s) => ({ id: Number(s.id), name: s.name, phone: s.phone }));
}

export async function createSupplier(name: string, phone = "") {
  const db = await getDb();
  const n = name.trim();
  if (!n) throw new ActionError("Seller name is required.");
  const existing = await getRow<{ id: number }>(db, "SELECT id FROM suppliers WHERE name=? COLLATE NOCASE", [n]);
  if (existing) return Number(existing.id);
  return (await run(db, "INSERT INTO suppliers (name, phone, created_at) VALUES (?,?,?)", [n, phone.trim(), nowIso()])).id;
}

export async function listPayables(sellerFilter = "") {
  const db = await getDb();
  let rows = await allRows<{
    id: number;
    kind: string;
    party_name: string;
    bill_no: string | null;
    description: string | null;
    iso_date: string;
    total_cents: number;
    paid_cents: number;
    unpaid_cents: number;
    purchase_id: number | null;
    operator_name: string;
  }>(db, "SELECT * FROM payables ORDER BY iso_date DESC, id DESC");
  if (sellerFilter.trim()) {
    const q = sellerFilter.trim().toLowerCase();
    rows = rows.filter((p) => p.party_name.toLowerCase().includes(q));
  }
  const totalDue = rows.reduce((s, p) => s + Number(p.unpaid_cents), 0);
  return {
    payables: rows.map((p) => ({
      id: Number(p.id),
      kind: p.kind as "supplier" | "freight" | "borrow",
      partyName: p.party_name,
      billNo: p.bill_no,
      description: p.description,
      isoDate: p.iso_date,
      totalCents: Number(p.total_cents),
      paidCents: Number(p.paid_cents),
      unpaidCents: Number(p.unpaid_cents),
      purchaseId: p.purchase_id == null ? null : Number(p.purchase_id),
      operatorName: p.operator_name,
    })),
    totalDue,
  };
}

export async function createPayable(input: {
  kind: "supplier" | "freight" | "borrow";
  partyName: string;
  totalCents: number;
  operatorName: string;
  billNo?: string;
  description?: string;
  isoDate?: string;
  purchaseId?: number;
}) {
  const db = await getDb();
  const total = roundCents(input.totalCents);
  if (total <= 0) throw new ActionError("Payable amount must be positive.");
  const when = nowIso();
  return (await run(
    db,
    `INSERT INTO payables (kind, party_name, bill_no, description, iso_date, total_cents, paid_cents, unpaid_cents, purchase_id, operator_name, created_at)
     VALUES (?,?,?,?,?,?,0,?,?,?,?)`,
    [
      input.kind,
      input.partyName.trim(),
      input.billNo || null,
      input.description || null,
      input.isoDate || when.slice(0, 10),
      total,
      total,
      input.purchaseId ?? null,
      input.operatorName,
      when,
    ],
  )).id;
}

export async function payPayable(input: {
  payableId: number;
  amountCents: number;
  operatorName: string;
  isoDate?: string;
  note?: string;
}) {
  const db = await getDb();
  return await withTransaction(db, async () => {
    const p = await getRow<{
      id: number;
      unpaid_cents: number;
      paid_cents: number;
      party_name: string;
      kind: string;
      bill_no: string | null;
    }>(db, "SELECT * FROM payables WHERE id=?", [input.payableId]);
    if (!p) throw new ActionError("Payable not found.");
    const amount = Math.min(roundCents(input.amountCents), Number(p.unpaid_cents));
    if (amount <= 0) throw new ActionError("Enter a payment amount.");
    const when = nowIso();
    const iso = input.isoDate || when.slice(0, 10);
    const cashType = p.kind === "freight" ? "freight" : "stock_purchase";
    // cash entry created outside transaction via nested - do inline insert
    const cashId = (await run(
      db,
      `INSERT INTO cash_book_entries (iso_date, type, amount_cents, description, seller, bill_no, rent_month, auto, payable_id, purchase_id, arrival_id, operator_name, created_at)
       VALUES (?,?,?,?,?,?,NULL,1,?,NULL,NULL,?,?)`,
      [
        iso,
        cashType,
        amount,
        input.note || `Payable pay · ${p.party_name}`,
        p.party_name,
        p.bill_no,
        p.id,
        input.operatorName,
        when,
      ],
    )).id;
    await run(
      db,
      `INSERT INTO payable_payments (payable_id, amount_cents, iso_date, cash_entry_id, note, created_at) VALUES (?,?,?,?,?,?)`,
      [p.id, amount, iso, cashId, input.note || null, when],
    );
    const paid = Number(p.paid_cents) + amount;
    const unpaid = Number(p.unpaid_cents) - amount;
    await run(db, "UPDATE payables SET paid_cents=?, unpaid_cents=? WHERE id=?", [paid, unpaid, p.id]);
    const sellerDue = (await allRows<{ unpaid_cents: number }>(
      db,
      "SELECT unpaid_cents FROM payables WHERE party_name=? COLLATE NOCASE",
      [p.party_name],
    )).reduce((s, x) => s + Number(x.unpaid_cents), 0);
    return { billDue: unpaid, sellerDue };
  });
}

export async function deletePayable(id: number) {
  const db = await getDb();
  await withTransaction(db, async () => {
    await run(db, "DELETE FROM payable_payments WHERE payable_id=?", [id]);
    await run(db, "DELETE FROM payables WHERE id=?", [id]);
  });
}

export async function sellerStatement(partyName: string) {
  const db = await getDb();
  const purchases = await allRows<{
    id: number;
    purchase_number: string;
    iso_date: string;
    goods_subtotal_cents: number;
    freight_total_cents: number;
    kind: string;
  }>(db, "SELECT * FROM purchases WHERE supplier_name=? COLLATE NOCASE ORDER BY iso_date, id", [partyName]);
  const payables = await allRows<{
    id: number;
    kind: string;
    total_cents: number;
    paid_cents: number;
    unpaid_cents: number;
    iso_date: string;
    bill_no: string | null;
  }>(db, "SELECT * FROM payables WHERE party_name=? COLLATE NOCASE ORDER BY iso_date, id", [partyName]);
  const payments = await allRows<{
    id: number;
    payable_id: number;
    amount_cents: number;
    iso_date: string;
    note: string | null;
  }>(
    db,
    `SELECT pp.* FROM payable_payments pp
     JOIN payables p ON p.id = pp.payable_id
     WHERE p.party_name=? COLLATE NOCASE ORDER BY pp.iso_date, pp.id`,
    [partyName],
  );
  return { purchases, payables, payments };
}
