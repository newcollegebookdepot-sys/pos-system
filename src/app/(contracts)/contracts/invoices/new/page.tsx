import { ContractInvoiceComposer } from "@/components/contract-invoice-composer";
import { PageHeader } from "@/components/page-header";
import { getContract } from "@/lib/repo/contracts/contracts";

export const metadata = { title: "New contract invoice" };

export default async function NewContractInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const contractId = sp.contractId ? Number(sp.contractId) : undefined;
  const contract = contractId ? await getContract(contractId) : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title="New contract invoice"
        description="Pick office/head, add BOQ lines, save as draft."
      />
      <ContractInvoiceComposer
        today={today}
        presetContractId={contract?.id}
        presetOfficeName={contract?.officeName}
        presetFirmName={contract?.firmName}
        presetVendor={contract?.vendorNumber || ""}
        presetHead={contract?.contractHead}
      />
    </div>
  );
}
