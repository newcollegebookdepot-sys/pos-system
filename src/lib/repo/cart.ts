import "server-only";

import { allRows, getDb, getRow, run, withTransaction } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";
import type { InvoiceLine } from "@/lib/types";

/** Reserve stock for a cart line (immediate deduct). */
export async function reserveLine(userId: number, clientKey: string, allocations: { batchId: number; qty: number }[]) {
  const db = await getDb();
  return withTransaction(db, () => {
    // Release any prior reservation for this client key
    const prior = allRows<{ batch_id: number; qty: number }>(
      db,
      "SELECT batch_id, qty FROM cart_reservations WHERE user_id=? AND client_key=?",
      [userId, clientKey],
    );
    for (const p of prior) {
      run(db, "UPDATE batches SET stock_pcs = stock_pcs + ? WHERE id = ?", [Number(p.qty), Number(p.batch_id)]);
    }
    run(db, "DELETE FROM cart_reservations WHERE user_id=? AND client_key=?", [userId, clientKey]);

    const done: { batchId: number; qty: number }[] = [];
    for (const a of allocations) {
      const b = getRow<{ stock_pcs: number; name: string }>(db, "SELECT stock_pcs, name FROM batches WHERE id=?", [
        a.batchId,
      ]);
      if (!b || Number(b.stock_pcs) < a.qty) {
        // rollback
        for (const d of done) {
          run(db, "UPDATE batches SET stock_pcs = stock_pcs + ? WHERE id = ?", [d.qty, d.batchId]);
          run(db, "DELETE FROM cart_reservations WHERE user_id=? AND client_key=? AND batch_id=?", [
            userId,
            clientKey,
            d.batchId,
          ]);
        }
        throw new ActionError(b ? `Only ${b.stock_pcs} left for ${b.name}.` : "Batch not found.");
      }
      run(db, "UPDATE batches SET stock_pcs = stock_pcs - ?, updated_at=? WHERE id=?", [a.qty, nowIso(), a.batchId]);
      run(db, "INSERT INTO cart_reservations (user_id, batch_id, qty, client_key, created_at) VALUES (?,?,?,?,?)", [
        userId,
        a.batchId,
        a.qty,
        clientKey,
        nowIso(),
      ]);
      done.push({ batchId: a.batchId, qty: a.qty });
    }
    return true;
  });
}

export async function releaseLine(userId: number, clientKey: string) {
  const db = await getDb();
  withTransaction(db, () => {
    const prior = allRows<{ batch_id: number; qty: number }>(
      db,
      "SELECT batch_id, qty FROM cart_reservations WHERE user_id=? AND client_key=?",
      [userId, clientKey],
    );
    for (const p of prior) {
      run(db, "UPDATE batches SET stock_pcs = stock_pcs + ?, updated_at=? WHERE id = ?", [
        Number(p.qty),
        nowIso(),
        Number(p.batch_id),
      ]);
    }
    run(db, "DELETE FROM cart_reservations WHERE user_id=? AND client_key=?", [userId, clientKey]);
  });
}

export async function releaseAllCart(userId: number) {
  const db = await getDb();
  withTransaction(db, () => {
    const prior = allRows<{ batch_id: number; qty: number }>(
      db,
      "SELECT batch_id, qty FROM cart_reservations WHERE user_id=?",
      [userId],
    );
    for (const p of prior) {
      run(db, "UPDATE batches SET stock_pcs = stock_pcs + ?, updated_at=? WHERE id = ?", [
        Number(p.qty),
        nowIso(),
        Number(p.batch_id),
      ]);
    }
    run(db, "DELETE FROM cart_reservations WHERE user_id=?", [userId]);
  });
}

export async function saveDraft(input: {
  customerId: number;
  customerName: string;
  billDiscountCents: number;
  paidCents: number;
  cart: InvoiceLine[];
  operatorName: string;
}) {
  const db = await getDb();
  const count = getRow<{ n: number }>(db, "SELECT COUNT(*) AS n FROM sale_drafts");
  const draftNumber = `DRF-${1000 + Number(count?.n || 0) + 1}`;
  run(
    db,
    `INSERT INTO sale_drafts (draft_number, customer_id, customer_name, bill_discount_cents, paid_cents, cart_json, operator_name, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      draftNumber,
      input.customerId,
      input.customerName,
      input.billDiscountCents,
      input.paidCents,
      JSON.stringify(input.cart),
      input.operatorName,
      nowIso(),
    ],
  );
  return draftNumber;
}

export async function listDrafts() {
  const db = await getDb();
  return allRows<{
    id: number;
    draft_number: string;
    customer_name: string;
    cart_json: string;
    bill_discount_cents: number;
    paid_cents: number;
    customer_id: number;
    created_at: string;
  }>(db, "SELECT * FROM sale_drafts ORDER BY id DESC").map((d) => ({
    id: Number(d.id),
    draftNumber: d.draft_number,
    customerId: Number(d.customer_id),
    customerName: d.customer_name,
    billDiscountCents: Number(d.bill_discount_cents),
    paidCents: Number(d.paid_cents),
    cart: JSON.parse(d.cart_json) as InvoiceLine[],
    createdAt: d.created_at,
  }));
}

export async function deleteDraft(id: number) {
  const db = await getDb();
  run(db, "DELETE FROM sale_drafts WHERE id = ?", [id]);
}

export async function getDraft(id: number) {
  const drafts = await listDrafts();
  return drafts.find((d) => d.id === id) ?? null;
}

export async function draftCount() {
  const db = await getDb();
  const row = getRow<{ n: number }>(db, "SELECT COUNT(*) AS n FROM sale_drafts");
  return Number(row?.n || 0);
}
