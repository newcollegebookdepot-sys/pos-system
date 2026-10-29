import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireManager } from "@/lib/auth";
import { balText, formatMoney } from "@/lib/money";
import { getCustomer } from "@/lib/repo/customers";
import { listInvoices } from "@/lib/repo/invoices";
import { listReceipts } from "@/lib/repo/receipts";

export default async function CustomerLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const customer = await getCustomer(Number(id));
  if (!customer) notFound();
  const { invoices } = await listInvoices({ from: null, to: null, q: customer.name });
  const custInvoices = invoices.filter((i) => i.customerId === customer.id);
  const receipts = (await listReceipts({ from: null, to: null })).filter((r) => r.customerId === customer.id);

  return (
    <div>
      <PageHeader title={customer.name} description={`${customer.phone} · ${customer.type} · ${balText(customer.balanceCents)}`} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/customers" className="btn btn-ghost ring-1 ring-line">
          Back
        </Link>
        <Link href={`/customers?receipt=1`} className="btn btn-primary">
          Cash receipt
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Invoices" value={String(custInvoices.length)} />
        <Stat label="Billed" value={formatMoney(custInvoices.reduce((s, i) => s + i.grandTotalCents, 0))} />
        <Stat label="Balance" value={balText(customer.balanceCents)} />
      </div>
      <h2 className="mt-6 font-serif text-2xl">Invoices</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {custInvoices.map((i) => (
          <li key={i.id} className="flex justify-between border-b border-line py-2">
            <Link href={`/invoices/${i.id}`} className="text-forest">
              {i.invoiceNumber} · {i.isoDate} · {i.status}
            </Link>
            <span className="tabular-nums">{formatMoney(i.grandTotalCents)}</span>
          </li>
        ))}
      </ul>
      <h2 className="mt-6 font-serif text-2xl">Receipts</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {receipts.map((r) => (
          <li key={r.id} className="flex justify-between border-b border-line py-2">
            <span>
              {r.receiptNumber} · {r.isoDate} · {r.mode}
            </span>
            <span className="tabular-nums">{formatMoney(r.amountCents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="card p-3">
      <p className="text-xs text-ink/60">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </article>
  );
}
