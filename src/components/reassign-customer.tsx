"use client";

import { useState, useTransition } from "react";
import { reassignCustomer } from "@/server/invoices";
import type { Customer } from "@/lib/types";

export function ReassignCustomer({ invoiceId, customers }: { invoiceId: number; customers: Customer[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const hits = customers.filter((c) => {
    const hay = `${c.name} ${c.phone}`.toLowerCase();
    return q
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((t) => hay.includes(t));
  });

  return (
    <div className="relative">
      <button type="button" className="btn btn-ghost ring-1 ring-line" onClick={() => setOpen((v) => !v)}>
        Customer
      </button>
      {open ? (
        <div className="absolute left-0 z-20 mt-1 w-72 rounded-xl border border-line bg-white p-3 shadow-lg">
          <input className="field" placeholder="Search customer" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="mt-2 max-h-48 overflow-auto text-sm">
            {hits.slice(0, 20).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left hover:bg-forest/5"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      if (!window.confirm(`Move invoice to ${c.name}?`)) return;
                      await reassignCustomer(invoiceId, c.id);
                      setOpen(false);
                      window.location.reload();
                    })
                  }
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
