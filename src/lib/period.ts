export type PeriodKey = "today" | "7d" | "month" | "year" | "3y" | "all" | "custom";

export const PERIOD_CHIPS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "3y", label: "Last 3 years" },
  { key: "all", label: "All time" },
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function localIso(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayIso() {
  return localIso();
}

export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return localIso(dt);
}

export function resolvePeriod(
  key: PeriodKey = "today",
  from?: string,
  to?: string,
): { from: string | null; to: string | null; key: PeriodKey; label: string } {
  const today = todayIso();
  if (key === "custom" && from && to) {
    return { from, to, key, label: `${from} → ${to}` };
  }
  if (key === "all") return { from: null, to: null, key, label: "All time" };
  if (key === "today") return { from: today, to: today, key, label: "Today" };
  if (key === "7d") return { from: addDays(today, -6), to: today, key, label: "7 days" };
  if (key === "month") {
    const [y, m] = today.split("-").map(Number);
    return { from: `${y}-${pad2(m)}-01`, to: today, key, label: "This month" };
  }
  if (key === "year") {
    const y = Number(today.slice(0, 4));
    return { from: `${y}-01-01`, to: today, key, label: "This year" };
  }
  if (key === "3y") {
    const y = Number(today.slice(0, 4));
    return { from: `${y - 2}-01-01`, to: today, key, label: "Last 3 years" };
  }
  return { from: today, to: today, key: "today", label: "Today" };
}

export function inRange(isoDate: string, from: string | null, to: string | null) {
  const d = String(isoDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function fmtDate(iso: string) {
  const m = String(iso || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return String(iso || "").slice(0, 10);
}

export function monthKey(iso: string) {
  return String(iso || "").slice(0, 7);
}

export function periodFromSearch(sp: { get: (k: string) => string | null }) {
  const key = (sp.get("period") as PeriodKey) || "today";
  return resolvePeriod(key, sp.get("from") || undefined, sp.get("to") || undefined);
}
