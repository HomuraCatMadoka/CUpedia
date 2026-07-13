import path from "node:path";
import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { deriveE2eRuntime } from "./e2e/runtime";

const commonRoot = path.dirname(
  execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: __dirname, encoding: "utf8" },
  ).trim(),
);
dotenv.config({
  path: [
    path.resolve(__dirname, ".env.local"),
    path.resolve(commonRoot, ".env.local"),
    path.resolve(__dirname, ".env.example"),
  ],
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for e2e");
const runtime = deriveE2eRuntime({
  projectRoot: __dirname,
  databaseUrl,
  e2eDatabaseUrl: process.env.E2E_DATABASE_URL,
  port: process.env.E2E_PORT ? Number(process.env.E2E_PORT) : undefined,
});
const PORT = runtime.port;
const baseURL = `http://localhost:${PORT}`;
const E2E_DATABASE_URL = runtime.databaseUrl;

// Point this process (and the spec workers it forks) at the isolated db so
// fixtures land in the same db the webServer reads. Specs load .env.local with
// dotenv's default override:false, which keeps this value.
if (E2E_DATABASE_URL) process.env.DATABASE_URL = E2E_DATABASE_URL;

export default defineConfig({
  testDir: "./e2e",
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
    // Provision the isolated db before the server. CI builds in its own step;
    // local cold builds get a budget that reflects the real editor bundle.
    command: process.env.CI
      ? `node --import tsx e2e/provision.ts && pnpm start --port ${PORT}`
      : `node --import tsx e2e/provision.ts && pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 10 * 60_000,
    // `pnpm start` runs in production mode, where instrumentation hard-fails if
    // SKIP_EMAIL_WHITELIST is on. Neutralize it here so a dev's .env.local
    // (which usually enables it) can't crash the e2e server — seed accounts
    // sign in by password and don't need the whitelist bypass anyway.
    //
    // AUTH_URL must be this server's real address. The dev .env.local sets it
    // to the :3000 dev port, but e2e serves on :3100; left uncorrected,
    // better-auth derives trustedOrigins from the stale :3000 and rejects
    // browser-driven sign-in (Origin :3100) as cross-origin. Deriving it from
    // PORT keeps the declared origin honest wherever e2e runs.
    env: {
      E2E_TEST: "1",
      BREVO_API_KEY: "",
      SKIP_EMAIL_WHITELIST: "false",
      CANTEEN_MOCK_DATA: "false",
      AUTH_URL: baseURL,
      ...(E2E_DATABASE_URL ? { DATABASE_URL: E2E_DATABASE_URL } : {}),
    },
  },
});
