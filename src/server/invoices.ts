"use server";

import { revalidatePath } from "next/cache";
import { requireManager, requireUser } from "@/lib/auth";
import { ActionError } from "@/lib/errors";
import { deleteInvoice, getInvoice, reassignInvoiceCustomer, saveInvoiceEdit } from "@/lib/repo/invoices";
import type { ActionState, InvoiceLine } from "@/lib/types";

export async function removeInvoice(id: number): Promise<ActionState> {
  await requireManager();
  try {
    await deleteInvoice(id);
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/stock");
  revalidatePath("/customers");
  return { ok: true };
}

export async function reassignCustomer(invoiceId: number, customerId: number): Promise<ActionState> {
  await requireManager();
  try {
    await reassignInvoiceCustomer(invoiceId, customerId);
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/invoices");
  revalidatePath("/customers");
  return { ok: true, message: "Customer reassigned" };
}

export async function updateInvoice(input: {
  id: number;
  lines: InvoiceLine[];
  billDiscountCents: number;
  paidCents: number;
}): Promise<ActionState> {
  await requireUser();
  try {
    await saveInvoiceEdit(input);
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/invoices/${input.id}`);
  revalidatePath("/invoices");
  revalidatePath("/stock");
  revalidatePath("/customers");
  return { ok: true, message: "Invoice saved" };
}

export async function loadInvoice(id: number) {
  await requireUser();
  return getInvoice(id);
}
