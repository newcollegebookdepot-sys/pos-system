import Link from "next/link";
import { Suspense } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { PeriodBar } from "@/components/ui/period-bar";
import { periodFromSearch } from "@/lib/period";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/period";
import { listInvoices } from "@/lib/repo/invoices";
import { listOperators } from "@/lib/repo/settings";
import { removeInvoice } from "@/server/invoices";

export const metadata = { title: "Invoices & returns" };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const period = periodFromSearch({ get: (k) => sp[k] ?? null });
  const { invoices, summary } = await listInvoices({
    from: period.from,
    to: period.to,
    q: sp.q,
    status: sp.status,
    operator: sp.operator,
    minTotal: sp.min ? Math.round(Number(sp.min) * 100) : null,
    maxTotal: sp.max ? Math.round(Number(sp.max) * 100) : null,
  });
  const operators = await listOperators();

  return (
    <div>
      <PageHeader title="Invoices" description="Edit qty to return · delete restores stock" />
      <Suspense>
        <PeriodBar />
      </Suspense>
      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="period" value={sp.period || "today"} />
        <input name="q" className="field max-w-xs" placeholder="Invoice # or customer" defaultValue={sp.q || ""} />
        <select name="status" className="field max-w-[9rem]" defaultValue={sp.status || ""}>
          <option value="">All status</option>
          <option value="Paid">Paid</option>
          <option value="Partial">Partial</option>
          <option value="Unpaid">Unpaid</option>
        </select>
        <select name="operator" className="field max-w-[10rem]" defaultValue={sp.operator || ""}>
          <option value="">All operators</option>
          {operators.map((o) => (
            <option key={o.id} value={o.name}>
              {o.name}
            </option>
          ))}
        </select>
        <input name="min" className="field max-w-[7rem]" placeholder="Min total" defaultValue={sp.min || ""} />
        <input name="max" className="field max-w-[7rem]" placeholder="Max total" defaultValue={sp.max || ""} />
        <button className="btn btn-primary" type="submit">
          Filter
        </button>
      </form>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Filtered sales" value={`${summary.salesCount}`} />
        <Stat label="Paid" value={formatMoney(summary.paidCents)} />
        <Stat label="Unpaid" value={formatMoney(summary.unpaidCents)} />
        <Stat label="Profit" value={formatMoney(summary.profitCents)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="text-ink/60">
            <tr>
              <th className="py-2">Inv</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Operator</th>
              <th>Status</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Due</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t border-line">
                <td className="py-2 font-medium">{inv.invoiceNumber}</td>
                <td>{fmtDate(inv.isoDate)}</td>
                <td>{inv.customerName}</td>
                <td>{inv.operatorName}</td>
                <td>{inv.status}</td>
                <td className="tabular-nums">{formatMoney(inv.grandTotalCents)}</td>
                <td className="tabular-nums">{formatMoney(inv.paidCents)}</td>
                <td className="tabular-nums">{formatMoney(inv.unpaidCents)}</td>
                <td className="space-x-2">
                  <Link href={`/invoices/${inv.id}`} className="font-semibold text-forest">
                    Open
                  </Link>
                  {user.role === "manager" ? (
                    <ConfirmButton
                      label="Del"
                      confirm={`Delete ${inv.invoiceNumber}? Stock and ledger will reverse.`}
                      action={removeInvoice.bind(null, inv.id)}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 ? <p className="mt-3 text-ink/60">No invoices in this period.</p> : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="card p-3">
      <p className="text-xs text-ink/60">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </article>
  );
}
