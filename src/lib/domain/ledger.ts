import { roundCents } from "@/lib/money";

export const WALK_IN_ID = 1;
export const WALK_IN_NAME = "Walk-in Customer";

export function isWalkIn(customerId: number | null | undefined) {
  return Number(customerId) === WALK_IN_ID;
}

export function custSurplusCents(customer: { id: number; balanceCents: number } | null | undefined) {
  if (!customer || isWalkIn(customer.id)) return 0;
  return Math.max(0, -roundCents(customer.balanceCents));
}

/**
 * Checkout / finalize math: prior surplus auto-applies; cash excess → surplus (registered only).
 * All values in cents.
 */
export function saleLedgerMath(
  cust: { id: number; balanceCents: number } | null | undefined,
  grandCents: number,
  cashPaidCents: number,
) {
  const grand = Math.max(0, roundCents(grandCents));
  const cashPaid = Math.max(0, roundCents(cashPaidCents));
  const prevBalance = roundCents(cust?.balanceCents ?? 0);
  const walkIn = !cust || isWalkIn(cust.id);
  const availableSurplus = walkIn ? 0 : Math.max(0, -prevBalance);
  const surplusApplied = Math.min(availableSurplus, grand);
  const afterSurplus = Math.max(0, grand - surplusApplied);
  const unpaid = Math.max(0, afterSurplus - cashPaid);
  const excessCash = Math.max(0, cashPaid - afterSurplus);
  let closingBalance = roundCents(prevBalance + grand - cashPaid);
  if (walkIn) closingBalance = Math.max(0, closingBalance);
  const surplusLeft = Math.max(0, -closingBalance);
  return {
    prevBalance,
    surplusApplied,
    afterSurplus,
    unpaid,
    excessCash,
    closingBalance,
    surplusLeft,
    isWalkIn: walkIn,
  };
}

export type CustomerType = "Regular" | "Office" | "School" | "Wholesale";

export const CUSTOMER_TYPES: CustomerType[] = ["Regular", "Office", "School", "Wholesale"];
