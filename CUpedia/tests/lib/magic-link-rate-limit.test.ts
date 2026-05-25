import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
    execute: vi.fn(),
    query: { users: { findFirst: vi.fn() } },
  },
}));

import { db } from "@/db";
import {
  peekMagicLinkRateLimit,
  consumeMagicLinkRateLimit,
} from "@/lib/magic-link-rate-limit";

const mockDb = vi.mocked(db);

function mockUserLookup(result: { banned: boolean } | undefined) {
  (mockDb.query.users.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
    result
  );
}

function mockRateLimitRow(lastAttemptedAt: Date | null) {
  mockDb.execute = vi.fn().mockResolvedValue(
    lastAttemptedAt ? [{ last_attempted_at: lastAttemptedAt }] : []
  );
}

function mockTransaction(
  lockResult: { lastAttemptedAt: Date } | null,
  shouldUpdate = true
) {
  mockDb.transaction = vi.fn().mockImplementation(async (fn) => {
    const tx = {
      execute: vi.fn(),
    };
    // INSERT ON CONFLICT DO NOTHING
    tx.execute.mockResolvedValueOnce([]);
    // SELECT FOR UPDATE
    tx.execute.mockResolvedValueOnce(
      lockResult ? [{ last_attempted_at: lockResult.lastAttemptedAt }] : []
    );
    if (shouldUpdate) {
      // UPDATE
      tx.execute.mockResolvedValueOnce([]);
    }
    return fn(tx);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("peekMagicLinkRateLimit", () => {
  it("returns INVALID_EMAIL for malformed email", async () => {
    const result = await peekMagicLinkRateLimit("not-an-email");
    expect(result).toMatchObject({ ok: false, code: "INVALID_EMAIL" });
  });

  it("returns INVALID_EMAIL_DOMAIN for non-CUHK email", async () => {
    const result = await peekMagicLinkRateLimit("user@gmail.com");
    expect(result).toMatchObject({ ok: false, code: "INVALID_EMAIL_DOMAIN" });
  });

  it("returns SUPPRESSED for banned user (not BANNED)", async () => {
    mockUserLookup({ banned: true });
    mockRateLimitRow(null);
    const result = await peekMagicLinkRateLimit("user@cuhk.edu.hk");
    expect(result).toMatchObject({ ok: false, code: "SUPPRESSED" });
    expect((result as any).code).not.toBe("BANNED");
  });

  it("returns RATE_LIMITED with retryAfterSeconds within 60s window", async () => {
    mockUserLookup(undefined);
    const now = new Date("2026-01-01T12:00:30Z");
    const lastAttempt = new Date("2026-01-01T12:00:00Z");
    mockRateLimitRow(lastAttempt);
    const result = await peekMagicLinkRateLimit("user@cuhk.edu.hk", now);
    expect(result).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect((result as any).retryAfterSeconds).toBe(30);
  });

  it("returns ok when no prior attempt", async () => {
    mockUserLookup(undefined);
    mockRateLimitRow(null);
    const result = await peekMagicLinkRateLimit("user@cuhk.edu.hk");
    expect(result).toEqual({ ok: true });
  });

  it("returns ok when last attempt was >= 60s ago", async () => {
    mockUserLookup(undefined);
    const now = new Date("2026-01-01T12:01:01Z");
    const lastAttempt = new Date("2026-01-01T12:00:00Z");
    mockRateLimitRow(lastAttempt);
    const result = await peekMagicLinkRateLimit("user@cuhk.edu.hk", now);
    expect(result).toEqual({ ok: true });
  });

  it("normalizes email case and whitespace", async () => {
    mockUserLookup(undefined);
    mockRateLimitRow(null);
    const result = await peekMagicLinkRateLimit("  User@CUHK.edu.hk  ");
    expect(result).toEqual({ ok: true });
  });
});

describe("consumeMagicLinkRateLimit", () => {
  it("returns INVALID_EMAIL for malformed email", async () => {
    const result = await consumeMagicLinkRateLimit("bad");
    expect(result).toMatchObject({ ok: false, code: "INVALID_EMAIL" });
  });

  it("returns INVALID_EMAIL_DOMAIN for non-CUHK email", async () => {
    const result = await consumeMagicLinkRateLimit("user@gmail.com");
    expect(result).toMatchObject({ ok: false, code: "INVALID_EMAIL_DOMAIN" });
  });

  it("returns BANNED for banned existing user", async () => {
    mockUserLookup({ banned: true });
    const result = await consumeMagicLinkRateLimit("user@cuhk.edu.hk");
    expect(result).toMatchObject({ ok: false, code: "BANNED" });
  });

  it("succeeds on first send for a normalized email", async () => {
    mockUserLookup(undefined);
    const epoch = new Date(0);
    mockTransaction({ lastAttemptedAt: epoch });
    const attemptedAt = new Date("2026-01-01T12:00:00Z");
    const result = await consumeMagicLinkRateLimit(
      "user@cuhk.edu.hk",
      attemptedAt
    );
    expect(result).toEqual({ ok: true });
  });

  it("returns RATE_LIMITED on second send within 60s", async () => {
    mockUserLookup(undefined);
    const firstAttempt = new Date("2026-01-01T12:00:00Z");
    mockTransaction({ lastAttemptedAt: firstAttempt });
    const attemptedAt = new Date("2026-01-01T12:00:30Z");
    const result = await consumeMagicLinkRateLimit(
      "user@cuhk.edu.hk",
      attemptedAt
    );
    expect(result).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect((result as any).retryAfterSeconds).toBe(30);
  });

  it("succeeds after 60s window", async () => {
    mockUserLookup(undefined);
    const firstAttempt = new Date("2026-01-01T12:00:00Z");
    mockTransaction({ lastAttemptedAt: firstAttempt });
    const attemptedAt = new Date("2026-01-01T12:01:01Z");
    const result = await consumeMagicLinkRateLimit(
      "user@cuhk.edu.hk",
      attemptedAt
    );
    expect(result).toEqual({ ok: true });
  });

  it("normalizes email — same email different case hits same path", async () => {
    mockUserLookup(undefined);
    mockTransaction({ lastAttemptedAt: new Date(0) });
    const at = new Date("2026-01-01T12:00:00Z");
    const r1 = await consumeMagicLinkRateLimit("User@CUHK.edu.hk", at);
    expect(r1).toEqual({ ok: true });
  });

  it("uses injected attemptedAt consistently", async () => {
    mockUserLookup(undefined);
    const lastAttempt = new Date("2026-01-01T12:00:00Z");
    mockTransaction({ lastAttemptedAt: lastAttempt });
    const attemptedAt = new Date("2026-01-01T12:00:59Z");
    const result = await consumeMagicLinkRateLimit(
      "user@cuhk.edu.hk",
      attemptedAt
    );
    expect(result).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect((result as any).retryAfterSeconds).toBe(1);
  });
});
