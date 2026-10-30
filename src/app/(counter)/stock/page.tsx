import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { BatchHint } from "@/components/batch-hint";
import { requireManager } from "@/lib/auth";
import { batchLabel } from "@/lib/domain/batching";
import { formatMoney, moneyToInput } from "@/lib/money";
import { listBatches, listCategories } from "@/lib/repo/batches";
import { readSettings } from "@/lib/repo/settings";
import { createOrRestockBatch, quickAdjustStock, removeBatch, saveBatch, wipeStock } from "@/server/batches";
import { redirect } from "next/navigation";

export const metadata = { title: "Stock & batches" };

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireManager();
  const settings = await readSettings();
  if (!settings) redirect("/setup");
  const sp = await searchParams;
  const q = sp.q || "";
  const category = sp.category || "";
  const lowOnly = sp.low === "1";
  const page = Math.max(1, Number(sp.page || 1) || 1);
  const editId = sp.edit ? Number(sp.edit) : null;
  const { batches, value, total, pages } = await listBatches({
    q,
    category: category || undefined,
    lowOnly,
    threshold: settings.lowStockThreshold,
    page,
    pageSize: 50,
  });
  const categories = await listCategories();

  function hrefFor(nextPage: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (lowOnly) params.set("low", "1");
    if (nextPage > 1) params.set("page", String(nextPage));
    const s = params.toString();
    return s ? `/stock?${s}` : "/stock";
  }

  return (
    <div className="screen-stock grid gap-6">
      <PageHeader
        title="Stock"
        description="Same item + buy cost restocks a batch; different buy cost opens a new batch."
      />

      <div className="cards">
        <article className="card">
          <p className="card-title">Landed value</p>
          <p className="card-value mono">{formatMoney(value.costCents)}</p>
        </article>
        <article className="card">
          <p className="card-title">Retail value</p>
          <p className="card-value mono">{formatMoney(value.retailCents)}</p>
        </article>
        <article className="card">
          <p className="card-title">Batches / pcs</p>
          <p className="card-value mono">
            {value.batches} · {value.pcs}
          </p>
        </article>
      </div>

      <section className="box">
        <h2>Add / restock batch</h2>
        <div className="mt-2 max-w-3xl">
          <ActionForm action={createOrRestockBatch} resetOnSuccess successMessage="Saved">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="name">
                  Item name
                </label>
                <input id="name" name="name" className="field" required maxLength={120} />
              </div>
              <div>
                <label className="label" htmlFor="category">
                  Category
                </label>
                <input id="category" name="category" className="field" list="categories" placeholder="Pens" />
                <datalist id="categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="label" htmlFor="packSize">
                  Pack size (pcs/pkt)
                </label>
                <input id="packSize" name="packSize" className="field" defaultValue="1" />
              </div>
              <div>
                <label className="label" htmlFor="stockPcs">
                  Qty pcs
                </label>
                <input id="stockPcs" name="stockPcs" className="field" defaultValue="0" required />
              </div>
              <div>
                <label className="label" htmlFor="buy">
                  Buy /pc
                </label>
                <input id="buy" name="buy" className="field" required placeholder="0.00" />
              </div>
              <div>
                <label className="label" htmlFor="freight">
                  Freight /u
                </label>
                <input id="freight" name="freight" className="field" placeholder="0.00" />
              </div>
              <div>
                <label className="label" htmlFor="wholesale">
                  Disc. list /pc
                </label>
                <input id="wholesale" name="wholesale" className="field" placeholder="optional" />
              </div>
              <div>
                <label className="label" htmlFor="retail">
                  Sale / retail /pc
                </label>
                <input id="retail" name="retail" className="field" required placeholder="0.00" />
              </div>
              <div>
                <label className="label" htmlFor="batchNo">
                  Batch # (blank = auto)
                </label>
                <input id="batchNo" name="batchNo" className="field" placeholder="auto" />
              </div>
              <div className="sm:col-span-2">
                <BatchHint />
              </div>
            </div>
            <button className="btn btn-primary" type="submit">
              Save batch
            </button>
          </ActionForm>
        </div>
      </section>

      <section className="box">
        <h2>
          Catalog
          <span className="muted" style={{ fontWeight: 600 }}>
            {total} match · page {page}/{pages}
          </span>
        </h2>
        <form className="filter-bar" method="get">
          <input name="q" className="field" placeholder="Search batch / item / category" defaultValue={q} />
          <select name="category" className="field" defaultValue={category} style={{ maxWidth: "10rem" }}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="low" value="1" defaultChecked={lowOnly} /> Low stock only
          </label>
          <button className="btn btn-primary btn-sm" type="submit">
            Filter
          </button>
          <Link href="/stock" className="btn btn-secondary btn-sm">
            Reset
          </Link>
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch</th>
                <th>Item</th>
                <th>Category</th>
                <th className="right">Pcs</th>
                <th className="right">Pkts</th>
                <th className="right">Buy</th>
                <th className="right">Freight</th>
                <th className="right">Landed</th>
                <th className="right">Disc</th>
                <th className="right">Retail</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const pkts = b.packSize > 1 ? (b.stockPcs / b.packSize).toFixed(1) : "—";
                const low = b.stockPcs < settings.lowStockThreshold;
                const editing = editId === b.id;
                return (
                  <tr key={b.id}>
                    <td>{batchLabel(b.batchNo)}</td>
                    <td className="strong">{b.name}</td>
                    <td>{b.category}</td>
                    <td className="right mono">{b.stockPcs}</td>
                    <td className="right mono">{pkts}</td>
                    <td className="right mono">{formatMoney(b.buyCents)}</td>
                    <td className="right mono">{formatMoney(b.freightCents)}</td>
                    <td className="right mono">{formatMoney(b.landedCents)}</td>
                    <td className="right mono">{b.wholesaleCents ? formatMoney(b.wholesaleCents) : "—"}</td>
                    <td className="right mono">{formatMoney(b.retailCents)}</td>
                    <td>
                      {low ? <span className="badge badge-low">Low</span> : <span className="badge badge-ok">OK</span>}
                    </td>
                    <td>
                      {editing ? (
                        <div className="space-y-2 rounded-xl border border-line bg-card p-3" style={{ minWidth: 280 }}>
                          <ActionForm action={saveBatch} successMessage="Saved">
                            <input type="hidden" name="id" value={b.id} />
                            <input name="name" className="field" defaultValue={b.name} required />
                            <input name="batchNo" className="field" defaultValue={b.batchNo} required />
                            <input name="category" className="field" defaultValue={b.category} />
                            <input name="packSize" className="field" defaultValue={b.packSize} />
                            <input name="stockPcs" className="field" defaultValue={b.stockPcs} />
                            <input name="buy" className="field" defaultValue={moneyToInput(b.buyCents)} />
                            <input name="freight" className="field" defaultValue={moneyToInput(b.freightCents)} />
                            <input
                              name="wholesale"
                              className="field"
                              defaultValue={b.wholesaleCents ? moneyToInput(b.wholesaleCents) : ""}
                              placeholder="disc list"
                            />
                            <input name="retail" className="field" defaultValue={moneyToInput(b.retailCents)} />
                            <button className="btn btn-primary btn-sm" type="submit">
                              Save
                            </button>
                          </ActionForm>
                          <ActionForm action={quickAdjustStock} successMessage="Adjusted">
                            <input type="hidden" name="id" value={b.id} />
                            <input name="delta" className="field" placeholder="+12 or -2" required />
                            <button className="btn btn-secondary btn-sm" type="submit">
                              Adjust pcs
                            </button>
                          </ActionForm>
                          <div className="flex gap-2">
                            <ConfirmButton
                              label="Delete"
                              confirm={`Delete ${b.name} ${batchLabel(b.batchNo)}?`}
                              action={removeBatch.bind(null, b.id)}
                            />
                            <Link href={hrefFor(page)} className="btn btn-secondary btn-sm">
                              Close
                            </Link>
                          </div>
                        </div>
                      ) : (
                        <Link
                          href={`${hrefFor(page)}${hrefFor(page).includes("?") ? "&" : "?"}edit=${b.id}`}
                          className="btn btn-secondary btn-sm"
                        >
                          Edit
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {batches.length === 0 ? <p className="muted" style={{ marginTop: 12 }}>No batches match.</p> : null}
        </div>

        {pages > 1 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link className={`btn btn-secondary btn-sm${page <= 1 ? " opacity-40 pointer-events-none" : ""}`} href={hrefFor(page - 1)}>
              Prev
            </Link>
            <span className="muted">
              Page {page} of {pages}
            </span>
            <Link
              className={`btn btn-secondary btn-sm${page >= pages ? " opacity-40 pointer-events-none" : ""}`}
              href={hrefFor(page + 1)}
            >
              Next
            </Link>
          </div>
        ) : null}

        <div className="mt-4 stock-danger-zone">
          <ConfirmButton
            label="Wipe all stock"
            confirm="Delete ALL batches? This cannot be undone from Undo."
            action={wipeStock}
          />
        </div>
      </section>
    </div>
  );
}
