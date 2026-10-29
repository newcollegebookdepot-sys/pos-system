import { monthKey } from "@/lib/period";
import { roundCents } from "@/lib/money";

export type CashEntryType =
  | "cash_in"
  | "cash_out"
  | "stock_purchase"
  | "freight"
  | "rent"
  | "meal"
  | "zakat"
  | "other";

export const CASH_TYPE_META: Record<CashEntryType, { label: string; outflow: boolean }> = {
  cash_in: { label: "Cash in", outflow: false },
  cash_out: { label: "Cash out", outflow: true },
  stock_purchase: { label: "Stock purchase", outflow: true },
  freight: { label: "Freight", outflow: true },
  rent: { label: "Rent", outflow: true },
  meal: { label: "Meal", outflow: true },
  zakat: { label: "Zakat", outflow: true },
  other: { label: "Other", outflow: true },
};

export function cashBookMath(input: {
  openingCents: number;
  salesPaidCents: number;
  receiptsCents: number;
  entries: { type: CashEntryType; amountCents: number }[];
}) {
  const opening = roundCents(input.openingCents);
  const amounts: Partial<Record<CashEntryType, number>> = {};
  for (const e of input.entries) {
    amounts[e.type] = roundCents((amounts[e.type] || 0) + e.amountCents);
  }
  const manualIn = roundCents(amounts.cash_in || 0);
  const manualOut = roundCents(
    (amounts.cash_out || 0) +
      (amounts.stock_purchase || 0) +
      (amounts.freight || 0) +
      (amounts.rent || 0) +
      (amounts.meal || 0) +
      (amounts.zakat || 0) +
      (amounts.other || 0),
  );
  const totalIn = roundCents(opening + input.salesPaidCents + input.receiptsCents + manualIn);
  const totalOut = manualOut;
  const closing = roundCents(totalIn - totalOut);
  return { opening, manualIn, manualOut, totalIn, totalOut, closing, amounts };
}

export function openingKeyForPeriodStart(fromIso: string | null) {
  if (!fromIso) return "all";
  return monthKey(fromIso);
}
