import "server-only";

import {
  batchLabel,
  computeLanded,
  guessCategory,
  makeBatchKey,
  nameKey,
  normName,
  resolveBatchNo,
} from "@/lib/domain/batching";
import { allRows, getDb, getRow, run, withTransaction } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";
import { formatMoney, roundCents } from "@/lib/money";
import type { Batch } from "@/lib/types";

type BatchRow = {
  id: number;
  name: string;
  batch_no: number;
  batch_key: string;
  category: string;
  pack_size: number;
  stock_pcs: number;
  buy_cents: number;
  freight_cents: number;
  landed_cents: number;
  wholesale_cents: number | null;
  retail_cents: number;
  packing_label: string | null;
  active: number;
  updated_at: string;
};

function mapBatch(row: BatchRow): Batch {
  return {
    id: Number(row.id),
    name: row.name,
    batchNo: Number(row.batch_no),
    batchKey: row.batch_key,
    category: row.category,
    packSize: Number(row.pack_size),
    stockPcs: Number(row.stock_pcs),
    buyCents: Number(row.buy_cents),
    freightCents: Number(row.freight_cents),
    landedCents: Number(row.landed_cents),
    wholesaleCents: row.wholesale_cents == null ? null : Number(row.wholesale_cents),
    retailCents: Number(row.retail_cents),
    packingLabel: row.packing_label,
    active: Number(row.active) === 1,
    updatedAt: row.updated_at,
  };
}

