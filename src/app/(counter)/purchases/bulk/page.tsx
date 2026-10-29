import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { requireManager } from "@/lib/auth";
import { bulkPurchaseAction } from "@/server/purchases";

export const metadata = { title: "Bulk purchase" };

export default async function BulkPurchasePage() {
  await requireManager();
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Bulk purchase + freight"
        description="Creates stock batches and supplier/freight payables. Does not post cash — pay later from Cash book."
      />
      <div className="card mt-4 p-5">
        <ActionForm
          action={bulkPurchaseAction}
          successMessage="Purchase completed"
        >
          <p className="text-sm font-semibold">+ Add seller (above search)</p>
          <input name="supplierName" className="field" placeholder="Seller name" required />
          <input name="supplierPhone" className="field" placeholder="Seller phone" />
          <input name="refNo" className="field" placeholder="Invoice / ref" />
          <input name="isoDate" type="date" className="field" defaultValue={new Date().toISOString().slice(0, 10)} />
          <hr className="border-line" />
          <p className="text-sm font-semibold">Line 1</p>
          <input name="name" className="field" placeholder="Item name" required />
          <input name="category" className="field" placeholder="Category" />
          <input name="qtyPcs" className="field" placeholder="Qty pcs" required />
          <input name="packSize" className="field" placeholder="Pack size" defaultValue="1" />
          <input name="buy" className="field" placeholder="Buy /pc" required />
          <input name="retail" className="field" placeholder="Sale /pc" required />
          <hr className="border-line" />
          <input name="freightTotal" className="field" placeholder="Total freight" defaultValue="0" />
          <input name="freightBillT" className="field" placeholder="Freight bill / T # (required if freight > 0)" />
          <button className="btn btn-primary" type="submit">
            Complete bulk purchase
          </button>
        </ActionForm>
        <p className="mt-3 text-sm">
          <a className="text-forest" href="/purchases/credit">
            Credit purchase →
          </a>
        </p>
      </div>
    </div>
  );
}
