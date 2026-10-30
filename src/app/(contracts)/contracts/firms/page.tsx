import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { listFirms } from "@/lib/repo/contracts/firms";
import { removeFirm, saveFirm } from "@/server/contracts/firms";

export const metadata = { title: "Firms" };

export default async function FirmsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const editId = sp.edit ? Number(sp.edit) : null;
  const firms = await listFirms();
  const editing = editId ? firms.find((f) => f.id === editId) : null;

  return (
    <div className="grid gap-6">
      <PageHeader title="Firms" description="Trading entities that hold office contracts." />

      <section className="box">
        <h2>{editing ? `Edit ${editing.name}` : "Register firm"}</h2>
        <ActionForm action={saveFirm} resetOnSuccess={!editing} successMessage="Saved">
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Name</label>
              <input name="name" className="field" required defaultValue={editing?.name || ""} />
            </div>
            <div>
              <label className="label">Legal name</label>
              <input name="legalName" className="field" defaultValue={editing?.legalName || ""} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <input name="address" className="field" defaultValue={editing?.address || ""} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input name="phone" className="field" defaultValue={editing?.phone || ""} />
            </div>
            <div>
              <label className="label">Email</label>
              <input name="email" className="field" defaultValue={editing?.email || ""} />
            </div>
            <div>
              <label className="label">Vendor #</label>
              <input name="vendorNumber" className="field" defaultValue={editing?.vendorNumber || ""} />
            </div>
            <div>
              <label className="label">GSTIN</label>
              <input name="gstin" className="field" defaultValue={editing?.gstin || ""} />
            </div>
            <div>
              <label className="label">Bank</label>
              <input name="bankName" className="field" defaultValue={editing?.bankName || ""} />
            </div>
            <div>
              <label className="label">Account holder</label>
              <input name="accountHolder" className="field" defaultValue={editing?.accountHolder || ""} />
            </div>
            <div>
              <label className="label">Account #</label>
              <input name="accountNumber" className="field" defaultValue={editing?.accountNumber || ""} />
            </div>
            <div>
              <label className="label">Branch</label>
              <input name="branchName" className="field" defaultValue={editing?.branchName || ""} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <input name="notes" className="field" defaultValue={editing?.notes || ""} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" type="submit">
              {editing ? "Update firm" : "Create firm"}
            </button>
            {editing ? (
              <Link href="/contracts/firms" className="btn btn-secondary">
                Cancel
              </Link>
            ) : null}
          </div>
        </ActionForm>
      </section>

      <section className="box">
        <h2>Directory</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Vendor</th>
                <th>Phone</th>
                <th>Bank</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {firms.map((f) => (
                <tr key={f.id}>
                  <td className="strong">
                    {f.name}
                    {!f.active ? <span className="badge badge-low">inactive</span> : null}
                  </td>
                  <td>{f.vendorNumber || "—"}</td>
                  <td>{f.phone || "—"}</td>
                  <td>{f.bankName || "—"}</td>
                  <td className="right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/contracts/firms?edit=${f.id}`} className="btn btn-secondary btn-sm">
                        Edit
                      </Link>
                      <ConfirmButton label="Delete" confirm={`Delete ${f.name}?`} action={removeFirm.bind(null, f.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {firms.length === 0 ? <p className="muted">No firms yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
