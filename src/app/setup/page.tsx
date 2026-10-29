import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { getCurrentUser } from "@/lib/auth";
import { readSettings } from "@/lib/repo/settings";
import { setupShop } from "@/server/auth";

export const metadata = { title: "Set up" };

export default async function SetupPage() {
  const settings = await readSettings();
  if (settings) {
    const user = await getCurrentUser();
    redirect(user ? (user.role === "manager" ? "/dashboard" : "/sell") : "/login");
  }

  return (
    <main className="login-shell">
      <div className="box login-card" style={{ width: "min(520px, 100%)" }}>
      <p className="label">Stationery counter</p>
      <h1 style={{ fontSize: 26, fontWeight: 900, margin: "6px 0 8px" }}>Set up this shop</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        This stays on this computer. You will be the manager, and you can add cashiers after this.
      </p>
      <div>
        <ActionForm action={setupShop}>
          <div>
            <label className="label" htmlFor="shopName">
              Shop name
            </label>
            <input id="shopName" name="shopName" className="field" required maxLength={80} autoComplete="organization" />
          </div>
          <div>
            <label className="label" htmlFor="currencySymbol">
              Currency symbol
            </label>
            <input
              id="currencySymbol"
              name="currencySymbol"
              className="field"
              required
              maxLength={8}
              placeholder="Rs."
              defaultValue="Rs."
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label" htmlFor="address">
              Address
            </label>
            <input id="address" name="address" className="field" maxLength={160} placeholder="Gilgit Business Center, Jutial" />
          </div>
          <div>
            <label className="label" htmlFor="phone">
              Phone
            </label>
            <input id="phone" name="phone" className="field" maxLength={40} placeholder="+92 355 4271173" />
          </div>
          <div>
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input id="name" name="name" className="field" required maxLength={80} autoComplete="name" />
          </div>
          <div>
            <label className="label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              name="username"
              className="field"
              required
              minLength={3}
              maxLength={32}
              autoComplete="username"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="field"
              required
              minLength={4}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label" htmlFor="confirmPassword">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              className="field"
              required
              minLength={4}
              autoComplete="new-password"
            />
          </div>
          <button className="btn btn-primary btn-block" type="submit">
            Create the counter
          </button>
        </ActionForm>
      </div>
      </div>
    </main>
  );
}
