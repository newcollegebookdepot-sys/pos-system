import "server-only";

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
    comparativeCents: Number(row.comparative_cents),
    comparativeListed: Number(row.comparative_listed) === 1,
    ncbdCents: Number(row.ncbd_cents),
    active: Number(row.active) === 1,
    notes: row.notes,
  };
}

export async function listBoq(contractId: number, q = "") {
  const db = await getDb();
  let rows = allRows<Row>(
    db,
    "SELECT * FROM ct_boq_items WHERE contract_id = ? AND active = 1 ORDER BY serial_number",
    [contractId],
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
  const row = getRow<Row>(db, "SELECT * FROM ct_boq_items WHERE id = ?", [id]);
  return row ? map(row) : null;
}

export async function upsertBoqItem(input: {
  id?: number;
  contractId: number;
  serialNumber: number;
  itemName: string;
  unit?: string | null;
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
  try {
    if (input.id) {
      run(
        db,
        `UPDATE ct_boq_items SET serial_number=?, item_name=?, unit=?, comparative_cents=?, comparative_listed=?,
         ncbd_cents=?, notes=?, updated_at=? WHERE id=? AND contract_id=?`,
        [
          input.serialNumber,
          name,
          input.unit?.trim() || null,
          roundCents(input.comparativeCents),
          input.comparativeListed === false ? 0 : 1,
          roundCents(input.ncbdCents),
          input.notes?.trim() || null,
          when,
          input.id,
          input.contractId,
        ],
      );
      return input.id;
    }
    const inserted = run(
      db,
      `INSERT INTO ct_boq_items (contract_id, serial_number, item_name, unit, comparative_cents, comparative_listed, ncbd_cents, active, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,1,?,?,?)`,
      [
        input.contractId,
        input.serialNumber,
        name,
        input.unit?.trim() || null,
        roundCents(input.comparativeCents),
        input.comparativeListed === false ? 0 : 1,
        roundCents(input.ncbdCents),
        input.notes?.trim() || null,
        when,
        when,
      ],
    );
    return inserted.id;
  } catch {
    throw new ActionError("Serial number already used on this contract.");
  }
}

export async function deleteBoqItem(id: number) {
  const db = await getDb();
  run(db, "UPDATE ct_boq_items SET active = 0, updated_at = ? WHERE id = ?", [nowIso(), id]);
}

export async function wipeBoq(contractId: number) {
  const db = await getDb();
  run(db, "DELETE FROM ct_boq_items WHERE contract_id = ?", [contractId]);
}

/** CSV columns: serial,item_name,unit,comparative,ncbd[,listed] — prices in rupees */
export async function importBoqCsv(contractId: number, text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new ActionError("CSV needs a header and at least one row.");
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
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iSerial = idx(["serial", "sno", "s.no", "#"]);
  const iName = idx(["item", "name", "description"]);
  const iUnit = idx(["unit"]);
  const iCompr = idx(["comparative", "compr", "rate", "bill"]);
  const iNcbd = idx(["ncbd", "cost"]);
  const iListed = idx(["listed"]);

  const db = await getDb();
  let created = 0;
  let updated = 0;
  withTransaction(db, () => {
    for (const line of lines.slice(1)) {
      const cols = split(line);
      const serial = Number(cols[iSerial >= 0 ? iSerial : 0]);
      const name = cols[iName >= 0 ? iName : 1];
      if (!serial || !name) continue;
      const unit = iUnit >= 0 ? cols[iUnit] : cols[2] || "";
      const compr = rupeesToCents(Number(String(cols[iCompr >= 0 ? iCompr : 3] || "0").replace(/,/g, "")));
      const ncbd = rupeesToCents(Number(String(cols[iNcbd >= 0 ? iNcbd : 4] || "0").replace(/,/g, "")));
      const listedRaw = iListed >= 0 ? cols[iListed] : "1";
      const listed = !/^(0|false|no|n)$/i.test(String(listedRaw || "1"));
      const existing = getRow<{ id: number }>(
        db,
        "SELECT id FROM ct_boq_items WHERE contract_id = ? AND serial_number = ?",
        [contractId, serial],
      );
      const when = nowIso();
      if (existing) {
        run(
          db,
          `UPDATE ct_boq_items SET item_name=?, unit=?, comparative_cents=?, comparative_listed=?, ncbd_cents=?, active=1, updated_at=? WHERE id=?`,
          [name, unit || null, compr, listed ? 1 : 0, ncbd, when, existing.id],
        );
        updated++;
      } else {
        run(
          db,
          `INSERT INTO ct_boq_items (contract_id, serial_number, item_name, unit, comparative_cents, comparative_listed, ncbd_cents, active, notes, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,1,NULL,?,?)`,
          [contractId, serial, name, unit || null, compr, listed ? 1 : 0, ncbd, when, when],
        );
        created++;
      }
    }
  });
  return { created, updated };
}
