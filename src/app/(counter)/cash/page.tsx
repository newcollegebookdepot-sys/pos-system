import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { PeriodBar } from "@/components/ui/period-bar";
import { periodFromSearch } from "@/lib/period";
import { requireManager } from "@/lib/auth";
import { CASH_TYPE_META, type CashEntryType } from "@/lib/domain/cashbook";
import { formatMoney, moneyToInput } from "@/lib/money";
import { arrivalCards, listArrivals } from "@/lib/repo/arrivals";
import { computeCashBook, getOpening, openingKeyForPeriodStart } from "@/lib/repo/cashbook";
import { listPayables } from "@/lib/repo/payables";
import {
  addBorrow,
  addEntry,
  addSellerBill,
  advanceBillT,
  clearOpeningAction,
  completeBillT,
  payBill,
  reachBillT,
  removeArrivalAction,
  removeEntry,
  removePayableAction,
  saveOpening,
} from "@/server/cash";

export const metadata = { title: "Cash book & expenses" };

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireManager();
  const sp = await searchParams;
  const period = periodFromSearch({ get: (k) => sp[k] ?? null });
  const type = sp.type || "";
  const book = await computeCashBook(period.from, period.to);
  const entries = type ? book.entries.filter((e) => e.type === type) : book.entries;
  const openKey = openingKeyForPeriodStart(period.from);
  const openingAmt = await getOpening(openKey);
  const { payables, totalDue } = await listPayables(sp.seller || "");
  const arrivals = await listArrivals();
  const cards = await arrivalCards();

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Cash book & expenses"
        description="Opening + sales paid + receipts + cash in − purchases/freight/rent/meal/zakat/other/outs/payable pays."
      />
      <Suspense>
        <PeriodBar />
      </Suspense>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Opening" value={formatMoney(book.opening)} />
        <Stat label="Cash in" value={formatMoney(book.totalIn)} />
        <Stat label="Cash out" value={formatMoney(book.totalOut)} />
        <Stat label="Live closing" value={formatMoney(book.closing)} />
      </div>
      <p className="text-sm text-ink/60">
        Auto inflows — sales paid {formatMoney(book.salesPaidCents)} · receipts {formatMoney(book.receiptsCents)}
      </p>

      <section className="card p-5">
        <h2 className="font-serif text-2xl">Opening balance</h2>
        <p className="mt-1 text-sm text-ink/60">Key for this period: {openKey}</p>
        <div className="mt-3 max-w-md">
          <ActionForm action={saveOpening} successMessage="Saved">
            <input name="month" className="field" defaultValue={openKey} placeholder="YYYY-MM or all" />
            <input name="amount" className="field" defaultValue={moneyToInput(openingAmt)} required />
            <button className="btn btn-primary" type="submit">
              Save opening
            </button>
          </ActionForm>
          <div className="mt-2">
            <ConfirmButton label="Clear opening" confirm="Clear this opening?" action={clearOpeningAction.bind(null, openKey)} />
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-serif text-2xl">Manual entry</h2>
        <div className="mt-3 max-w-xl">
          <ActionForm action={addEntry} resetOnSuccess successMessage="Added">
            <select name="type" className="field" defaultValue="cash_in">
              {(Object.keys(CASH_TYPE_META) as CashEntryType[]).map((t) => (
                <option key={t} value={t}>
                  {CASH_TYPE_META[t].label}
                </option>
              ))}
            </select>
            <input name="isoDate" type="date" className="field" defaultValue={new Date().toISOString().slice(0, 10)} />
            <input name="amount" className="field" placeholder="Amount" required />
            <input name="description" className="field" placeholder="Description" required />
            <input name="rentMonth" className="field" placeholder="Rent month YYYY-MM (if rent)" />
            <button className="btn btn-primary" type="submit">
              Add entry
            </button>
          </ActionForm>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <a href="?period=today" className="sr-only">
          period
        </a>
        {(Object.keys(CASH_TYPE_META) as CashEntryType[]).map((t) => (
          <a
            key={t}
            href={`?period=${sp.period || "today"}&type=${t}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold no-underline ${type === t ? "bg-forest text-white" : "bg-ink/5 text-ink"}`}
          >
            {CASH_TYPE_META[t].label}
          </a>
        ))}
        <a href={`?period=${sp.period || "today"}`} className="rounded-lg bg-ink/5 px-3 py-1.5 text-sm font-semibold text-ink no-underline">
          All types
        </a>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-ink/60">
            <tr>
              <th className="py-2">Date</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Detail</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="py-2">{e.isoDate}</td>
                <td>{CASH_TYPE_META[e.type]?.label || e.type}</td>
                <td className="tabular-nums">{formatMoney(e.amountCents)}</td>
                <td>
                  {e.description}
                  {e.auto ? " · Auto" : ""}
                  {e.seller ? ` · ${e.seller}` : ""}
                </td>
                <td>
                  <ConfirmButton label="Del" confirm="Delete cash entry?" action={removeEntry.bind(null, e.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card p-5">
        <h2 className="font-serif text-2xl">Payables</h2>
        <p className="text-sm text-ink/60">Total due {formatMoney(totalDue)}</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <ActionForm action={addSellerBill} resetOnSuccess successMessage="Added">
            <p className="text-sm font-semibold">+ Seller bill</p>
            <input name="party" className="field" placeholder="Seller" required />
            <input name="amount" className="field" placeholder="Amount" required />
            <input name="description" className="field" placeholder="Note" />
            <button className="btn btn-primary" type="submit">
              Add seller bill
            </button>
          </ActionForm>
          <ActionForm action={addBorrow} resetOnSuccess successMessage="Added">
            <p className="text-sm font-semibold">+ Borrow/loan</p>
            <input name="party" className="field" placeholder="Party" required />
            <input name="amount" className="field" placeholder="Amount" required />
            <input name="description" className="field" placeholder="Note" />
            <button className="btn btn-primary" type="submit">
              Add borrow
            </button>
          </ActionForm>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-ink/60">
              <tr>
                <th className="py-2">Date</th>
                <th>Kind</th>
                <th>Party</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Due</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {payables.map((p) => (
                <tr key={p.id} className="border-t border-line align-top">
                  <td className="py-2">{p.isoDate}</td>
                  <td>{p.kind}</td>
                  <td>{p.partyName}</td>
                  <td className="tabular-nums">{formatMoney(p.totalCents)}</td>
                  <td className="tabular-nums">{formatMoney(p.paidCents)}</td>
                  <td className="tabular-nums">{formatMoney(p.unpaidCents)}</td>
                  <td className="space-y-2">
                    {p.unpaidCents > 0 ? (
                      <ActionForm action={payBill} successMessage="Paid">
                        <input type="hidden" name="payableId" value={p.id} />
                        <input name="amount" className="field" defaultValue={moneyToInput(p.unpaidCents)} />
                        <button className="btn btn-primary" type="submit">
                          Pay
                        </button>
                      </ActionForm>
                    ) : null}
                    <ConfirmButton label="Del" confirm="Delete payable?" action={removePayableAction.bind(null, p.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-serif text-2xl">To be arrived (Bill T)</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-4">
          <Stat label="Awaiting stock" value={String(cards.awaiting)} />
          <Stat label="Advance tied up" value={formatMoney(cards.advanceTied)} />
          <Stat label="Bill T to pay" value={formatMoney(cards.billTToPay)} />
          <Stat label="Records" value={String(cards.records)} />
        </div>
        <div className="mt-4 max-w-xl">
          <ActionForm action={advanceBillT} resetOnSuccess successMessage="Advance posted">
            <p className="text-sm font-semibold">+ Advance to seller</p>
            <input name="seller" className="field" placeholder="Seller" required />
            <input name="amount" className="field" placeholder="Advance amount" required />
            <input name="billTNo" className="field" placeholder="Bill T # (optional)" />
            <input name="note" className="field" placeholder="Note" />
            <button className="btn btn-primary" type="submit">
              Post advance
            </button>
          </ActionForm>
        </div>
        <ul className="mt-4 space-y-3">
          {arrivals.map((a) => (
            <li key={a.id} className="rounded-xl border border-line p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {a.sellerName} · {a.status}
                  </p>
                  <p className="text-ink/60">
                    Advance {formatMoney(a.advanceCents)}
                    {a.billTNo ? ` · Bill T ${a.billTNo}` : ""}
                    {a.billTAmountCents ? ` · Amt ${formatMoney(a.billTAmountCents)}` : ""}
                    {a.billTPaidCents ? ` · Paid ${formatMoney(a.billTPaidCents)}` : ""}
                  </p>
                </div>
                <ConfirmButton label="Del" confirm="Delete arrival record?" action={removeArrivalAction.bind(null, a.id)} />
              </div>
              {a.status === "pending" ? (
                <div className="mt-2 max-w-md">
                  <ActionForm action={reachBillT} successMessage="Reached">
                    <input type="hidden" name="id" value={a.id} />
                    <input name="billTNo" className="field" placeholder="Bill T #" required />
                    <input name="amount" className="field" placeholder="Bill T amount" required />
                    <input name="reachedDate" type="date" className="field" defaultValue={new Date().toISOString().slice(0, 10)} />
                    <button className="btn btn-primary" type="submit">
                      Reached
                    </button>
                  </ActionForm>
                </div>
              ) : null}
              {a.status === "reached" ? (
                <div className="mt-2 max-w-md">
                  <ActionForm action={completeBillT} successMessage="Paid">
                    <input type="hidden" name="id" value={a.id} />
                    <input
                      name="amount"
                      className="field"
                      defaultValue={moneyToInput(a.billTAmountCents - a.billTPaidCents)}
                      required
                    />
                    <button className="btn btn-primary" type="submit">
                      Complete / pay
                    </button>
                  </ActionForm>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
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
