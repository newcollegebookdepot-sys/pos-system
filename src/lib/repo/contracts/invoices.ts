import "server-only";

import {
  calcContractLine,
  nextInvoiceNumber,
  type CtEntryKind,
  type CtInvoiceStatus,
  type CtSaleMode,
} from "@/lib/domain/contracts";
import { allRows, getDb, getRow, run, withTransaction } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";
import { milliToQty } from "@/lib/domain/contracts";
import { roundCents } from "@/lib/money";
import { getContract } from "@/lib/repo/contracts/contracts";

export type CtSupplyEntry = {
  id: number;
  contractId: number;
  invoiceId: number | null;
  boqItemId: number | null;
  entryDate: string;
  itemName: string;
  unit: string | null;
  qty: number;
  comparativeCents: number;
  comparativeTotalCents: number;
  comparativeSerial: number | null;
  comparativeListed: boolean;
  demandNo: string | null;
  ncbdCents: number;
  ncbdTotalCents: number;
  saleMode: CtSaleMode;
  packetComparativeCents: number | null;
  packetNcbdCents: number | null;
  pcsPerPacket: number | null;
  pcsSold: number | null;
  entryKind: CtEntryKind;
  notes: string | null;
};

export type CtInvoice = {
  id: number;
  contractId: number;
  invoiceNumber: string;
  isoDate: string;
  status: CtInvoiceStatus;
  notes: string | null;
  billedAt: string | null;
  officeName?: string;
  contractHead?: string;
  firmName?: string;
  comparativeTotalCents: number;
  ncbdTotalCents: number;
  demandNo: string | null;
  hasCashAlternate: boolean;
  isCashAlternateOnly: boolean;
  entries: CtSupplyEntry[];
};

type InvRow = {
  id: number;
  contract_id: number;
  invoice_number: string;
  iso_date: string;
  status: CtInvoiceStatus;
  notes: string | null;
  billed_at: string | null;
  office_name?: string;
  contract_head?: string;
  firm_name?: string;
};

type EntRow = {
  id: number;
  contract_id: number;
  invoice_id: number | null;
  boq_item_id: number | null;
  entry_date: string;
  item_name: string;
  unit: string | null;
  qty_milli: number;
  comparative_cents: number;
  comparative_total_cents: number;
  comparative_serial: number | null;
  comparative_listed: number;
  demand_no: string | null;
  ncbd_cents: number;
  ncbd_total_cents: number;
  sale_mode: CtSaleMode;
  packet_comparative_cents: number | null;
  packet_ncbd_cents: number | null;
  pcs_per_packet_milli: number | null;
  pcs_sold_milli: number | null;
  entry_kind: CtEntryKind;
  notes: string | null;
};

function mapEntry(row: EntRow): CtSupplyEntry {
  return {
    id: Number(row.id),
    contractId: Number(row.contract_id),
    invoiceId: row.invoice_id == null ? null : Number(row.invoice_id),
    boqItemId: row.boq_item_id == null ? null : Number(row.boq_item_id),
    entryDate: row.entry_date,
    itemName: row.item_name,
    unit: row.unit,
    qty: milliToQty(row.qty_milli),
    comparativeCents: Number(row.comparative_cents),
    comparativeTotalCents: Number(row.comparative_total_cents),
    comparativeSerial: row.comparative_serial,
    comparativeListed: Number(row.comparative_listed) === 1,
    demandNo: row.demand_no,
    ncbdCents: Number(row.ncbd_cents),
    ncbdTotalCents: Number(row.ncbd_total_cents),
    saleMode: row.sale_mode,
    packetComparativeCents: row.packet_comparative_cents,
    packetNcbdCents: row.packet_ncbd_cents,
    pcsPerPacket: row.pcs_per_packet_milli == null ? null : milliToQty(row.pcs_per_packet_milli),
    pcsSold: row.pcs_sold_milli == null ? null : milliToQty(row.pcs_sold_milli),
    entryKind: row.entry_kind,
    notes: row.notes,
  };
}

