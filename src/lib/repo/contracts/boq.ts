import "server-only";

import * as XLSX from "xlsx";
import { allRows, getDb, getRow, run, withTransaction } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";
import { roundCents, rupeesToCents } from "@/lib/money";

export type CtBoqItem = {
  id: number;
  contractId: number;
  serialNumber: number;
  itemName: string;
  unit: string | null;
  priceCents: number;
  comparativeCents: number;
  comparativeListed: boolean;
  ncbdCents: number;
  active: boolean;
  notes: string | null;
};

type Row = {
  id: number;
  contract_id: number;
  serial_number: number;
  item_name: string;
  unit: string | null;
  price_cents?: number | null;
  comparative_cents: number;
  comparative_listed: number;
  ncbd_cents: number;
  active: number;
  notes: string | null;
};

function map(row: Row): CtBoqItem {
  return {
    id: Number(row.id),
    contractId: Number(row.contract_id),
    serialNumber: Number(row.serial_number),
    itemName: row.item_name,
    unit: row.unit,
    priceCents: Number(row.price_cents ?? 0),
    comparativeCents: Number(row.comparative_cents),
    comparativeListed: Number(row.comparative_listed) === 1,
    ncbdCents: Number(row.ncbd_cents),
    active: Number(row.active) === 1,
    notes: row.notes,
  };
}

