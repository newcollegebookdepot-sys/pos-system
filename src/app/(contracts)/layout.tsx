import { redirect } from "next/navigation";
import { ContractsShell } from "@/components/contracts-shell";
import { requireManager } from "@/lib/auth";
import { readSettings } from "@/lib/repo/settings";

export default async function ContractsModuleLayout({ children }: { children: React.ReactNode }) {
  const settings = await readSettings();
  if (!settings) redirect("/setup");
  const user = await requireManager();
  return (
    <ContractsShell settings={settings} user={user}>
      {children}
    </ContractsShell>
  );
}
