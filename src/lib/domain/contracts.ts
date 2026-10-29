import { roundCents } from "@/lib/money";

export type CtSaleMode = "unit" | "pieces";
export type CtEntryKind = "normal" | "cash_alternate";
export type CtInvoiceStatus = "draft" | "billed";
export type CtContractStatus = "active" | "completed" | "suspended" | "cancelled";

export const CT_CONTRACT_STATUSES: CtContractStatus[] = [
  "active",
  "completed",
  "suspended",
  "cancelled",
];

/** Quantity stored as milli-units (1.000 → 1000) for STRICT integer SQLite. */
export function qtyToMilli(q: number) {
  return Math.round((Number(q) || 0) * 1000);
}

export function milliToQty(m: number) {
  return Math.round(Number(m) || 0) / 1000;
}

export type ComposerLineInput = {
  saleMode?: CtSaleMode;
  qty?: number;
  unit?: string;
  packetComparativeCents: number;
  packetNcbdCents: number;
  ncbdOverrideCents?: number | null;
  pcsPerPacket?: number | null;
  pcsSold?: number | null;
};

export type PricedLine = {
  saleMode: CtSaleMode;
  unit: string | null;
  qty: number;
  qtyMilli: number;
  comparativeCents: number;
  ncbdCents: number;
  comparativeTotalCents: number;
  ncbdTotalCents: number;
  packetComparativeCents: number;
  packetNcbdCents: number;
  pcsPerPacketMilli: number | null;
  pcsSoldMilli: number | null;
};

/** Port of Flask `_calc_line` — money already in cents. */
export function calcContractLine(line: ComposerLineInput): PricedLine {
  const saleMode: CtSaleMode = line.saleMode === "pieces" ? "pieces" : "unit";
  let packetCompr = roundCents(line.packetComparativeCents);
  let packetNcbd = roundCents(line.packetNcbdCents);
  const override =
    line.ncbdOverrideCents != null && Number.isFinite(line.ncbdOverrideCents)
      ? roundCents(line.ncbdOverrideCents)
      : null;
  if (override != null && saleMode !== "pieces") packetNcbd = override;

  if (saleMode === "pieces") {
    const pcsPer = Number(line.pcsPerPacket);
    const pcsSold = Number(line.pcsSold);
    if (!pcsPer || pcsPer <= 0 || !pcsSold || pcsSold <= 0) {
      throw new Error("For pieces sale, enter Pcs in packet and Pcs sold.");
    }
    const ncbdPacket = override != null ? override : packetNcbd;
    const comprEach = roundCents(packetCompr / pcsPer);
    const ncbdEach = roundCents(ncbdPacket / pcsPer);
    return {
      saleMode: "pieces",
      unit: "Pcs",
      qty: pcsSold,
      qtyMilli: qtyToMilli(pcsSold),
      comparativeCents: comprEach,
      ncbdCents: ncbdEach,
      comparativeTotalCents: roundCents(comprEach * pcsSold),
      ncbdTotalCents: roundCents(ncbdEach * pcsSold),
      packetComparativeCents: packetCompr,
      packetNcbdCents: ncbdPacket,
      pcsPerPacketMilli: qtyToMilli(pcsPer),
      pcsSoldMilli: qtyToMilli(pcsSold),
    };
  }

  const qty = Number(line.qty);
  if (!qty || qty <= 0) throw new Error("Quantity must be greater than zero.");
  const comparativeCents = packetCompr;
  const ncbdCents = override != null ? override : packetNcbd;
  return {
    saleMode: "unit",
    unit: (line.unit || "").trim() || null,
    qty,
    qtyMilli: qtyToMilli(qty),
    comparativeCents,
    ncbdCents,
    comparativeTotalCents: roundCents(comparativeCents * qty),
    ncbdTotalCents: roundCents(ncbdCents * qty),
    packetComparativeCents: packetCompr,
    packetNcbdCents: ncbdCents,
    pcsPerPacketMilli: null,
    pcsSoldMilli: null,
  };
}

export function parseInvoiceNumberInt(value: string) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  const matches = text.match(/\d+/g);
  if (!matches?.length) return null;
  return Number(matches[matches.length - 1]);
}

export function nextInvoiceNumber(existing: string[]) {
  let maxN = 0;
  for (const num of existing) {
    const parsed = parseInvoiceNumberInt(num);
    if (parsed != null && parsed > maxN) maxN = parsed;
  }
  return String(maxN + 1).padStart(3, "0");
}

export type TotalsBucket = {
  allCompr: number;
  allNcbd: number;
  allMargin: number;
  billedCompr: number;
  billedNcbd: number;
  billedMargin: number;
  billedCount: number;
  unbilledCompr: number;
  unbilledNcbd: number;
  unbilledMargin: number;
  unbilledCount: number;
  draftCompr: number;
  draftCount: number;
};

function emptyBucket(): TotalsBucket {
  return {
    allCompr: 0,
    allNcbd: 0,
    allMargin: 0,
    billedCompr: 0,
    billedNcbd: 0,
    billedMargin: 0,
    billedCount: 0,
    unbilledCompr: 0,
    unbilledNcbd: 0,
    unbilledMargin: 0,
    unbilledCount: 0,
    draftCompr: 0,
    draftCount: 0,
  };
}

export type EntryForSummary = {
  entryKind: CtEntryKind;
  comparativeTotalCents: number;
  ncbdTotalCents: number;
  billingState: "unbilled" | "billed" | "on_draft";
};

export function summarizeContractEntries(
  entries: EntryForSummary[],
  receivedCents: number,
) {
  const head = emptyBucket();
  const cash = emptyBucket();
  for (const entry of entries) {
    const target = entry.entryKind === "cash_alternate" ? cash : head;
    const compr = roundCents(entry.comparativeTotalCents);
    const ncbd = roundCents(entry.ncbdTotalCents);
    const margin = compr - ncbd;
    target.allCompr += compr;
    target.allNcbd += ncbd;
    target.allMargin += margin;
    if (entry.billingState === "billed") {
      target.billedCompr += compr;
      target.billedNcbd += ncbd;
      target.billedMargin += margin;
      target.billedCount++;
    } else if (entry.billingState === "unbilled") {
      target.unbilledCompr += compr;
      target.unbilledNcbd += ncbd;
      target.unbilledMargin += margin;
      target.unbilledCount++;
    } else {
      target.draftCompr += compr;
      target.draftCount++;
    }
  }
  const billedTotal = head.billedCompr + cash.billedCompr;
  const received = Math.max(0, roundCents(receivedCents));
  const dueThisHead = Math.max(0, billedTotal - received);
  return {
    head,
    cashAlternate: cash,
    entryCount: entries.length,
    billedTotal,
    unbilledTotal:
      head.unbilledCompr + cash.unbilledCompr + head.draftCompr + cash.draftCompr,
    receivedTotal: received,
    dueThisHead,
  };
}
