import { afterEach, describe, expect, it } from "vitest";
import { getLocalE2eOtp } from "@/lib/e2e-otp";

const originalE2eTest = process.env.E2E_TEST;
const originalAuthUrl = process.env.AUTH_URL;
const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  process.env.E2E_TEST = originalE2eTest;
  process.env.AUTH_URL = originalAuthUrl;
  process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("getLocalE2eOtp", () => {
  it.each(["http://localhost:3100", "http://127.0.0.1:3100"])(
    "returns a deterministic OTP for a local E2E server at %s",
    (authUrl) => {
      process.env.E2E_TEST = "1";
      process.env.AUTH_URL = authUrl;
      process.env.DATABASE_URL =
        "postgresql://postgres:postgres@localhost:5433/cuclaw_e2e_deadbeef";

      expect(getLocalE2eOtp()).toBe("123456");
    },
  );

  it("is disabled outside E2E", () => {
    process.env.E2E_TEST = "0";
    process.env.AUTH_URL = "http://localhost:3100";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5433/cuclaw_e2e_deadbeef";

    expect(getLocalE2eOtp()).toBeNull();
  });

  it.each(["https://cupedia.example", "https://10.0.0.8"])(
    "is disabled for a non-local auth origin at %s",
    (authUrl) => {
      process.env.E2E_TEST = "1";
      process.env.AUTH_URL = authUrl;
      process.env.DATABASE_URL =
        "postgresql://postgres:postgres@localhost:5433/cuclaw_e2e_deadbeef";

      expect(getLocalE2eOtp()).toBeNull();
    },
  );

  it("fails closed when AUTH_URL is malformed or missing", () => {
    process.env.E2E_TEST = "1";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5433/cuclaw_e2e_deadbeef";
    delete process.env.AUTH_URL;
    expect(getLocalE2eOtp()).toBeNull();

    process.env.AUTH_URL = "not-a-url";
    expect(getLocalE2eOtp()).toBeNull();
  });

  it("stays disabled for a local server connected to a non-E2E database", () => {
    process.env.E2E_TEST = "1";
    process.env.AUTH_URL = "http://localhost:3000";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5433/cuclaw";

    expect(getLocalE2eOtp()).toBeNull();
  });

  it("fails closed when DATABASE_URL is malformed or missing", () => {
    process.env.E2E_TEST = "1";
    process.env.AUTH_URL = "http://localhost:3100";
    delete process.env.DATABASE_URL;
    expect(getLocalE2eOtp()).toBeNull();

    process.env.DATABASE_URL = "not-a-url";
    expect(getLocalE2eOtp()).toBeNull();
  });
});
