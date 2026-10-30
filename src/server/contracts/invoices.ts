"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import type { CtEntryKind, CtSaleMode } from "@/lib/domain/contracts";
import { ActionError } from "@/lib/errors";
import { roundCents, tryParseMoney } from "@/lib/money";
import { searchBoq } from "@/lib/repo/contracts/boq";
import { contractsForOffice, listOffices } from "@/lib/repo/contracts/contracts";
import {
  createCtInvoice,
  deleteCtInvoice,
  entryToComposerLine,
  getCtInvoice,
  markCtInvoiceBilled,
  markCtInvoiceDraft,
  suggestInvoiceNumber,
  updateCtInvoice,
  type ComposerLinePayload,
  type ComposerPayload,
} from "@/lib/repo/contracts/invoices";
import type { ActionState } from "@/lib/types";

function revalidate(invoiceId?: number, contractId?: number) {
  revalidatePath("/contracts", "layout");
  revalidatePath("/contracts/invoices");
  if (invoiceId) revalidatePath(`/contracts/invoices/${invoiceId}`);
  if (contractId) revalidatePath(`/contracts/${contractId}`);
}

export async function apiSearchOffices(q: string) {
  await requireManager();
  return listOffices(q);
}

export async function apiContractsForOffice(office: string) {
  await requireManager();
  const list = await contractsForOffice(office);
  return list.map((c) => ({
    id: c.id,
    officeName: c.officeName,
    contractHead: c.contractHead,
    firmId: c.firmId,
    firmName: c.firmName,
    vendorNumber: c.vendorNumber || "",
    label: `${c.contractHead} · ${c.firmName}`,
  }));
}

export async function apiSuggestInvoiceNumber(contractId: number) {
  await requireManager();
  return suggestInvoiceNumber(contractId);
}

export async function apiSearchBoq(contractId: number, q: string) {
  await requireManager();
  const rows = await searchBoq(contractId, q, 40);
  return rows.map((b) => ({
    id: b.id,
    serialNumber: b.serialNumber,
    itemName: b.itemName,
    unit: b.unit || "",
    comparativeCents: b.comparativeCents,
    ncbdCents: b.ncbdCents,
    comparativeListed: b.comparativeListed,
  }));
}

export async function apiLoadInvoiceBootstrap(invoiceId: number) {
  await requireManager();
  const inv = await getCtInvoice(invoiceId);
  if (!inv) return null;
  return {
    invoiceId: inv.id,
    contractId: inv.contractId,
    officeName: inv.officeName || "",
    contractHead: inv.contractHead || "",
    firmName: inv.firmName || "",
    invoiceNumber: inv.invoiceNumber,
    isoDate: inv.isoDate,
    notes: inv.notes || "",
    status: inv.status,
    demandNo: inv.demandNo || "",
    entryKind: (inv.entries[0]?.entryKind || "normal") as CtEntryKind,
    cashTakenCents: inv.cashTakenCents,
    lines: inv.entries.map(entryToComposerLine),
  };
}

function parseLines(raw: unknown): ComposerLinePayload[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((line) => {
    const l = line as Record<string, unknown>;
    const saleMode: CtSaleMode = l.saleMode === "pieces" ? "pieces" : "unit";
    const packetComparativeCents =
      typeof l.packetComparativeCents === "number"
        ? roundCents(l.packetComparativeCents)
        : tryParseMoney(String(l.packetComparative || "0")) || 0;
    const packetNcbdCents =
      typeof l.packetNcbdCents === "number"
        ? roundCents(l.packetNcbdCents)
        : tryParseMoney(String(l.packetNcbd || "0")) || 0;
    const ncbdOverride =
      l.ncbdOverrideCents == null || l.ncbdOverrideCents === ""
        ? null
        : typeof l.ncbdOverrideCents === "number"
          ? roundCents(l.ncbdOverrideCents)
          : tryParseMoney(String(l.ncbdOverrideCents));
    return {
      boqItemId: l.boqItemId ? Number(l.boqItemId) : null,
      itemName: String(l.itemName || ""),
      unit: String(l.unit || ""),
      saleMode,
      qty: l.qty != null ? Number(l.qty) : undefined,
      packetComparativeCents,
      packetNcbdCents,
      ncbdOverrideCents: ncbdOverride,
      pcsPerPacket: l.pcsPerPacket != null && l.pcsPerPacket !== "" ? Number(l.pcsPerPacket) : null,
      pcsSold: l.pcsSold != null && l.pcsSold !== "" ? Number(l.pcsSold) : null,
      comparativeListed: l.comparativeListed !== false,
      comparativeSerial: l.comparativeSerial != null ? Number(l.comparativeSerial) : null,
      entryKind: l.entryKind === "cash_alternate" ? "cash_alternate" : "normal",
      pickedQty: l.pickedQty != null && l.pickedQty !== "" ? Number(l.pickedQty) : null,
      cashAltQty: l.cashAltQty != null && l.cashAltQty !== "" ? Number(l.cashAltQty) : null,
      lineCashTakenCents:
        typeof l.lineCashTakenCents === "number"
          ? roundCents(l.lineCashTakenCents)
          : tryParseMoney(String(l.lineCashTaken || l.lineCashTakenCents || "0")) || 0,
      demandNo: String(l.demandNo || ""),
      notes: String(l.notes || ""),
    };
  });
}

export async function saveComposerInvoice(payload: {
  invoiceId?: number;
  contractId: number;
  invoiceNumber?: string;
  isoDate: string;
  notes?: string;
  demandNo?: string;
  entryKind?: CtEntryKind;
  cashTakenCents?: number;
  lines: unknown[];
}): Promise<{ ok: true; invoiceId: number } | { error: string }> {
  await requireManager();
  try {
    const body: ComposerPayload = {
      contractId: Number(payload.contractId),
      invoiceNumber: payload.invoiceNumber,
      isoDate: payload.isoDate,
      notes: payload.notes,
      demandNo: payload.demandNo,
      entryKind: payload.entryKind,
      cashTakenCents: Number(payload.cashTakenCents || 0),
      lines: parseLines(payload.lines),
    };
    let id: number;
    if (payload.invoiceId) {
      await updateCtInvoice(payload.invoiceId, body);
      id = payload.invoiceId;
    } else {
      id = await createCtInvoice(body);
    }
    revalidate(id, body.contractId);
    return { ok: true, invoiceId: id };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    return { error: "Could not save invoice." };
  }
}

export async function billCtInvoice(id: number): Promise<ActionState> {
  await requireManager();
  try {
    await markCtInvoiceBilled(id);
    const inv = await getCtInvoice(id);
    revalidate(id, inv?.contractId);
    return { ok: true, message: "Marked billed" };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}

export async function unbillCtInvoice(id: number): Promise<ActionState> {
  await requireManager();
  try {
    await markCtInvoiceDraft(id);
    const inv = await getCtInvoice(id);
    revalidate(id, inv?.contractId);
    return { ok: true, message: "Reverted to draft" };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}

export async function removeCtInvoice(id: number): Promise<ActionState> {
  await requireManager();
  try {
    const inv = await getCtInvoice(id);
    await deleteCtInvoice(id);
    revalidate(undefined, inv?.contractId);
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
  redirect("/contracts/invoices");
}
