import "server-only";

import {
  calcContractLine,
  milliToQty,
  nextInvoiceNumber,
  qtyToMilli,
  resolveLineSplit,
  type CtEntryKind,
  type CtInvoiceStatus,
  type CtSaleMode,
} from "@/lib/domain/contracts";
import { allRows, getDb, getRow, run, withTransaction } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { nowIso } from "@/lib/format";
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
  pickedQty: number;
  cashAltQty: number;
  lineCashTakenCents: number;
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
  cashTakenCents: number;
  officeName?: string;
  contractHead?: string;
  firmName?: string;
  comparativeTotalCents: number;
  ncbdTotalCents: number;
  cashAlternateComparativeCents: number;
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
  cash_taken_cents?: number | null;
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
  picked_qty_milli?: number | null;
  cash_alt_qty_milli?: number | null;
  line_cash_taken_cents?: number | null;
  notes: string | null;
};

function mapEntry(row: EntRow): CtSupplyEntry {
  const qty = milliToQty(row.qty_milli);
  const split = resolveLineSplit({
    qty,
    pickedQty: row.picked_qty_milli == null ? null : milliToQty(row.picked_qty_milli),
    cashAltQty: row.cash_alt_qty_milli == null ? null : milliToQty(row.cash_alt_qty_milli),
    entryKind: row.entry_kind,
  });
  return {
    id: Number(row.id),
    contractId: Number(row.contract_id),
    invoiceId: row.invoice_id == null ? null : Number(row.invoice_id),
    boqItemId: row.boq_item_id == null ? null : Number(row.boq_item_id),
    entryDate: row.entry_date,
    itemName: row.item_name,
    unit: row.unit,
    qty,
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
    entryKind: row.entry_kind === "cash_alternate" ? "cash_alternate" : "normal",
    pickedQty: split.pickedQty,
    cashAltQty: split.cashAltQty,
    lineCashTakenCents: Number(row.line_cash_taken_cents || 0),
    notes: row.notes,
  };
}

function withTotals(inv: InvRow, entries: CtSupplyEntry[]): CtInvoice {
  const comparativeTotalCents = entries.reduce((s, e) => s + e.comparativeTotalCents, 0);
  const ncbdTotalCents = entries.reduce((s, e) => s + e.ncbdTotalCents, 0);
  const cashAlternateComparativeCents = entries.reduce((s, e) => {
    const totalQ = e.pickedQty + e.cashAltQty;
    if (totalQ <= 0) return s;
    return s + roundCents(e.comparativeTotalCents * (e.cashAltQty / totalQ));
  }, 0);
  const demandNo = entries.find((e) => e.demandNo)?.demandNo || null;
  const hasCashAlternate = entries.some((e) => e.cashAltQty > 0 || e.entryKind === "cash_alternate" || e.lineCashTakenCents > 0);
  const isCashAlternateOnly = entries.length > 0 && entries.every((e) => e.pickedQty <= 0 && e.cashAltQty > 0);
  const lineCashSum = entries.reduce((s, e) => s + e.lineCashTakenCents, 0);
  const cashTakenCents = Math.max(Number(inv.cash_taken_cents || 0), lineCashSum);
  return {
    id: Number(inv.id),
    contractId: Number(inv.contract_id),
    invoiceNumber: inv.invoice_number,
    isoDate: inv.iso_date,
    status: inv.status,
    notes: inv.notes,
    billedAt: inv.billed_at,
    cashTakenCents,
    officeName: inv.office_name,
    contractHead: inv.contract_head,
    firmName: inv.firm_name,
    comparativeTotalCents,
    ncbdTotalCents,
    cashAlternateComparativeCents,
    demandNo,
    hasCashAlternate,
    isCashAlternateOnly,
    entries,
  };
}

export async function suggestInvoiceNumber(contractId: number) {
  const db = await getDb();
  const nums = (await allRows<{ invoice_number: string }>(
    db,
    "SELECT invoice_number FROM ct_invoices WHERE contract_id = ?",
    [contractId],
  )).map((r) => r.invoice_number);
  return nextInvoiceNumber(nums);
}

