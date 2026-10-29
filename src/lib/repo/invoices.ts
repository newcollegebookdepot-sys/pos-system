import "server-only";

import { saleLedgerMath, WALK_IN_ID } from "@/lib/domain/ledger";
import { checkoutTotals, invoiceStatus, type SaleUnit } from "@/lib/domain/pricing";
import { planEqualIncrease, releaseEqual, type Alloc } from "@/lib/domain/stock";
import { allRows, getDb, getRow, run, withTransaction } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";
import { roundCents } from "@/lib/money";
import { inRange } from "@/lib/period";
import type { Invoice, InvoiceLine } from "@/lib/types";

type InvRow = {
  id: number;
  invoice_number: string;
  iso_date: string;
  created_at: string;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  customer_type: string;
  operator_name: string;
  retail_subtotal_cents: number;
  item_discount_cents: number;
  subtotal_cents: number;
  bill_discount_cents: number;
  grand_total_cents: number;
  paid_cents: number;
  unpaid_cents: number;
  profit_cents: number;
  surplus_applied_cents: number;
  prev_balance_cents: number;
  closing_balance_cents: number;
  status: "Paid" | "Partial" | "Unpaid";
};

function mapInv(row: InvRow, lines: InvoiceLine[]): Invoice {
  return {
    id: Number(row.id),
    invoiceNumber: row.invoice_number,
    isoDate: row.iso_date,
    createdAt: row.created_at,
    customerId: Number(row.customer_id),
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerType: row.customer_type,
    operatorName: row.operator_name,
    retailSubtotalCents: Number(row.retail_subtotal_cents),
    itemDiscountCents: Number(row.item_discount_cents),
    subtotalCents: Number(row.subtotal_cents),
    billDiscountCents: Number(row.bill_discount_cents),
    grandTotalCents: Number(row.grand_total_cents),
    paidCents: Number(row.paid_cents),
    unpaidCents: Number(row.unpaid_cents),
    profitCents: Number(row.profit_cents),
    surplusAppliedCents: Number(row.surplus_applied_cents),
    prevBalanceCents: Number(row.prev_balance_cents),
    closingBalanceCents: Number(row.closing_balance_cents),
    status: row.status,
    lines,
  };
}

async function loadLines(db: Awaited<ReturnType<typeof getDb>>, invoiceId: number): Promise<InvoiceLine[]> {
  const lines = await allRows<{
    id: number;
    name: string;
    sale_unit: SaleUnit;
    pack_size: number;
    qty_pcs: number;
    packets: number;
    retail_cents: number;
    disc_cents: number;
    disc_pct: number;
    retail_total_cents: number;
    saved_cents: number;
    line_total_cents: number;
  }>(db, "SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY id", [invoiceId]);
  const out: InvoiceLine[] = [];
  for (const l of lines) {
    const allocationRows = await allRows<{
      batch_id: number;
      batch_no: number;
      qty: number;
      landed_cents: number;
    }>(db, "SELECT batch_id, batch_no, qty, landed_cents FROM invoice_allocations WHERE invoice_line_id = ?", [
      l.id,
    ]);
    out.push({
      id: Number(l.id),
      name: l.name,
      saleUnit: l.sale_unit,
      packSize: Number(l.pack_size),
      qtyPcs: Number(l.qty_pcs),
      packets: Number(l.packets),
      retailCents: Number(l.retail_cents),
      discCents: Number(l.disc_cents),
      discPct: Number(l.disc_pct),
      retailTotalCents: Number(l.retail_total_cents),
      savedCents: Number(l.saved_cents),
      lineTotalCents: Number(l.line_total_cents),
      allocations: allocationRows.map((a) => ({
        batchId: Number(a.batch_id),
        batchNo: Number(a.batch_no),
        qty: Number(a.qty),
        landedCents: Number(a.landed_cents),
      })),
    });
  }
  return out;
}

export async function getInvoice(id: number) {
  const db = await getDb();
  const row = await getRow<InvRow>(db, "SELECT * FROM invoices WHERE id = ?", [id]);
  if (!row) return null;
  return mapInv(row, await loadLines(db, id));
}

