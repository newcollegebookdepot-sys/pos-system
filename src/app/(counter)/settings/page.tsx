import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { BackupPanel } from "@/components/backup-panel";
import { PageHeader } from "@/components/page-header";
import { requireManager } from "@/lib/auth";
import { listOperators, readSettings } from "@/lib/repo/settings";
import { saveShopSettings } from "@/server/settings";
import { factoryReset } from "@/server/backup";
import { addOperatorAction } from "@/server/operators";
import { redirect } from "next/navigation";

export const metadata = { title: "Backup & settings" };

export default async function SettingsPage() {
  await requireManager();
  const settings = await readSettings();
  if (!settings) redirect("/setup");
  const operators = await listOperators();

  return (
    <div className="grid max-w-2xl gap-6">
      <PageHeader title="Backup & settings" description="Shop profile, operators, backup/restore, and danger ops." />
      <div className="card p-5">
        <ActionForm action={saveShopSettings} successMessage="Saved">
          <label className="label" htmlFor="shopName">
            Shop name
          </label>
          <input id="shopName" name="shopName" className="field" defaultValue={settings.shopName} required />
          <label className="label" htmlFor="address">
            Address
          </label>
          <input id="address" name="address" className="field" defaultValue={settings.address} />
          <label className="label" htmlFor="phone">
            Phone
          </label>
          <input id="phone" name="phone" className="field" defaultValue={settings.phone} />
          <label className="label" htmlFor="currencySymbol">
            Currency
          </label>
          <input id="currencySymbol" name="currencySymbol" className="field" defaultValue={settings.currencySymbol || "Rs."} />
          <label className="label" htmlFor="lowStockThreshold">
            Low stock threshold (pcs)
          </label>
          <input id="lowStockThreshold" name="lowStockThreshold" className="field" defaultValue={settings.lowStockThreshold} />
          <label className="label" htmlFor="printTerms">
            Print terms
          </label>
          <input id="printTerms" name="printTerms" className="field" defaultValue={settings.printTerms} />
          <button className="btn btn-primary" type="submit">
            Save settings
          </button>
        </ActionForm>
      </div>

      <div className="card p-5">
        <h2 className="font-serif text-2xl">Operators</h2>
        <ul className="mt-2 text-sm">
          {operators.map((o) => (
            <li key={o.id}>
              {o.name} {o.active ? "" : "(inactive)"}
            </li>
          ))}
        </ul>
        <form className="mt-3 flex gap-2" action={addOperatorAction}>
          <input name="name" className="field" placeholder="Add operator name" required />
          <button className="btn btn-primary" type="submit">
            Add
          </button>
        </form>
      </div>

      <BackupPanel />

      <div className="card p-5">
        <h2 className="font-serif text-2xl text-stamp">Danger</h2>
        <p className="mt-2 text-sm text-ink/70">Keeps logins and shop settings. Clears stock, sales, cash, customers (except Walk-in).</p>
        <div className="mt-3">
          <ConfirmButton
            label="Factory reset"
            confirm="Factory reset this shop database?"
            action={factoryReset}
          />
        </div>
      </div>
    </div>
  );
}
