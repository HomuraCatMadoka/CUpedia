/** Postgres / driver error helpers (walks Drizzle cause chain). */

function walkPgCodes(error: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = error;
  for (let i = 0; i < 6 && current; i++) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      typeof (current as { code: unknown }).code === "string"
    ) {
      codes.push((current as { code: string }).code);
    }
    current =
      typeof current === "object" &&
      current !== null &&
      "cause" in current
        ? (current as { cause: unknown }).cause
        : null;
  }
  return codes;
}

export function isPgPermissionDenied(error: unknown): boolean {
  return walkPgCodes(error).includes("42501");
}

/** Role connection quota exhausted (common on Supabase readonly). */
export function isPgTooManyConnections(error: unknown): boolean {
  return walkPgCodes(error).includes("53300");
}

/** Soft-fail secondary reads against a constrained prod readonly role. */
export function isPgSoftFail(error: unknown): boolean {
  return isPgPermissionDenied(error) || isPgTooManyConnections(error);
}
