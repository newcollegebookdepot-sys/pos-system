import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { readSettings } from "@/lib/repo/settings";

export default async function HomePage() {
  const settings = await readSettings();
  if (!settings) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(user.role === "manager" ? "/dashboard" : "/sell");
}
