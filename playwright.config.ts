import path from "node:path";
import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { PLAYWRIGHT_RETRIES } from "./e2e/policy";
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
const node = JSON.stringify(process.execPath);
const useDevServer = process.env.E2E_SERVER_MODE === "dev";
const useCiGroups = process.env.E2E_CI_GROUPS === "1";
const mobileWebKitTest =
  /(?:wiki-edit\.mobile-webkit|header\.mobile-webkit)\.spec\.ts$/;
// The third browser runner already owns the small WebKit risk surface. Let it
// absorb measured Chromium hotspots without starting another runner or server.
// None of these specs uploads files, so MinIO remains exclusive to wiki-media.
const balancedChromiumTest =
  /(?:sidebar|wiki-create|wiki-edit\.(?:shell|toolbar))\.spec\.ts$/;
// This is also the only group with upload coverage, and therefore the only one
// whose CI runner starts MinIO.
const wikiMediaTest =
  /(?:sidebar|wiki-(?!(?:edit\.(?:shell|toolbar|mobile-webkit)|lifecycle|links|routing)\.spec\.ts$).*)\.spec\.ts$/;

// Point this process (and the spec workers it forks) at the isolated db so
// fixtures land in the same db the webServer reads. Specs load .env.local with
// dotenv's default override:false, which keeps this value.
if (E2E_DATABASE_URL) process.env.DATABASE_URL = E2E_DATABASE_URL;

export default defineConfig({
  testDir: "./e2e",
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? "test-results",
  // CI shards own separate databases, servers, and caches. Test-level
  // sharding lets a single large spec (notably mobile editing) be balanced
  // across those isolated runtimes instead of pinning one whole runner lane.
  fullyParallel: true,
  // A worker owns one isolated database. CI splits files across separate
  // jobs/databases instead of racing shared fixtures in one process.
  forbidOnly: !!process.env.CI,
  retries: PLAYWRIGHT_RETRIES,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    ...(useCiGroups
      ? [
          {
            name: "chromium-general",
            testIgnore: [wikiMediaTest, balancedChromiumTest, mobileWebKitTest],
            use: { ...devices["Desktop Chrome"] },
          },
          {
            name: "chromium-wiki-media",
            testMatch: wikiMediaTest,
            testIgnore: balancedChromiumTest,
            use: { ...devices["Desktop Chrome"] },
          },
          {
            name: "chromium-balanced",
            testMatch: balancedChromiumTest,
            testIgnore: mobileWebKitTest,
            use: { ...devices["Desktop Chrome"] },
          },
        ]
      : [
          {
            name: "chromium",
            testIgnore: mobileWebKitTest,
            use: { ...devices["Desktop Chrome"] },
          },
        ]),
    {
      name: "webkit-mobile",
      testMatch: mobileWebKitTest,
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: {
    // Provision the isolated db before the server. CI builds in its own step;
    // local cold builds get a budget that reflects the real editor bundle.
    // E2E_SERVER_MODE=dev is for fast local debugging only; production-mode
    // runs and CI remain the authoritative gate.
    command: process.env.CI
      ? `${node} --import tsx e2e/provision.ts && ${node} node_modules/next/dist/bin/next start --port ${PORT}`
      : useDevServer
        ? `${node} --import tsx e2e/provision.ts && ${node} node_modules/next/dist/bin/next dev --port ${PORT}`
        : `${node} --import tsx e2e/provision.ts && ${node} node_modules/next/dist/bin/next build --webpack && ${node} node_modules/next/dist/bin/next start --port ${PORT}`,
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
      // Keep local E2E output away from the developer's `.next`; sharing one
      // dist directory across dev and production modes invalidates caches.
      ...(process.env.CI ? {} : { NEXT_DIST_DIR: ".next-e2e" }),
      // Typecheck is an independent Ready/CI gate. Repeating it inside the
      // production build more than doubles this editor-heavy E2E startup.
      NEXT_BUILD_SKIP_TYPECHECK: "1",
      BREVO_API_KEY: "",
      SKIP_EMAIL_WHITELIST: "false",
      CANTEEN_MOCK_DATA: "false",
      DANMAKU_RATE_LIMIT_PER_HOUR: "100",
      AUTH_URL: baseURL,
      ...(E2E_DATABASE_URL ? { DATABASE_URL: E2E_DATABASE_URL } : {}),
    },
  },
});
