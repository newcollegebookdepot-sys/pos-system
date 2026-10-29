import "server-only";

import { allRows, getDb, getRow, run } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";
import type { Operator, Settings } from "@/lib/types";

export async function readSettings(): Promise<Settings | null> {
  const db = await getDb();
  const row = await getRow<{
    shop_name: string;
    currency_symbol: string;
    address: string;
    phone: string;
    low_stock_threshold: number;
    print_terms: string;
    operator_name: string;
  }>(
    db,
    `SELECT shop_name, currency_symbol, address, phone, low_stock_threshold, print_terms, operator_name
     FROM settings WHERE id = 1`,
  );
  if (!row) return null;
  return {
    shopName: row.shop_name,
    currencySymbol: row.currency_symbol || "Rs.",
    address: row.address || "",
    phone: row.phone || "",
    lowStockThreshold: Number(row.low_stock_threshold) || 10,
    printTerms: row.print_terms || "Goods once sold are not returnable unless defective.",
    operatorName: row.operator_name || "",
  };
}

export async function updateSettings(input: Partial<Settings> & { shopName?: string }) {
  const db = await getDb();
  const cur = await readSettings();
  if (!cur) throw new ActionError("Set up the shop before changing settings.");
  const next = { ...cur, ...input };
  await run(
    db,
    `UPDATE settings SET shop_name=?, currency_symbol=?, address=?, phone=?, low_stock_threshold=?, print_terms=?, operator_name=? WHERE id=1`,
    [
      next.shopName,
      next.currencySymbol || "Rs.",
      next.address,
      next.phone,
      next.lowStockThreshold,
      next.printTerms,
      next.operatorName,
    ],
  );
}

export async function insertShopAndManager(input: {
  shopName: string;
  currencySymbol: string;
  name: string;
  username: string;
  passwordHash: string;
  address?: string;
  phone?: string;
}) {
  const db = await getDb();
  const when = nowIso();
  const existing = await getRow<{ id: number }>(db, "SELECT id FROM settings WHERE id = 1");
  if (existing) throw new ActionError("This shop is already set up.");
  await run(
    db,
    `INSERT INTO settings (id, shop_name, currency_symbol, address, phone, low_stock_threshold, print_terms, operator_name, created_at)
     VALUES (1, ?, ?, ?, ?, 10, 'Goods once sold are not returnable unless defective.', ?, ?)`,
    [input.shopName, input.currencySymbol || "Rs.", input.address || "", input.phone || "", input.name, when],
  );
  const user = await run(
    db,
    `INSERT INTO users (name, username, password_hash, role, active, created_at) VALUES (?, ?, ?, 'manager', 1, ?)`,
    [input.name, input.username, input.passwordHash, when],
  );
  const op = await getRow<{ id: number }>(db, "SELECT id FROM operators WHERE name = ? COLLATE NOCASE", [input.name]);
  if (!op) {
    await run(db, "INSERT INTO operators (name, active, created_at) VALUES (?, 1, ?)", [input.name, when]);
  }
  return user.id;
}

export async function listOperators() {
  const db = await getDb();
  return (await allRows<{ id: number; name: string; active: number }>(
    db,
    "SELECT id, name, active FROM operators ORDER BY name COLLATE NOCASE",
  )).map(
    (r): Operator => ({
      id: Number(r.id),
      name: r.name,
      active: Number(r.active) === 1,
    }),
  );
}

export async function setOperatorName(name: string) {
  await updateSettings({ operatorName: name });
}

export async function upsertOperator(name: string) {
  const db = await getDb();
  const trimmed = name.trim();
  if (!trimmed) throw new ActionError("Operator name is required.");
  const existing = await getRow<{ id: number }>(db, "SELECT id FROM operators WHERE name = ? COLLATE NOCASE", [trimmed]);
  if (existing) {
    await run(db, "UPDATE operators SET active = 1 WHERE id = ?", [existing.id]);
    return existing.id;
  }
  return (await run(db, "INSERT INTO operators (name, active, created_at) VALUES (?, 1, ?)", [trimmed, nowIso()])).id;
}
