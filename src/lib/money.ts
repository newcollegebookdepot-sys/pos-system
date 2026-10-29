const MAX_CENTS = 100_000_000_00;

/** Round rupee float to cents. */
export function rupeesToCents(n: number) {
  return Math.round((Number(n) || 0) * 100);
}

export function centsToRupees(cents: number) {
  return Math.round(Number(cents) || 0) / 100;
}

export function roundCents(cents: number) {
  return Math.round(Number(cents) || 0);
}

export function tryParseMoney(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, "");
  if (cleaned === "") return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const raw = negative ? cleaned.slice(1) : cleaned;
  const [whole, frac = ""] = raw.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return negative ? -cents : cents;
}

export function moneyToInput(cents: number) {
  const neg = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  return `${neg ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Always display as Rs. 0.00 */
export function formatMoney(cents: number, _symbol?: string) {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const major = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const minor = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}Rs. ${major}.${minor}`;
}

export function balText(balanceCents: number) {
  const b = roundCents(balanceCents);
  if (b > 0) return `Due ${formatMoney(b)}`;
  if (b < 0) return `Surplus ${formatMoney(Math.abs(b))}`;
  return "Cleared";
}
