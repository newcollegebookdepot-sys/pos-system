import "server-only";

import { allocateFreightByValue } from "@/lib/domain/batching";
import { upsertBatch } from "@/lib/repo/batches";
import { createPayable, createSupplier } from "@/lib/repo/payables";
import { getDb, run } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";
import { roundCents } from "@/lib/money";

export async function completeBulkPurchase(input: {
  supplierName: string;
  supplierPhone?: string;
  refNo?: string;
  freightTotalCents: number;
  freightBillT?: string;
  isoDate: string;
  operatorName: string;
  lines: {
    name: string;
    category: string;
    qtyPcs: number;
    packSize: number;
    buyCents: number;
    retailCents: number;
    wholesaleCents?: number | null;
  }[];
}) {
  if (!input.lines.length) throw new ActionError("Add at least one purchase line.");
  if (input.freightTotalCents > 0 && !input.freightBillT?.trim()) {
    throw new ActionError("Freight bill / T # is required when freight is greater than zero.");
  }
  const supplierId = await createSupplier(input.supplierName, input.supplierPhone || "");
  const freightPer = allocateFreightByValue(
    input.lines.map((l) => ({ qtyPcs: l.qtyPcs, buyCents: l.buyCents })),
    input.freightTotalCents,
  );
  const db = await getDb();
  const when = nowIso();
  const countRow = db.prepare("SELECT COUNT(*) AS n FROM purchases").get() as { n: number };
  const purchaseNumber = `PUR-${1000 + Number(countRow.n) + 1}`;
  const goods = input.lines.reduce((s, l) => s + l.qtyPcs * l.buyCents, 0);
  const purchaseId = run(
    db,
    `INSERT INTO purchases (purchase_number, kind, supplier_id, supplier_name, ref_no, freight_total_cents, freight_bill_t, goods_subtotal_cents, operator_name, iso_date, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      purchaseNumber,
      "bulk",
      supplierId,
      input.supplierName.trim(),
      input.refNo || null,
      roundCents(input.freightTotalCents),
      input.freightBillT || null,
      roundCents(goods),
      input.operatorName,
      input.isoDate,
      when,
    ],
  ).id;

  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    const freightU = freightPer[i];
    const result = await upsertBatch({
      name: line.name,
      category: line.category,
      stockPcs: line.qtyPcs,
      buyCents: line.buyCents,
      freightCents: freightU,
      retailCents: line.retailCents,
      wholesaleCents: line.wholesaleCents,
      packSize: line.packSize,
    });
    run(
      db,
      `INSERT INTO purchase_lines (purchase_id, batch_id, name, category, qty_pcs, pack_size, buy_cents, freight_u_cents, landed_cents, retail_cents, batch_no)
       VALUES (?,?,?,?,?,?,?,?,?,?,NULL)`,
      [
        purchaseId,
        result.id,
        line.name,
        line.category,
        line.qtyPcs,
        line.packSize,
        line.buyCents,
        freightU,
        line.buyCents + freightU,
        line.retailCents,
      ],
    );
  }

  await createPayable({
    kind: "supplier",
    partyName: input.supplierName,
    totalCents: goods,
    operatorName: input.operatorName,
    billNo: input.refNo,
    description: `Bulk purchase ${purchaseNumber}`,
    isoDate: input.isoDate,
    purchaseId,
  });
  if (input.freightTotalCents > 0) {
    await createPayable({
      kind: "freight",
      partyName: input.supplierName,
      totalCents: input.freightTotalCents,
      operatorName: input.operatorName,
      billNo: input.freightBillT,
      description: `Freight ${purchaseNumber}`,
      isoDate: input.isoDate,
      purchaseId,
    });
  }
  return { purchaseId, purchaseNumber, freightPer, supplierId, goods };
}

export async function completeCreditPurchase(input: {
  supplierName: string;
  supplierPhone?: string;
  refNo?: string;
  isoDate: string;
  operatorName: string;
  lines: {
    name: string;
    category: string;
    qtyPcs: number;
    packSize: number;
    buyCents: number;
    retailCents: number;
    wholesaleCents?: number | null;
  }[];
}) {
  if (!input.lines.length) throw new ActionError("Add at least one line.");
  await createSupplier(input.supplierName, input.supplierPhone || "");
  const goods = input.lines.reduce((s, l) => s + l.qtyPcs * l.buyCents, 0);
  const db = await getDb();
  const when = nowIso();
  const countRow = db.prepare("SELECT COUNT(*) AS n FROM purchases").get() as { n: number };
  const purchaseNumber = `PUR-${1000 + Number(countRow.n) + 1}`;
  const purchaseId = run(
    db,
    `INSERT INTO purchases (purchase_number, kind, supplier_id, supplier_name, ref_no, freight_total_cents, freight_bill_t, goods_subtotal_cents, operator_name, iso_date, created_at)
     VALUES (?,?,NULL,?,?,0,NULL,?,?,?,?)`,
    [
      purchaseNumber,
      "credit",
      input.supplierName.trim(),
      input.refNo || null,
      roundCents(goods),
      input.operatorName,
      input.isoDate,
      when,
    ],
  ).id;

  for (const line of input.lines) {
    const result = await upsertBatch({
      name: line.name,
      category: line.category,
      stockPcs: line.qtyPcs,
      buyCents: line.buyCents,
      freightCents: 0,
      retailCents: line.retailCents,
      wholesaleCents: line.wholesaleCents,
      packSize: line.packSize,
    });
    run(
      db,
      `INSERT INTO purchase_lines (purchase_id, batch_id, name, category, qty_pcs, pack_size, buy_cents, freight_u_cents, landed_cents, retail_cents, batch_no)
       VALUES (?,?,?,?,?,?,?,0,?,?,NULL)`,
      [
        purchaseId,
        result.id,
        line.name,
        line.category,
        line.qtyPcs,
        line.packSize,
        line.buyCents,
        line.buyCents,
        line.retailCents,
      ],
    );
  }

  await createPayable({
    kind: "supplier",
    partyName: input.supplierName,
    totalCents: goods,
    operatorName: input.operatorName,
    billNo: input.refNo,
    description: `Credit purchase ${purchaseNumber}`,
    isoDate: input.isoDate,
    purchaseId,
  });
  return { purchaseId, purchaseNumber };
}
