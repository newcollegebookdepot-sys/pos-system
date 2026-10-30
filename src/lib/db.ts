import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient, type Client, type Transaction } from "@libsql/client";
import { DatabaseSync } from "node:sqlite";
import { connection } from "next/server";
import { SCHEMA_SQL } from "@/lib/schema-sql";

export type SqlValue = string | number | null | bigint | ArrayBuffer;

type LocalHandle = { kind: "local"; db: DatabaseSync };
type TursoHandle = { kind: "turso"; client: Client };
export type PosDb = LocalHandle | TursoHandle;

const tursoTx = new AsyncLocalStorage<Transaction>();

/**
 * Auto fingerprint of schema + column patches.
 * Changing SCHEMA_SQL or PATCH_IDS causes Turso to re-migrate on next request after deploy.
 * No manual version bump required.
 */
const PATCH_IDS = [
  "settings.address",
  "settings.phone",
  "settings.low_stock_threshold",
  "settings.print_terms",
  "settings.operator_name",
  "ct_invoices.cash_taken_cents",
  "ct_supply_entries.picked_qty_milli",
  "ct_supply_entries.cash_alt_qty_milli",
  "ct_supply_entries.line_cash_taken_cents",
  "ct_boq_items.price_cents",
  "firms.drop_gstin_app",
] as const;

function schemaFingerprint() {
  return createHash("sha256")
    .update(SCHEMA_SQL)
    .update("\n")
    .update(PATCH_IDS.join("\n"))
    .digest("hex")
    .slice(0, 32);
}

const globalForDb = globalThis as unknown as {
  posDb?: PosDb;
  posDbMigrated?: boolean;
};

/**
 * Offline-first: local SQLite is the default for dev and shop production.
 * Turso is only used when explicitly opted in (legacy/cloud), never by accident.
 */
function tursoConfigured() {
  if (process.env.POS_USE_TURSO !== "1") return false;
  return Boolean(process.env.TURSO_DATABASE_URL?.trim());
}

function splitStatements(sql: string) {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function asArgs(params: SqlValue[]) {
  return params.map((p) => (typeof p === "bigint" ? Number(p) : p));
}

async function tursoExecute(client: Client, sql: string, params: SqlValue[] = []) {
  const tx = tursoTx.getStore();
  const payload = { sql, args: asArgs(params) };
  if (tx) return tx.execute(payload);
  return client.execute(payload);
}

async function migrateLocal(db: DatabaseSync) {
  db.exec(SCHEMA_SQL);
  const legacy = ["sale_items", "stock_movements", "sales", "products"] as const;
  for (const table of legacy) {
    try {
      db.exec(`DROP TABLE IF EXISTS ${table}`);
    } catch {
      // ignore
    }
  }

  const cols = db.prepare("PRAGMA table_info(settings)").all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  const addCol = (name: string, ddl: string) => {
    if (!names.has(name)) db.exec(`ALTER TABLE settings ADD COLUMN ${ddl}`);
  };
  addCol("address", "address TEXT NOT NULL DEFAULT ''");
  addCol("phone", "phone TEXT NOT NULL DEFAULT ''");
  addCol("low_stock_threshold", "low_stock_threshold INTEGER NOT NULL DEFAULT 10");
  addCol(
    "print_terms",
    "print_terms TEXT NOT NULL DEFAULT 'Goods once sold are not returnable unless defective.'",
  );
  addCol("operator_name", "operator_name TEXT NOT NULL DEFAULT ''");

  const ctInvCols = db.prepare("PRAGMA table_info(ct_invoices)").all() as { name: string }[];
  if (!ctInvCols.some((c) => c.name === "cash_taken_cents")) {
    db.exec("ALTER TABLE ct_invoices ADD COLUMN cash_taken_cents INTEGER NOT NULL DEFAULT 0");
  }

  const ctEntCols = db.prepare("PRAGMA table_info(ct_supply_entries)").all() as { name: string }[];
  const entNames = new Set(ctEntCols.map((c) => c.name));
  if (!entNames.has("picked_qty_milli")) {
    db.exec("ALTER TABLE ct_supply_entries ADD COLUMN picked_qty_milli INTEGER");
  }
  if (!entNames.has("cash_alt_qty_milli")) {
    db.exec("ALTER TABLE ct_supply_entries ADD COLUMN cash_alt_qty_milli INTEGER");
  }
  if (!entNames.has("line_cash_taken_cents")) {
    db.exec("ALTER TABLE ct_supply_entries ADD COLUMN line_cash_taken_cents INTEGER NOT NULL DEFAULT 0");
  }

  const ctBoqCols = db.prepare("PRAGMA table_info(ct_boq_items)").all() as { name: string }[];
  if (!ctBoqCols.some((c) => c.name === "price_cents")) {
    db.exec("ALTER TABLE ct_boq_items ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0");
  }
  // Expand entry_kind check for mixed (SQLite ignores CHECK on ALTER; new DBs get it from schema)
  try {
    db.exec(`UPDATE ct_supply_entries SET picked_qty_milli = qty_milli WHERE picked_qty_milli IS NULL AND entry_kind = 'normal'`);
    db.exec(
      `UPDATE ct_supply_entries SET cash_alt_qty_milli = qty_milli, picked_qty_milli = 0 WHERE cash_alt_qty_milli IS NULL AND entry_kind = 'cash_alternate'`,
    );
  } catch {
    // ignore
  }

  const walkIn = db.prepare("SELECT id FROM customers WHERE id = 1").get() as { id: number } | undefined;
  if (!walkIn) {
    const when = new Date().toISOString();
    db.prepare(
      `INSERT INTO customers (id, name, phone, type, balance_cents, opening_dues_cents, balance_manual, active, created_at, updated_at)
       VALUES (1, 'Walk-in Customer', 'N/A', 'Regular', 0, 0, 0, 1, ?, ?)`,
    ).run(when, when);
  }

  const opCount = db.prepare("SELECT COUNT(*) AS n FROM operators").get() as { n: number };
  if (Number(opCount.n) === 0) {
    const when = new Date().toISOString();
    for (const name of ["M. Akif", "Sohaib Alam"]) {
      db.prepare("INSERT INTO operators (name, active, created_at) VALUES (?, 1, ?)").run(name, when);
    }
  }
}

async function tursoStoredFingerprint(client: Client): Promise<string | null> {
  try {
    const res = await client.execute("SELECT value FROM _pos_schema WHERE key = 'fingerprint'");
    const fp = res.rows[0]?.value;
    return fp == null ? null : String(fp);
  } catch {
    return null;
  }
}

async function setTursoFingerprint(client: Client, fingerprint: string) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS _pos_schema (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )
  `);
  await client.execute({
    sql: `INSERT INTO _pos_schema (key, value) VALUES ('fingerprint', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [fingerprint],
  });
}

