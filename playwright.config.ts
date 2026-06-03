import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

// The webServer must read the SAME isolated db that global-setup migrates/seeds
// and the specs write fixtures to. Playwright snapshots the webServer env at
// config load (before global-setup runs), so mutating process.env there can't
// reach it — derive the e2e url here and pass it explicitly.
function e2eDatabaseUrl(): string | undefined {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;
  const u = new URL(base);
  u.pathname = u.pathname.replace(/\/?$/, "") + "_e2e";
  return u.toString();
}

const E2E_DATABASE_URL = e2eDatabaseUrl();

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Run serially: better-auth rate-limits /sign-in to 3 req / 10s per IP, so
  // parallel workers signing in at once trip a shared 429. One worker spaces
  // logins out and keeps the auth-dependent specs deterministic.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // CI builds in a dedicated step so the cold build never races the 180s
    // server-start window; locally we build+start in one shot and reuse.
    command: process.env.CI
      ? `pnpm start --port ${PORT}`
      : `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // `pnpm start` runs in production mode, where instrumentation hard-fails if
    // SKIP_EMAIL_WHITELIST is on. Neutralize it here so a dev's .env.local
    // (which usually enables it) can't crash the e2e server — seed accounts
    // sign in by password and don't need the whitelist bypass anyway.
    env: {
      E2E_TEST: "1",
      SKIP_EMAIL_WHITELIST: "false",
      ...(E2E_DATABASE_URL ? { DATABASE_URL: E2E_DATABASE_URL } : {}),
    },
  },
});
