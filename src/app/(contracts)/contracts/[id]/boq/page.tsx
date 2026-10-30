import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { formatMoney, moneyToInput } from "@/lib/money";
import { listBoq } from "@/lib/repo/contracts/boq";
import { getContract } from "@/lib/repo/contracts/contracts";
import { clearBoq, removeBoqItem, saveBoqItem, uploadBoq } from "@/server/contracts/boq";

export const metadata = { title: "BOQ rates" };

export default async function BoqPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  const contract = await getContract(id);
  if (!contract) notFound();
  const sp = await searchParams;
  const q = sp.q || "";
  const editId = sp.edit ? Number(sp.edit) : null;
  const items = await listBoq(id, q);
  const editing = editId ? items.find((b) => b.id === editId) : null;
  const nextSerial = items.reduce((m, b) => Math.max(m, b.serialNumber), 0) + 1;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="BOQ"
        description={`${contract.officeName} · ${contract.contractHead}`}
        actions={
          <Link href={`/contracts/${id}`} className="btn btn-secondary">
            Board
          </Link>
        }
      />

      <section className="box">
        <h2>{editing ? `Edit #${editing.serialNumber}` : "Add BOQ item"}</h2>
        <ActionForm action={saveBoqItem} resetOnSuccess={!editing} successMessage="Saved">
          <input type="hidden" name="contractId" value={id} />
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Serial</label>
              <input
                name="serialNumber"
                className="field"
                required
                defaultValue={editing?.serialNumber ?? nextSerial}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Item name</label>
              <input name="itemName" className="field" required defaultValue={editing?.itemName || ""} />
            </div>
            <div>
              <label className="label">Unit</label>
              <input name="unit" className="field" defaultValue={editing?.unit || ""} />
            </div>
            <div>
              <label className="label">Price</label>
              <input
                name="price"
                className="field"
                defaultValue={editing ? moneyToInput(editing.priceCents) : ""}
              />
            </div>
            <div>
              <label className="label">Comparative</label>
              <input
                name="comparative"
                className="field"
                required
                defaultValue={editing ? moneyToInput(editing.comparativeCents) : ""}
              />
            </div>
            <div>
              <label className="label">NCBD</label>
              <input
                name="ncbd"
                className="field"
                required
                defaultValue={editing ? moneyToInput(editing.ncbdCents) : ""}
              />
            </div>
            <div>
              <label className="label">Listed (Compr. Check)</label>
              <select name="listed" className="field" defaultValue={editing && !editing.comparativeListed ? "0" : "1"}>
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <input name="notes" className="field" defaultValue={editing?.notes || ""} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn btn-primary" type="submit">
              {editing ? "Update" : "Add item"}
            </button>
            {editing ? (
              <Link href={`/contracts/${id}/boq`} className="btn btn-secondary">
                Cancel
              </Link>
            ) : null}
          </div>
        </ActionForm>
      </section>

      <section className="box">
        <h2>Import Excel / CSV</h2>
        <p className="muted mb-2">S.No, Item, Unit, Price, Comparative, Check, NCBD</p>
        <ActionForm action={uploadBoq} successMessage="Imported">
          <input type="hidden" name="contractId" value={id} />
          <input
            type="file"
            name="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            required
            className="field"
          />
          <button className="btn btn-secondary btn-sm" type="submit">
            Upload
          </button>
        </ActionForm>
      </section>

      <section className="box">
        <h2>
          Rates ({items.length})
          <form action={`/contracts/${id}/boq`} method="get" className="flex gap-2">
            <input name="q" className="field" placeholder="Search…" defaultValue={q} style={{ minWidth: 160 }} />
            <button className="btn btn-secondary btn-sm" type="submit">
              Filter
            </button>
          </form>
        </h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Unit</th>
                <th className="right">Price</th>
                <th className="right">Comparative</th>
                <th className="right">NCBD</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id}>
                  <td className="mono">{b.serialNumber}</td>
                  <td>
                    {b.itemName}
                    {!b.comparativeListed ? <span className="badge badge-low">unlisted</span> : null}
                  </td>
                  <td>{b.unit || "—"}</td>
                  <td className="right mono">{formatMoney(b.priceCents)}</td>
                  <td className="right mono">{formatMoney(b.comparativeCents)}</td>
                  <td className="right mono">{formatMoney(b.ncbdCents)}</td>
                  <td className="right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/contracts/${id}/boq?edit=${b.id}`} className="btn btn-secondary btn-sm">
                        Edit
                      </Link>
                      <ConfirmButton
                        label="×"
                        confirm={`Remove #${b.serialNumber}?`}
                        action={removeBoqItem.bind(null, b.id, id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 ? <p className="muted">No BOQ items.</p> : null}
        </div>
        {items.length > 0 ? (
          <div className="mt-3">
            <ConfirmButton
              label="Clear entire BOQ"
              confirm="Delete all BOQ rates for this contract?"
              action={clearBoq.bind(null, id)}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
