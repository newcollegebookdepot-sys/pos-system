import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PeriodBar } from "@/components/ui/period-bar";
import { periodFromSearch } from "@/lib/period";
import { requireManager } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { listBatches, lowStockBatches } from "@/lib/repo/batches";
import { listCustomers } from "@/lib/repo/customers";
import { listInvoices } from "@/lib/repo/invoices";
import { readSettings } from "@/lib/repo/settings";
import { redirect } from "next/navigation";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireManager();
  const settings = await readSettings();
  if (!settings) redirect("/setup");
  const sp = await searchParams;
  const period = periodFromSearch({ get: (k) => sp[k] ?? null });
  const { invoices, summary } = await listInvoices({ from: period.from, to: period.to });
  const { customers } = await listCustomers();
  const outstanding = customers.reduce((s, c) => s + Math.max(0, c.balanceCents), 0);
  const { value: stock } = await listBatches({ pageSize: 1 });
  const low = await lowStockBatches(settings.lowStockThreshold);
  const avg = summary.salesCount ? Math.round(summary.grandCents / summary.salesCount) : 0;

  // Top sellers from invoice lines
  const byProduct = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const inv of invoices) {
    const full = await (await import("@/lib/repo/invoices")).getInvoice(inv.id);
    if (!full) continue;
    for (const line of full.lines) {
      const cur = byProduct.get(line.name) || { name: line.name, qty: 0, revenue: 0 };
      cur.qty += line.qtyPcs;
      cur.revenue += line.lineTotalCents;
      byProduct.set(line.name, cur);
    }
  }
  const top = [...byProduct.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 8);

  const cashCollected = summary.paidCents;
  const accrualProfit = summary.profitCents;
  const realizedScale = summary.grandCents > 0 ? cashCollected / summary.grandCents : 0;
  const realizedProfit = Math.round(accrualProfit * realizedScale);
  const margin = summary.grandCents > 0 ? Math.round((accrualProfit / summary.grandCents) * 1000) / 10 : 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={period.label}
        actions={
          <Link href="/analytics" className="btn btn-primary">
            Analytics
          </Link>
        }
      />
      <Suspense>
        <PeriodBar />
      </Suspense>
      <div className="cards">
        <Card label="Sales" value={`${summary.salesCount}`} sub={`Avg bill ${formatMoney(avg)}`} />
        <Card label="Realized profit" value={formatMoney(realizedProfit)} sub={`Cash collected ${formatMoney(cashCollected)}`} />
        <Card label="Accrual profit" value={formatMoney(accrualProfit)} sub={`Margin ${margin}%`} />
        <Card label="Outstanding dues" value={formatMoney(outstanding)} sub={`Low stock batches ${low.length}`} />
        <Card
          label="Stock at landed"
          value={formatMoney(stock.costCents)}
          sub={`Retail ${formatMoney(stock.retailCents)} · ${stock.batches} batches`}
        />
      </div>
      <div className="grid-2">
        <section className="box">
          <h2>Top sellers</h2>
          {top.length === 0 ? (
            <p className="muted">No sales this period.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th className="right">Qty</th>
                    <th className="right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((t, i) => (
                    <tr key={t.name}>
                      <td>{i + 1}</td>
                      <td className="strong">{t.name}</td>
                      <td className="right mono">{t.qty}</td>
                      <td className="right mono">{formatMoney(t.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="box">
          <h2>Low stock</h2>
          {low.length === 0 ? (
            <p className="muted">None under {settings.lowStockThreshold} pcs.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th className="right">Pcs</th>
                  </tr>
                </thead>
                <tbody>
                  {low.map((b) => (
                    <tr key={b.id}>
                      <td>
                        {b.name} · Batch {b.batchNo}
                      </td>
                      <td className="right mono">
                        <span className="badge badge-low">{b.stockPcs}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <article className="card">
      <p className="card-title">{label}</p>
      <p className="card-value mono">{value}</p>
      {sub ? <p className="card-sub">{sub}</p> : null}
    </article>
  );
}
