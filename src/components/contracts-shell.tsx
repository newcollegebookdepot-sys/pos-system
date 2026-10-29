import Link from "next/link";
import { ContractsNav } from "@/components/contracts-nav";
import { LiveClock } from "@/components/ui/live-clock";
import { ToastProvider } from "@/components/ui/toast";
import { logout } from "@/server/auth";
import type { PublicUser, Settings } from "@/lib/types";

const LINKS = [
  { href: "/contracts", label: "Overview", match: "exact" as const },
  { href: "/contracts/list", label: "Offices & heads", match: "prefix" as const },
  { href: "/contracts/invoices", label: "Invoices", match: "invoices" as const },
  { href: "/contracts/invoices/new", label: "Compose invoice", match: "exact" as const },
  { href: "/contracts/firms", label: "Firms", match: "prefix" as const },
];

export function ContractsShell({
  settings,
  user,
  children,
}: {
  settings: Settings;
  user: PublicUser;
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="ct-shell">
        <aside className="ct-sidebar no-print">
          <div className="ct-brand">
            <p className="ct-brand-kicker">Module</p>
            <Link href="/contracts" className="ct-brand-title">
              Office contracts
            </Link>
            <p className="ct-brand-sub">{settings.shopName}</p>
          </div>

          <ContractsNav links={LINKS} />

          <div className="ct-side-foot">
            <LiveClock />
            <div className="ct-user">
              <strong>{user.name}</strong>
              <span>Manager</span>
            </div>
            <Link href="/dashboard" className="ct-back">
              ← Back to retail POS
            </Link>
            <form action={logout}>
              <button className="btn btn-secondary btn-block btn-sm" type="submit">
                Log out
              </button>
            </form>
          </div>
        </aside>

        <div className="ct-main">
          <header className="ct-module-bar no-print">
            <div>
              <p className="ct-module-kicker">Separate ledger · comparative billing</p>
              <p className="ct-module-note">Does not touch retail stock or customer dues.</p>
            </div>
          </header>
          {children}
        </div>
      </div>
    </ToastProvider>
  );
}
