"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { upsertOperator } from "@/lib/repo/settings";

export async function addOperatorAction(formData: FormData) {
  await requireManager();
  await upsertOperator(String(formData.get("name") || ""));
  revalidatePath("/settings");
}
