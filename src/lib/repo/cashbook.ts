import "server-only";

import { cashBookMath, type CashEntryType } from "@/lib/domain/cashbook";
import { openingKeyForPeriodStart } from "@/lib/domain/cashbook";
import { allRows, getDb, getRow, run } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";
import { roundCents } from "@/lib/money";
import { inRange } from "@/lib/period";

export async function getOpening(periodKey: string) {
  const db = await getDb();
  const row = getRow<{ amount_cents: number }>(
    db,
    "SELECT amount_cents FROM cash_book_openings WHERE period_key=?",
    [periodKey],
  );
  return Number(row?.amount_cents || 0);
}

export async function setOpening(periodKey: string, amountCents: number) {
  const db = await getDb();
  const when = nowIso();
  const existing = getRow<{ period_key: string }>(db, "SELECT period_key FROM cash_book_openings WHERE period_key=?", [
    periodKey,
  ]);
  if (existing) {
    run(db, "UPDATE cash_book_openings SET amount_cents=?, updated_at=? WHERE period_key=?", [
      roundCents(amountCents),
      when,
      periodKey,
    ]);
  } else {
    run(db, "INSERT INTO cash_book_openings (period_key, amount_cents, updated_at) VALUES (?,?,?)", [
      periodKey,
      roundCents(amountCents),
      when,
    ]);
  }
}

export async function clearOpening(periodKey: string) {
  const db = await getDb();
  run(db, "DELETE FROM cash_book_openings WHERE period_key=?", [periodKey]);
}

export async function listCashEntries(from: string | null, to: string | null, type?: string) {
  const db = await getDb();
  let rows = allRows<{
    id: number;
    iso_date: string;
    type: CashEntryType;
    amount_cents: number;
    description: string;
    seller: string | null;
    bill_no: string | null;
    rent_month: string | null;
    auto: number;
    operator_name: string;
  }>(db, "SELECT * FROM cash_book_entries ORDER BY iso_date DESC, id DESC");
  rows = rows.filter((e) => inRange(e.iso_date, from, to));
  if (type) rows = rows.filter((e) => e.type === type);
  return rows.map((e) => ({
    id: Number(e.id),
    isoDate: e.iso_date,
    type: e.type,
    amountCents: Number(e.amount_cents),
    description: e.description,
    seller: e.seller,
    billNo: e.bill_no,
    rentMonth: e.rent_month,
    auto: Number(e.auto) === 1,
    operatorName: e.operator_name,
  }));
}

export async function addCashEntry(input: {
  type: CashEntryType;
  amountCents: number;
  description: string;
  isoDate: string;
  operatorName: string;
  seller?: string;
  billNo?: string;
  rentMonth?: string;
  auto?: boolean;
  payableId?: number;
  purchaseId?: number;
  arrivalId?: number;
}) {
  const db = await getDb();
  const amount = roundCents(input.amountCents);
  if (amount <= 0) throw new ActionError("Enter an amount.");
  if (!input.description.trim() && !input.auto) throw new ActionError("Description is required.");
  return run(
    db,
    `INSERT INTO cash_book_entries (iso_date, type, amount_cents, description, seller, bill_no, rent_month, auto, payable_id, purchase_id, arrival_id, operator_name, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      input.isoDate,
      input.type,
      amount,
      input.description || "",
      input.seller || null,
      input.billNo || null,
      input.rentMonth || null,
      input.auto ? 1 : 0,
      input.payableId ?? null,
      input.purchaseId ?? null,
      input.arrivalId ?? null,
      input.operatorName,
      nowIso(),
    ],
  ).id;
}

export async function updateCashEntry(
  id: number,
  input: {
    type: CashEntryType;
    amountCents: number;
    description: string;
    isoDate: string;
    rentMonth?: string;
  },
) {
  const db = await getDb();
  const updated = run(
    db,
    `UPDATE cash_book_entries SET type=?, amount_cents=?, description=?, iso_date=?, rent_month=? WHERE id=?`,
    [input.type, roundCents(input.amountCents), input.description, input.isoDate, input.rentMonth || null, id],
  );
  if (updated.changes !== 1) throw new ActionError("Cash entry not found.");
}

export async function deleteCashEntry(id: number) {
  const db = await getDb();
  const row = getRow<Record<string, unknown>>(db, "SELECT * FROM cash_book_entries WHERE id=?", [id]);
  if (!row) throw new ActionError("Cash entry not found.");
  run(db, "DELETE FROM cash_book_entries WHERE id=?", [id]);
  return row;
}

export async function computeCashBook(from: string | null, to: string | null) {
  const db = await getDb();
  const opening = await getOpening(openingKeyForPeriodStart(from));
  const entries = await listCashEntries(from, to);

  // Auto inflows: paid at sale + receipts in period
  const invPaid = allRows<{ paid_cents: number; iso_date: string }>(db, "SELECT paid_cents, iso_date FROM invoices")
    .filter((i) => inRange(i.iso_date, from, to))
    .reduce((s, i) => s + Number(i.paid_cents), 0);
  const receipts = allRows<{ amount_cents: number; iso_date: string }>(db, "SELECT amount_cents, iso_date FROM receipts")
    .filter((r) => inRange(r.iso_date, from, to))
    .reduce((s, r) => s + Number(r.amount_cents), 0);

  const math = cashBookMath({
    openingCents: opening,
    salesPaidCents: invPaid,
    receiptsCents: receipts,
    entries: entries.map((e) => ({ type: e.type, amountCents: e.amountCents })),
  });
  return { ...math, entries, salesPaidCents: invPaid, receiptsCents: receipts };
}

export { openingKeyForPeriodStart };
