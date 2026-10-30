"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type OfficeInvoiceStat = {
  officeName: string;
  invoiceCount: number;
  draftCount: number;
  billedCount: number;
};

export function ContractOfficesFilter({ offices }: { offices: OfficeInvoiceStat[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return offices;
    return offices.filter((o) => o.officeName.toLowerCase().includes(needle));
  }, [offices, q]);

  return (
    <div className="grid gap-4">
      <div>
        <label className="label">Search offices</label>
        <input
          className="field"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type office name…"
          autoFocus
        />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Office</th>
              <th className="right">Invoices</th>
              <th className="right">Draft</th>
              <th className="right">Billed</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.officeName}>
                <td className="strong">{o.officeName}</td>
                <td className="right mono">{o.invoiceCount}</td>
                <td className="right mono">{o.draftCount}</td>
                <td className="right mono">{o.billedCount}</td>
                <td className="right">
                  <Link
                    href={`/contracts/invoices?office=${encodeURIComponent(o.officeName)}`}
                    className="btn btn-primary btn-sm"
                  >
                    Open invoices
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="muted">No offices match.</p> : null}
      </div>
    </div>
  );
}
