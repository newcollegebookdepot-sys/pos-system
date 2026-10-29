"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { PERIOD_CHIPS, type PeriodKey, resolvePeriod } from "@/lib/period";

export function PeriodBar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const key = (sp.get("period") as PeriodKey) || "today";
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  const resolved = resolvePeriod(key === "custom" ? "custom" : key, from || undefined, to || undefined);

  function setPeriod(next: PeriodKey) {
    const params = new URLSearchParams(sp.toString());
    params.set("period", next);
    if (next !== "custom") {
      params.delete("from");
      params.delete("to");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function applyCustom(formData: FormData) {
    const f = String(formData.get("from") || "");
    const t = String(formData.get("to") || "");
    const params = new URLSearchParams(sp.toString());
    params.set("period", "custom");
    params.set("from", f);
    params.set("to", t);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="period-bar no-print">
      {PERIOD_CHIPS.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => setPeriod(chip.key)}
          className={`chip${key === chip.key ? " active" : ""}`}
        >
          {chip.label}
        </button>
      ))}
      <form action={applyCustom} className="ml-auto flex flex-wrap items-end gap-2">
        <div className="field-wrap">
          <label className="label" htmlFor="from">
            From
          </label>
          <input id="from" name="from" type="date" className="field" defaultValue={from || resolved.from || ""} />
        </div>
        <div className="field-wrap">
          <label className="label" htmlFor="to">
            To
          </label>
          <input id="to" name="to" type="date" className="field" defaultValue={to || resolved.to || ""} />
        </div>
        <button className="btn btn-primary btn-sm" type="submit">
          Apply
        </button>
      </form>
      <p className="muted" style={{ width: "100%", margin: 0 }}>
        Range: {resolved.label}
      </p>
    </div>
  );
}
