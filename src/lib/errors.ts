export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

export function isUniqueConstraint(error: unknown) {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

export function isCheckConstraint(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String(error.code) : "";
  return code.includes("CONSTRAINT") || error.message.includes("CHECK constraint");
}