export async function getInvoiceByNumber(invoiceNumber: string) {
  const db = await getDb();
  const row = await getRow<InvRow>(db, "SELECT * FROM invoices WHERE invoice_number = ?", [invoiceNumber]);
  if (!row) return null;
  return mapInv(row, await loadLines(db, Number(row.id)));
}

export async function listInvoices(opts: {
  from: string | null;
  to: string | null;
  q?: string;
  status?: string;
  operator?: string;
  minTotal?: number | null;
  maxTotal?: number | null;
}) {
  const db = await getDb();
  let rows = (await allRows<InvRow>(db, "SELECT * FROM invoices ORDER BY iso_date DESC, id DESC")).map((r) =>
    mapInv(r, []),
  );
  rows = rows.filter((inv) => inRange(inv.isoDate, opts.from, opts.to));
  if (opts.status) rows = rows.filter((i) => i.status === opts.status);
  if (opts.operator) rows = rows.filter((i) => i.operatorName === opts.operator);
  if (opts.minTotal != null) rows = rows.filter((i) => i.grandTotalCents >= opts.minTotal!);
  if (opts.maxTotal != null) rows = rows.filter((i) => i.grandTotalCents <= opts.maxTotal!);
  if (opts.q?.trim()) {
    const q = opts.q.trim().toLowerCase();
    rows = rows.filter(
      (i) => i.invoiceNumber.toLowerCase().includes(q) || i.customerName.toLowerCase().includes(q),
    );
  }
  // attach light line qty via counts
  const summary = {
    salesCount: rows.length,
    paidCents: rows.reduce((s, i) => s + i.paidCents, 0),
    unpaidCents: rows.reduce((s, i) => s + i.unpaidCents, 0),
    profitCents: rows.reduce((s, i) => s + i.profitCents, 0),
    grandCents: rows.reduce((s, i) => s + i.grandTotalCents, 0),
  };
  return { invoices: rows, summary };
}

async function nextInvoiceNumber(db: Awaited<ReturnType<typeof getDb>>) {
  const count = await getRow<{ n: number }>(db, "SELECT COUNT(*) AS n FROM invoices");
  return `INV-${1000 + Number(count?.n || 0) + 1}`;
}

async function insertInvoiceRecord(
  db: Awaited<ReturnType<typeof getDb>>,
  input: {
    customer: { id: number; name: string; phone: string; type: string; balanceCents: number };
    operatorName: string;
    lines: InvoiceLine[];
    billDiscountCents: number;
    paidCents: number;
    isoDate?: string;
  },
) {
  const totals = checkoutTotals(
    input.lines.map((l) => ({
      retailTotalCents: l.retailTotalCents,
      lineTotalCents: l.lineTotalCents,
      savedCents: l.savedCents,
    })),
    input.billDiscountCents,
  );
  const ledger = saleLedgerMath(input.customer, totals.grand, input.paidCents);
  let profit = 0;
  for (const line of input.lines) {
    for (const a of line.allocations) {
      profit += line.discCents * a.qty - a.qty * a.landedCents;
    }
  }
  profit -= totals.billDisc;
  const status = invoiceStatus(input.paidCents, ledger.unpaid);
  const when = nowIso();
  const isoDate = input.isoDate || when.slice(0, 10);
  const invoiceNumber = await nextInvoiceNumber(db);
  const inv = await run(
    db,
    `INSERT INTO invoices (
      invoice_number, iso_date, customer_id, customer_name, customer_phone, customer_type, operator_name,
      retail_subtotal_cents, item_discount_cents, subtotal_cents, bill_discount_cents, grand_total_cents,
      paid_cents, unpaid_cents, profit_cents, surplus_applied_cents, prev_balance_cents, closing_balance_cents,
      status, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      invoiceNumber,
      isoDate,
      input.customer.id,
      input.customer.name,
      input.customer.phone,
      input.customer.type,
      input.operatorName,
      totals.retailSubtotal,
      totals.itemDiscount,
      totals.afterItem,
      totals.billDisc,
      totals.grand,
      roundCents(input.paidCents),
      ledger.unpaid,
      roundCents(profit),
      ledger.surplusApplied,
      ledger.prevBalance,
      ledger.closingBalance,
      status,
      when,
      when,
    ],
  );
  for (const line of input.lines) {
    const lineIns = await run(
      db,
      `INSERT INTO invoice_lines (
        invoice_id, name, sale_unit, pack_size, qty_pcs, packets, retail_cents, disc_cents, disc_pct,
        retail_total_cents, saved_cents, line_total_cents
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        inv.id,
        line.name,
        line.saleUnit,
        line.packSize,
        line.qtyPcs,
        line.packets,
        line.retailCents,
        line.discCents,
        line.discPct,
        line.retailTotalCents,
        line.savedCents,
        line.lineTotalCents,
      ],
    );
    for (const a of line.allocations) {
      await run(
        db,
        `INSERT INTO invoice_allocations (invoice_line_id, batch_id, batch_no, qty, landed_cents) VALUES (?,?,?,?,?)`,
        [lineIns.id, a.batchId, a.batchNo, a.qty, a.landedCents],
      );
    }
  }
  await run(db, "UPDATE customers SET balance_cents=?, updated_at=? WHERE id=?", [
    ledger.closingBalance,
    when,
    input.customer.id,
  ]);
  return { invoiceId: inv.id, invoiceNumber, ledger };
}

