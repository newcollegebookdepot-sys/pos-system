import "server-only";

import { redirect } from "next/navigation";
import { findActiveUserById } from "@/lib/repo/users";
import { readSession } from "@/lib/session";
import type { PublicUser } from "@/lib/types";

export async function getCurrentUser(): Promise<PublicUser | null> {
  const session = await readSession();
  if (!session) return null;
  return findActiveUserById(session.userId);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireManager() {
  const user = await requireUser();
  if (user.role !== "manager") redirect("/sell");
  return user;
}
