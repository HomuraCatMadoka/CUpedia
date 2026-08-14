const SYNC_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*(?:_\d{3})?/;

export function normalizeSyncErrorCode(
  message: string | null | undefined,
): string {
  if (!message) return "UNKNOWN_SYNC_ERROR";
  return message.match(SYNC_ERROR_CODE_PATTERN)?.[0] ?? "UNKNOWN_SYNC_ERROR";
}