export async function listOfficesForInvoices(q = "") {
  const db = await getDb();
  const rows = await allRows<{
    office_name: string;
    invoices: number;
    drafts: number;
    billed: number;
  }>(
    db,
    `SELECT c.office_name,
            COUNT(i.id) AS invoices,
            SUM(CASE WHEN i.status = 'draft' THEN 1 ELSE 0 END) AS drafts,
            SUM(CASE WHEN i.status = 'billed' THEN 1 ELSE 0 END) AS billed
     FROM ct_contracts c
     LEFT JOIN ct_invoices i ON i.contract_id = c.id
     GROUP BY c.office_name
     ORDER BY c.office_name COLLATE NOCASE`,
  );
  const needle = q.trim().toLowerCase();
  return rows
    .map((r) => ({
      officeName: r.office_name,
      invoiceCount: Number(r.invoices || 0),
      draftCount: Number(r.drafts || 0),
      billedCount: Number(r.billed || 0),
    }))
    .filter((r) => !needle || r.officeName.toLowerCase().includes(needle));
}

export async function listCtInvoices(opts: { contractId?: number; status?: string; officeName?: string } = {}) {
  const db = await getDb();
  const where: string[] = ["1=1"];
  const params: (string | number)[] = [];
  if (opts.contractId) {
    where.push("i.contract_id = ?");
    params.push(opts.contractId);
  }
  if (opts.officeName?.trim()) {
    where.push("lower(c.office_name) = lower(?)");
    params.push(opts.officeName.trim());
  }
  if (opts.status) {
    where.push("i.status = ?");
    params.push(opts.status);
  }
  const rows = await allRows<InvRow>(
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
    const entries = (await allRows<EntRow>(
      db,
      "SELECT * FROM ct_supply_entries WHERE invoice_id = ? ORDER BY id",
      [row.id],
    )).map(mapEntry);
    result.push(withTotals(row, entries));
  }
  return result;
}

export async function getCtInvoice(id: number) {
  const db = await getDb();
  const row = await getRow<InvRow>(
    db,
    `SELECT i.*, c.office_name, c.contract_head, f.name AS firm_name
     FROM ct_invoices i
     JOIN ct_contracts c ON c.id = i.contract_id
     JOIN ct_firms f ON f.id = c.firm_id
     WHERE i.id = ?`,
    [id],
  );
  if (!row) return null;
  const entries = (await allRows<EntRow>(
    db,
    "SELECT * FROM ct_supply_entries WHERE invoice_id = ? ORDER BY id",
    [id],
  )).map(mapEntry);
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
  pickedQty?: number | null;
  cashAltQty?: number | null;
  lineCashTakenCents?: number;
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
  /** Actual cash taken that this alternate bill stands in for (cents). */
  cashTakenCents?: number;
  lines: ComposerLinePayload[];
};

