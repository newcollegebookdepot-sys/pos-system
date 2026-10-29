"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/lib/types";

export function ConfirmButton({
  label,
  confirm,
  action,
  tone = "danger",
}: {
  label: string;
  confirm?: string;
  action: () => Promise<ActionState | void>;
  tone?: "danger" | "default";
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <button
        type="button"
        className={tone === "danger" ? "btn btn-danger" : "btn btn-ghost ring-1 ring-line"}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          startTransition(async () => {
            const result = await action();
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "Working..." : label}
      </button>
      {error ? (
        <p role="alert" className="mt-1 text-sm text-stamp">
          {error}
        </p>
      ) : null}
    </div>
  );
}
