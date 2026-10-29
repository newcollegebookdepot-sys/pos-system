"use client";

import { useEffect, useState } from "react";
import { batchHint } from "@/server/batches";

export function BatchHint() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const form = document.querySelector("form");
    if (!form) return;
    const onInput = () => {
      const name = (form.querySelector<HTMLInputElement>('[name="name"]')?.value || "").trim();
      const buy = form.querySelector<HTMLInputElement>('[name="buy"]')?.value || "0";
      if (!name) {
        setMsg("");
        return;
      }
      void batchHint(name, buy).then((r) => setMsg(r.message));
    };
    form.addEventListener("input", onInput);
    return () => form.removeEventListener("input", onInput);
  }, []);
  if (!msg) return null;
  return <p className="text-sm text-forest">{msg}</p>;
}
