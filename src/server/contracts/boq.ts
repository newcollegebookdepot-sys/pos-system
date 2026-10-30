"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { ActionError } from "@/lib/errors";
import { field, optionalText, parseId, parseMoney, requiredText } from "@/lib/parse";
import {
  deleteBoqItem,
  importBoqFile,
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
    const priceRaw = field(formData, "price").trim();
    await upsertBoqItem({
      id: idRaw ? parseId(idRaw, "BOQ item") : undefined,
      contractId,
      serialNumber: Number(field(formData, "serialNumber") || 0),
      itemName: requiredText(field(formData, "itemName"), "Item name", 500),
      unit: optionalText(field(formData, "unit"), "Unit", 80),
      priceCents: priceRaw ? parseMoney(priceRaw, "Price") : 0,
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

export async function uploadBoq(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    const contractId = parseId(field(formData, "contractId"), "Contract");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ActionError("Choose an Excel or CSV file.");
    const name = file.name || "upload.xlsx";
    if (!/\.(xlsx|xls|csv|txt)$/i.test(name) && file.type && !/sheet|excel|csv|text/i.test(file.type)) {
      throw new ActionError("Use an .xlsx or .csv file.");
    }
    const bytes = await file.arrayBuffer();
    const res = await importBoqFile(contractId, bytes, name);
    revalidate(contractId);
    return { ok: true, message: `BOQ import: ${res.created} created, ${res.updated} updated` };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}

/** @deprecated alias */
export const uploadBoqCsv = uploadBoq;
