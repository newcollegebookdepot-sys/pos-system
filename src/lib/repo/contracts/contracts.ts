import "server-only";

import {
  milliToQty,
  summarizeContractEntries,
  type CtContractStatus,
  type EntryForSummary,
} from "@/lib/domain/contracts";
import { allRows, getDb, getRow, run, withTransaction } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";
import { roundCents } from "@/lib/money";

export type CtContract = {
  id: number;
  firmId: number;
  firmName: string;
  vendorNumber: string | null;
  officeName: string;
  contractHead: string;
  contractNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  status: CtContractStatus;
  notes: string | null;
};

type Row = {
  id: number;
  firm_id: number;
  firm_name: string;
  vendor_number: string | null;
  office_name: string;
  contract_head: string;
  contract_number: string | null;
  start_date: string | null;
  end_date: string | null;
  status: CtContractStatus;
  notes: string | null;
};

function map(row: Row): CtContract {
  return {
    id: Number(row.id),
    firmId: Number(row.firm_id),
    firmName: row.firm_name,
    vendorNumber: row.vendor_number,
    officeName: row.office_name,
    contractHead: row.contract_head,
    contractNumber: row.contract_number,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    notes: row.notes,
  };
}

const SELECT = `SELECT c.*, f.name AS firm_name, f.vendor_number
  FROM ct_contracts c JOIN ct_firms f ON f.id = c.firm_id`;

export async function listContracts() {
  const db = await getDb();
  return (await allRows<Row>(
    db,
    `${SELECT} ORDER BY c.office_name COLLATE NOCASE, c.contract_head COLLATE NOCASE`,
  )).map(map);
}

export async function getContract(id: number) {
  const db = await getDb();
  const row = await getRow<Row>(db, `${SELECT} WHERE c.id = ?`, [id]);
  return row ? map(row) : null;
}

export async function listOffices(q = "") {
  const db = await getDb();
  let rows = await allRows<{ office_name: string }>(
    db,
    "SELECT DISTINCT office_name FROM ct_contracts ORDER BY office_name COLLATE NOCASE",
  );
  const needle = q.trim().toLowerCase();
  if (needle) rows = rows.filter((r) => r.office_name.toLowerCase().includes(needle));
  return rows.map((r) => r.office_name).slice(0, 40);
}

export async function contractsForOffice(office: string) {
  const db = await getDb();
  return (await allRows<Row>(
    db,
    `${SELECT} WHERE lower(c.office_name) = lower(?) ORDER BY c.contract_head COLLATE NOCASE, f.name COLLATE NOCASE`,
    [office.trim()],
  )).map(map);
}

