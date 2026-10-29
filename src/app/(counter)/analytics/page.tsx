import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PeriodBar } from "@/components/ui/period-bar";
import { requireManager } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { monthKey, periodFromSearch } from "@/lib/period";
import { listBatches } from "@/lib/repo/batches";
import { listCustomers } from "@/lib/repo/customers";
import { getInvoice, listInvoices } from "@/lib/repo/invoices";
import { listReceipts } from "@/lib/repo/receipts";
import { readSettings } from "@/lib/repo/settings";
import { redirect } from "next/navigation";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireManager();
  const settings = await readSettings();
  if (!settings) redirect("/setup");
  const sp = await searchParams;
  const period = periodFromSearch({ get: (k) => sp[k] ?? null });
  const { invoices, summary } = await listInvoices({
    from: period.from,
    to: period.to,
    q: sp.q,
    status: sp.status,
    operator: sp.operator,
  });
  const receipts = await listReceipts({ from: period.from, to: period.to });
  const { batches, value: stock } = await listBatches({
    category: sp.category || undefined,
    pageSize: 5000,
  });
  const { customers } = await listCustomers();

  const byMonth = new Map<string, { sales: number; total: number }>();
  const byOp = new Map<string, { sales: number; total: number }>();
  const byCat = new Map<string, { qty: number; revenue: number }>();
  const productSold = new Map<string, number>();

  for (const inv of invoices) {
    const mk = monthKey(inv.isoDate);
    const m = byMonth.get(mk) || { sales: 0, total: 0 };
    m.sales++;
    m.total += inv.grandTotalCents;
    byMonth.set(mk, m);
    const o = byOp.get(inv.operatorName) || { sales: 0, total: 0 };
    o.sales++;
    o.total += inv.grandTotalCents;
    byOp.set(inv.operatorName, o);
    const full = await getInvoice(inv.id);
    if (!full) continue;
    for (const line of full.lines) {
      productSold.set(line.name, (productSold.get(line.name) || 0) + line.qtyPcs);
      // category from first matching batch
      const batch = batches.find((b) => b.name === line.name);
      const cat = batch?.category || "General";
      if (sp.category && cat !== sp.category) continue;
      const c = byCat.get(cat) || { qty: 0, revenue: 0 };
      c.qty += line.qtyPcs;
      c.revenue += line.lineTotalCents;
      byCat.set(cat, c);
    }
  }

  const aging = { d30: 0, d60: 0, d90: 0, d90p: 0 };
  const today = new Date();
  for (const inv of invoices.filter((i) => i.unpaidCents > 0)) {
    const [y, m, d] = inv.isoDate.split("-").map(Number);
    const days = Math.floor((today.getTime() - new Date(y, m - 1, d).getTime()) / 86400000);
    if (days <= 30) aging.d30 += inv.unpaidCents;
    else if (days <= 60) aging.d60 += inv.unpaidCents;
    else if (days <= 90) aging.d90 += inv.unpaidCents;
    else aging.d90p += inv.unpaidCents;
  }

  const topProducts = [...productSold.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const slow = batches.filter((b) => !productSold.has(b.name) || productSold.get(b.name) === 0).slice(0, 20);
  const modes = new Map<string, number>();
  for (const r of receipts) modes.set(r.mode, (modes.get(r.mode) || 0) + r.amountCents);

  const avg = summary.salesCount ? Math.round(summary.grandCents / summary.salesCount) : 0;
  const margin = summary.grandCents > 0 ? Math.round((summary.profitCents / summary.grandCents) * 1000) / 10 : 0;
  const realized =
    summary.grandCents > 0 ? Math.round(summary.profitCents * (summary.paidCents / summary.grandCents)) : 0;

  return (
    <div>
      <PageHeader title="Analytics" description={period.label} />
      <Suspense>
        <PeriodBar />
      </Suspense>
      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="period" value={sp.period || "today"} />
        <input name="q" className="field max-w-xs" placeholder="Search" defaultValue={sp.q || ""} />
        <input name="category" className="field max-w-[10rem]" placeholder="Category" defaultValue={sp.category || ""} />
        <input name="operator" className="field max-w-[10rem]" placeholder="Operator" defaultValue={sp.operator || ""} />
        <select name="status" className="field max-w-[9rem]" defaultValue={sp.status || ""}>
          <option value="">All status</option>
          <option>Paid</option>
          <option>Partial</option>
          <option>Unpaid</option>
        </select>
        <button className="btn btn-primary" type="submit">
          Apply
        </button>
      </form>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card label="Period sales" value={formatMoney(summary.grandCents)} />
        <Card label="Gross margin %" value={`${margin}%`} />
        <Card label="Cash realized profit" value={formatMoney(realized)} />
        <Card label="Inventory landed" value={formatMoney(stock.costCents)} sub={`Retail ${formatMoney(stock.retailCents)}`} />
        <Card label="Avg bill" value={formatMoney(avg)} />
        <Card label="Receipts collected" value={formatMoney(receipts.reduce((s, r) => s + r.amountCents, 0))} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Table title="Sales by month" rows={[...byMonth.entries()].map(([k, v]) => [k, `${v.sales}`, formatMoney(v.total)])} heads={["Month", "Sales", "Total"]} />
        <Table title="By operator" rows={[...byOp.entries()].map(([k, v]) => [k, `${v.sales}`, formatMoney(v.total)])} heads={["Operator", "Sales", "Total"]} />
        <Table title="Category performance" rows={[...byCat.entries()].map(([k, v]) => [k, `${v.qty}`, formatMoney(v.revenue)])} heads={["Category", "Qty", "Revenue"]} />
        <Table
          title="Dues aging"
          rows={[
            ["0–30", formatMoney(aging.d30)],
            ["31–60", formatMoney(aging.d60)],
            ["61–90", formatMoney(aging.d90)],
            ["90+", formatMoney(aging.d90p)],
            ["Customer dues total", formatMoney(customers.reduce((s, c) => s + Math.max(0, c.balanceCents), 0))],
          ]}
          heads={["Bucket", "Amount"]}
        />
        <Table title="Top products" rows={topProducts.map(([n, q]) => [n, String(q)])} heads={["Product", "Qty"]} />
        <Table title="Slow / dead stock" rows={slow.map((b) => [b.name, `Batch ${b.batchNo}`, String(b.stockPcs)])} heads={["Item", "Batch", "Pcs"]} />
        <Table title="Payment modes" rows={[...modes.entries()].map(([k, v]) => [k, formatMoney(v)])} heads={["Mode", "Amount"]} />
      </div>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <article className="card p-3">
      <p className="text-xs text-ink/60">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {sub ? <p className="text-[11px] text-ink/50">{sub}</p> : null}
    </article>
  );
}

function Table({ title, heads, rows }: { title: string; heads: string[]; rows: string[][] }) {
  return (
    <section className="card p-4">
      <h2 className="font-serif text-xl">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink/60">No data.</p>
      ) : (
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-ink/60">
            <tr>
              {heads.map((h) => (
                <th key={h} className="py-1">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {r.map((c, j) => (
                  <td key={j} className="py-1.5 tabular-nums">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
