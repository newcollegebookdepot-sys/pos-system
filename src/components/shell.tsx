import Link from "next/link";
import { NavLinks } from "@/components/nav-links";
import { LiveClock } from "@/components/ui/live-clock";
import { OperatorSelect } from "@/components/ui/operator-select";
import { ToastProvider } from "@/components/ui/toast";
import { draftCount } from "@/lib/repo/cart";
import { listOperators } from "@/lib/repo/settings";
import { logout } from "@/server/auth";
import type { PublicUser, Settings } from "@/lib/types";

export async function Shell({
  settings,
  user,
  children,
}: {
  settings: Settings;
  user: PublicUser;
  children: React.ReactNode;
}) {
  const operators = (await listOperators()).filter((o) => o.active);
  const drafts = await draftCount();
  const links =
    user.role === "manager"
      ? [
          { href: "/dashboard", label: "Dashboard" },
          { href: "/sell", label: "New sale" },
          { href: "/invoices", label: "Invoices & returns" },
          { href: "/stock", label: "Stock & batches" },
          { href: "/customers", label: "Customers & ledger" },
          { href: "/cash", label: "Cash book & expenses" },
          { href: "/analytics", label: "Analytics" },
          { href: "/settings", label: "Backup / settings" },
        ]
      : [
          { href: "/sell", label: "New sale" },
          { href: "/invoices", label: "Invoices" },
        ];

  const currentOp =
    settings.operatorName && operators.some((o) => o.name === settings.operatorName)
      ? settings.operatorName
      : operators[0]?.name || user.name;

  const home = user.role === "manager" ? "/dashboard" : "/sell";

  return (
    <ToastProvider>
      <div className="app-shell">
        <aside className="sidebar no-print">
          <Link href={home} className="shop-name no-underline">
            {settings.shopName}
            {(settings.address || settings.phone) && (
              <span>{[settings.address, settings.phone].filter(Boolean).join(" · ")}</span>
            )}
          </Link>

          <div className="operator-box">
            <label htmlFor="operator">Bill operator</label>
            <OperatorSelect operators={operators} current={currentOp} />
          </div>

          <NavLinks links={links} />

          <div className="sidebar-foot">
            {user.role === "manager" ? (
              <Link href="/contracts" className="menu-link module-portal">
                Office contracts module
              </Link>
            ) : null}
            <LiveClock />
            <div className="user-chip">
              <strong>{user.name}</strong>
              <span>{user.role}</span>
            </div>
            {user.role === "manager" ? (
              <Link href="/staff" className="menu-link" style={{ textAlign: "center" }}>
                Staff accounts
              </Link>
            ) : null}
            <form action={logout}>
              <button className="btn btn-secondary btn-block btn-sm" type="submit">
                Log out
              </button>
            </form>
          </div>
        </aside>

        <div className="main">
          {user.role === "manager" ? (
            <div className="qa-bar no-print">
              <Link href="/sell" className="qa-tile qa-sale">
                <span className="qa-kicker">POS</span>
                <span className="qa-title">New sale</span>
              </Link>
              <Link href="/customers?receipt=1" className="qa-tile qa-rcp">
                <span className="qa-kicker">Ledger</span>
                <span className="qa-title">Cash receipt</span>
              </Link>
              <Link href="/stock?search=1" className="qa-tile qa-search">
                <span className="qa-kicker">Catalog</span>
                <span className="qa-title">Search product</span>
              </Link>
              <Link href="/purchases/bulk" className="qa-tile qa-bulk">
                <span className="qa-kicker">Purchase</span>
                <span className="qa-title">Bulk purchase</span>
              </Link>
              <Link href="/sell?drafts=1" className={`qa-tile qa-drafts${drafts ? " has-drafts" : ""}`}>
                <span className="qa-kicker">Parked</span>
                <span className="qa-title">Sale drafts</span>
                {drafts ? <span className="qa-draft-count">{drafts}</span> : null}
              </Link>
            </div>
          ) : (
            <div className="qa-bar no-print" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
              <Link href="/sell" className="qa-tile qa-sale">
                <span className="qa-kicker">POS</span>
                <span className="qa-title">New sale</span>
              </Link>
              <Link href="/sell?drafts=1" className={`qa-tile qa-drafts${drafts ? " has-drafts" : ""}`}>
                <span className="qa-kicker">Parked</span>
                <span className="qa-title">Sale drafts</span>
                {drafts ? <span className="qa-draft-count">{drafts}</span> : null}
              </Link>
            </div>
          )}
          {children}
        </div>
      </div>
    </ToastProvider>
  );
}