export async function upsertContract(input: {
  id?: number;
  firmId: number;
  officeName: string;
  contractHead: string;
  contractNumber?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: CtContractStatus;
  notes?: string | null;
}) {
  const db = await getDb();
  const office = input.officeName.trim().replace(/\s+/g, " ");
  const head = input.contractHead.trim().replace(/\s+/g, " ");
  if (!office) throw new ActionError("Office name is required.");
  if (!head) throw new ActionError("Contract head is required.");
  const firm = await getRow(db, "SELECT id FROM ct_firms WHERE id = ?", [input.firmId]);
  if (!firm) throw new ActionError("Select a firm.");
  const when = nowIso();
  const status = input.status || "active";
  try {
    if (input.id) {
      const updated = await run(
        db,
        `UPDATE ct_contracts SET firm_id=?, office_name=?, contract_head=?, contract_number=?, start_date=?, end_date=?, status=?, notes=?, updated_at=?
         WHERE id=?`,
        [
          input.firmId,
          office,
          head,
          input.contractNumber?.trim() || null,
          input.startDate || null,
          input.endDate || null,
          status,
          input.notes?.trim() || null,
          when,
          input.id,
        ],
      );
      if (updated.changes !== 1) throw new ActionError("Contract not found.");
      return input.id;
    }
    const inserted = await run(
      db,
      `INSERT INTO ct_contracts (firm_id, office_name, contract_head, contract_number, start_date, end_date, status, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        input.firmId,
        office,
        head,
        input.contractNumber?.trim() || null,
        input.startDate || null,
        input.endDate || null,
        status,
        input.notes?.trim() || null,
        when,
        when,
      ],
    );
    return inserted.id;
  } catch (e) {
    if (e instanceof ActionError) throw e;
    throw new ActionError("That office + head already exists for this firm.");
  }
}

export async function deleteContract(id: number) {
  const db = await getDb();
  await withTransaction(db, async () => {
    await run(db, "DELETE FROM ct_payments WHERE contract_id = ?", [id]);
    await run(db, "DELETE FROM ct_supply_entries WHERE contract_id = ?", [id]);
    await run(db, "DELETE FROM ct_invoices WHERE contract_id = ?", [id]);
    await run(db, "DELETE FROM ct_boq_items WHERE contract_id = ?", [id]);
    const r = await run(db, "DELETE FROM ct_contracts WHERE id = ?", [id]);
    if (r.changes !== 1) throw new ActionError("Contract not found.");
  });
}

export async function contractSummary(contractId: number) {
  const db = await getDb();
  const entries = (await allRows<{
    entry_kind: string;
    comparative_total_cents: number;
    ncbd_total_cents: number;
    invoice_id: number | null;
    invoice_status: string | null;
    picked_qty_milli: number | null;
    cash_alt_qty_milli: number | null;
    line_cash_taken_cents: number | null;
    qty_milli: number;
  }>(
    db,
    `SELECT e.entry_kind, e.comparative_total_cents, e.ncbd_total_cents, e.invoice_id, i.status AS invoice_status,
            e.picked_qty_milli, e.cash_alt_qty_milli, e.line_cash_taken_cents, e.qty_milli
     FROM ct_supply_entries e
     LEFT JOIN ct_invoices i ON i.id = e.invoice_id
     WHERE e.contract_id = ?`,
    [contractId],
  )).map((e): EntryForSummary => {
    let billingState: EntryForSummary["billingState"] = "unbilled";
    if (e.invoice_id == null) billingState = "unbilled";
    else if (e.invoice_status === "billed") billingState = "billed";
    else billingState = "on_draft";
    const qty = milliToQty(e.qty_milli);
    const pickedQty = e.picked_qty_milli == null ? null : milliToQty(e.picked_qty_milli);
    const cashAltQty = e.cash_alt_qty_milli == null ? null : milliToQty(e.cash_alt_qty_milli);
    return {
      entryKind: e.entry_kind === "cash_alternate" ? "cash_alternate" : "normal",
      comparativeTotalCents: Number(e.comparative_total_cents),
      ncbdTotalCents: Number(e.ncbd_total_cents),
      billingState,
      pickedQty: pickedQty ?? (e.entry_kind === "cash_alternate" ? 0 : qty),
      cashAltQty: cashAltQty ?? (e.entry_kind === "cash_alternate" ? qty : 0),
      lineCashTakenCents: Number(e.line_cash_taken_cents || 0),
    };
  });
  const received = await getRow<{ s: number }>(
    db,
    "SELECT COALESCE(SUM(amount_cents),0) AS s FROM ct_payments WHERE contract_id = ?",
    [contractId],
  );
  const cashTaken = await getRow<{ s: number }>(
    db,
    "SELECT COALESCE(SUM(cash_taken_cents),0) AS s FROM ct_invoices WHERE contract_id = ?",
    [contractId],
  );
  const summarized = summarizeContractEntries(entries, Number(received?.s || 0), Number(cashTaken?.s || 0));
  return summarized;
}

export async function officeSummary(officeName: string) {
  const contracts = await contractsForOffice(officeName);
  let billed = 0;
  let unbilled = 0;
  let received = 0;
  for (const c of contracts) {
    const s = await contractSummary(c.id);
    billed += s.billedTotal;
    unbilled += s.unbilledTotal;
    received += s.receivedTotal;
  }
  return {
    officeName,
    heads: contracts.length,
    billedTotal: billed,
    unbilledTotal: unbilled,
    receivedTotal: received,
    dueAllHeads: Math.max(0, roundCents(billed - received)),
  };
}

export async function contractsDashboardStats() {
  const db = await getDb();
  const firms = await getRow<{ n: number }>(db, "SELECT COUNT(*) AS n FROM ct_firms WHERE active = 1");
  const contracts = await getRow<{ n: number }>(
    db,
    "SELECT COUNT(*) AS n FROM ct_contracts WHERE status = 'active'",
  );
  const boq = await getRow<{ n: number }>(db, "SELECT COUNT(*) AS n FROM ct_boq_items WHERE active = 1");
  const recent = await listContracts();
  return {
    firms: Number(firms?.n || 0),
    contracts: Number(contracts?.n || 0),
    boqItems: Number(boq?.n || 0),
    recent: recent.slice(0, 8),
  };
}
