import Link from "next/link";
import { ContractInvoiceRowActions } from "@/components/contract-invoice-row-actions";
import { ContractOfficesFilter } from "@/components/contract-offices-filter";
import { PageHeader } from "@/components/page-header";
import { requireManager } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { listCtInvoices, listOfficesForInvoices } from "@/lib/repo/contracts/invoices";

export const metadata = { title: "Contract invoices" };

export default async function ContractInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireManager();
  const sp = await searchParams;
  const office = sp.office?.trim() || "";
  const status = sp.status === "draft" || sp.status === "billed" ? sp.status : undefined;

  if (!office) {
    const offices = await listOfficesForInvoices();
    return (
      <div>
        <PageHeader
          title="Invoices"
          description="Pick an office to view and manage its comparative invoices."
          actions={
            <Link href="/contracts/invoices/new" className="btn btn-primary">
              Compose
            </Link>
          }
        />
        <section className="box">
          <h2>Offices</h2>
          <ContractOfficesFilter offices={offices} />
        </section>
      </div>
    );
  }

  const invoices = await listCtInvoices({ officeName: office, status });
  const statusQs = status ? `&status=${status}` : "";

  return (
    <div>
      <PageHeader
        title={office}
        description="Edit lines, mark billed/unbilled, track picked vs cash-alternate."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/contracts/invoices" className="btn btn-secondary">
              All offices
            </Link>
            <Link
              href={`/contracts/invoices/new`}
              className="btn btn-primary"
            >
              Compose
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={`/contracts/invoices?office=${encodeURIComponent(office)}`}
          className={`btn btn-sm ${!status ? "btn-primary" : "btn-secondary"}`}
        >
          All
        </Link>
        <Link
          href={`/contracts/invoices?office=${encodeURIComponent(office)}&status=draft`}
          className={`btn btn-sm ${status === "draft" ? "btn-primary" : "btn-secondary"}`}
        >
          Drafts
        </Link>
        <Link
          href={`/contracts/invoices?office=${encodeURIComponent(office)}&status=billed`}
          className={`btn btn-sm ${status === "billed" ? "btn-primary" : "btn-secondary"}`}
        >
          Billed
        </Link>
      </div>

      <section className="box">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Head</th>
                <th>Firm</th>
                <th>Status</th>
                <th className="right">Comparative</th>
                <th className="right">Cash taken</th>
                <th className="right">Alternate billed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="strong">{inv.invoiceNumber}</td>
                  <td>{inv.isoDate}</td>
                  <td>{inv.contractHead}</td>
                  <td>{inv.firmName}</td>
                  <td>
                    <span className={`badge ${inv.status === "billed" ? "badge-paid" : "badge-partial"}`}>
                      {inv.status}
                    </span>
                    {inv.hasCashAlternate ? <span className="badge badge-low">cash alt</span> : null}
                  </td>
                  <td className="right mono">{formatMoney(inv.comparativeTotalCents)}</td>
                  <td className="right mono">
                    {inv.cashTakenCents > 0 ? formatMoney(inv.cashTakenCents) : "—"}
                  </td>
                  <td className="right mono">
                    {inv.cashAlternateComparativeCents > 0
                      ? formatMoney(inv.cashAlternateComparativeCents)
                      : "—"}
                  </td>
                  <td className="right">
                    <ContractInvoiceRowActions invoiceId={inv.id} status={inv.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 ? (
            <p className="muted">
              No invoices{status ? ` (${status})` : ""}.{statusQs ? "" : ""}{" "}
              <Link href="/contracts/invoices/new">Compose one</Link>.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
