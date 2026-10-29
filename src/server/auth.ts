"use server";

import { redirect } from "next/navigation";
import { ActionError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/password";
import { field, parsePassword, parseUsername, requiredText } from "@/lib/parse";
import { findUserByUsername } from "@/lib/repo/users";
import { insertShopAndManager, readSettings } from "@/lib/repo/settings";
import { clearSession, setSession } from "@/lib/session";
import type { ActionState } from "@/lib/types";

export async function setupShop(_state: ActionState, formData: FormData): Promise<ActionState> {
  const existing = await readSettings();
  if (existing) redirect("/login");
  try {
    const shopName = requiredText(field(formData, "shopName"), "Shop name", 80);
    const currencySymbol = requiredText(field(formData, "currencySymbol"), "Currency symbol", 8) || "Rs.";
    const address = field(formData, "address").trim();
    const phone = field(formData, "phone").trim();
    const name = requiredText(field(formData, "name"), "Your name", 80);
    const username = parseUsername(field(formData, "username"));
    const password = parsePassword(field(formData, "password"));
    const confirm = field(formData, "confirmPassword");
    if (password !== confirm) throw new ActionError("Passwords do not match.");
    const passwordHash = await hashPassword(password);
    const userId = await insertShopAndManager({
      shopName,
      currencySymbol,
      name,
      username,
      passwordHash,
      address,
      phone,
    });
    await setSession(userId);
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  redirect("/dashboard");
}

export async function login(_state: ActionState, formData: FormData): Promise<ActionState> {
  const settings = await readSettings();
  if (!settings) redirect("/setup");
  const username = field(formData, "username").trim();
  const password = field(formData, "password");
  if (!username || !password) return { error: "Enter your username and password." };
  const user = await findUserByUsername(username);
  if (!user || !user.active) {
    if (user) await verifyPassword(password, user.passwordHash);
    return { error: "Wrong username or password." };
  }
  const matches = await verifyPassword(password, user.passwordHash);
  if (!matches) return { error: "Wrong username or password." };
  await setSession(user.id);
  redirect(user.role === "manager" ? "/dashboard" : "/sell");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}
