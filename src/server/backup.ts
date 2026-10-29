"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";
import type { ActionState } from "@/lib/types";

export async function exportBackupJson(): Promise<{ ok: true; json: string } | { error: string }> {
  await requireManager();
  const db = await getDb();
  const dump: Record<string, unknown> = { exportedAt: nowIso(), version: 1 };
  const tables = [
    "settings",
    "operators",
    "batches",
    "customers",
    "invoices",
    "invoice_lines",
    "invoice_allocations",
    "receipts",
    "surplus_logs",
    "sale_drafts",
    "suppliers",
    "purchases",
    "purchase_lines",
    "payables",
    "payable_payments",
    "cash_book_openings",
    "cash_book_entries",
    "arrivals",
  ];
  for (const t of tables) {
    dump[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }
  return { ok: true, json: JSON.stringify(dump, null, 2) };
}

export async function factoryReset(): Promise<ActionState> {
  await requireManager();
  const db = await getDb();
  const tables = [
    "cart_reservations",
    "sale_drafts",
    "invoice_allocations",
    "invoice_lines",
    "invoices",
    "receipts",
    "surplus_logs",
    "payable_payments",
    "payables",
    "purchase_lines",
    "purchases",
    "arrivals",
    "cash_book_entries",
    "cash_book_openings",
    "batches",
    "suppliers",
  ];
  for (const t of tables) {
    db.exec(`DELETE FROM ${t}`);
  }
  db.exec(`UPDATE customers SET balance_cents=0, opening_dues_cents=0, balance_manual=0, active=1 WHERE id=1`);
  db.exec(`DELETE FROM customers WHERE id != 1`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Factory reset complete (users/settings kept)" };
}

export async function restoreBackupJson(json: string): Promise<ActionState> {
  await requireManager();
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    if (!data || typeof data !== "object") throw new ActionError("Invalid backup file.");
    // Soft restore: write file alongside for manual inspection; full table restore is destructive
    const dir = path.join(process.cwd(), "data", "restores");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `restore-${Date.now()}.json`);
    fs.writeFileSync(file, json);
    // Apply customers + batches + settings if present (minimal safe restore)
    const db = await getDb();
    if (Array.isArray(data.batches)) {
      db.exec("DELETE FROM batches");
      for (const b of data.batches as Record<string, unknown>[]) {
        db.prepare(
          `INSERT OR REPLACE INTO batches (id, name, batch_no, batch_key, category, pack_size, stock_pcs, buy_cents, freight_cents, landed_cents, wholesale_cents, retail_cents, packing_label, active, created_at, updated_at)
           VALUES (@id,@name,@batch_no,@batch_key,@category,@pack_size,@stock_pcs,@buy_cents,@freight_cents,@landed_cents,@wholesale_cents,@retail_cents,@packing_label,@active,@created_at,@updated_at)`,
        ).run(b as never);
      }
    }
    if (Array.isArray(data.customers)) {
      for (const c of data.customers as Record<string, unknown>[]) {
        if (Number(c.id) === 1) continue;
        db.prepare(
          `INSERT OR REPLACE INTO customers (id, name, phone, type, balance_cents, opening_dues_cents, balance_manual, active, created_at, updated_at)
           VALUES (@id,@name,@phone,@type,@balance_cents,@opening_dues_cents,@balance_manual,@active,@created_at,@updated_at)`,
        ).run(c as never);
      }
    }
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    return { error: "Could not restore backup." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Backup restored (batches + customers)" };
}
