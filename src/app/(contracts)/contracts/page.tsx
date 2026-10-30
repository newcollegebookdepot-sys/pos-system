import Link from "next/link";
import { contractsDashboardStats } from "@/lib/repo/contracts/contracts";

export const metadata = { title: "Contracts" };

export default async function ContractsDashboardPage() {
  const stats = await contractsDashboardStats();

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Overview</h1>
        </div>
        <div className="topbar-actions">
          <Link href="/contracts/invoices/new" className="btn btn-primary">
            Compose
          </Link>
        </div>
      </div>

      <div className="ct-stat-row">
        <div className="ct-stat">
          <p className="k">Firms</p>
          <p className="v mono">{stats.firms}</p>
        </div>
        <div className="ct-stat">
          <p className="k">Contracts</p>
          <p className="v mono">{stats.contracts}</p>
        </div>
        <div className="ct-stat">
          <p className="k">BOQ items</p>
          <p className="v mono">{stats.boqItems}</p>
        </div>
      </div>

      <div className="ct-hub-grid">
        <Link href="/contracts/invoices/new" className="ct-hub-tile">
          <span className="k">Invoice</span>
          <span className="t">Compose</span>
        </Link>
        <Link href="/contracts/list" className="ct-hub-tile">
          <span className="k">Browse</span>
          <span className="t">Offices</span>
        </Link>
        <Link href="/contracts/firms" className="ct-hub-tile">
          <span className="k">Setup</span>
          <span className="t">Firms</span>
        </Link>
      </div>

      <section className="box">
        <h2>
          Recent
          <Link href="/contracts/list" className="btn btn-secondary btn-sm">
            All
          </Link>
        </h2>
        {stats.recent.length === 0 ? (
          <p className="muted">No contracts yet. Add a firm, then an office/head.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Office</th>
                  <th>Head</th>
                  <th>Firm</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((c) => (
                  <tr key={c.id}>
                    <td>{c.officeName}</td>
                    <td className="strong">{c.contractHead}</td>
                    <td>{c.firmName}</td>
                    <td>
                      <span className="badge badge-ok">{c.status}</span>
                    </td>
                    <td className="right">
                      <Link href={`/contracts/${c.id}`} className="btn btn-secondary btn-sm">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
