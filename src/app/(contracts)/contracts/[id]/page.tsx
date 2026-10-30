import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { requireManager } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { listBoq } from "@/lib/repo/contracts/boq";
import { contractSummary, getContract, officeSummary } from "@/lib/repo/contracts/contracts";
import { listCtInvoices } from "@/lib/repo/contracts/invoices";
import { listPayments } from "@/lib/repo/contracts/payments";
import { removeContract, removePayment, savePayment } from "@/server/contracts/contracts";

export const metadata = { title: "Contract board" };

export default async function ContractBoardPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  const contract = await getContract(id);
  if (!contract) notFound();

  const summary = await contractSummary(id);
  const office = await officeSummary(contract.officeName);
  const invoices = await listCtInvoices({ contractId: id });
  const payments = await listPayments(id);
  const boq = await listBoq(id);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={`${contract.officeName} — ${contract.contractHead}`}
        description={`${contract.firmName}${contract.vendorNumber ? ` · Vendor ${contract.vendorNumber}` : ""} · ${contract.status}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/contracts/invoices/new?contractId=${id}`} className="btn btn-primary">
              New invoice
            </Link>
            <Link href={`/contracts/${id}/boq`} className="btn btn-secondary">
              BOQ ({boq.length})
            </Link>
            <Link href="/contracts/list" className="btn btn-secondary">
              All contracts
            </Link>
          </div>
        }
      />

      <div className="cards cash-sum">
        <article className="card cb-open">
          <p className="card-title">Due this head</p>
          <p className="card-value mono">{formatMoney(summary.dueThisHead)}</p>
          <p className="card-sub">Billed − received</p>
        </article>
        <article className="card cb-in">
          <p className="card-title">Billed comparative</p>
          <p className="card-value mono">{formatMoney(summary.billedTotal)}</p>
        </article>
        <article className="card cb-out">
          <p className="card-title">Unbilled / draft</p>
          <p className="card-value mono">{formatMoney(summary.unbilledTotal)}</p>
        </article>
        <article className="card cb-close">
          <p className="card-title">Received</p>
          <p className="card-value mono">{formatMoney(summary.receivedTotal)}</p>
        </article>
        <article className="card">
          <p className="card-title">Cash taken</p>
          <p className="card-value mono">{formatMoney(summary.cashTakenTotal)}</p>
          <p className="card-sub">Actual cash against alternate bills</p>
        </article>
        <article className="card">
          <p className="card-title">Alternate cash billed</p>
          <p className="card-value mono">{formatMoney(summary.cashAlternateBilledCompr)}</p>
          <p className="card-sub">Comparative stand-in total</p>
        </article>
      </div>

      <section className="box">
        <h2>Office roll-up · {office.officeName}</h2>
        <p className="muted">
          {office.heads} heads · billed {formatMoney(office.billedTotal)} · received{" "}
          {formatMoney(office.receivedTotal)} · due all heads {formatMoney(office.dueAllHeads)}
        </p>
      </section>

      <div className="grid-2">
        <section className="box">
          <h2>Invoices</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="right">Comparative</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="strong">{inv.invoiceNumber}</td>
                    <td>{inv.isoDate}</td>
                    <td>
                      <span className={`badge ${inv.status === "billed" ? "badge-paid" : "badge-partial"}`}>
                        {inv.status}
                      </span>
                      {inv.hasCashAlternate ? <span className="badge badge-low">cash alt</span> : null}
                    </td>
                    <td className="right mono">{formatMoney(inv.comparativeTotalCents)}</td>
                    <td className="right">
                      <Link href={`/contracts/invoices/${inv.id}`} className="btn btn-secondary btn-sm">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {invoices.length === 0 ? <p className="muted">No invoices yet.</p> : null}
          </div>
        </section>

        <section className="box">
          <h2>Payments</h2>
          <ActionForm action={savePayment} resetOnSuccess successMessage="Recorded" className="mb-4">
            <input type="hidden" name="contractId" value={id} />
            <div className="grid gap-2 sm:grid-cols-3">
              <input name="amount" className="field" placeholder="Amount" required />
              <input name="isoDate" type="date" className="field" defaultValue={today} required />
              <input name="notes" className="field" placeholder="Note" />
            </div>
            <button className="btn btn-primary btn-sm" type="submit">
              Record payment
            </button>
          </ActionForm>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="right">Amount</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.isoDate}</td>
                    <td className="right mono">{formatMoney(p.amountCents)}</td>
                    <td>{p.notes || "—"}</td>
                    <td className="right">
                      <ConfirmButton
                        label="×"
                        confirm="Delete this payment?"
                        action={removePayment.bind(null, p.id, id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payments.length === 0 ? <p className="muted">No payments.</p> : null}
          </div>
        </section>
      </div>

      <section className="box">
        <h2>
          Margin snapshot
          <span className="muted" style={{ fontWeight: 600 }}>
            Staff only — comparative vs NCBD
          </span>
        </h2>
        <p className="muted">
          Head billed margin {formatMoney(summary.head.billedMargin)} · Cash-alt billed margin{" "}
          {formatMoney(summary.cashAlternate.billedMargin)} · All entries {summary.entryCount}
        </p>
      </section>

      <div className="flex gap-2">
        <ConfirmButton
          label="Delete contract"
          confirm={`Delete ${contract.officeName} / ${contract.contractHead} and all BOQ, invoices, payments?`}
          action={removeContract.bind(null, id)}
        />
      </div>
    </div>
  );
}
