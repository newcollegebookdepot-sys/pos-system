"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import type { CtContractStatus } from "@/lib/domain/contracts";
import { CT_CONTRACT_STATUSES } from "@/lib/domain/contracts";
import { ActionError } from "@/lib/errors";
import { field, optionalText, parseId, parseMoney, requiredText } from "@/lib/parse";
import { deleteContract, upsertContract } from "@/lib/repo/contracts/contracts";
import { addPayment, deletePayment } from "@/lib/repo/contracts/payments";
import type { ActionState } from "@/lib/types";

function revalidate(id?: number) {
  revalidatePath("/contracts", "layout");
  if (id) revalidatePath(`/contracts/${id}`);
}

export async function saveContract(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    const idRaw = field(formData, "id").trim();
    const statusRaw = field(formData, "status").trim() || "active";
    const status = (CT_CONTRACT_STATUSES.includes(statusRaw as CtContractStatus)
      ? statusRaw
      : "active") as CtContractStatus;
    const id = await upsertContract({
      id: idRaw ? parseId(idRaw, "Contract") : undefined,
      firmId: parseId(field(formData, "firmId"), "Firm"),
      officeName: requiredText(field(formData, "officeName"), "Office name", 200),
      contractHead: requiredText(field(formData, "contractHead"), "Contract head", 200),
      contractNumber: optionalText(field(formData, "contractNumber"), "Contract #", 100),
      startDate: field(formData, "startDate").trim() || undefined,
      endDate: field(formData, "endDate").trim() || undefined,
      status,
      notes: optionalText(field(formData, "notes"), "Notes", 1000),
    });
    revalidate(id);
    return { ok: true, message: "Contract saved" };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}

export async function removeContract(id: number): Promise<ActionState> {
  await requireManager();
  try {
    await deleteContract(id);
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidate();
  return { ok: true, message: "Contract deleted" };
}

export async function savePayment(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    const contractId = parseId(field(formData, "contractId"), "Contract");
    await addPayment({
      contractId,
      amountCents: parseMoney(field(formData, "amount"), "amount"),
      isoDate: field(formData, "isoDate").trim() || new Date().toISOString().slice(0, 10),
      notes: optionalText(field(formData, "notes"), "Notes", 500),
    });
    revalidate(contractId);
    return { ok: true, message: "Payment recorded" };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}

export async function removePayment(id: number, contractId: number): Promise<ActionState> {
  await requireManager();
  await deletePayment(id);
  revalidate(contractId);
  return { ok: true, message: "Payment removed" };
}
