import { PosScreen } from "@/components/pos-screen";
import { requireUser } from "@/lib/auth";
import { getCustomer } from "@/lib/repo/customers";
import { WALK_IN_ID } from "@/lib/domain/ledger";
import { redirect } from "next/navigation";

export const metadata = { title: "New sale" };

export default async function SellPage({
  searchParams,
}: {
  searchParams: Promise<{ drafts?: string }>;
}) {
  await requireUser();
  const walkIn = await getCustomer(WALK_IN_ID);
  if (!walkIn) redirect("/setup");
  const sp = await searchParams;
  return <PosScreen walkIn={walkIn} showDrafts={sp.drafts === "1"} />;
}
