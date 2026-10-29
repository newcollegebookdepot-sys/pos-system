import "server-only";

import { allRows, getDb, run } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";
import { roundCents } from "@/lib/money";

export type CtPayment = {
  id: number;
  contractId: number;
  amountCents: number;
  isoDate: string;
  notes: string | null;
  createdAt: string;
};

type Row = {
  id: number;
  contract_id: number;
  amount_cents: number;
  iso_date: string;
  notes: string | null;
  created_at: string;
};

function map(row: Row): CtPayment {
  return {
    id: Number(row.id),
    contractId: Number(row.contract_id),
    amountCents: Number(row.amount_cents),
    isoDate: row.iso_date,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function listPayments(contractId: number) {
  const db = await getDb();
  return allRows<Row>(
    db,
    "SELECT * FROM ct_payments WHERE contract_id = ? ORDER BY iso_date DESC, id DESC",
    [contractId],
  ).map(map);
}

export async function addPayment(input: {
  contractId: number;
  amountCents: number;
  isoDate: string;
  notes?: string | null;
}) {
  const amount = roundCents(input.amountCents);
  if (amount <= 0) throw new ActionError("Payment amount must be positive.");
  const db = await getDb();
  const when = nowIso();
  const inserted = run(
    db,
    `INSERT INTO ct_payments (contract_id, amount_cents, iso_date, notes, created_at) VALUES (?,?,?,?,?)`,
    [input.contractId, amount, input.isoDate.slice(0, 10), input.notes?.trim() || null, when],
  );
  return inserted.id;
}

export async function deletePayment(id: number) {
  const db = await getDb();
  run(db, "DELETE FROM ct_payments WHERE id = ?", [id]);
}
