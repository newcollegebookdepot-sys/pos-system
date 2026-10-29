"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import type { CashEntryType } from "@/lib/domain/cashbook";
import { ActionError } from "@/lib/errors";
import { field, parseMoney, requiredText } from "@/lib/parse";
import {
  addCashEntry,
  clearOpening,
  deleteCashEntry,
  openingKeyForPeriodStart,
  setOpening,
  updateCashEntry,
} from "@/lib/repo/cashbook";
import { createAdvance, deleteArrival, markReached, payBillT } from "@/lib/repo/arrivals";
import { createPayable, createSupplier, deletePayable, payPayable } from "@/lib/repo/payables";
import { readSettings } from "@/lib/repo/settings";
import type { ActionState } from "@/lib/types";

export async function saveOpening(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    const month = field(formData, "month").trim() || "all";
    const amount = parseMoney(field(formData, "amount"), "opening");
    await setOpening(month === "all" ? "all" : month.slice(0, 7), amount);
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/cash");
  return { ok: true, message: "Opening saved" };
}

export async function clearOpeningAction(periodKey: string): Promise<ActionState> {
  await requireManager();
  await clearOpening(periodKey);
  revalidatePath("/cash");
  return { ok: true };
}

export async function addEntry(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireManager();
  const settings = await readSettings();
  try {
    const type = field(formData, "type") as CashEntryType;
    await addCashEntry({
      type,
      amountCents: parseMoney(field(formData, "amount"), "amount"),
      description: requiredText(field(formData, "description"), "Description", 200),
      isoDate: field(formData, "isoDate") || new Date().toISOString().slice(0, 10),
      operatorName: settings?.operatorName || user.name,
      rentMonth: field(formData, "rentMonth") || undefined,
    });
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/cash");
  return { ok: true, message: "Entry added" };
}

export async function removeEntry(id: number): Promise<ActionState> {
  await requireManager();
  try {
    await deleteCashEntry(id);
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/cash");
  return { ok: true };
}

export async function payBill(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireManager();
  const settings = await readSettings();
  try {
    const result = await payPayable({
      payableId: Number(field(formData, "payableId")),
      amountCents: parseMoney(field(formData, "amount"), "amount"),
      operatorName: settings?.operatorName || user.name,
    });
    revalidatePath("/cash");
    return {
      ok: true,
      message: `Paid. Bill due ${result.billDue / 100} · Seller due ${result.sellerDue / 100}`,
    };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}

export async function addSellerBill(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireManager();
  const settings = await readSettings();
  try {
    await createSupplier(requiredText(field(formData, "party"), "Seller", 120));
    await createPayable({
      kind: "supplier",
      partyName: field(formData, "party"),
      totalCents: parseMoney(field(formData, "amount"), "amount"),
      operatorName: settings?.operatorName || user.name,
      description: field(formData, "description") || "Seller bill (goods in transit)",
    });
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/cash");
  return { ok: true, message: "Seller bill added" };
}

export async function addBorrow(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireManager();
  const settings = await readSettings();
  try {
    await createPayable({
      kind: "borrow",
      partyName: requiredText(field(formData, "party"), "Party", 120),
      totalCents: parseMoney(field(formData, "amount"), "amount"),
      operatorName: settings?.operatorName || user.name,
      description: field(formData, "description") || "Borrow/loan",
    });
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/cash");
  return { ok: true, message: "Borrow recorded" };
}

export async function removePayableAction(id: number): Promise<ActionState> {
  await requireManager();
  await deletePayable(id);
  revalidatePath("/cash");
  return { ok: true };
}

export async function advanceBillT(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireManager();
  const settings = await readSettings();
  try {
    await createAdvance({
      sellerName: requiredText(field(formData, "seller"), "Seller", 120),
      advanceCents: parseMoney(field(formData, "amount"), "advance"),
      operatorName: settings?.operatorName || user.name,
      billTNo: field(formData, "billTNo") || undefined,
      note: field(formData, "note") || undefined,
    });
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/cash");
  return { ok: true, message: "Advance posted" };
}

export async function reachBillT(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    await markReached({
      id: Number(field(formData, "id")),
      billTNo: requiredText(field(formData, "billTNo"), "Bill T #", 40),
      billTAmountCents: parseMoney(field(formData, "amount"), "Bill T amount"),
      reachedDate: field(formData, "reachedDate") || new Date().toISOString().slice(0, 10),
    });
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/cash");
  return { ok: true, message: "Marked reached" };
}

export async function completeBillT(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireManager();
  const settings = await readSettings();
  try {
    await payBillT({
      id: Number(field(formData, "id")),
      amountCents: parseMoney(field(formData, "amount"), "amount"),
      operatorName: settings?.operatorName || user.name,
    });
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/cash");
  return { ok: true, message: "Bill T payment posted" };
}

export async function removeArrivalAction(id: number): Promise<ActionState> {
  await requireManager();
  await deleteArrival(id);
  revalidatePath("/cash");
  return { ok: true };
}

export async function openingKey(from: string | null) {
  return openingKeyForPeriodStart(from);
}
