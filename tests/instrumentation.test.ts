import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockMigrate } = vi.hoisted(() => ({
  mockMigrate: vi.fn(),
}));

vi.mock("drizzle-orm/node-postgres/migrator", () => ({
  migrate: mockMigrate,
}));

vi.mock("@/db", () => ({ db: {} }));

import { register } from "@/instrumentation";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("register — boot migration is opt-in (#133)", () => {
  it("does not migrate when RUN_MIGRATIONS_ON_BOOT is unset, even in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await register();
    expect(mockMigrate).not.toHaveBeenCalled();
  });

  it("does not migrate when RUN_MIGRATIONS_ON_BOOT is 'false'", async () => {
    vi.stubEnv("RUN_MIGRATIONS_ON_BOOT", "false");
    await register();
    expect(mockMigrate).not.toHaveBeenCalled();
  });

  it("migrates when RUN_MIGRATIONS_ON_BOOT is 'true'", async () => {
    vi.stubEnv("RUN_MIGRATIONS_ON_BOOT", "true");
    await register();
    expect(mockMigrate).toHaveBeenCalledTimes(1);
  });
});

describe("register — SKIP_EMAIL_WHITELIST production guard", () => {
  it("throws when enabled in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SKIP_EMAIL_WHITELIST", "true");
    await expect(register()).rejects.toThrow(/SKIP_EMAIL_WHITELIST/);
  });

  it("allows it outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SKIP_EMAIL_WHITELIST", "true");
    await expect(register()).resolves.toBeUndefined();
  });
});
