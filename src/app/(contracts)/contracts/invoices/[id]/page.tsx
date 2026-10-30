import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { ContractInvoiceComposer } from "@/components/contract-invoice-composer";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { comparativeSerialLabel } from "@/lib/domain/contracts";
import { formatMoney } from "@/lib/money";
import { getFirm } from "@/lib/repo/contracts/firms";
import { getContract } from "@/lib/repo/contracts/contracts";
import { getCtInvoice } from "@/lib/repo/contracts/invoices";
import { billCtInvoice, removeCtInvoice, unbillCtInvoice } from "@/server/contracts/invoices";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Contract invoice ${id}` };
}

export default async function ContractInvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; print?: string }>;
}) {
  const { id: raw } = await params;
  const sp = await searchParams;
  if (!/^\d+$/.test(raw)) notFound();
  const inv = await getCtInvoice(Number(raw));
  if (!inv) notFound();
  const contract = await getContract(inv.contractId);
  if (!contract) notFound();
  const firm = await getFirm(contract.firmId);
  const today = new Date().toISOString().slice(0, 10);
  const editing = sp.edit === "1";

  if (editing) {
    return (
      <div>
        <PageHeader
          title={`Edit invoice ${inv.invoiceNumber}`}
          description={`${inv.officeName} · ${inv.contractHead} · ${inv.status}`}
          actions={
            <Link href={`/contracts/invoices/${inv.id}`} className="btn btn-secondary">
              Cancel
            </Link>
          }
        />
        <ContractInvoiceComposer
          today={today}
          bootstrap={{
            invoiceId: inv.id,
            contractId: inv.contractId,
            officeName: inv.officeName || "",
            contractHead: inv.contractHead || "",
            firmName: inv.firmName || "",
            invoiceNumber: inv.invoiceNumber,
            isoDate: inv.isoDate,
            notes: inv.notes || "",
            status: inv.status,
            demandNo: inv.demandNo || "",
            entryKind: inv.entries[0]?.entryKind || "normal",
            cashTakenCents: inv.cashTakenCents,
            lines: inv.entries.map((e) => ({
              boqItemId: e.boqItemId,
              itemName: e.itemName,
              unit: e.unit || "",
              saleMode: e.saleMode,
              qty: e.qty,
              packetComparativeCents: e.packetComparativeCents ?? e.comparativeCents,
              packetNcbdCents: e.packetNcbdCents ?? e.ncbdCents,
              pcsPerPacket: e.pcsPerPacket,
              pcsSold: e.pcsSold,
              comparativeSerial: e.comparativeSerial,
              comparativeListed: e.comparativeListed,
              entryKind: e.entryKind,
              pickedQty: e.pickedQty,
              cashAltQty: e.cashAltQty,
              lineCashTakenCents: e.lineCashTakenCents,
            })),
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap gap-2">
        <PrintButton />
        <Link href={`/contracts/invoices/${inv.id}?edit=1`} className="btn btn-secondary">
          Edit
        </Link>
        {inv.status === "draft" ? (
          <ConfirmButton
            label="Mark billed"
            confirm="Mark this invoice billed? It will count toward dues."
            action={billCtInvoice.bind(null, inv.id)}
            tone="default"
          />
        ) : (
          <ConfirmButton
            label="Mark unbilled"
            confirm="Revert to draft / unbilled? It will leave billed dues."
            action={unbillCtInvoice.bind(null, inv.id)}
            tone="default"
          />
        )}
        <Link href={`/contracts/${inv.contractId}`} className="btn btn-secondary">
          Contract board
        </Link>
        <Link href="/contracts/invoices" className="btn btn-secondary">
          All invoices
        </Link>
        <ConfirmButton
          label="Delete"
          confirm={`Delete invoice ${inv.invoiceNumber}?`}
          action={removeCtInvoice.bind(null, inv.id)}
        />
      </div>

      {sp.print === "1" ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `setTimeout(()=>window.print(), 400);`,
          }}
        />
      ) : null}

      <section className="box no-print mb-4">
        <h2>
          Invoice {inv.invoiceNumber}
          <span className={`badge ${inv.status === "billed" ? "badge-paid" : "badge-partial"}`}>
            {inv.status}
          </span>
          {inv.hasCashAlternate ? <span className="badge badge-low">cash alternate</span> : null}
        </h2>
        <p className="muted">
          {inv.officeName} · {inv.contractHead} · {inv.firmName} · {inv.isoDate}
          {inv.demandNo ? ` · Demand ${inv.demandNo}` : ""}
        </p>
        <div className="cards" style={{ marginTop: 12 }}>
          <article className="card">
            <p className="card-title">Comparative (bill)</p>
            <p className="card-value mono">{formatMoney(inv.comparativeTotalCents)}</p>
          </article>
          <article className="card">
            <p className="card-title">NCBD (staff)</p>
            <p className="card-value mono">{formatMoney(inv.ncbdTotalCents)}</p>
          </article>
          <article className="card">
            <p className="card-title">Margin</p>
            <p className="card-value mono">
              {formatMoney(inv.comparativeTotalCents - inv.ncbdTotalCents)}
            </p>
          </article>
          {inv.hasCashAlternate || inv.cashTakenCents > 0 ? (
            <>
              <article className="card">
                <p className="card-title">Cash taken</p>
                <p className="card-value mono">{formatMoney(inv.cashTakenCents)}</p>
                <p className="card-sub">Actual cash they took</p>
              </article>
              <article className="card">
                <p className="card-title">Alternate cash billed</p>
                <p className="card-value mono">{formatMoney(inv.cashAlternateComparativeCents)}</p>
                <p className="card-sub">Comparative stand-in lines</p>
              </article>
            </>
          ) : null}
        </div>
      </section>

      <article className="inv-sheet" style={{ margin: "0 auto", padding: 16 }}>
        <div className="inv-head">
          <div className="inv-co">
            <h1>{firm?.legalName || firm?.name || inv.firmName}</h1>
            {firm?.address ? <p className="addr">{firm.address}</p> : null}
            <p className="sub">
              {[firm?.phone, firm?.email].filter(Boolean).join(" · ")}
              {firm?.vendorNumber ? ` · Vendor ${firm.vendorNumber}` : ""}
            </p>
          </div>
          <div className="inv-titlebox">
            <p className="ttl">INVOICE</p>
            <table className="inv-meta-table">
              <tbody>
                <tr>
                  <td>Invoice #</td>
                  <td>{inv.invoiceNumber}</td>
                </tr>
                <tr>
                  <td>Date</td>
                  <td>{inv.isoDate}</td>
                </tr>
                {inv.demandNo ? (
                  <tr>
                    <td>Demand #</td>
                    <td>{inv.demandNo}</td>
                  </tr>
                ) : null}
                <tr>
                  <td>Status</td>
                  <td>{inv.status}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="inv-parties">
          <div className="inv-box">
            <div className="lbl">Bill to</div>
            <div className="name">{inv.officeName}</div>
            <div className="detail">Contract head: {inv.contractHead}</div>
            {contract.contractNumber ? <div className="detail">Contract # {contract.contractNumber}</div> : null}
          </div>
          <div className="inv-box">
            <div className="lbl">From</div>
            <div className="name">{firm?.name || inv.firmName}</div>
            {firm?.bankName ? (
              <div className="detail">
                {firm.bankName}
                {firm.accountNumber ? ` · ${firm.accountNumber}` : ""}
              </div>
            ) : null}
            {firm?.branchName ? <div className="detail">{firm.branchName}</div> : null}
          </div>
        </div>

        <table className="inv-table ct-inv-print">
          <thead>
            <tr>
              <th className="c-no">#</th>
              <th className="c-desc">Description</th>
              <th className="c-unit">Unit</th>
              <th className="c-qty">Qty</th>
              <th className="c-rate">Rate</th>
              <th className="c-amt">Amount</th>
              <th className="c-serial">Comparative serial no.</th>
            </tr>
          </thead>
          <tbody>
            {inv.entries.map((e, i) => (
              <tr key={e.id}>
                <td className="c-no">{i + 1}</td>
                <td className="c-desc">
                  {e.itemName}
                  <span className="no-print" style={{ display: "block", fontSize: 10, color: "#64748b" }}>
                    picked {e.pickedQty}
                    {e.cashAltQty > 0 ? ` · cash alt ${e.cashAltQty}` : ""}
                    {e.lineCashTakenCents > 0 ? ` · cash ${formatMoney(e.lineCashTakenCents)}` : ""}
                  </span>
                </td>
                <td className="c-unit">{e.unit || "—"}</td>
                <td className="c-qty">{e.qty}</td>
                <td className="c-rate">{formatMoney(e.comparativeCents)}</td>
                <td className="c-amt">{formatMoney(e.comparativeTotalCents)}</td>
                <td className="c-serial">{comparativeSerialLabel(e.comparativeListed, e.comparativeSerial)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-payable" style={{ textAlign: "right", fontSize: 14, fontWeight: 800 }}>
          Total payable {formatMoney(inv.comparativeTotalCents)}
        </div>
        {inv.notes ? (
          <p style={{ marginTop: 12, fontSize: 11, color: "#64748b" }}>Notes: {inv.notes}</p>
        ) : null}
        <p className="no-print" style={{ marginTop: 16, fontSize: 11, color: "#94a3b8" }}>
          Print shows comparative rates only. NCBD {formatMoney(inv.ncbdTotalCents)} is staff-only.
          {inv.hasCashAlternate
            ? ` Cash taken ${formatMoney(inv.cashTakenCents)} · alternate billed ${formatMoney(inv.cashAlternateComparativeCents)}.`
            : ""}
        </p>
      </article>
    </div>
  );
}