function withTotals(inv: InvRow, entries: CtSupplyEntry[]): CtInvoice {
  const comparativeTotalCents = entries.reduce((s, e) => s + e.comparativeTotalCents, 0);
  const ncbdTotalCents = entries.reduce((s, e) => s + e.ncbdTotalCents, 0);
  const demandNo = entries.find((e) => e.demandNo)?.demandNo || null;
  const hasCashAlternate = entries.some((e) => e.entryKind === "cash_alternate");
  const isCashAlternateOnly = entries.length > 0 && entries.every((e) => e.entryKind === "cash_alternate");
  return {
    id: Number(inv.id),
    contractId: Number(inv.contract_id),
    invoiceNumber: inv.invoice_number,
    isoDate: inv.iso_date,
    status: inv.status,
    notes: inv.notes,
    billedAt: inv.billed_at,
    officeName: inv.office_name,
    contractHead: inv.contract_head,
    firmName: inv.firm_name,
    comparativeTotalCents,
    ncbdTotalCents,
    demandNo,
    hasCashAlternate,
    isCashAlternateOnly,
    entries,
  };
}

export async function suggestInvoiceNumber(contractId: number) {
  const db = await getDb();
  const nums = allRows<{ invoice_number: string }>(
    db,
    "SELECT invoice_number FROM ct_invoices WHERE contract_id = ?",
    [contractId],
  ).map((r) => r.invoice_number);
  return nextInvoiceNumber(nums);
}

export async function listCtInvoices(opts: { contractId?: number; status?: string } = {}) {
  const db = await getDb();
  const where: string[] = ["1=1"];
  const params: (string | number)[] = [];
  if (opts.contractId) {
    where.push("i.contract_id = ?");
    params.push(opts.contractId);
  }
  if (opts.status) {
    where.push("i.status = ?");
    params.push(opts.status);
  }
  const rows = allRows<InvRow>(
    db,
    `SELECT i.*, c.office_name, c.contract_head, f.name AS firm_name
     FROM ct_invoices i
     JOIN ct_contracts c ON c.id = i.contract_id
     JOIN ct_firms f ON f.id = c.firm_id
     WHERE ${where.join(" AND ")}
     ORDER BY i.iso_date DESC, i.id DESC`,
    params,
  );
  const result: CtInvoice[] = [];
  for (const row of rows) {
    const entries = allRows<EntRow>(
      db,
      "SELECT * FROM ct_supply_entries WHERE invoice_id = ? ORDER BY id",
      [row.id],
    ).map(mapEntry);
    result.push(withTotals(row, entries));
  }
  return result;
}

export async function getCtInvoice(id: number) {
  const db = await getDb();
  const row = getRow<InvRow>(
    db,
    `SELECT i.*, c.office_name, c.contract_head, f.name AS firm_name
     FROM ct_invoices i
     JOIN ct_contracts c ON c.id = i.contract_id
     JOIN ct_firms f ON f.id = c.firm_id
     WHERE i.id = ?`,
    [id],
  );
  if (!row) return null;
  const entries = allRows<EntRow>(
    db,
    "SELECT * FROM ct_supply_entries WHERE invoice_id = ? ORDER BY id",
    [id],
  ).map(mapEntry);
  return withTotals(row, entries);
}

export type ComposerLinePayload = {
  boqItemId?: number | null;
  itemName: string;
  unit?: string;
  saleMode?: CtSaleMode;
  qty?: number;
  packetComparativeCents: number;
  packetNcbdCents: number;
  ncbdOverrideCents?: number | null;
  pcsPerPacket?: number | null;
  pcsSold?: number | null;
  comparativeListed?: boolean;
  comparativeSerial?: number | null;
  entryKind?: CtEntryKind;
  demandNo?: string;
  notes?: string;
};

export type ComposerPayload = {
  contractId: number;
  invoiceNumber?: string;
  isoDate: string;
  notes?: string;
  demandNo?: string;
  entryKind?: CtEntryKind;
  lines: ComposerLinePayload[];
};