/** Full migrate — runs only when schema fingerprint changed (automatic on deploy). */
async function migrateTurso(client: Client) {
  const stmts = splitStatements(SCHEMA_SQL).map((sql) => ({ sql }));
  if (stmts.length) await client.batch(stmts, "write");

  await client.batch(
    ["sale_items", "stock_movements", "sales", "products"].map((table) => ({
      sql: `DROP TABLE IF EXISTS ${table}`,
    })),
    "write",
  );

  const cols = await client.execute("PRAGMA table_info(settings)");
  const names = new Set(cols.rows.map((r) => String(r.name)));
  const addCol = async (name: string, ddl: string) => {
    if (!names.has(name)) await client.execute(`ALTER TABLE settings ADD COLUMN ${ddl}`);
  };
  await addCol("address", "address TEXT NOT NULL DEFAULT ''");
  await addCol("phone", "phone TEXT NOT NULL DEFAULT ''");
  await addCol("low_stock_threshold", "low_stock_threshold INTEGER NOT NULL DEFAULT 10");
  await addCol(
    "print_terms",
    "print_terms TEXT NOT NULL DEFAULT 'Goods once sold are not returnable unless defective.'",
  );
  await addCol("operator_name", "operator_name TEXT NOT NULL DEFAULT ''");

  const ctInvCols = await client.execute("PRAGMA table_info(ct_invoices)");
  if (!ctInvCols.rows.some((r) => String(r.name) === "cash_taken_cents")) {
    await client.execute("ALTER TABLE ct_invoices ADD COLUMN cash_taken_cents INTEGER NOT NULL DEFAULT 0");
  }

  const ctEntCols = await client.execute("PRAGMA table_info(ct_supply_entries)");
  const entNames = new Set(ctEntCols.rows.map((r) => String(r.name)));
  if (!entNames.has("picked_qty_milli")) {
    await client.execute("ALTER TABLE ct_supply_entries ADD COLUMN picked_qty_milli INTEGER");
  }
  if (!entNames.has("cash_alt_qty_milli")) {
    await client.execute("ALTER TABLE ct_supply_entries ADD COLUMN cash_alt_qty_milli INTEGER");
  }
  if (!entNames.has("line_cash_taken_cents")) {
    await client.execute(
      "ALTER TABLE ct_supply_entries ADD COLUMN line_cash_taken_cents INTEGER NOT NULL DEFAULT 0",
    );
  }

  const ctBoqCols = await client.execute("PRAGMA table_info(ct_boq_items)");
  if (!ctBoqCols.rows.some((r) => String(r.name) === "price_cents")) {
    await client.execute("ALTER TABLE ct_boq_items ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0");
  }

  try {
    await client.batch(
      [
        {
          sql: `UPDATE ct_supply_entries SET picked_qty_milli = qty_milli WHERE picked_qty_milli IS NULL AND entry_kind = 'normal'`,
        },
        {
          sql: `UPDATE ct_supply_entries SET cash_alt_qty_milli = qty_milli, picked_qty_milli = 0 WHERE cash_alt_qty_milli IS NULL AND entry_kind = 'cash_alternate'`,
        },
      ],
      "write",
    );
  } catch {
    // ignore
  }

  const walkIn = await client.execute("SELECT id FROM customers WHERE id = 1");
  if (!walkIn.rows.length) {
    const when = new Date().toISOString();
    await client.execute({
      sql: `INSERT INTO customers (id, name, phone, type, balance_cents, opening_dues_cents, balance_manual, active, created_at, updated_at)
            VALUES (1, 'Walk-in Customer', 'N/A', 'Regular', 0, 0, 0, 1, ?, ?)`,
      args: [when, when],
    });
  }

  const opCount = await client.execute("SELECT COUNT(*) AS n FROM operators");
  if (Number(opCount.rows[0]?.n || 0) === 0) {
    const when = new Date().toISOString();
    await client.batch(
      ["M. Akif", "Sohaib Alam"].map((name) => ({
        sql: "INSERT INTO operators (name, active, created_at) VALUES (?, 1, ?)",
        args: [name, when],
      })),
      "write",
    );
  }

  await setTursoFingerprint(client, schemaFingerprint());
}

