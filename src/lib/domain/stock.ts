export type Alloc = { batchId: number; batchNo: number; qty: number; landedCents: number };

/** Equal-split release across allocation entries. */
export function releaseEqual(allocs: Alloc[], qtyToRelease: number) {
  let left = Math.max(0, Math.round(Number(qtyToRelease) || 0));
  const next = (allocs || []).map((a) => ({ ...a, qty: Math.round(Number(a.qty) || 0) }));
  const releasedMap: Record<number, number> = {};
  while (left > 0) {
    const active = next.filter((a) => a.qty > 0);
    if (!active.length) break;
    const n = active.length;
    const base = Math.floor(left / n);
    let rem = left % n;
    if (base === 0) {
      for (const a of active) {
        if (left <= 0) break;
        a.qty -= 1;
        releasedMap[a.batchId] = (releasedMap[a.batchId] || 0) + 1;
        left -= 1;
      }
      continue;
    }
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      const want = base + (i < rem ? 1 : 0);
      const take = Math.min(a.qty, want);
      a.qty -= take;
      releasedMap[a.batchId] = (releasedMap[a.batchId] || 0) + take;
      left -= take;
    }
  }
  return {
    allocs: next.filter((a) => a.qty > 0),
    released: Object.entries(releasedMap).map(([batchId, qty]) => ({
      batchId: Number(batchId),
      qty,
    })),
  };
}

/** Equal-split increase plan across available batches. */
export function planEqualIncrease(
  batches: { id: number; batchNo: number; stockPcs: number; landedCents: number }[],
  qtyNeeded: number,
): Alloc[] | null {
  let left = Math.max(0, Math.round(qtyNeeded));
  if (left <= 0) return [];
  const pool = batches
    .map((b) => ({ ...b, stockPcs: Math.max(0, Math.round(b.stockPcs)) }))
    .filter((b) => b.stockPcs > 0);
  const total = pool.reduce((s, b) => s + b.stockPcs, 0);
  if (total < left) return null;
  const allocMap: Record<number, Alloc> = {};
  while (left > 0) {
    const active = pool.filter((b) => b.stockPcs > 0);
    if (!active.length) return null;
    const n = active.length;
    const base = Math.floor(left / n);
    let rem = left % n;
    if (base === 0) {
      for (const b of active) {
        if (left <= 0) break;
        b.stockPcs -= 1;
        if (!allocMap[b.id]) {
          allocMap[b.id] = { batchId: b.id, batchNo: b.batchNo, qty: 0, landedCents: b.landedCents };
        }
        allocMap[b.id].qty += 1;
        left -= 1;
      }
      continue;
    }
    for (let i = 0; i < active.length; i++) {
      const b = active[i];
      const want = base + (i < rem ? 1 : 0);
      const take = Math.min(b.stockPcs, want);
      b.stockPcs -= take;
      if (!allocMap[b.id]) {
        allocMap[b.id] = { batchId: b.id, batchNo: b.batchNo, qty: 0, landedCents: b.landedCents };
      }
      allocMap[b.id].qty += take;
      left -= take;
    }
  }
  return Object.values(allocMap);
}

export function stockValueTotals(
  items: { stockPcs: number; landedCents: number; retailCents: number }[],
) {
  let cost = 0;
  let retail = 0;
  let pcs = 0;
  let batches = 0;
  for (const i of items) {
    batches++;
    const qty = Math.max(0, Math.round(i.stockPcs));
    pcs += qty;
    cost += qty * i.landedCents;
    retail += qty * i.retailCents;
  }
  return { costCents: cost, retailCents: retail, pcs, batches };
}
