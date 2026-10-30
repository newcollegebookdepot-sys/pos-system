"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { billCtInvoice, unbillCtInvoice } from "@/server/contracts/invoices";

export function ContractInvoiceRowActions({
  invoiceId,
  status,
}: {
  invoiceId: number;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    start(async () => {
      const res =
        status === "billed" ? await unbillCtInvoice(invoiceId) : await billCtInvoice(invoiceId);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Link href={`/contracts/invoices/${invoiceId}`} className="btn btn-secondary btn-sm">
        Open
      </Link>
      <Link href={`/contracts/invoices/${invoiceId}?edit=1`} className="btn btn-secondary btn-sm">
        Edit
      </Link>
      <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={toggle}>
        {pending ? "…" : status === "billed" ? "Unbill" : "Bill"}
      </button>
      {error ? (
        <span className="muted" style={{ color: "var(--red)", width: "100%", textAlign: "right" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
