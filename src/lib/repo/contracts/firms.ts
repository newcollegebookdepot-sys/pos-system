import "server-only";

import { allRows, getDb, getRow, run } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";

export type CtFirm = {
  id: number;
  name: string;
  legalName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  vendorNumber: string | null;
  bankName: string | null;
  accountHolder: string | null;
  accountNumber: string | null;
  branchName: string | null;
  notes: string | null;
  active: boolean;
};

type Row = {
  id: number;
  name: string;
  legal_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  vendor_number: string | null;
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
  branch_name: string | null;
  notes: string | null;
  active: number;
};

function map(row: Row): CtFirm {
  return {
    id: Number(row.id),
    name: row.name,
    legalName: row.legal_name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    gstin: row.gstin,
    vendorNumber: row.vendor_number,
    bankName: row.bank_name,
    accountHolder: row.account_holder,
    accountNumber: row.account_number,
    branchName: row.branch_name,
    notes: row.notes,
    active: Number(row.active) === 1,
  };
}

export async function listFirms(activeOnly = false) {
  const db = await getDb();
  const sql = activeOnly
    ? "SELECT * FROM ct_firms WHERE active = 1 ORDER BY name COLLATE NOCASE"
    : "SELECT * FROM ct_firms ORDER BY name COLLATE NOCASE";
  return (await allRows<Row>(db, sql)).map(map);
}

export async function getFirm(id: number) {
  const db = await getDb();
  const row = await getRow<Row>(db, "SELECT * FROM ct_firms WHERE id = ?", [id]);
  return row ? map(row) : null;
}

export async function upsertFirm(input: {
  id?: number;
  name: string;
  legalName?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  vendorNumber?: string | null;
  bankName?: string | null;
  accountHolder?: string | null;
  accountNumber?: string | null;
  branchName?: string | null;
  notes?: string | null;
  active?: boolean;
}) {
  const db = await getDb();
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new ActionError("Firm name is required.");
  const when = nowIso();
  const vals = [
    name,
    input.legalName?.trim() || null,
    input.address?.trim() || null,
    input.phone?.trim() || null,
    input.email?.trim() || null,
    input.gstin?.trim() || null,
    input.vendorNumber?.trim() || null,
    input.bankName?.trim() || null,
    input.accountHolder?.trim() || null,
    input.accountNumber?.trim() || null,
    input.branchName?.trim() || null,
    input.notes?.trim() || null,
    input.active === false ? 0 : 1,
    when,
  ];
  if (input.id) {
    const updated = await run(
      db,
      `UPDATE ct_firms SET name=?, legal_name=?, address=?, phone=?, email=?, gstin=?, vendor_number=?,
       bank_name=?, account_holder=?, account_number=?, branch_name=?, notes=?, active=?, updated_at=?
       WHERE id=?`,
      [...vals, input.id],
    );
    if (updated.changes !== 1) throw new ActionError("Firm not found.");
    return input.id;
  }
  try {
    const inserted = await run(
      db,
      `INSERT INTO ct_firms (name, legal_name, address, phone, email, gstin, vendor_number,
        bank_name, account_holder, account_number, branch_name, notes, active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [...vals, when],
    );
    return inserted.id;
  } catch {
    throw new ActionError("A firm with that name already exists.");
  }
}

export async function deleteFirm(id: number) {
  const db = await getDb();
  const used = await getRow<{ n: number }>(db, "SELECT COUNT(*) AS n FROM ct_contracts WHERE firm_id = ?", [id]);
  if (Number(used?.n || 0) > 0) throw new ActionError("Firm has contracts — deactivate instead of delete.");
  await run(db, "DELETE FROM ct_firms WHERE id = ?", [id]);
}