/** Finalize sale: stock already reserved — do not deduct again. Clear reservations for user. */
export async function finalizeSale(input: {
  userId: number;
  customerId: number;
  operatorName: string;
  lines: InvoiceLine[];
  billDiscountCents: number;
  paidCents: number;
}) {
  if (!input.lines.length) throw new ActionError("Cart empty. Add items first.");
  const db = await getDb();
  return await withTransaction(db, async () => {
    const cust = await getRow<{
      id: number;
      name: string;
      phone: string;
      type: string;
      balance_cents: number;
    }>(db, "SELECT id, name, phone, type, balance_cents FROM customers WHERE id = ?", [input.customerId]);
    if (!cust) throw new ActionError("Customer not found.");

    for (const line of input.lines) {
      for (const a of line.allocations) {
        const b = await getRow<{ id: number; stock_pcs: number }>(db, "SELECT id, stock_pcs FROM batches WHERE id = ?", [
          a.batchId,
        ]);
        if (!b) throw new ActionError(`Batch missing for ${line.name}.`);
        if (Number(b.stock_pcs) < 0) throw new ActionError(`Stock inconsistency for ${line.name}.`);
      }
    }

    const result = await insertInvoiceRecord(db, {
      customer: {
        id: Number(cust.id),
        name: cust.name,
        phone: cust.phone,
        type: cust.type,
        balanceCents: Number(cust.balance_cents),
      },
      operatorName: input.operatorName,
      lines: input.lines,
      billDiscountCents: input.billDiscountCents,
      paidCents: input.paidCents,
    });

    // Clear cart reservations (stock already deducted at reserve time)
    await run(db, "DELETE FROM cart_reservations WHERE user_id = ?", [input.userId]);
    return result;
  });
}

export async function restoreStockFromInvoice(db: Awaited<ReturnType<typeof getDb>>, invoiceId: number) {
  const lines = await loadLines(db, invoiceId);
  const when = nowIso();
  for (const line of lines) {
    for (const a of line.allocations) {
      await run(db, "UPDATE batches SET stock_pcs = stock_pcs + ?, updated_at = ? WHERE id = ?", [
        a.qty,
        when,
        a.batchId,
      ]);
    }
  }
}

export async function reverseInvoiceLedger(db: Awaited<ReturnType<typeof getDb>>, inv: Invoice) {
  // Reverse: closing was prev + grand - paid; restore to prev
  const cust = await getRow<{ balance_cents: number }>(db, "SELECT balance_cents FROM customers WHERE id = ?", [
    inv.customerId,
  ]);
  if (!cust) return;
  // Revert by subtracting (grand - paid) effect: balance was set to closing; set back toward prev
  // Safer: balance -= (closing - prev) = -(grand - paid) wait: closing = prev + grand - paid, so delta = grand - paid
  const delta = roundCents(inv.grandTotalCents - inv.paidCents);
  let next = Number(cust.balance_cents) - delta;
  if (inv.customerId === WALK_IN_ID) next = Math.max(0, next);
  await run(db, "UPDATE customers SET balance_cents=?, updated_at=? WHERE id=?", [next, nowIso(), inv.customerId]);
}

