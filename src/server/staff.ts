"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { ActionError } from "@/lib/errors";
import { hashPassword } from "@/lib/password";
import { field, parseId, parsePassword, parseRole, parseUsername, requiredText } from "@/lib/parse";
import { insertUser, updateUserActive, updateUserPassword, updateUserRole } from "@/lib/repo/users";
import { upsertOperator } from "@/lib/repo/settings";
import type { ActionState } from "@/lib/types";

export async function createStaff(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    const name = requiredText(field(formData, "name"), "Name", 80);
    const username = parseUsername(field(formData, "username"));
    const password = parsePassword(field(formData, "password"));
    const confirm = field(formData, "confirmPassword");
    if (password !== confirm) throw new ActionError("Passwords do not match.");
    const role = parseRole(field(formData, "role"));
    await insertUser({ name, username, passwordHash: await hashPassword(password), role });
    await upsertOperator(name);
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/staff");
  return { ok: true };
}

export async function changeRole(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    await updateUserRole(parseId(field(formData, "id"), "Staff login"), parseRole(field(formData, "role")));
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/staff");
  return { ok: true };
}

export async function setStaffActive(userId: number, active: boolean): Promise<ActionState> {
  const manager = await requireManager();
  try {
    await updateUserActive(userId, active, manager.id);
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/staff");
  return { ok: true };
}

export async function resetPassword(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();
  try {
    const id = parseId(field(formData, "id"), "Staff login");
    const password = parsePassword(field(formData, "password"));
    if (password !== field(formData, "confirmPassword")) throw new ActionError("Passwords do not match.");
    await updateUserPassword(id, await hashPassword(password));
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/staff");
  return { ok: true };
}
