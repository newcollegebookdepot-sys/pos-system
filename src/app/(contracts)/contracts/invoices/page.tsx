import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireManager } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { listCtInvoices } from "@/lib/repo/contracts/invoices";

export const metadata = { title: "Contract invoices" };

export default async function ContractInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireManager();
  const sp = await searchParams;
  const status = sp.status === "draft" || sp.status === "billed" ? sp.status : undefined;
  const invoices = await listCtInvoices({ status });

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Draft and billed comparative invoices."
        actions={
          <Link href="/contracts/invoices/new" className="btn btn-primary">
            Compose
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/contracts/invoices" className={`btn btn-sm ${!status ? "btn-primary" : "btn-secondary"}`}>
          All
        </Link>
        <Link
          href="/contracts/invoices?status=draft"
          className={`btn btn-sm ${status === "draft" ? "btn-primary" : "btn-secondary"}`}
        >
          Drafts
        </Link>
        <Link
          href="/contracts/invoices?status=billed"
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
                <th>Office</th>
                <th>Head</th>
                <th>Firm</th>
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
                  <td>{inv.officeName}</td>
                  <td>{inv.contractHead}</td>
                  <td>{inv.firmName}</td>
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
          {invoices.length === 0 ? <p className="muted">No invoices.</p> : null}
        </div>
      </section>
    </div>
  );
}
