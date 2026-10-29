"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { setOperatorName, upsertOperator } from "@/lib/repo/settings";

export async function setCurrentOperator(name: string) {
  await requireUser();
  await upsertOperator(name);
  await setOperatorName(name);
  revalidatePath("/", "layout");
}