async function ensureTursoMigrated(client: Client) {
  const current = schemaFingerprint();
  if ((await tursoStoredFingerprint(client)) === current) return;
  await migrateTurso(client);
}

function openLocalDb() {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "pos.sqlite"));
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  try {
    db.prepare("PRAGMA journal_mode = WAL").get();
  } catch {
    // ignore on hosts that reject WAL
  }
  return db;
}

export async function getDb(): Promise<PosDb> {
  await connection();

  if (globalForDb.posDb) return globalForDb.posDb;

  if (tursoConfigured()) {
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    const handle: TursoHandle = { kind: "turso", client };
    if (!globalForDb.posDbMigrated) {
      await ensureTursoMigrated(client);
      globalForDb.posDbMigrated = true;
      console.info("[pos] database: Turso (POS_USE_TURSO=1)");
    }
    globalForDb.posDb = handle;
    return handle;
  }

  // Local shop / offline production: durable file SQLite under data/
  const db = openLocalDb();
  await migrateLocal(db);
  const handle: LocalHandle = { kind: "local", db };
  globalForDb.posDb = handle;
  if (!globalForDb.posDbMigrated) {
    globalForDb.posDbMigrated = true;
    console.info("[pos] database: local SQLite (data/pos.sqlite)");
  }
  return handle;
}

export async function run(db: PosDb, sql: string, params: SqlValue[] = []) {
  if (db.kind === "local") {
    const result = db.db.prepare(sql).run(...(params as (string | number | null | bigint)[]));
    return { changes: Number(result.changes), id: Number(result.lastInsertRowid) };
  }
  const result = await tursoExecute(db.client, sql, params);
  return {
    changes: Number(result.rowsAffected ?? 0),
    id: Number(result.lastInsertRowid ?? 0),
  };
}

export async function getRow<T>(db: PosDb, sql: string, params: SqlValue[] = []) {
  if (db.kind === "local") {
    return db.db.prepare(sql).get(...(params as (string | number | null | bigint)[])) as T | undefined;
  }
  const result = await tursoExecute(db.client, sql, params);
  return (result.rows[0] as T | undefined) ?? undefined;
}

export async function allRows<T>(db: PosDb, sql: string, params: SqlValue[] = []) {
  if (db.kind === "local") {
    return db.db.prepare(sql).all(...(params as (string | number | null | bigint)[])) as T[];
  }
  const result = await tursoExecute(db.client, sql, params);
  return result.rows as T[];
}

export async function execSql(db: PosDb, sql: string) {
  if (db.kind === "local") {
    db.db.exec(sql);
    return;
  }
  for (const stmt of splitStatements(sql)) {
    await tursoExecute(db.client, stmt);
  }
}

export async function withTransaction<T>(db: PosDb, fn: () => Promise<T> | T): Promise<T> {
  if (db.kind === "local") {
    db.db.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn();
      db.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        db.db.exec("ROLLBACK");
      } catch {
        // keep original
      }
      throw error;
    }
  }

  const tx = await db.client.transaction("write");
  try {
    const result = await tursoTx.run(tx, async () => await fn());
    await tx.commit();
    return result;
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // keep original
    }
    throw error;
  }
}
