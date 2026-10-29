"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { ActionError } from "@/lib/errors";
import { field, requiredText } from "@/lib/parse";
import { updateSettings } from "@/lib/repo/settings";
import type { ActionState } from "@/lib/types";

export async function saveShopSettings(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    await updateSettings({
      shopName: requiredText(field(formData, "shopName"), "Shop name", 80),
      currencySymbol: requiredText(field(formData, "currencySymbol"), "Currency", 8),
      address: field(formData, "address").trim(),
      phone: field(formData, "phone").trim(),
      lowStockThreshold: Math.max(1, Number(field(formData, "lowStockThreshold") || 10)),
      printTerms: field(formData, "printTerms").trim() || "Goods once sold are not returnable unless defective.",
    });
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveSettings(state: ActionState, formData: FormData) {
  return saveShopSettings(state, formData);
}
