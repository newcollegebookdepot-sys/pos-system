import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { PeriodBar } from "@/components/ui/period-bar";
import { requireManager } from "@/lib/auth";
import { CUSTOMER_TYPES, WALK_IN_ID } from "@/lib/domain/ledger";
import { balText, formatMoney, moneyToInput } from "@/lib/money";
import { listCustomers } from "@/lib/repo/customers";
import { listReceipts } from "@/lib/repo/receipts";
import { periodFromSearch } from "@/lib/period";
import {
  addCustomer,
  doAdjustSurplus,
  doClearSalesHistory,
  doWriteOffDues,
  recordReceipt,
  removeCustomer,
  saveCustomer,
} from "@/server/customers";

export const metadata = { title: "Customers & ledger" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireManager();
  const sp = await searchParams;
  const period = periodFromSearch({ get: (k) => sp[k] ?? null });
  const q = sp.q || "";
  const type = sp.type || "";
  const duesOnly = sp.dues === "1";
  const page = Math.max(1, Number(sp.page || 1) || 1);
  const editId = sp.edit ? Number(sp.edit) : null;
  const pageSize = 40;
  const { customers: allCustomers, totalDues, totalSurplus, count } = await listCustomers({
    q,
    type: type || undefined,
    duesOnly,
  });
  const pages = Math.max(1, Math.ceil(allCustomers.length / pageSize));
  const customers = allCustomers.slice((page - 1) * pageSize, page * pageSize);
  const receipts = await listReceipts({ from: period.from, to: period.to, q });

  function hrefFor(nextPage: number, edit?: number | null) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    if (duesOnly) params.set("dues", "1");
    if (sp.period) params.set("period", sp.period);
    if (nextPage > 1) params.set("page", String(nextPage));
    if (edit) params.set("edit", String(edit));
    const s = params.toString();
    return s ? `/customers?${s}` : "/customers";
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Customers & ledger" description="Walk-in is always first. Balance > 0 = dues, < 0 = surplus." />
      <Suspense>
        <PeriodBar />
      </Suspense>
      <div className="cards">
        <Stat label="Accounts" value={String(count)} />
        <Stat label="Total dues" value={formatMoney(totalDues)} />
        <Stat label="Total surplus" value={formatMoney(totalSurplus)} />
      </div>

      <section className="card p-5">
        <h2 className="font-serif text-2xl">Register customer</h2>
        <div className="mt-4 max-w-xl">
          <ActionForm action={addCustomer} resetOnSuccess successMessage="Added">
            <input name="name" className="field" placeholder="Name" required />
            <input name="phone" className="field" placeholder="Phone" />
            <select name="type" className="field" defaultValue="Regular">
              {CUSTOMER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input name="opening" className="field" placeholder="Opening balance (+ dues / − surplus)" />
            <button className="btn btn-primary" type="submit">
              Register
            </button>
          </ActionForm>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-serif text-2xl">Cash receipt</h2>
        <div className="mt-4 max-w-xl">
          <ActionForm action={recordReceipt} resetOnSuccess successMessage="Received">
            <select name="customerId" className="field" required defaultValue="">
              <option value="" disabled>
                Customer
              </option>
              {allCustomers
                .filter((c) => c.id !== WALK_IN_ID)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {balText(c.balanceCents)}
                  </option>
                ))}
            </select>
            <input name="amount" className="field" placeholder="Amount" required />
            <select name="mode" className="field" defaultValue="Cash">
              <option value="Cash">Cash</option>
              <option value="Bank·Easypaisa">Bank·Easypaisa</option>
            </select>
            <input name="note" className="field" placeholder="Note" />
            <button className="btn btn-primary" type="submit">
              Receive
            </button>
          </ActionForm>
        </div>
      </section>

      <form method="get" className="flex flex-wrap gap-2">
        <input name="q" className="field max-w-xs" defaultValue={q} placeholder="Search name / phone" />
        <select name="type" className="field max-w-[10rem]" defaultValue={type}>
          <option value="">All types</option>
          {CUSTOMER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dues" value="1" defaultChecked={duesOnly} /> Dues only
        </label>
        <button className="btn btn-primary" type="submit">
          Filter
        </button>
      </form>

      <p className="muted">
        Showing {customers.length} of {allCustomers.length} · page {page}/{pages}
      </p>
      <ul className="space-y-3">
        {customers.map((c) => (
          <li key={c.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">
                  {c.name}{" "}
                  <span className="text-sm font-medium text-ink/50">
                    {c.type}
                    {c.id === WALK_IN_ID ? " · fixed" : ""}
                  </span>
                </h3>
                <p className="text-sm text-ink/60">
                  {c.phone} · {balText(c.balanceCents)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/customers/${c.id}`} className="btn btn-secondary btn-sm">
                  Ledger
                </Link>
                <Link href={hrefFor(page, c.id)} className="btn btn-secondary btn-sm">
                  Edit
                </Link>
                {c.id !== WALK_IN_ID ? (
                  <ConfirmButton
                    label="Delete"
                    confirm={`Delete ${c.name}?`}
                    action={removeCustomer.bind(null, c.id)}
                  />
                ) : null}
              </div>
            </div>
            {editId === c.id ? (
              <div className="mt-3 max-w-xl">
                <ActionForm action={saveCustomer} successMessage="Saved">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="name" className="field" defaultValue={c.name} disabled={c.id === WALK_IN_ID} required />
                  {c.id === WALK_IN_ID ? <input type="hidden" name="name" value={c.name} /> : null}
                  <input name="phone" className="field" defaultValue={c.phone} />
                  <select name="type" className="field" defaultValue={c.type}>
                    {CUSTOMER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input name="balance" className="field" defaultValue={moneyToInput(c.balanceCents)} />
                  <div className="flex gap-2">
                    <button className="btn btn-primary" type="submit">
                      Save
                    </button>
                    <Link href={hrefFor(page)} className="btn btn-secondary">
                      Close
                    </Link>
                  </div>
                </ActionForm>
                {c.balanceCents < 0 ? (
                  <div className="mt-3">
                    <ActionForm action={doAdjustSurplus} successMessage="Surplus updated">
                      <input type="hidden" name="customerId" value={c.id} />
                      <input
                        name="surplus"
                        className="field"
                        defaultValue={moneyToInput(Math.abs(c.balanceCents))}
                        placeholder="Remaining surplus"
                      />
                      <input name="note" className="field" placeholder="Note" />
                      <button className="btn btn-secondary" type="submit">
                        Adjust surplus
                      </button>
                    </ActionForm>
                  </div>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link className={`btn btn-secondary btn-sm${page <= 1 ? " pointer-events-none opacity-40" : ""}`} href={hrefFor(page - 1)}>
            Prev
          </Link>
          <span className="muted">
            Page {page} of {pages}
          </span>
          <Link
            className={`btn btn-secondary btn-sm${page >= pages ? " pointer-events-none opacity-40" : ""}`}
            href={hrefFor(page + 1)}
          >
            Next
          </Link>
        </div>
      ) : null}

      <section>
        <h2 className="font-serif text-2xl">Receipts ({period.label})</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-ink/60">
              <tr>
                <th className="py-2">#</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Mode</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-2">{r.receiptNumber}</td>
                  <td>{r.isoDate}</td>
                  <td>{r.customerName}</td>
                  <td>{r.mode}</td>
                  <td className="tabular-nums">{formatMoney(r.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <ConfirmButton
          label="Write off all dues"
          confirm="Zero all positive dues (surplus kept)?"
          action={doWriteOffDues}
        />
        <ConfirmButton
          label="Clear sales history"
          confirm="Remove invoices & receipts; keep customers and opening dues?"
          action={doClearSalesHistory}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="card">
      <p className="card-title">{label}</p>
      <p className="card-value mono">{value}</p>
    </article>
  );
}
