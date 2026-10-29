"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { ActionError } from "@/lib/errors";
import { field, optionalText, parseId, parseMoney, requiredText } from "@/lib/parse";
import {
  deleteBoqItem,
  importBoqCsv,
  upsertBoqItem,
  wipeBoq,
} from "@/lib/repo/contracts/boq";
import type { ActionState } from "@/lib/types";

function revalidate(contractId: number) {
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath(`/contracts/${contractId}/boq`);
  revalidatePath("/contracts/invoices/new");
}

export async function saveBoqItem(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    const contractId = parseId(field(formData, "contractId"), "Contract");
    const idRaw = field(formData, "id").trim();
    await upsertBoqItem({
      id: idRaw ? parseId(idRaw, "BOQ item") : undefined,
      contractId,
      serialNumber: Number(field(formData, "serialNumber") || 0),
      itemName: requiredText(field(formData, "itemName"), "Item name", 500),
      unit: optionalText(field(formData, "unit"), "Unit", 80),
      comparativeCents: parseMoney(field(formData, "comparative"), "comparative"),
      ncbdCents: parseMoney(field(formData, "ncbd"), "NCBD"),
      comparativeListed: field(formData, "listed") !== "0",
      notes: optionalText(field(formData, "notes"), "Notes", 500),
    });
    revalidate(contractId);
    return { ok: true, message: "BOQ item saved" };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}

export async function removeBoqItem(id: number, contractId: number): Promise<ActionState> {
  await requireManager();
  await deleteBoqItem(id);
  revalidate(contractId);
  return { ok: true, message: "BOQ item removed" };
}

export async function clearBoq(contractId: number): Promise<ActionState> {
  await requireManager();
  await wipeBoq(contractId);
  revalidate(contractId);
  return { ok: true, message: "BOQ cleared" };
}

export async function uploadBoqCsv(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    const contractId = parseId(field(formData, "contractId"), "Contract");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ActionError("Choose a CSV file.");
    const text = await file.text();
    const res = await importBoqCsv(contractId, text);
    revalidate(contractId);
    return { ok: true, message: `BOQ import: ${res.created} created, ${res.updated} updated` };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}