export async function deleteInvoice(id: number) {
  const db = await getDb();
  return await withTransaction(db, async () => {
    const inv = await getRow<InvRow>(db, "SELECT * FROM invoices WHERE id = ?", [id]);
    if (!inv) throw new ActionError("Invoice not found.");
    const full = mapInv(inv, await loadLines(db, id));
    await reverseInvoiceLedger(db, full);
    await restoreStockFromInvoice(db, id);
    await run(db, "DELETE FROM invoice_allocations WHERE invoice_line_id IN (SELECT id FROM invoice_lines WHERE invoice_id=?)", [
      id,
    ]);
    await run(db, "DELETE FROM invoice_lines WHERE invoice_id = ?", [id]);
    await run(db, "DELETE FROM invoices WHERE id = ?", [id]);
    return full;
  });
}

export async function reassignInvoiceCustomer(invoiceId: number, newCustomerId: number) {
  const db = await getDb();
  return await withTransaction(db, async () => {
    const invRow = await getRow<InvRow>(db, "SELECT * FROM invoices WHERE id = ?", [invoiceId]);
    if (!invRow) throw new ActionError("Invoice not found.");
    const inv = mapInv(invRow, await loadLines(db, invoiceId));
    const neu = await getRow<{
      id: number;
      name: string;
      phone: string;
      type: string;
      balance_cents: number;
    }>(db, "SELECT * FROM customers WHERE id = ?", [newCustomerId]);
    if (!neu) throw new ActionError("Customer not found.");
    if (neu.id === inv.customerId) return;

    await reverseInvoiceLedger(db, inv);

    const ledger = saleLedgerMath(
      { id: Number(neu.id), balanceCents: Number(neu.balance_cents) },
      inv.grandTotalCents,
      inv.paidCents,
    );
    const status = invoiceStatus(inv.paidCents, ledger.unpaid);
    await run(
      db,
      `UPDATE invoices SET customer_id=?, customer_name=?, customer_phone=?, customer_type=?,
       unpaid_cents=?, surplus_applied_cents=?, prev_balance_cents=?, closing_balance_cents=?, status=?, updated_at=?
       WHERE id=?`,
      [
        neu.id,
        neu.name,
        neu.phone,
        neu.type,
        ledger.unpaid,
        ledger.surplusApplied,
        ledger.prevBalance,
        ledger.closingBalance,
        status,
        nowIso(),
        invoiceId,
      ],
    );
    await run(db, "UPDATE customers SET balance_cents=?, updated_at=? WHERE id=?", [
      ledger.closingBalance,
      nowIso(),
      neu.id,
    ]);
  });
}

