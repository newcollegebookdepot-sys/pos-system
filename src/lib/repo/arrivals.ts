import "server-only";

import { allRows, getDb, getRow, run, withTransaction } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";
import { roundCents } from "@/lib/money";

export async function listArrivals() {
  const db = await getDb();
  const rows = await allRows<{
    id: number;
    seller_name: string;
    bill_t_no: string | null;
    advance_cents: number;
    bill_t_amount_cents: number;
    bill_t_paid_cents: number;
    status: string;
    advance_date: string;
    reached_date: string | null;
    note: string | null;
    operator_name: string;
  }>(db, "SELECT * FROM arrivals ORDER BY id DESC");
  return rows.map((a) => ({
    id: Number(a.id),
    sellerName: a.seller_name,
    billTNo: a.bill_t_no,
    advanceCents: Number(a.advance_cents),
    billTAmountCents: Number(a.bill_t_amount_cents),
    billTPaidCents: Number(a.bill_t_paid_cents),
    status: a.status as "pending" | "reached" | "completed",
    advanceDate: a.advance_date,
    reachedDate: a.reached_date,
    note: a.note,
    operatorName: a.operator_name,
  }));
}

export async function createAdvance(input: {
  sellerName: string;
  advanceCents: number;
  operatorName: string;
  billTNo?: string;
  note?: string;
  isoDate?: string;
}) {
  const amount = roundCents(input.advanceCents);
  if (amount <= 0) throw new ActionError("Enter advance amount.");
  const db = await getDb();
  return await withTransaction(db, async () => {
    const when = nowIso();
    const iso = input.isoDate || when.slice(0, 10);
    const cashId = (await run(
      db,
      `INSERT INTO cash_book_entries (iso_date, type, amount_cents, description, seller, bill_no, rent_month, auto, payable_id, purchase_id, arrival_id, operator_name, created_at)
       VALUES (?,?,?,?,?,?,NULL,1,NULL,NULL,NULL,?,?)`,
      [
        iso,
        "stock_purchase",
        amount,
        `Advance to seller (Bill T)`,
        input.sellerName.trim(),
        input.billTNo || null,
        input.operatorName,
        when,
      ],
    )).id;
    const id = (await run(
      db,
      `INSERT INTO arrivals (seller_name, bill_t_no, advance_cents, bill_t_amount_cents, bill_t_paid_cents, status, advance_date, reached_date, note, advance_cash_id, operator_name, created_at)
       VALUES (?,?,?,0,0,'pending',?,NULL,?,?,?,?)`,
      [
        input.sellerName.trim(),
        input.billTNo || null,
        amount,
        iso,
        input.note || null,
        cashId,
        input.operatorName,
        when,
      ],
    )).id;
    await run(db, "UPDATE cash_book_entries SET arrival_id=? WHERE id=?", [id, cashId]);
    return id;
  });
}

export async function markReached(input: {
  id: number;
  billTNo: string;
  billTAmountCents: number;
  reachedDate: string;
}) {
  const db = await getDb();
  const a = await getRow<{ status: string }>(db, "SELECT status FROM arrivals WHERE id=?", [input.id]);
  if (!a) throw new ActionError("Arrival not found.");
  if (a.status === "completed") throw new ActionError("Already completed.");
  const amt = roundCents(input.billTAmountCents);
  if (amt <= 0) throw new ActionError("Enter Bill T amount.");
  if (!input.billTNo.trim()) throw new ActionError("Bill T # is required.");
  await run(
    db,
    `UPDATE arrivals SET bill_t_no=?, bill_t_amount_cents=?, status='reached', reached_date=? WHERE id=?`,
    [input.billTNo.trim(), amt, input.reachedDate, input.id],
  );
}

export async function payBillT(input: {
  id: number;
  amountCents: number;
  operatorName: string;
  isoDate?: string;
}) {
  const db = await getDb();
  return await withTransaction(db, async () => {
    const a = await getRow<{
      id: number;
      status: string;
      bill_t_amount_cents: number;
      bill_t_paid_cents: number;
      seller_name: string;
      bill_t_no: string | null;
    }>(db, "SELECT * FROM arrivals WHERE id=?", [input.id]);
    if (!a) throw new ActionError("Arrival not found.");
    if (a.status === "pending") throw new ActionError("Mark as reached first.");
    const due = Number(a.bill_t_amount_cents) - Number(a.bill_t_paid_cents);
    const amount = Math.min(roundCents(input.amountCents), due);
    if (amount <= 0) throw new ActionError("Nothing left to pay.");
    const when = nowIso();
    const iso = input.isoDate || when.slice(0, 10);
    await run(
      db,
      `INSERT INTO cash_book_entries (iso_date, type, amount_cents, description, seller, bill_no, rent_month, auto, payable_id, purchase_id, arrival_id, operator_name, created_at)
       VALUES (?,?,?,?,?,?,NULL,1,NULL,NULL,?,?,?)`,
      [
        iso,
        "freight",
        amount,
        `Bill T payment`,
        a.seller_name,
        a.bill_t_no,
        a.id,
        input.operatorName,
        when,
      ],
    );
    const paid = Number(a.bill_t_paid_cents) + amount;
    const status = paid >= Number(a.bill_t_amount_cents) ? "completed" : "reached";
    await run(db, "UPDATE arrivals SET bill_t_paid_cents=?, status=? WHERE id=?", [paid, status, a.id]);
    return { paid, status, remaining: Number(a.bill_t_amount_cents) - paid };
  });
}

export async function deleteArrival(id: number) {
  const db = await getDb();
  const row = await getRow<Record<string, unknown>>(db, "SELECT * FROM arrivals WHERE id=?", [id]);
  if (!row) throw new ActionError("Arrival not found.");
  await run(db, "DELETE FROM arrivals WHERE id=?", [id]);
  return row;
}

export async function arrivalCards() {
  const list = await listArrivals();
  const awaiting = list.filter((a) => a.status === "pending").length;
  const advanceTied = list.filter((a) => a.status !== "completed").reduce((s, a) => s + a.advanceCents, 0);
  const billTToPay = list
    .filter((a) => a.status === "reached")
    .reduce((s, a) => s + (a.billTAmountCents - a.billTPaidCents), 0);
  return { awaiting, advanceTied, billTToPay, records: list.length };
}
