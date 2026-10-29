"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { ActionError } from "@/lib/errors";
import { field, optionalText, parseId, parseMoney, parseStock, requiredText } from "@/lib/parse";
import {
  adjustBatchStock,
  deleteBatch,
  previewBatchNo,
  updateBatch,
  upsertBatch,
  wipeAllBatches,
} from "@/lib/repo/batches";
import type { ActionState } from "@/lib/types";

export async function createOrRestockBatch(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    const name = requiredText(field(formData, "name"), "Item name", 120);
    const category = optionalText(field(formData, "category"), "Category", 40);
    const packSize = Math.max(1, Number(field(formData, "packSize") || 1) || 1);
    const stockPcs = parseStock(field(formData, "stockPcs") || "0");
    const buyCents = parseMoney(field(formData, "buy"), "buy price");
    const freightCents = field(formData, "freight").trim()
      ? parseMoney(field(formData, "freight"), "freight")
      : 0;
    const retailCents = parseMoney(field(formData, "retail"), "retail price");
    const wholesaleRaw = field(formData, "wholesale").trim();
    const wholesaleCents = wholesaleRaw ? parseMoney(wholesaleRaw, "disc list price") : null;
    const batchNoRaw = field(formData, "batchNo").trim();
    const batchNo = batchNoRaw ? Number(batchNoRaw) : null;
    const result = await upsertBatch({
      name,
      category,
      stockPcs,
      buyCents,
      freightCents,
      retailCents,
      wholesaleCents,
      packSize,
      batchNo,
    });
    revalidatePath("/stock");
    revalidatePath("/sell");
    revalidatePath("/dashboard");
    return { ok: true, message: result.message };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}

export async function saveBatch(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    await updateBatch({
      id: parseId(field(formData, "id"), "Batch"),
      name: requiredText(field(formData, "name"), "Item name", 120),
      batchNo: Number(field(formData, "batchNo") || 1),
      category: optionalText(field(formData, "category"), "Category", 40) || "General",
      packSize: Math.max(1, Number(field(formData, "packSize") || 1)),
      stockPcs: parseStock(field(formData, "stockPcs") || "0"),
      buyCents: parseMoney(field(formData, "buy"), "buy price"),
      freightCents: field(formData, "freight").trim() ? parseMoney(field(formData, "freight"), "freight") : 0,
      retailCents: parseMoney(field(formData, "retail"), "retail"),
      wholesaleCents: field(formData, "wholesale").trim()
        ? parseMoney(field(formData, "wholesale"), "disc list")
        : null,
      packingLabel: optionalText(field(formData, "packingLabel"), "Packing label", 40),
    });
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/stock");
  revalidatePath("/sell");
  return { ok: true, message: "Batch saved" };
}

export async function quickAdjustStock(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    const id = parseId(field(formData, "id"), "Batch");
    const raw = field(formData, "delta").trim();
    if (!/^[+-]?\d+$/.test(raw) || Number(raw) === 0) throw new ActionError("Enter a non-zero whole number.");
    await adjustBatchStock(id, Number(raw));
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/stock");
  revalidatePath("/sell");
  return { ok: true, message: "Stock updated" };
}

export async function removeBatch(id: number): Promise<ActionState> {
  await requireManager();
  try {
    await deleteBatch(id);
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/stock");
  return { ok: true };
}

export async function wipeStock(): Promise<ActionState> {
  await requireManager();
  await wipeAllBatches();
  revalidatePath("/stock");
  revalidatePath("/sell");
  revalidatePath("/dashboard");
  return { ok: true, message: "All stock wiped" };
}

export async function batchHint(name: string, buy: string) {
  await requireManager();
  try {
    const buyCents = parseMoney(buy || "0", "buy");
    const hint = await previewBatchNo(name, buyCents);
    return {
      batchNo: hint.batchNo,
      message: hint.same
        ? `Same buy → restock Batch ${hint.batchNo}`
        : hint.isNewName
          ? "New item → Batch 1"
          : `Different buy → Batch ${hint.batchNo}`,
    };
  } catch {
    return { batchNo: 1, message: "" };
  }
}