export async function saveInvoiceEdit(input: {
  id: number;
  lines: InvoiceLine[];
  billDiscountCents: number;
  paidCents: number;
}) {
  const db = await getDb();
  return await withTransaction(db, async () => {
    const invRow = await getRow<InvRow>(db, "SELECT * FROM invoices WHERE id = ?", [input.id]);
    if (!invRow) throw new ActionError("Invoice not found.");
    const old = mapInv(invRow, await loadLines(db, input.id));

    // Restore old stock, reverse old ledger
    await reverseInvoiceLedger(db, old);
    await restoreStockFromInvoice(db, input.id);

    // Apply new stock deductions
    for (const line of input.lines) {
      for (const a of line.allocations) {
        const b = await getRow<{ stock_pcs: number; name: string }>(db, "SELECT stock_pcs, name FROM batches WHERE id=?", [
          a.batchId,
        ]);
        if (!b || Number(b.stock_pcs) < a.qty) {
          throw new ActionError(`Not enough stock for ${line.name}.`);
        }
        await run(db, "UPDATE batches SET stock_pcs = stock_pcs - ?, updated_at=? WHERE id=?", [
          a.qty,
          nowIso(),
          a.batchId,
        ]);
      }
    }

    await run(db, "DELETE FROM invoice_allocations WHERE invoice_line_id IN (SELECT id FROM invoice_lines WHERE invoice_id=?)", [
      input.id,
    ]);
    await run(db, "DELETE FROM invoice_lines WHERE invoice_id=?", [input.id]);

    const cust = await getRow<{
      id: number;
      name: string;
      phone: string;
      type: string;
      balance_cents: number;
    }>(db, "SELECT * FROM customers WHERE id=?", [old.customerId]);
    if (!cust) throw new ActionError("Customer missing.");

    const totals = checkoutTotals(
      input.lines.map((l) => ({
        retailTotalCents: l.retailTotalCents,
        lineTotalCents: l.lineTotalCents,
        savedCents: l.savedCents,
      })),
      input.billDiscountCents,
    );
    const ledger = saleLedgerMath(
      { id: Number(cust.id), balanceCents: Number(cust.balance_cents) },
      totals.grand,
      input.paidCents,
    );
    let profit = 0;
    for (const line of input.lines) {
      for (const a of line.allocations) {
        profit += line.discCents * a.qty - a.qty * a.landedCents;
      }
    }
    profit -= totals.billDisc;
    const status = invoiceStatus(input.paidCents, ledger.unpaid);
    const when = nowIso();
    await run(
      db,
      `UPDATE invoices SET retail_subtotal_cents=?, item_discount_cents=?, subtotal_cents=?, bill_discount_cents=?,
       grand_total_cents=?, paid_cents=?, unpaid_cents=?, profit_cents=?, surplus_applied_cents=?,
       prev_balance_cents=?, closing_balance_cents=?, status=?, updated_at=? WHERE id=?`,
      [
        totals.retailSubtotal,
        totals.itemDiscount,
        totals.afterItem,
        totals.billDisc,
        totals.grand,
        roundCents(input.paidCents),
        ledger.unpaid,
        roundCents(profit),
        ledger.surplusApplied,
        ledger.prevBalance,
        ledger.closingBalance,
        status,
        when,
        input.id,
      ],
    );
    for (const line of input.lines) {
      const lineIns = await run(
        db,
        `INSERT INTO invoice_lines (
          invoice_id, name, sale_unit, pack_size, qty_pcs, packets, retail_cents, disc_cents, disc_pct,
          retail_total_cents, saved_cents, line_total_cents
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          input.id,
          line.name,
          line.saleUnit,
          line.packSize,
          line.qtyPcs,
          line.packets,
          line.retailCents,
          line.discCents,
          line.discPct,
          line.retailTotalCents,
          line.savedCents,
          line.lineTotalCents,
        ],
      );
      for (const a of line.allocations) {
        await run(
          db,
          `INSERT INTO invoice_allocations (invoice_line_id, batch_id, batch_no, qty, landed_cents) VALUES (?,?,?,?,?)`,
          [lineIns.id, a.batchId, a.batchNo, a.qty, a.landedCents],
        );
      }
    }
    await run(db, "UPDATE customers SET balance_cents=?, updated_at=? WHERE id=?", [
      ledger.closingBalance,
      when,
      cust.id,
    ]);
  });
}

export async function allocateForQty(
  batchId: number,
  qtyPcs: number,
  preferEqualAcrossName = false,
): Promise<Alloc[]> {
  const db = await getDb();
  const primary = await getRow<{
    id: number;
    batch_no: number;
    stock_pcs: number;
    landed_cents: number;
    name: string;
  }>(db, "SELECT id, batch_no, stock_pcs, landed_cents, name FROM batches WHERE id=?", [batchId]);
  if (!primary) throw new ActionError("Batch not found.");
  if (!preferEqualAcrossName) {
    if (Number(primary.stock_pcs) < qtyPcs) throw new ActionError(`Only ${primary.stock_pcs} left for ${primary.name}.`);
    return [
      {
        batchId: Number(primary.id),
        batchNo: Number(primary.batch_no),
        qty: qtyPcs,
        landedCents: Number(primary.landed_cents),
      },
    ];
  }
  const siblings = (await allRows<{
    id: number;
    batch_no: number;
    stock_pcs: number;
    landed_cents: number;
  }>(db, "SELECT id, batch_no, stock_pcs, landed_cents FROM batches WHERE lower(name)=lower(?) AND active=1 AND stock_pcs>0", [
    primary.name,
  ])).map((b) => ({
    id: Number(b.id),
    batchNo: Number(b.batch_no),
    stockPcs: Number(b.stock_pcs),
    landedCents: Number(b.landed_cents),
  }));
  const plan = planEqualIncrease(siblings, qtyPcs);
  if (!plan) throw new ActionError(`Not enough stock for ${primary.name}.`);
  return plan;
}

export { releaseEqual };
