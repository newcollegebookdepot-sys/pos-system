import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { getCurrentUser } from "@/lib/auth";
import { readSettings } from "@/lib/repo/settings";
import { login } from "@/server/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const settings = await readSettings();
  if (!settings) redirect("/setup");
  const user = await getCurrentUser();
  if (user) redirect("/sell");

  return (
    <main className="login-shell">
      <div className="box login-card">
        <div className="shop-name" style={{ border: 0, marginBottom: 8, paddingBottom: 0 }}>
          {settings.shopName}
          <span>Point of sale</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 16 }}>Sign in</h1>
        <ActionForm action={login}>
          <div>
            <label className="label" htmlFor="username">
              Username
            </label>
            <input id="username" name="username" className="field" required autoComplete="username" spellCheck={false} />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input id="password" name="password" type="password" className="field" required autoComplete="current-password" />
          </div>
          <button className="btn btn-primary btn-block" type="submit">
            Sign in
          </button>
        </ActionForm>
      </div>
    </main>
  );
}
