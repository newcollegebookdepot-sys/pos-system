"use server";

import { revalidatePath } from "next/cache";
import { requireManager, requireUser } from "@/lib/auth";
import { CUSTOMER_TYPES, type CustomerType } from "@/lib/domain/ledger";
import { ActionError } from "@/lib/errors";
import { field, parseId, parseMoney, requiredText } from "@/lib/parse";
import {
  adjustSurplus,
  clearSalesHistoryKeepOpeningDues,
  createCustomer,
  deleteCustomer,
  restoreCustomer,
  updateCustomer,
  writeOffAllDues,
} from "@/lib/repo/customers";
import { createReceipt, deleteReceipt } from "@/lib/repo/receipts";
import { readSettings } from "@/lib/repo/settings";
import type { ActionState, Customer } from "@/lib/types";

export async function addCustomer(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    const type = field(formData, "type") as CustomerType;
    if (!CUSTOMER_TYPES.includes(type)) throw new ActionError("Choose a customer type.");
    const opening = field(formData, "opening").trim();
    await createCustomer({
      name: requiredText(field(formData, "name"), "Name", 120),
      phone: field(formData, "phone"),
      type,
      openingBalanceCents: opening ? parseMoney(opening.replace(/^\+/, ""), "opening balance") : 0,
    });
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/customers");
  return { ok: true, message: "Customer added" };
}

export async function saveCustomer(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    const type = field(formData, "type") as CustomerType;
    await updateCustomer({
      id: parseId(field(formData, "id"), "Customer"),
      name: requiredText(field(formData, "name"), "Name", 120),
      phone: field(formData, "phone") || "N/A",
      type,
      balanceCents: parseMoney(field(formData, "balance").replace(/^\+/, ""), "balance"),
    });
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/customers");
  return { ok: true, message: "Saved" };
}

export async function removeCustomer(id: number): Promise<ActionState & { undo?: Customer }> {
  await requireManager();
  try {
    const snap = await deleteCustomer(id);
    revalidatePath("/customers");
    return { ok: true, undo: snap };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}

export async function undoDeleteCustomer(customer: Customer): Promise<ActionState> {
  await requireManager();
  await restoreCustomer(customer);
  revalidatePath("/customers");
  return { ok: true };
}

export async function recordReceipt(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const settings = await readSettings();
  try {
    await createReceipt({
      customerId: parseId(field(formData, "customerId"), "Customer"),
      amountCents: parseMoney(field(formData, "amount"), "amount"),
      mode: field(formData, "mode") === "Bank·Easypaisa" ? "Bank·Easypaisa" : "Cash",
      operatorName: settings?.operatorName || user.name,
      note: field(formData, "note"),
    });
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/customers");
  revalidatePath("/cash");
  return { ok: true, message: "Receipt recorded" };
}

export async function removeReceipt(id: number): Promise<ActionState> {
  await requireManager();
  try {
    await deleteReceipt(id);
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/customers");
  revalidatePath("/cash");
  return { ok: true };
}

export async function doWriteOffDues(): Promise<ActionState> {
  await requireManager();
  await writeOffAllDues();
  revalidatePath("/customers");
  return { ok: true, message: "Dues written off" };
}

export async function doClearSalesHistory(): Promise<ActionState> {
  await requireManager();
  await clearSalesHistoryKeepOpeningDues();
  revalidatePath("/customers");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { ok: true, message: "Sales history cleared" };
}

export async function doAdjustSurplus(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const settings = await readSettings();
  try {
    await adjustSurplus(
      parseId(field(formData, "customerId"), "Customer"),
      parseMoney(field(formData, "surplus"), "surplus"),
      field(formData, "note"),
      settings?.operatorName || user.name,
    );
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/customers");
  return { ok: true, message: "Surplus updated" };
}
