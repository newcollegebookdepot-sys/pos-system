"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { discPctFromPrices, lineDiscTotal, lineRetailTotal, lineSaved, pcsFromPackets } from "@/lib/domain/pricing";
import { ActionError } from "@/lib/errors";
import { allocateForQty, finalizeSale } from "@/lib/repo/invoices";
import {
  deleteDraft,
  getDraft,
  listDrafts,
  releaseAllCart,
  releaseLine,
  reserveLine,
  saveDraft,
} from "@/lib/repo/cart";
import { getCustomer } from "@/lib/repo/customers";
import { getBatch, searchBatches } from "@/lib/repo/batches";
import { listCustomers } from "@/lib/repo/customers";
import { readSettings } from "@/lib/repo/settings";
import { roundCents } from "@/lib/money";
import type { InvoiceLine, SaleUnit } from "@/lib/types";

export async function searchPosCustomers(q: string) {
  await requireUser();
  const { customers } = await listCustomers({ q });
  return customers.slice(0, 30);
}

export async function searchPosBatches(q: string) {
  await requireUser();
  return searchBatches(q, 40);
}

export async function buildCartLine(input: {
  batchId: number;
  saleUnit: SaleUnit;
  qty: number;
  retailDisplayCents: number;
  discDisplayCents: number;
  clientKey: string;
}): Promise<{ error?: string; line?: InvoiceLine & { clientKey: string } }> {
  const user = await requireUser();
  try {
    const batch = await getBatch(input.batchId);
    if (!batch) throw new ActionError("Batch not found.");
    const pack = batch.packSize;
    let qtyPcs = 0;
    let packets = 0;
    if (input.saleUnit === "pkt") {
      if (pack <= 1) throw new ActionError("This item is loose only.");
      packets = Math.round(input.qty);
      if (packets < 1) throw new ActionError("Enter packet quantity.");
      qtyPcs = pcsFromPackets(packets, pack);
    } else {
      qtyPcs = Math.round(input.qty);
      if (qtyPcs < 1) throw new ActionError("Enter piece quantity.");
    }
    const retailCents =
      input.saleUnit === "pkt" && pack > 1
        ? roundCents(input.retailDisplayCents / pack)
        : roundCents(input.retailDisplayCents);
    const discCents =
      input.saleUnit === "pkt" && pack > 1
        ? roundCents(input.discDisplayCents / pack)
        : roundCents(input.discDisplayCents);
    const allocations = await allocateForQty(batch.id, qtyPcs, false);
    await reserveLine(
      user.id,
      input.clientKey,
      allocations.map((a) => ({ batchId: a.batchId, qty: a.qty })),
    );
    const line: InvoiceLine & { clientKey: string } = {
      clientKey: input.clientKey,
      name: batch.name,
      saleUnit: input.saleUnit,
      packSize: pack,
      qtyPcs,
      packets,
      retailCents,
      discCents,
      discPct: discPctFromPrices(retailCents, discCents),
      retailTotalCents: lineRetailTotal(retailCents, qtyPcs),
      savedCents: lineSaved(retailCents, discCents, qtyPcs),
      lineTotalCents: lineDiscTotal(discCents, qtyPcs),
      allocations,
    };
    return { line };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}

export async function removeCartLine(clientKey: string) {
  const user = await requireUser();
  await releaseLine(user.id, clientKey);
}

export async function clearCartAction() {
  const user = await requireUser();
  await releaseAllCart(user.id);
}

export async function parkDraft(input: {
  customerId: number;
  billDiscountCents: number;
  paidCents: number;
  cart: InvoiceLine[];
}) {
  const user = await requireUser();
  const settings = await readSettings();
  const customer = await getCustomer(input.customerId);
  if (!customer) return { error: "Customer not found." };
  await releaseAllCart(user.id);
  const draftNumber = await saveDraft({
    customerId: customer.id,
    customerName: customer.name,
    billDiscountCents: input.billDiscountCents,
    paidCents: input.paidCents,
    cart: input.cart,
    operatorName: settings?.operatorName || user.name,
  });
  revalidatePath("/sell");
  return { ok: true as const, draftNumber };
}

export async function loadDrafts() {
  await requireUser();
  return listDrafts();
}

export async function discardDraft(id: number) {
  await requireUser();
  await deleteDraft(id);
  revalidatePath("/sell");
}

export async function resumeDraft(id: number) {
  const user = await requireUser();
  const draft = await getDraft(id);
  if (!draft) return { error: "Draft not found." };
  await releaseAllCart(user.id);
  for (const line of draft.cart) {
    const key = (line as { clientKey?: string }).clientKey || `resume-${id}-${line.name}-${Math.random()}`;
    await reserveLine(
      user.id,
      key,
      line.allocations.map((a) => ({ batchId: a.batchId, qty: a.qty })),
    );
    (line as InvoiceLine & { clientKey?: string }).clientKey = key;
  }
  await deleteDraft(id);
  revalidatePath("/sell");
  return { ok: true as const, draft };
}

export async function completeSale(input: {
  customerId: number;
  billDiscountCents: number;
  paidCents: number;
  lines: InvoiceLine[];
}) {
  const user = await requireUser();
  const settings = await readSettings();
  try {
    const result = await finalizeSale({
      userId: user.id,
      customerId: input.customerId,
      operatorName: settings?.operatorName || user.name,
      lines: input.lines,
      billDiscountCents: input.billDiscountCents,
      paidCents: input.paidCents,
    });
    revalidatePath("/sell");
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    revalidatePath("/customers");
    revalidatePath("/stock");
    return { ok: true as const, invoiceId: result.invoiceId, invoiceNumber: result.invoiceNumber };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}
