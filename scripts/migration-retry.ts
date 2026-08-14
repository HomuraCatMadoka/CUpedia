type PostgresLikeError = Error & {
  code?: unknown;
  cause?: unknown;
};

export type MigrationRetryOptions = {
  maxAttempts?: number;
  retryDelaysMs?: readonly number[];
  wait?: (delayMs: number) => Promise<void>;
  onRetry?: (attempt: number, delayMs: number, code: string) => void;
};

const DEFAULT_RETRY_DELAYS_MS = [5_000, 10_000, 20_000] as const;
const RETRYABLE_POSTGRES_CODES = new Set(["55P03"]);

export function postgresErrorCode(error: unknown): string | null {
  let current = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const candidate = current as PostgresLikeError;
    if (typeof candidate.code === "string") return candidate.code;
    current = candidate.cause;
  }
  return null;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function runMigrationWithRetry(
  migrate: () => Promise<void>,
  options: MigrationRetryOptions = {},
): Promise<void> {
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const maxAttempts = options.maxAttempts ?? retryDelaysMs.length + 1;
  const wait = options.wait ?? sleep;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("INVALID_MIGRATION_MAX_ATTEMPTS");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await migrate();
      return;
    } catch (error) {
      const code = postgresErrorCode(error);
      const delayMs = retryDelaysMs[attempt - 1];
      if (
        !code ||
        !RETRYABLE_POSTGRES_CODES.has(code) ||
        attempt >= maxAttempts ||
        delayMs === undefined
      ) {
        throw error;
      }
      options.onRetry?.(attempt, delayMs, code);
      await wait(delayMs);
    }
  }
}
