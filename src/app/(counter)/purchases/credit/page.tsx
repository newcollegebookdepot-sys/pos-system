import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { requireManager } from "@/lib/auth";
import { creditPurchaseAction } from "@/server/purchases";

export const metadata = { title: "Credit purchase" };

export default async function CreditPurchasePage() {
  await requireManager();
  return (
    <div className="max-w-2xl">
      <PageHeader title="Credit purchase" description="Stock in + seller payable. Same buy cost restocks the batch." />
      <div className="card mt-4 p-5">
        <ActionForm action={creditPurchaseAction} successMessage="Completed">
          <input name="supplierName" className="field" placeholder="Seller name" required />
          <input name="supplierPhone" className="field" placeholder="Phone" />
          <input name="refNo" className="field" placeholder="Ref" />
          <input name="isoDate" type="date" className="field" defaultValue={new Date().toISOString().slice(0, 10)} />
          <input name="name" className="field" placeholder="Item" required />
          <input name="category" className="field" placeholder="Category" />
          <input name="qtyPcs" className="field" placeholder="Qty pcs" required />
          <input name="packSize" className="field" defaultValue="1" />
          <input name="buy" className="field" placeholder="Buy /pc" required />
          <input name="retail" className="field" placeholder="Sale /pc" required />
          <button className="btn btn-primary" type="submit">
            Complete credit purchase
          </button>
        </ActionForm>
      </div>
    </div>
  );
}
