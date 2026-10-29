"use client";

import { useTransition } from "react";
import { setCurrentOperator } from "@/server/ops";

export function OperatorSelect({
  operators,
  current,
}: {
  operators: { id: number; name: string }[];
  current: string;
}) {
  const [pending, start] = useTransition();
  return (
    <select
      id="operator"
      disabled={pending}
      value={current}
      onChange={(e) => {
        const name = e.target.value;
        start(async () => {
          await setCurrentOperator(name);
        });
      }}
    >
      {operators.map((op) => (
        <option key={op.id} value={op.name}>
          {op.name}
        </option>
      ))}
    </select>
  );
}