export async function listBoq(contractId: number, q = "") {
  const db = await getDb();
  let rows = (
    await allRows<Row>(
      db,
      "SELECT * FROM ct_boq_items WHERE contract_id = ? AND active = 1 ORDER BY serial_number",
      [contractId],
    )
  ).map(map);
  const tokens = q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length) {
    rows = rows.filter((b) => {
      const hay = `${b.serialNumber} ${b.itemName} ${b.unit || ""}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }
  return rows;
}

export async function searchBoq(contractId: number, q: string, limit = 40) {
  const rows = await listBoq(contractId, q);
  return rows.slice(0, limit);
}

export async function getBoqItem(id: number) {
  const db = await getDb();
  const row = await getRow<Row>(db, "SELECT * FROM ct_boq_items WHERE id = ?", [id]);
  return row ? map(row) : null;
}

export async function upsertBoqItem(input: {
  id?: number;
  contractId: number;
  serialNumber: number;
  itemName: string;
  unit?: string | null;
  priceCents?: number;
  comparativeCents: number;
  comparativeListed?: boolean;
  ncbdCents: number;
  notes?: string | null;
}) {
  const db = await getDb();
  const name = input.itemName.trim();
  if (!name) throw new ActionError("Item name is required.");
  if (!input.serialNumber || input.serialNumber < 1) throw new ActionError("Serial number required.");
  const when = nowIso();
  const price = roundCents(input.priceCents ?? 0);
  const comparative = roundCents(input.comparativeCents);
  const ncbd = roundCents(input.ncbdCents);
  const listed = input.comparativeListed === false ? 0 : 1;
  const unit = input.unit?.trim() || null;
  const notes = input.notes?.trim() || null;
  try {
    if (input.id) {
      await run(
        db,
        `UPDATE ct_boq_items SET serial_number=?, item_name=?, unit=?, price_cents=?, comparative_cents=?, comparative_listed=?,
         ncbd_cents=?, notes=?, updated_at=? WHERE id=? AND contract_id=?`,
        [
          input.serialNumber,
          name,
          unit,
          price,
          comparative,
          listed,
          ncbd,
          notes,
          when,
          input.id,
          input.contractId,
        ],
      );
      return input.id;
    }
    const inserted = await run(
      db,
      `INSERT INTO ct_boq_items (contract_id, serial_number, item_name, unit, price_cents, comparative_cents, comparative_listed, ncbd_cents, active, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,1,?,?,?)`,
      [input.contractId, input.serialNumber, name, unit, price, comparative, listed, ncbd, notes, when, when],
    );
    return inserted.id;
  } catch {
    throw new ActionError("Serial number already used on this contract.");
  }
}

export async function deleteBoqItem(id: number) {
  const db = await getDb();
  await run(db, "UPDATE ct_boq_items SET active = 0, updated_at = ? WHERE id = ?", [nowIso(), id]);
}

export async function wipeBoq(contractId: number) {
  const db = await getDb();
  await run(db, "DELETE FROM ct_boq_items WHERE contract_id = ?", [contractId]);
}

type BoqImportRow = {
  serial: number;
  name: string;
  unit: string;
  price: number;
  comparative: number;
  ncbd: number;
  listed: boolean;
};

function moneyCell(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) return rupeesToCents(raw);
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? rupeesToCents(n) : 0;
}

function listedCell(raw: unknown): boolean {
  if (raw == null || raw === "") return true;
  return !/^(0|false|no|n)$/i.test(String(raw).trim());
}

function findCol(header: string[], names: string[]) {
  return header.findIndex((h) => names.some((n) => h.includes(n)));
}

function parseHeaderRow(headerCells: unknown[]): string[] {
  return headerCells.map((h) => String(h ?? "").trim().toLowerCase());
}

function rowsFromMatrix(matrix: unknown[][]): BoqImportRow[] {
  if (matrix.length < 2) throw new ActionError("File needs a header and at least one row.");
  const header = parseHeaderRow(matrix[0] || []);
  const iSerial = findCol(header, ["serial", "sno", "s.no", "s no", "#"]);
  const iName = findCol(header, ["item", "name", "description"]);
  const iUnit = findCol(header, ["unit"]);
  // Prefer "price" but not "comparative price" / "ncbd price"
  let iPrice = header.findIndex((h) => h === "price" || (h.includes("price") && !h.includes("compr") && !h.includes("ncbd")));
  if (iPrice < 0) iPrice = findCol(header, ["tender"]);
  const iCompr = findCol(header, ["comparative", "comprative", "compr"]);
  const iNcbd = findCol(header, ["ncbd"]);
  const iListed = findCol(header, ["listed", "check", "compr. check", "compr check"]);

  const out: BoqImportRow[] = [];
  let autoSerial = 0;
  for (const cols of matrix.slice(1)) {
    if (!cols || !cols.length) continue;
    const name = String(cols[iName >= 0 ? iName : 1] ?? "").trim();
    if (!name) continue;
    let serial = Number(cols[iSerial >= 0 ? iSerial : 0]);
    if (!Number.isFinite(serial) || serial < 1) {
      autoSerial += 1;
      serial = autoSerial;
    } else {
      autoSerial = Math.max(autoSerial, serial);
    }
    const unit = String((iUnit >= 0 ? cols[iUnit] : cols[2]) ?? "").trim();
    const price = iPrice >= 0 ? moneyCell(cols[iPrice]) : 0;
    const comparative =
      iCompr >= 0 ? moneyCell(cols[iCompr]) : moneyCell(cols[iPrice >= 0 ? iPrice : 3]);
    const ncbd = iNcbd >= 0 ? moneyCell(cols[iNcbd]) : 0;
    const listed = iListed >= 0 ? listedCell(cols[iListed]) : true;
    out.push({
      serial,
      name,
      unit,
      price: price || comparative,
      comparative: comparative || price,
      ncbd: ncbd || comparative || price,
      listed,
    });
  }
  if (!out.length) throw new ActionError("No BOQ rows found in the file.");
  return out;
}

function matrixFromCsv(text: string): unknown[][] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const split = (line: string) => {
    const cols: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        q = !q;
        continue;
      }
      if (ch === "," && !q) {
        cols.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  };
  return lines.map(split);
}

function matrixFromXlsx(bytes: ArrayBuffer): unknown[][] {
  const wb = XLSX.read(bytes, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new ActionError("Excel file has no sheets.");
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
}

/** Import BOQ from .xlsx or .csv (DG Health style headers supported). */
export async function importBoqFile(contractId: number, bytes: ArrayBuffer, filename: string) {
  const lower = filename.toLowerCase();
  let matrix: unknown[][];
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    matrix = matrixFromXlsx(bytes);
  } else if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = new TextDecoder("utf-8").decode(bytes);
    matrix = matrixFromCsv(text);
  } else {
    // Try Excel first, then CSV
    try {
      matrix = matrixFromXlsx(bytes);
    } catch {
      const text = new TextDecoder("utf-8").decode(bytes);
      matrix = matrixFromCsv(text);
    }
  }

  const rows = rowsFromMatrix(matrix);
  const db = await getDb();
  let created = 0;
  let updated = 0;
  await withTransaction(db, async () => {
    for (const row of rows) {
      const existing = await getRow<{ id: number }>(
        db,
        "SELECT id FROM ct_boq_items WHERE contract_id = ? AND serial_number = ?",
        [contractId, row.serial],
      );
      const when = nowIso();
      if (existing) {
        await run(
          db,
          `UPDATE ct_boq_items SET item_name=?, unit=?, price_cents=?, comparative_cents=?, comparative_listed=?, ncbd_cents=?, active=1, updated_at=? WHERE id=?`,
          [row.name, row.unit || null, row.price, row.comparative, row.listed ? 1 : 0, row.ncbd, when, existing.id],
        );
        updated++;
      } else {
        await run(
          db,
          `INSERT INTO ct_boq_items (contract_id, serial_number, item_name, unit, price_cents, comparative_cents, comparative_listed, ncbd_cents, active, notes, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,1,NULL,?,?)`,
          [
            contractId,
            row.serial,
            row.name,
            row.unit || null,
            row.price,
            row.comparative,
            row.listed ? 1 : 0,
            row.ncbd,
            when,
            when,
          ],
        );
        created++;
      }
    }
  });
  return { created, updated };
}

/** @deprecated use importBoqFile */
export async function importBoqCsv(contractId: number, text: string) {
  const bytes = new TextEncoder().encode(text).buffer;
  return importBoqFile(contractId, bytes, "import.csv");
}
