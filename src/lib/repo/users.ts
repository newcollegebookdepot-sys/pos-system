import "server-only";

import { allRows, getDb, getRow, run, withTransaction } from "@/lib/db";
import { ActionError, isUniqueConstraint } from "@/lib/errors";
import { nowIso } from "@/lib/format";
import type { PublicUser, Role } from "@/lib/types";

type UserRow = {
  id: number;
  name: string;
  username: string;
  password_hash?: string;
  role: Role;
  active: number;
};

function mapUser(row: UserRow): PublicUser {
  return {
    id: Number(row.id),
    name: row.name,
    username: row.username,
    role: row.role,
    active: Number(row.active) === 1,
  };
}

export type AuthUser = PublicUser & { passwordHash: string };

export async function findUserByUsername(username: string): Promise<AuthUser | null> {
  const db = await getDb();
  const row = getRow<UserRow>(
    db,
    "SELECT id, name, username, password_hash, role, active FROM users WHERE username = ?",
    [username],
  );
  if (!row || !row.password_hash) return null;
  return { ...mapUser(row), passwordHash: row.password_hash };
}

export async function findActiveUserById(id: number): Promise<PublicUser | null> {
  const db = await getDb();
  const row = getRow<UserRow>(
    db,
    "SELECT id, name, username, role, active FROM users WHERE id = ? AND active = 1",
    [id],
  );
  return row ? mapUser(row) : null;
}

export async function listUsers() {
  const db = await getDb();
  return allRows<UserRow>(
    db,
    `SELECT id, name, username, role, active FROM users
     ORDER BY CASE role WHEN 'manager' THEN 0 ELSE 1 END, name COLLATE NOCASE`,
  ).map(mapUser);
}

export async function insertUser(input: {
  name: string;
  username: string;
  passwordHash: string;
  role: Role;
}) {
  const db = await getDb();
  try {
    run(db, "INSERT INTO users (name, username, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)", [
      input.name,
      input.username,
      input.passwordHash,
      input.role,
      nowIso(),
    ]);
  } catch (error) {
    if (isUniqueConstraint(error)) throw new ActionError("That username is already in use.");
    throw error;
  }
}

export async function updateUserRole(userId: number, role: Role) {
  const db = await getDb();
  withTransaction(db, () => {
    const row = getRow<UserRow>(db, "SELECT id, name, username, role, active FROM users WHERE id = ?", [userId]);
    if (!row) throw new ActionError("That staff login was not found.");
    if (row.role === "manager" && Number(row.active) === 1 && role === "cashier") {
      const others = getRow<{ count: number }>(
        db,
        "SELECT COUNT(*) AS count FROM users WHERE role = 'manager' AND active = 1 AND id != ?",
        [userId],
      );
      if (Number(others?.count ?? 0) < 1) throw new ActionError("Add another manager before changing this role.");
    }
    run(db, "UPDATE users SET role = ? WHERE id = ?", [role, userId]);
  });
}

export async function updateUserActive(userId: number, active: boolean, actorId: number) {
  const db = await getDb();
  withTransaction(db, () => {
    const row = getRow<UserRow>(db, "SELECT id, name, username, role, active FROM users WHERE id = ?", [userId]);
    if (!row) throw new ActionError("That staff login was not found.");
    if (!active && userId === actorId) throw new ActionError("You cannot deactivate your own login.");
    if (!active && row.role === "manager" && Number(row.active) === 1) {
      const others = getRow<{ count: number }>(
        db,
        "SELECT COUNT(*) AS count FROM users WHERE role = 'manager' AND active = 1 AND id != ?",
        [userId],
      );
      if (Number(others?.count ?? 0) < 1) throw new ActionError("Add another manager before deactivating this one.");
    }
    run(db, "UPDATE users SET active = ? WHERE id = ?", [active ? 1 : 0, userId]);
  });
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  const updated = run(db, "UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, userId]);
  if (updated.changes !== 1) throw new ActionError("That staff login was not found.");
}