async function replaceLines(
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

  await run(db, "DELETE FROM ct_supply_entries WHERE invoice_id = ?", [invoiceId]);

  let lineCashTotal = 0;
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
      const boq = await getRow<{
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

    const kindHint: CtEntryKind =
      raw.entryKind === "cash_alternate" || raw.entryKind === "normal" ? raw.entryKind : entryKind;
    const split = resolveLineSplit({
      qty: priced.qty,
      pickedQty: raw.pickedQty,
      cashAltQty: raw.cashAltQty,
      entryKind: kindHint,
    });
    const lineCash = Math.max(0, roundCents(raw.lineCashTakenCents || 0));
    if (split.cashAltQty > 0) lineCashTotal += lineCash;

    await run(
      db,
      `INSERT INTO ct_supply_entries (
        contract_id, invoice_id, boq_item_id, entry_date, item_name, unit, qty_milli,
        comparative_cents, comparative_total_cents, comparative_serial, comparative_listed, demand_no,
        ncbd_cents, ncbd_total_cents, sale_mode, packet_comparative_cents, packet_ncbd_cents,
        pcs_per_packet_milli, pcs_sold_milli, entry_kind, picked_qty_milli, cash_alt_qty_milli,
        line_cash_taken_cents, notes, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
        split.entryKind,
        qtyToMilli(split.pickedQty),
        qtyToMilli(split.cashAltQty),
        lineCash,
        raw.notes?.trim() || null,
        when,
        when,
      ],
    );
  }

  // Keep invoice cash_taken in sync with line cash (unless payload sets a higher override)
  const cashTaken = Math.max(0, roundCents(payload.cashTakenCents || 0), lineCashTotal);
  await run(db, "UPDATE ct_invoices SET cash_taken_cents=? WHERE id=?", [cashTaken, invoiceId]);
}

export async function createCtInvoice(payload: ComposerPayload) {
  const contract = await getContract(payload.contractId);
  if (!contract) throw new ActionError("Select an office contract.");
  const db = await getDb();
  const when = nowIso();
  const number = (payload.invoiceNumber || "").trim() || (await suggestInvoiceNumber(payload.contractId));
  const clash = await getRow(db, "SELECT id FROM ct_invoices WHERE contract_id = ? AND invoice_number = ?", [
    payload.contractId,
    number,
  ]);
  if (clash) throw new ActionError("Invoice number already used.");
  const cashTaken = Math.max(0, roundCents(payload.cashTakenCents || 0));

  return await withTransaction(db, async () => {
    const inserted = await run(
      db,
      `INSERT INTO ct_invoices (contract_id, invoice_number, iso_date, status, notes, billed_at, cash_taken_cents, created_at, updated_at)
       VALUES (?,?,?,'draft',?,NULL,?,?,?)`,
      [payload.contractId, number, payload.isoDate.slice(0, 10), payload.notes?.trim() || null, cashTaken, when, when],
    );
    await replaceLines(db, inserted.id, payload.contractId, { ...payload, invoiceNumber: number });
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
    const clash = await getRow(
      db,
      "SELECT id FROM ct_invoices WHERE contract_id = ? AND invoice_number = ? AND id != ?",
      [existing.contractId, number, invoiceId],
    );
    if (clash) throw new ActionError("Invoice number already used.");
  }
  const cashTaken = Math.max(0, roundCents(payload.cashTakenCents || 0));
  await withTransaction(db, async () => {
    await run(
      db,
      `UPDATE ct_invoices SET invoice_number=?, iso_date=?, notes=?, cash_taken_cents=?, updated_at=? WHERE id=?`,
      [number, payload.isoDate.slice(0, 10), payload.notes?.trim() || null, cashTaken, when, invoiceId],
    );
    await replaceLines(db, invoiceId, existing.contractId, { ...payload, invoiceNumber: number });
  });
}

export async function markCtInvoiceBilled(invoiceId: number) {
  const db = await getDb();
  const when = nowIso();
  const r = await run(
    db,
    `UPDATE ct_invoices SET status='billed', billed_at=COALESCE(billed_at, ?), updated_at=? WHERE id=?`,
    [when, when, invoiceId],
  );
  if (r.changes !== 1) throw new ActionError("Invoice not found.");
}

export async function markCtInvoiceDraft(invoiceId: number) {
  const db = await getDb();
  const r = await run(
    db,
    `UPDATE ct_invoices SET status='draft', billed_at=NULL, updated_at=? WHERE id=?`,
    [nowIso(), invoiceId],
  );
  if (r.changes !== 1) throw new ActionError("Invoice not found.");
}

export async function deleteCtInvoice(invoiceId: number) {
  const db = await getDb();
  await withTransaction(db, async () => {
    await run(db, "DELETE FROM ct_supply_entries WHERE invoice_id = ?", [invoiceId]);
    const r = await run(db, "DELETE FROM ct_invoices WHERE id = ?", [invoiceId]);
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
    pickedQty: e.pickedQty,
    cashAltQty: e.cashAltQty,
    lineCashTakenCents: e.lineCashTakenCents,
    demandNo: e.demandNo || "",
  };
}
