import { roundCents } from "@/lib/money";

export type CtSaleMode = "unit" | "pieces";
export type CtEntryKind = "normal" | "cash_alternate";
export type CtInvoiceStatus = "draft" | "billed";
export type CtContractStatus = "active" | "completed" | "suspended" | "cancelled";

/** Resolve how a billed qty splits into picked vs cash-alternate. */
export function resolveLineSplit(input: {
  qty: number;
  pickedQty?: number | null;
  cashAltQty?: number | null;
  entryKind?: CtEntryKind;
}) {
  const qty = Number(input.qty) || 0;
  let picked = input.pickedQty != null && Number.isFinite(Number(input.pickedQty)) ? Number(input.pickedQty) : null;
  let cashAlt =
    input.cashAltQty != null && Number.isFinite(Number(input.cashAltQty)) ? Number(input.cashAltQty) : null;

  if (picked == null && cashAlt == null) {
    if (input.entryKind === "cash_alternate") {
      picked = 0;
      cashAlt = qty;
    } else {
      picked = qty;
      cashAlt = 0;
    }
  } else if (picked == null) {
    picked = Math.max(0, qty - (cashAlt || 0));
  } else if (cashAlt == null) {
    cashAlt = Math.max(0, qty - picked);
  }

  let pickedQty = Math.max(0, picked ?? 0);
  let cashAltQty = Math.max(0, cashAlt ?? 0);
  if (pickedQty + cashAltQty === 0 && qty > 0) {
    pickedQty = qty;
    cashAltQty = 0;
  }

  // Persist only normal|cash_alternate; mixed is expressed via both qty fields.
  const entryKind: CtEntryKind = cashAltQty > 0 && pickedQty <= 0 ? "cash_alternate" : "normal";
  return { qty, pickedQty, cashAltQty, entryKind, isMixed: cashAltQty > 0 && pickedQty > 0 };
}

export function splitComparativeTotals(comparativeTotalCents: number, ncbdTotalCents: number, pickedQty: number, cashAltQty: number) {
  const totalQty = pickedQty + cashAltQty;
  if (totalQty <= 0) {
    return { pickedCompr: comparativeTotalCents, cashCompr: 0, pickedNcbd: ncbdTotalCents, cashNcbd: 0 };
  }
  const cashShare = cashAltQty / totalQty;
  const cashCompr = roundCents(comparativeTotalCents * cashShare);
  const cashNcbd = roundCents(ncbdTotalCents * cashShare);
  return {
    pickedCompr: comparativeTotalCents - cashCompr,
    cashCompr,
    pickedNcbd: ncbdTotalCents - cashNcbd,
    cashNcbd,
  };
}

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
  pickedQty?: number | null;
  cashAltQty?: number | null;
  lineCashTakenCents?: number;
};

function addToBucket(
  target: TotalsBucket,
  compr: number,
  ncbd: number,
  billingState: EntryForSummary["billingState"],
) {
  const margin = compr - ncbd;
  target.allCompr += compr;
  target.allNcbd += ncbd;
  target.allMargin += margin;
  if (billingState === "billed") {
    target.billedCompr += compr;
    target.billedNcbd += ncbd;
    target.billedMargin += margin;
    target.billedCount++;
  } else if (billingState === "unbilled") {
    target.unbilledCompr += compr;
    target.unbilledNcbd += ncbd;
    target.unbilledMargin += margin;
    target.unbilledCount++;
  } else {
    target.draftCompr += compr;
    target.draftCount++;
  }
}

export function summarizeContractEntries(
  entries: EntryForSummary[],
  receivedCents: number,
  cashTakenOverrideCents?: number,
) {
  const head = emptyBucket();
  const cash = emptyBucket();
  let lineCashTaken = 0;
  for (const entry of entries) {
    lineCashTaken += roundCents(entry.lineCashTakenCents || 0);
    const split = resolveLineSplit({
      qty: (entry.pickedQty || 0) + (entry.cashAltQty || 0) || 1,
      pickedQty: entry.pickedQty,
      cashAltQty: entry.cashAltQty,
      entryKind: entry.entryKind,
    });
    // Prefer explicit qty fields when present on the entry
    const pickedQty = entry.pickedQty != null ? Number(entry.pickedQty) : split.pickedQty;
    const cashAltQty = entry.cashAltQty != null ? Number(entry.cashAltQty) : split.cashAltQty;
    const parts = splitComparativeTotals(
      entry.comparativeTotalCents,
      entry.ncbdTotalCents,
      pickedQty,
      cashAltQty,
    );
    if (parts.pickedCompr || parts.pickedNcbd) {
      addToBucket(head, parts.pickedCompr, parts.pickedNcbd, entry.billingState);
    }
    if (parts.cashCompr || parts.cashNcbd || cashAltQty > 0) {
      addToBucket(cash, parts.cashCompr, parts.cashNcbd, entry.billingState);
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
    cashAlternateBilledCompr: cash.allCompr,
    cashAlternateBilledOnlyCompr: cash.billedCompr,
    cashTakenFromLines: lineCashTaken,
    cashTakenTotal: cashTakenOverrideCents != null ? roundCents(cashTakenOverrideCents) : lineCashTaken,
  };
}

/** Print label for BOQ comparative serial. */
export function comparativeSerialLabel(listed: boolean, serial: number | null | undefined) {
  if (listed && serial != null && Number.isFinite(serial)) return String(serial);
  return "out of comparative";
}
