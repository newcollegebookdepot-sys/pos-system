import { ActionError } from "@/lib/errors";
import { tryParseMoney } from "@/lib/money";
import type { Role } from "@/lib/types";

export function requiredText(value: string, label: string, max: number) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new ActionError(`${label} is required.`);
  if (trimmed.length > max) throw new ActionError(`${label} must be ${max} characters or less.`);
  if (/[\u0000-\u001F]/.test(trimmed)) throw new ActionError(`${label} cannot include line breaks.`);
  return trimmed;
}

export function optionalText(value: string, label: string, max: number) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length > max) throw new ActionError(`${label} must be ${max} characters or less.`);
  if (/[\u0000-\u001F]/.test(trimmed)) throw new ActionError(`${label} cannot include line breaks.`);
  return trimmed;
}

export function parseUsername(value: string) {
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(trimmed)) {
    throw new ActionError("Username must be 3–32 characters: letters, numbers, dots, dashes, or underscores.");
  }
  return trimmed;
}

export function parsePassword(value: string) {
  if (value.length < 4) throw new ActionError("Password must be at least 4 characters.");
  if (value.length > 128) throw new ActionError("Password must be 128 characters or less.");
  return value;
}

export function parseRole(value: string): Role {
  if (value !== "cashier" && value !== "manager") throw new ActionError("Choose a valid role.");
  return value;
}

export function parseMoney(input: string, label: string) {
  const cents = tryParseMoney(input);
  if (cents === null) {
    throw new ActionError(`Enter ${label} using numbers and up to 2 decimal places, up to 1000000.00.`);
  }
  return cents;
}

export function parseStock(input: string) {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) throw new ActionError("Enter starting stock as a whole number.");
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value > 1_000_000) {
    throw new ActionError("Starting stock must be 1000000 or less.");
  }
  return value;
}

export function parseDelta(input: string) {
  const trimmed = input.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) {
    throw new ActionError("Enter the stock change as a whole number, like 12 or -2.");
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value === 0 || Math.abs(value) > 1_000_000) {
    throw new ActionError("Enter a stock change other than zero, up to 1000000.");
  }
  return value;
}

export function parseId(value: string, label: string) {
  if (!/^\d+$/.test(value)) throw new ActionError(`${label} is not valid.`);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new ActionError(`${label} is not valid.`);
  return id;
}

export function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