export async function listBatches(opts: {
  q?: string;
  category?: string;
  lowOnly?: boolean;
  priceMin?: number | null;
  priceMax?: number | null;
  qtyMin?: number | null;
  qtyMax?: number | null;
  threshold?: number;
  page?: number;
  pageSize?: number;
} = {}) {
  const db = await getDb();
  const where: string[] = ["active = 1"];
  const params: (string | number)[] = [];
  if (opts.q?.trim()) {
    const tokens = opts.q
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    for (const token of tokens) {
      const like = `%${token.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push(
        `(lower(name) LIKE ? ESCAPE '\\' OR lower(batch_key) LIKE ? ESCAPE '\\' OR lower(category) LIKE ? ESCAPE '\\')`,
      );
      params.push(like, like, like);
    }
  }
  if (opts.category?.trim()) {
    where.push("category = ?");
    params.push(opts.category.trim());
  }
  if (opts.lowOnly) {
    where.push("stock_pcs < ?");
    params.push(opts.threshold ?? 10);
  }
  if (opts.priceMin != null) {
    where.push("retail_cents >= ?");
    params.push(opts.priceMin);
  }
  if (opts.priceMax != null) {
    where.push("retail_cents <= ?");
    params.push(opts.priceMax);
  }
  if (opts.qtyMin != null) {
    where.push("stock_pcs >= ?");
    params.push(opts.qtyMin);
  }
  if (opts.qtyMax != null) {
    where.push("stock_pcs <= ?");
    params.push(opts.qtyMax);
  }
  const whereSql = where.join(" AND ");
  const totalRow = getRow<{ n: number }>(db, `SELECT COUNT(*) AS n FROM batches WHERE ${whereSql}`, params);
  const total = Number(totalRow?.n || 0);

  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
  const page = Math.max(1, opts.page ?? 1);
  const offset = (page - 1) * pageSize;

  const rows = allRows<BatchRow>(
    db,
    `SELECT * FROM batches WHERE ${whereSql} ORDER BY name COLLATE NOCASE, batch_no LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );
  const batches = rows.map(mapBatch);

  // Catalog value always reflects full active stock (not just this page/filter)
  const valueRow = getRow<{ batches: number; pcs: number; cost: number; retail: number }>(
    db,
    `SELECT COUNT(*) AS batches,
            COALESCE(SUM(stock_pcs), 0) AS pcs,
            COALESCE(SUM(stock_pcs * landed_cents), 0) AS cost,
            COALESCE(SUM(stock_pcs * retail_cents), 0) AS retail
     FROM batches WHERE active = 1`,
  );
  const value = {
    batches: Number(valueRow?.batches || 0),
    pcs: Number(valueRow?.pcs || 0),
    costCents: Number(valueRow?.cost || 0),
    retailCents: Number(valueRow?.retail || 0),
  };

  return {
    batches,
    value,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getBatch(id: number) {
  const db = await getDb();
  const row = getRow<BatchRow>(db, "SELECT * FROM batches WHERE id = ?", [id]);
  return row ? mapBatch(row) : null;
}

export async function getBatchByKey(batchKey: string) {
  const db = await getDb();
  const row = getRow<BatchRow>(db, "SELECT * FROM batches WHERE batch_key = ?", [batchKey]);
  return row ? mapBatch(row) : null;
}

export async function batchesForName(name: string) {
  const db = await getDb();
  const rows = allRows<BatchRow>(
    db,
    "SELECT * FROM batches WHERE lower(name) = lower(?) AND active = 1 ORDER BY batch_no",
    [normName(name)],
  );
  return rows.map(mapBatch);
}

export async function searchBatches(q: string, limit = 40) {
  const db = await getDb();
  const cap = Math.min(80, Math.max(1, limit));
  const tokens = q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  // Empty query: A–Z browse cap (first N by name)
  if (!tokens.length) {
    return allRows<BatchRow>(
      db,
      "SELECT * FROM batches WHERE active = 1 ORDER BY name COLLATE NOCASE, batch_no LIMIT ?",
      [cap],
    ).map(mapBatch);
  }
  const where: string[] = ["active = 1"];
  const params: (string | number)[] = [];
  for (const token of tokens) {
    const like = `%${token.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      `(lower(name) LIKE ? ESCAPE '\\' OR lower(category) LIKE ? ESCAPE '\\' OR lower(batch_key) LIKE ? ESCAPE '\\' OR printf('batch %d', batch_no) LIKE ? ESCAPE '\\')`,
    );
    params.push(like, like, like, like);
  }
  return allRows<BatchRow>(
    db,
    `SELECT * FROM batches WHERE ${where.join(" AND ")} ORDER BY name COLLATE NOCASE, batch_no LIMIT ?`,
    [...params, cap],
  ).map(mapBatch);
}

export async function listCategories() {
  const db = await getDb();
  return allRows<{ category: string }>(
    db,
    "SELECT DISTINCT category FROM batches WHERE category != '' ORDER BY category COLLATE NOCASE",
  ).map((r) => r.category);
}

export async function previewBatchNo(name: string, buyCents: number) {
  const batches = await batchesForName(name);
  return resolveBatchNo(batches, name, buyCents);
}

export async function upsertBatch(input: {
  name: string;
  category?: string | null;
  stockPcs: number;
  buyCents: number;
  freightCents?: number;
  retailCents: number;
  wholesaleCents?: number | null;
  packSize?: number;
  batchNo?: number | null;
  packingLabel?: string | null;
}) {
  const db = await getDb();
  const name = normName(input.name);
  if (!name) throw new ActionError("Item name is required.");
  const buyCents = roundCents(input.buyCents);
  const freightCents = roundCents(input.freightCents || 0);
  const retailCents = roundCents(input.retailCents);
  const packSize = Math.max(1, Math.round(input.packSize || 1));
  const stockPcs = Math.round(input.stockPcs || 0);
  const category = input.category?.trim() || guessCategory(name);
  const wholesale =
    input.wholesaleCents != null && input.wholesaleCents !== undefined && Number(input.wholesaleCents) > 0
      ? roundCents(input.wholesaleCents)
      : null;
  const when = nowIso();

  return withTransaction(db, () => {
    const existingForName = allRows<BatchRow>(
      db,
      "SELECT * FROM batches WHERE lower(name) = lower(?) ORDER BY batch_no",
      [name],
    ).map(mapBatch);

    if (input.batchNo != null && String(input.batchNo).trim() !== "") {
      const n = Number(input.batchNo);
      if (!n || n < 1) throw new ActionError("Batch number must be a positive number.");
      const existing = existingForName.find((b) => b.batchNo === n);
      if (existing) {
        if (roundCents(existing.buyCents) !== buyCents) {
          throw new ActionError(
            `${batchLabel(n)} for "${name}" already exists with buying price ${formatMoney(existing.buyCents)}. You cannot reuse it for ${formatMoney(buyCents)}.`,
          );
        }
        run(
          db,
          `UPDATE batches SET stock_pcs = stock_pcs + ?, freight_cents = ?, landed_cents = ?, pack_size = ?, retail_cents = COALESCE(NULLIF(?,0), retail_cents),
           wholesale_cents = COALESCE(?, wholesale_cents), category = ?, packing_label = COALESCE(?, packing_label), updated_at = ?
           WHERE id = ?`,
          [
            stockPcs,
            freightCents,
            computeLanded(existing.buyCents, freightCents),
            packSize,
            retailCents,
            wholesale,
            category,
            input.packingLabel ?? null,
            when,
            existing.id,
          ],
        );
        return { id: existing.id, created: false, message: `Restocked ${batchLabel(n)} for ${name}.` };
      }
      const key = makeBatchKey(name, n);
      const inserted = run(
        db,
        `INSERT INTO batches (name, batch_no, batch_key, category, pack_size, stock_pcs, buy_cents, freight_cents, landed_cents, wholesale_cents, retail_cents, packing_label, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          name,
          n,
          key,
          category,
          packSize,
          stockPcs,
          buyCents,
          freightCents,
          computeLanded(buyCents, freightCents),
          wholesale,
          retailCents,
          input.packingLabel ?? null,
          when,
          when,
        ],
      );
      return { id: inserted.id, created: true, message: `Created ${name} · ${batchLabel(n)}.` };
    }

    const resolved = resolveBatchNo(existingForName, name, buyCents);
    if (resolved.same) {
      run(
        db,
        `UPDATE batches SET stock_pcs = stock_pcs + ?, freight_cents = ?, landed_cents = ?, pack_size = ?, retail_cents = COALESCE(NULLIF(?,0), retail_cents),
         wholesale_cents = COALESCE(?, wholesale_cents), category = ?, packing_label = COALESCE(?, packing_label), updated_at = ?
         WHERE id = ?`,
        [
          stockPcs,
          freightCents,
          computeLanded(resolved.same.buyCents, freightCents),
          packSize,
          retailCents,
          wholesale,
          category,
          input.packingLabel ?? null,
          when,
          resolved.same.id,
        ],
      );
      return {
        id: resolved.same.id,
        created: false,
        message: `Same buying price — restocked ${batchLabel(resolved.same.batchNo)} for ${name}.`,
      };
    }

    const n = resolved.batchNo;
    const key = makeBatchKey(name, n);
    const inserted = run(
      db,
      `INSERT INTO batches (name, batch_no, batch_key, category, pack_size, stock_pcs, buy_cents, freight_cents, landed_cents, wholesale_cents, retail_cents, packing_label, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        name,
        n,
        key,
        category,
        packSize,
        stockPcs,
        buyCents,
        freightCents,
        computeLanded(buyCents, freightCents),
        wholesale,
        retailCents,
        input.packingLabel ?? null,
        when,
        when,
      ],
    );
    return { id: inserted.id, created: true, message: `Created ${name} · ${batchLabel(n)} (buy ${formatMoney(buyCents)}).` };
  });
}

export async function updateBatch(input: {
  id: number;
  name: string;
  batchNo: number;
  category: string;
  packSize: number;
  stockPcs: number;
  buyCents: number;
  freightCents: number;
  retailCents: number;
  wholesaleCents: number | null;
  packingLabel: string | null;
}) {
  const db = await getDb();
  const name = normName(input.name);
  const batchNo = Math.max(1, Math.round(input.batchNo));
  const buyCents = roundCents(input.buyCents);
  const freightCents = roundCents(input.freightCents);
  const key = makeBatchKey(name, batchNo);
  const clash = getRow<{ id: number; buy_cents: number }>(
    db,
    "SELECT id, buy_cents FROM batches WHERE batch_key = ? AND id != ?",
    [key, input.id],
  );
  if (clash && roundCents(clash.buy_cents) !== buyCents) {
    throw new ActionError(`Batch key ${key} already exists with a different buy cost.`);
  }
  // Also prevent same name+batch_no with different buy via name match
  const sameNo = getRow<{ id: number; buy_cents: number }>(
    db,
    "SELECT id, buy_cents FROM batches WHERE lower(name)=lower(?) AND batch_no=? AND id!=?",
    [name, batchNo, input.id],
  );
  if (sameNo && roundCents(sameNo.buy_cents) !== buyCents) {
    throw new ActionError(`${batchLabel(batchNo)} for "${name}" already exists with another buy cost.`);
  }
  const updated = run(
    db,
    `UPDATE batches SET name=?, batch_no=?, batch_key=?, category=?, pack_size=?, stock_pcs=?, buy_cents=?, freight_cents=?, landed_cents=?,
     wholesale_cents=?, retail_cents=?, packing_label=?, updated_at=? WHERE id=?`,
    [
      name,
      batchNo,
      key,
      input.category || guessCategory(name),
      Math.max(1, input.packSize),
      Math.round(input.stockPcs),
      buyCents,
      freightCents,
      computeLanded(buyCents, freightCents),
      input.wholesaleCents != null && input.wholesaleCents > 0 ? roundCents(input.wholesaleCents) : null,
      roundCents(input.retailCents),
      input.packingLabel,
      nowIso(),
      input.id,
    ],
  );
  if (updated.changes !== 1) throw new ActionError("Batch not found.");
}

export async function adjustBatchStock(id: number, deltaPcs: number) {
  const db = await getDb();
  withTransaction(db, () => {
    const row = getRow<BatchRow>(db, "SELECT * FROM batches WHERE id = ?", [id]);
    if (!row) throw new ActionError("Batch not found.");
    const next = Number(row.stock_pcs) + Math.round(deltaPcs);
    if (next < 0) throw new ActionError(`That would take ${row.name} below zero.`);
    run(db, "UPDATE batches SET stock_pcs = ?, updated_at = ? WHERE id = ?", [next, nowIso(), id]);
  });
}

export async function deleteBatch(id: number) {
  const db = await getDb();
  const used = getRow<{ n: number }>(db, "SELECT COUNT(*) AS n FROM invoice_allocations WHERE batch_id = ?", [id]);
  if (Number(used?.n) > 0) {
    run(db, "UPDATE batches SET active = 0, stock_pcs = 0, updated_at = ? WHERE id = ?", [nowIso(), id]);
    return { soft: true };
  }
  run(db, "DELETE FROM batches WHERE id = ?", [id]);
  return { soft: false };
}

export async function wipeAllBatches() {
  const db = await getDb();
  withTransaction(db, () => {
    run(db, "DELETE FROM invoice_allocations");
    run(db, "DELETE FROM invoice_lines");
    run(db, "DELETE FROM invoices");
    run(db, "DELETE FROM cart_reservations");
    run(db, "DELETE FROM sale_drafts");
    run(db, "DELETE FROM purchase_lines");
    run(db, "DELETE FROM batches");
  });
}

export async function lowStockBatches(threshold = 10) {
  const db = await getDb();
  return allRows<BatchRow>(
    db,
    "SELECT * FROM batches WHERE active = 1 AND stock_pcs < ? ORDER BY stock_pcs, name COLLATE NOCASE LIMIT 50",
    [threshold],
  ).map(mapBatch);
}

export function searchTokensMatch(haystack: string, query: string) {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return true;
  const hay = haystack.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

export { nameKey, normName, batchLabel };
