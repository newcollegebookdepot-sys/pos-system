import { roundCents } from "@/lib/money";

export type SaleUnit = "pcs" | "pkt";

export function packSizeOf(packSize: number | null | undefined) {
  return Math.max(1, Math.round(Number(packSize) || 1));
}

export function landedCents(buyCents: number, freightCents: number) {
  return roundCents(buyCents) + roundCents(freightCents);
}

export function wholesaleOrZero(wholesaleCents: number | null | undefined) {
  const w = Number(wholesaleCents);
  return Number.isFinite(w) && w > 0 ? roundCents(w) : 0;
}

/** POS disc/pc default: wholesale when set, else retail. */
export function discPrefillFromBatch(batch: { retailCents: number; wholesaleCents: number | null }) {
  const ws = wholesaleOrZero(batch.wholesaleCents);
  return ws > 0 ? ws : roundCents(batch.retailCents);
}

export function displayUnitPrice(pieceCents: number, saleUnit: SaleUnit, packSize: number) {
  const pack = packSizeOf(packSize);
  if (saleUnit === "pkt" && pack > 1) return roundCents(pieceCents * pack);
  return roundCents(pieceCents);
}

/** Convert display price (pc or pkt) to per-piece cents. */
export function pieceFromDisplay(displayCents: number, saleUnit: SaleUnit, packSize: number) {
  const pack = packSizeOf(packSize);
  if (saleUnit === "pkt" && pack > 1) return roundCents(displayCents / pack);
  return roundCents(displayCents);
}

export function discPctFromPrices(retailPieceCents: number, discPieceCents: number) {
  const retail = roundCents(retailPieceCents);
  if (retail <= 0) return 0;
  return Math.round(((retail - roundCents(discPieceCents)) / retail) * 10000) / 100;
}

export function discFromPct(retailPieceCents: number, pct: number) {
  const retail = roundCents(retailPieceCents);
  const p = Math.max(0, Number(pct) || 0);
  return roundCents(retail * (1 - p / 100));
}

export function lineRetailTotal(retailPieceCents: number, qtyPcs: number) {
  return roundCents(retailPieceCents) * Math.round(qtyPcs);
}

export function lineDiscTotal(discPieceCents: number, qtyPcs: number) {
  return roundCents(discPieceCents) * Math.round(qtyPcs);
}

export function lineSaved(retailPieceCents: number, discPieceCents: number, qtyPcs: number) {
  return Math.max(0, lineRetailTotal(retailPieceCents, qtyPcs) - lineDiscTotal(discPieceCents, qtyPcs));
}

export function packetsFromPcs(qtyPcs: number, packSize: number) {
  const pack = packSizeOf(packSize);
  if (pack <= 1) return 0;
  return Math.round(qtyPcs) / pack;
}

export function pcsFromPackets(packets: number, packSize: number) {
  return Math.round(Number(packets) || 0) * packSizeOf(packSize);
}

export function invoiceStatus(paidCents: number, unpaidCents: number) {
  if (Math.abs(unpaidCents) < 1) return "Paid" as const;
  if (paidCents > 0) return "Partial" as const;
  return "Unpaid" as const;
}

export function checkoutTotals(lines: { retailTotalCents: number; lineTotalCents: number; savedCents: number }[], billDiscCents: number) {
  const retailSubtotal = lines.reduce((s, l) => s + l.retailTotalCents, 0);
  const itemDiscount = lines.reduce((s, l) => s + l.savedCents, 0);
  const afterItem = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const billDisc = Math.max(0, roundCents(billDiscCents));
  const grand = Math.max(0, afterItem - billDisc);
  return { retailSubtotal, itemDiscount, afterItem, billDisc, grand };
}
