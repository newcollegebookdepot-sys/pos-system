"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { ActionError } from "@/lib/errors";
import { field, optionalText, parseId, requiredText } from "@/lib/parse";
import { deleteFirm, upsertFirm } from "@/lib/repo/contracts/firms";
import type { ActionState } from "@/lib/types";

function revalidate() {
  revalidatePath("/contracts", "layout");
}

export async function saveFirm(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    const idRaw = field(formData, "id").trim();
    await upsertFirm({
      id: idRaw ? parseId(idRaw, "Firm") : undefined,
      name: requiredText(field(formData, "name"), "Firm name", 200),
      legalName: optionalText(field(formData, "legalName"), "Legal name", 250),
      address: optionalText(field(formData, "address"), "Address", 500),
      phone: optionalText(field(formData, "phone"), "Phone", 40),
      email: optionalText(field(formData, "email"), "Email", 120),
      gstin: optionalText(field(formData, "gstin"), "GSTIN", 20),
      vendorNumber: optionalText(field(formData, "vendorNumber"), "Vendor #", 50),
      bankName: optionalText(field(formData, "bankName"), "Bank", 150),
      accountHolder: optionalText(field(formData, "accountHolder"), "Account holder", 200),
      accountNumber: optionalText(field(formData, "accountNumber"), "Account #", 50),
      branchName: optionalText(field(formData, "branchName"), "Branch", 150),
      notes: optionalText(field(formData, "notes"), "Notes", 1000),
      active: field(formData, "active") !== "0",
    });
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidate();
  return { ok: true, message: "Firm saved" };
}

export async function removeFirm(id: number): Promise<ActionState> {
  await requireManager();
  try {
    await deleteFirm(id);
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidate();
  return { ok: true, message: "Firm deleted" };
}
