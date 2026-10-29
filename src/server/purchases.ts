"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { ActionError } from "@/lib/errors";
import { field, parseMoney, parseStock, requiredText } from "@/lib/parse";
import { completeBulkPurchase, completeCreditPurchase } from "@/lib/repo/purchases";
import { readSettings } from "@/lib/repo/settings";
import type { ActionState } from "@/lib/types";

export async function bulkPurchaseAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireManager();
  const settings = await readSettings();
  try {
    const freightTotalCents = field(formData, "freightTotal").trim()
      ? parseMoney(field(formData, "freightTotal"), "freight")
      : 0;
    await completeBulkPurchase({
      supplierName: requiredText(field(formData, "supplierName"), "Seller", 120),
      supplierPhone: field(formData, "supplierPhone"),
      refNo: field(formData, "refNo") || undefined,
      freightTotalCents,
      freightBillT: field(formData, "freightBillT") || undefined,
      isoDate: field(formData, "isoDate") || new Date().toISOString().slice(0, 10),
      operatorName: settings?.operatorName || user.name,
      lines: [
        {
          name: requiredText(field(formData, "name"), "Item", 120),
          category: field(formData, "category") || "General",
          qtyPcs: parseStock(field(formData, "qtyPcs")),
          packSize: Math.max(1, Number(field(formData, "packSize") || 1)),
          buyCents: parseMoney(field(formData, "buy"), "buy"),
          retailCents: parseMoney(field(formData, "retail"), "retail"),
        },
      ],
    });
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/stock");
  revalidatePath("/cash");
  return { ok: true, message: "Bulk purchase completed" };
}

export async function creditPurchaseAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireManager();
  const settings = await readSettings();
  try {
    await completeCreditPurchase({
      supplierName: requiredText(field(formData, "supplierName"), "Seller", 120),
      supplierPhone: field(formData, "supplierPhone"),
      refNo: field(formData, "refNo") || undefined,
      isoDate: field(formData, "isoDate") || new Date().toISOString().slice(0, 10),
      operatorName: settings?.operatorName || user.name,
      lines: [
        {
          name: requiredText(field(formData, "name"), "Item", 120),
          category: field(formData, "category") || "General",
          qtyPcs: parseStock(field(formData, "qtyPcs")),
          packSize: Math.max(1, Number(field(formData, "packSize") || 1)),
          buyCents: parseMoney(field(formData, "buy"), "buy"),
          retailCents: parseMoney(field(formData, "retail"), "retail"),
        },
      ],
    });
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/stock");
  revalidatePath("/cash");
  return { ok: true, message: "Credit purchase completed" };
}