function replaceLines(
  db: Awaited<ReturnType<typeof getDb>>,
  invoiceId: number,
  contractId: number,
  payload: ComposerPayload,
) {
  if (!payload.lines.length) throw new ActionError("Add at least one item.");
  const when = nowIso();
  const isoDate = payload.isoDate.slice(0, 10);
  const demandNo = payload.demandNo?.trim() || null;
  let entryKind: CtEntryKind = payload.entryKind === "cash_alternate" ? "cash_alternate" : "normal";

  run(db, "DELETE FROM ct_supply_entries WHERE invoice_id = ?", [invoiceId]);

  for (const raw of payload.lines) {
    const itemName = raw.itemName.trim();
    if (!itemName) throw new ActionError("Each line needs an item name.");
    let priced;
    try {
      priced = calcContractLine({
        saleMode: raw.saleMode,
        qty: raw.qty,
        unit: raw.unit,
        packetComparativeCents: raw.packetComparativeCents,
        packetNcbdCents: raw.packetNcbdCents,
        ncbdOverrideCents: raw.ncbdOverrideCents,
        pcsPerPacket: raw.pcsPerPacket,
        pcsSold: raw.pcsSold,
      });
    } catch (e) {
      throw new ActionError(e instanceof Error ? e.message : "Invalid line.");
    }

    let listed = raw.comparativeListed !== false;
    let serial: number | null = listed && raw.comparativeSerial != null ? Number(raw.comparativeSerial) : null;
    if (raw.boqItemId) {
      const boq = getRow<{
        contract_id: number;
        serial_number: number;
        comparative_listed: number;
      }>(db, "SELECT contract_id, serial_number, comparative_listed FROM ct_boq_items WHERE id = ?", [
        raw.boqItemId,
      ]);
      if (!boq || Number(boq.contract_id) !== contractId) {
        throw new ActionError(`Item “${itemName}” is not in this office/head BOQ.`);
      }
      listed = Number(boq.comparative_listed) === 1;
      serial = listed ? Number(boq.serial_number) : null;
    }

    const kind: CtEntryKind =
      raw.entryKind === "cash_alternate" || raw.entryKind === "normal" ? raw.entryKind : entryKind;

    run(
      db,
      `INSERT INTO ct_supply_entries (
        contract_id, invoice_id, boq_item_id, entry_date, item_name, unit, qty_milli,
        comparative_cents, comparative_total_cents, comparative_serial, comparative_listed, demand_no,
        ncbd_cents, ncbd_total_cents, sale_mode, packet_comparative_cents, packet_ncbd_cents,
        pcs_per_packet_milli, pcs_sold_milli, entry_kind, notes, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        contractId,
        invoiceId,
        raw.boqItemId || null,
        isoDate,
        itemName,
        priced.unit,
        priced.qtyMilli,
        priced.comparativeCents,
        priced.comparativeTotalCents,
        serial,
        listed ? 1 : 0,
        raw.demandNo?.trim() || demandNo,
        priced.ncbdCents,
        priced.ncbdTotalCents,
        priced.saleMode,
        priced.packetComparativeCents,
        priced.packetNcbdCents,
        priced.pcsPerPacketMilli,
        priced.pcsSoldMilli,
        kind,
        raw.notes?.trim() || null,
        when,
        when,
      ],
    );
  }
}

export async function createCtInvoice(payload: ComposerPayload) {
  const contract = await getContract(payload.contractId);
  if (!contract) throw new ActionError("Select an office contract.");
  const db = await getDb();
  const when = nowIso();
  const number = (payload.invoiceNumber || "").trim() || (await suggestInvoiceNumber(payload.contractId));
  const clash = getRow(db, "SELECT id FROM ct_invoices WHERE contract_id = ? AND invoice_number = ?", [
    payload.contractId,
    number,
  ]);
  if (clash) throw new ActionError("Invoice number already used.");

  return withTransaction(db, () => {
    const inserted = run(
      db,
      `INSERT INTO ct_invoices (contract_id, invoice_number, iso_date, status, notes, billed_at, created_at, updated_at)
       VALUES (?,?,?,'draft',?,NULL,?,?)`,
      [payload.contractId, number, payload.isoDate.slice(0, 10), payload.notes?.trim() || null, when, when],
    );
    replaceLines(db, inserted.id, payload.contractId, { ...payload, invoiceNumber: number });
    return inserted.id;
  });
}

export async function updateCtInvoice(invoiceId: number, payload: ComposerPayload) {
  const existing = await getCtInvoice(invoiceId);
  if (!existing) throw new ActionError("Invoice not found.");
  const db = await getDb();
  const when = nowIso();
  const number = (payload.invoiceNumber || existing.invoiceNumber).trim();
  if (number !== existing.invoiceNumber) {
    const clash = getRow(
      db,
      "SELECT id FROM ct_invoices WHERE contract_id = ? AND invoice_number = ? AND id != ?",
      [existing.contractId, number, invoiceId],
    );
    if (clash) throw new ActionError("Invoice number already used.");
  }
  withTransaction(db, () => {
    run(
      db,
      `UPDATE ct_invoices SET invoice_number=?, iso_date=?, notes=?, updated_at=? WHERE id=?`,
      [number, payload.isoDate.slice(0, 10), payload.notes?.trim() || null, when, invoiceId],
    );
    replaceLines(db, invoiceId, existing.contractId, { ...payload, invoiceNumber: number });
  });
}

export async function markCtInvoiceBilled(invoiceId: number) {
  const db = await getDb();
  const when = nowIso();
  const r = run(
    db,
    `UPDATE ct_invoices SET status='billed', billed_at=COALESCE(billed_at, ?), updated_at=? WHERE id=?`,
    [when, when, invoiceId],
  );
  if (r.changes !== 1) throw new ActionError("Invoice not found.");
}

export async function markCtInvoiceDraft(invoiceId: number) {
  const db = await getDb();
  const r = run(
    db,
    `UPDATE ct_invoices SET status='draft', billed_at=NULL, updated_at=? WHERE id=?`,
    [nowIso(), invoiceId],
  );
  if (r.changes !== 1) throw new ActionError("Invoice not found.");
}

export async function deleteCtInvoice(invoiceId: number) {
  const db = await getDb();
  withTransaction(db, () => {
    run(db, "DELETE FROM ct_supply_entries WHERE invoice_id = ?", [invoiceId]);
    const r = run(db, "DELETE FROM ct_invoices WHERE id = ?", [invoiceId]);
    if (r.changes !== 1) throw new ActionError("Invoice not found.");
  });
}

export function entryToComposerLine(e: CtSupplyEntry) {
  let packetNcbd = e.packetNcbdCents;
  if (packetNcbd == null) {
    packetNcbd =
      e.saleMode === "pieces" && e.pcsPerPacket
        ? roundCents(e.ncbdCents * e.pcsPerPacket)
        : e.ncbdCents;
  }
  let packetCompr = e.packetComparativeCents;
  if (packetCompr == null) {
    packetCompr =
      e.saleMode === "pieces" && e.pcsPerPacket
        ? roundCents(e.comparativeCents * e.pcsPerPacket)
        : e.comparativeCents;
  }
  return {
    boqItemId: e.boqItemId,
    itemName: e.itemName,
    comparativeSerial: e.comparativeSerial,
    comparativeListed: e.comparativeListed,
    unit: e.unit || "",
    saleMode: e.saleMode,
    qty: e.qty,
    packetComparativeCents: packetCompr,
    packetNcbdCents: packetNcbd,
    pcsPerPacket: e.pcsPerPacket,
    pcsSold: e.pcsSold,
    comparativeCents: e.comparativeCents,
    ncbdLineCents: e.ncbdCents,
    comparativeTotalCents: e.comparativeTotalCents,
    ncbdTotalCents: e.ncbdTotalCents,
    entryKind: e.entryKind,
    demandNo: e.demandNo || "",
  };
}
