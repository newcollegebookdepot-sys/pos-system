import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { requireManager } from "@/lib/auth";
import { CT_CONTRACT_STATUSES } from "@/lib/domain/contracts";
import { listContracts } from "@/lib/repo/contracts/contracts";
import { listFirms } from "@/lib/repo/contracts/firms";
import { saveContract } from "@/server/contracts/contracts";

export const metadata = { title: "Contracts list" };

export default async function ContractsListPage() {
  await requireManager();
  const contracts = await listContracts();
  const firms = await listFirms(true);

  const groups: { officeName: string; firmName: string; contracts: typeof contracts }[] = [];
  for (const c of contracts) {
    const last = groups[groups.length - 1];
    if (!last || last.officeName !== c.officeName) {
      groups.push({ officeName: c.officeName, firmName: c.firmName, contracts: [c] });
    } else {
      last.contracts.push(c);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Offices & heads"
        description="Each contract is an office name plus a contract head under one firm."
      />

      <section className="box">
        <h2>New contract</h2>
        {firms.length === 0 ? (
          <p className="muted">
            Register a <Link href="/contracts/firms">firm</Link> first.
          </p>
        ) : (
          <ActionForm action={saveContract} resetOnSuccess successMessage="Created">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Firm</label>
                <select name="firmId" className="field" required defaultValue="">
                  <option value="" disabled>
                    Select firm
                  </option>
                  {firms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select name="status" className="field" defaultValue="active">
                  {CT_CONTRACT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Office name</label>
                <input name="officeName" className="field" required placeholder="e.g. DG Health" />
              </div>
              <div>
                <label className="label">Contract head</label>
                <input name="contractHead" className="field" required placeholder="e.g. Stationery 2025-26" />
              </div>
              <div>
                <label className="label">Contract #</label>
                <input name="contractNumber" className="field" />
              </div>
              <div>
                <label className="label">Start</label>
                <input name="startDate" type="date" className="field" />
              </div>
              <div>
                <label className="label">End</label>
                <input name="endDate" type="date" className="field" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Notes</label>
                <input name="notes" className="field" />
              </div>
            </div>
            <button className="btn btn-primary" type="submit">
              Create contract
            </button>
          </ActionForm>
        )}
      </section>

      {groups.map((g) => (
        <section key={g.officeName} className="box">
          <h2>
            {g.officeName}
            <span className="muted" style={{ fontWeight: 600 }}>
              {g.firmName}
            </span>
          </h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Head</th>
                  <th>Contract #</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {g.contracts.map((c) => (
                  <tr key={c.id}>
                    <td className="strong">{c.contractHead}</td>
                    <td>{c.contractNumber || "—"}</td>
                    <td>
                      <span className="badge badge-ok">{c.status}</span>
                    </td>
                    <td className="right">
                      <Link href={`/contracts/${c.id}`} className="btn btn-primary btn-sm">
                        Board
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {groups.length === 0 ? <p className="muted">No contracts yet.</p> : null}
    </div>
  );
}
