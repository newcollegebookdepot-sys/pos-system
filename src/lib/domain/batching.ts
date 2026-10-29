import { landedCents } from "@/lib/domain/pricing";
import { roundCents } from "@/lib/money";

export function normName(s: string) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function nameKey(s: string) {
  return normName(s).toLowerCase();
}

export function slugName(name: string) {
  return nameKey(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}

export function makeBatchKey(name: string, batchNo: number) {
  return `${slugName(name)}::${Number(batchNo) || 1}`;
}

export function batchLabel(n: number) {
  return `Batch ${Number(n) || 1}`;
}

export function guessCategory(name = "") {
  const n = name.toLowerCase();
  if (/pen|pencil|marker|pointer|ball/.test(n)) return "Pens";
  if (/register|notebook|copy|diary/.test(n)) return "Notebooks";
  if (/paper|ream|a4|sheet/.test(n)) return "Paper";
  if (/book|guide|text/.test(n)) return "Books";
  if (/color|crayon|paint|brush/.test(n)) return "Art";
  if (/stapler|clip|file|tape|glue/.test(n)) return "Office";
  return "General";
}

export const CATEGORIES = ["Pens", "Notebooks", "Paper", "Books", "Art", "Office", "General"] as const;

export type BatchLike = {
  id: number;
  name: string;
  batchNo: number;
  batchKey: string;
  buyCents: number;
  freightCents: number;
  landedCents: number;
  stockPcs: number;
  packSize: number;
  retailCents: number;
  wholesaleCents: number | null;
  category: string;
};

export function resolveBatchNo(batchesForName: BatchLike[], name: string, buyCents: number) {
  const buy = roundCents(buyCents);
  if (!normName(name) || !batchesForName.length) {
    return { batchNo: 1, same: null as BatchLike | null, isNewName: true };
  }
  const same = batchesForName.find((b) => roundCents(b.buyCents) === buy) ?? null;
  if (same) return { batchNo: same.batchNo, same, isNewName: false };
  const max = batchesForName.reduce((m, b) => Math.max(m, b.batchNo), 0);
  return { batchNo: max + 1, same: null, isNewName: false };
}

export function computeLanded(buyCents: number, freightCents: number) {
  return landedCents(buyCents, freightCents);
}

/** Allocate total freight across lines by goods value share → per-unit freight cents. */
export function allocateFreightByValue(
  lines: { qtyPcs: number; buyCents: number }[],
  totalFreightCents: number,
) {
  const goods = lines.reduce((s, l) => s + l.qtyPcs * l.buyCents, 0);
  if (goods <= 0 || totalFreightCents <= 0) {
    return lines.map(() => 0);
  }
  return lines.map((l) => {
    const share = (l.qtyPcs * l.buyCents) / goods;
    const lineFreight = roundCents(totalFreightCents * share);
    return l.qtyPcs > 0 ? roundCents(lineFreight / l.qtyPcs) : 0;
  });
}
