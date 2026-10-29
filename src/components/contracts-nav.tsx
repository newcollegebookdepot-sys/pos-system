"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Match = "exact" | "prefix" | "invoices";

export function ContractsNav({
  links,
}: {
  links: { href: string; label: string; match: Match }[];
}) {
  const pathname = usePathname();

  return (
    <nav className="ct-menu" aria-label="Contracts module">
      {links.map((link) => {
        let active = false;
        if (link.match === "exact") {
          active = pathname === link.href;
        } else if (link.match === "invoices") {
          active =
            pathname === "/contracts/invoices" ||
            (/^\/contracts\/invoices\/\d+/.test(pathname) && !pathname.includes("/new"));
        } else {
          active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        }
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`ct-nav-link${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
