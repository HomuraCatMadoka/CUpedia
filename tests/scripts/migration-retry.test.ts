import { describe, expect, it, vi } from "vitest";
import {
  postgresErrorCode,
  runMigrationWithRetry,
} from "../../scripts/migration-retry";

function postgresError(code: string): Error & { code: string } {
  return Object.assign(new Error(`postgres ${code}`), { code });
}

describe("deployment migration retry", () => {
  it("finds a PostgreSQL code wrapped by the migration library", () => {
    expect(
      postgresErrorCode(
        new Error("Failed query", { cause: postgresError("55P03") }),
      ),
    ).toBe("55P03");
  });

  it("retries a transient PostgreSQL lock timeout", async () => {
    const migrate = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(postgresError("55P03"))
      .mockResolvedValueOnce();
    const wait = vi
      .fn<(delayMs: number) => Promise<void>>()
      .mockResolvedValue();

    await runMigrationWithRetry(migrate, {
      maxAttempts: 3,
      retryDelaysMs: [1, 2],
      wait,
    });

    expect(migrate).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(1);
  });

  it("fails immediately for a deterministic migration error", async () => {
    const error = postgresError("23514");
    const migrate = vi.fn<() => Promise<void>>().mockRejectedValue(error);
    const wait = vi
      .fn<(delayMs: number) => Promise<void>>()
      .mockResolvedValue();

    await expect(
      runMigrationWithRetry(migrate, {
        maxAttempts: 3,
        retryDelaysMs: [1, 2],
        wait,
      }),
    ).rejects.toBe(error);

    expect(migrate).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("fails after the bounded lock-timeout attempts are exhausted", async () => {
    const error = postgresError("55P03");
    const migrate = vi.fn<() => Promise<void>>().mockRejectedValue(error);
    const wait = vi
      .fn<(delayMs: number) => Promise<void>>()
      .mockResolvedValue();

    await expect(
      runMigrationWithRetry(migrate, {
        maxAttempts: 3,
        retryDelaysMs: [1, 2],
        wait,
      }),
    ).rejects.toBe(error);

    expect(migrate).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });
});
