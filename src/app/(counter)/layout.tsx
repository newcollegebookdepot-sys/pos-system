import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { readSettings } from "@/lib/repo/settings";

export default async function CounterLayout({ children }: { children: React.ReactNode }) {
  const settings = await readSettings();
  if (!settings) redirect("/setup");
  const user = await requireUser();
  return (
    <Shell settings={settings} user={user}>
      {children}
    </Shell>
  );
}
