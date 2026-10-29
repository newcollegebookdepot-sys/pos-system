import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { PrintButton } from "@/components/print-button";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { ReassignCustomer } from "@/components/reassign-customer";
import { requireUser } from "@/lib/auth";
import { balText, formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/period";
import { listCustomers } from "@/lib/repo/customers";
import { getInvoice } from "@/lib/repo/invoices";
import { readSettings } from "@/lib/repo/settings";
import { removeInvoice } from "@/server/invoices";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Invoice ${id}` };
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const user = await requireUser();
  const settings = await readSettings();
  if (!settings) redirect("/setup");
  const { id: raw } = await params;
  const sp = await searchParams;
  if (!/^\d+$/.test(raw)) notFound();
  const inv = await getInvoice(Number(raw));
  if (!inv) notFound();
  const { customers } = await listCustomers();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex flex-wrap gap-2">
        <PrintButton />
        <WhatsAppButton phone={inv.customerPhone} invoiceNumber={inv.invoiceNumber} />
        <Link href="/invoices" className="btn btn-ghost ring-1 ring-line">
          Back
        </Link>
        <Link href="/sell" className="btn btn-ghost ring-1 ring-line">
          New sale
        </Link>
        {user.role === "manager" ? (
          <>
            <ReassignCustomer invoiceId={inv.id} customers={customers.filter((c) => c.id !== inv.customerId)} />
            <ConfirmButton
              label="Delete invoice"
              confirm={`Delete ${inv.invoiceNumber}?`}
              action={removeInvoice.bind(null, inv.id)}
            />
          </>
        ) : null}
      </div>

      {sp.print === "1" ? <AutoPrint /> : null}

      <article className="receipt-sheet card px-6 py-8 print:max-w-none">
        <div className="flex flex-wrap justify-between gap-4 border-b border-dashed border-ink/20 pb-4">
          <div>
            <h1 className="font-serif text-3xl">{settings.shopName}</h1>
            <p className="text-sm text-ink/70">{settings.address}</p>
            <p className="text-sm text-ink/70">{settings.phone}</p>
          </div>
          <div className="text-sm">
            <p className="font-serif text-2xl">INVOICE</p>
            <p>{inv.invoiceNumber}</p>
            <p>{fmtDate(inv.isoDate)}</p>
            <p>Cashier: {inv.operatorName}</p>
            <p>Status: {inv.status}</p>
          </div>
        </div>
        <div className="mt-4 text-sm">
          <p className="font-semibold">Bill to</p>
          <p>{inv.customerName}</p>
          {inv.customerPhone !== "N/A" ? <p>Phone: {inv.customerPhone}</p> : null}
          <p>Account: {inv.customerType}</p>
        </div>
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink/20">
              <th className="py-2">Item</th>
              <th>Unit</th>
              <th>Qty</th>
              <th>Retail</th>
              <th>Disc</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} className="border-b border-dashed border-ink/10">
                <td className="py-2">
                  {l.name}
                  {l.packSize > 1 ? <span className="block text-xs text-ink/50">Pkt of {l.packSize}</span> : null}
                </td>
                <td>{l.saleUnit === "pkt" ? "Pkt" : "Pcs"}</td>
                <td className="tabular-nums">{l.saleUnit === "pkt" ? l.packets : l.qtyPcs}</td>
                <td className="tabular-nums">{formatMoney(l.retailCents)}</td>
                <td className="tabular-nums">{formatMoney(l.discCents)}</td>
                <td className="text-right tabular-nums">{formatMoney(l.lineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <Row k="Retail" v={formatMoney(inv.retailSubtotalCents)} />
          <Row k="Discount" v={formatMoney(inv.itemDiscountCents + inv.billDiscountCents)} />
          <Row k="Grand" v={formatMoney(inv.grandTotalCents)} bold />
          <Row k="Paid" v={formatMoney(inv.paidCents)} />
          <Row k="Due" v={formatMoney(inv.unpaidCents)} />
          {inv.surplusAppliedCents > 0 ? <Row k="Surplus applied" v={formatMoney(inv.surplusAppliedCents)} /> : null}
          <Row k="Previous balance" v={balText(inv.prevBalanceCents)} />
          <Row k="Closing balance" v={balText(inv.closingBalanceCents)} />
        </dl>
        <p className="mt-8 text-center text-xs text-ink/60">{settings.printTerms}</p>
        {user.role === "manager" ? (
          <p className="no-print mt-4 text-center text-xs text-ink/40">
            Est. profit {formatMoney(inv.profitCents)} (staff only)
          </p>
        ) : null}
      </article>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? "text-base font-semibold" : ""}`}>
      <dt>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}

function AutoPrint() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `setTimeout(()=>window.print(), 400);`,
      }}
    />
  );
}
