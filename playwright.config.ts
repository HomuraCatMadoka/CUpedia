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
const node = JSON.stringify(process.execPath);
const useDevServer = process.env.E2E_SERVER_MODE === "dev";
const useCiGroups = process.env.E2E_CI_GROUPS === "1";
const campusBusTest = /campus-bus\.spec\.ts$/;
const mobileWebKitTest = /wiki-edit\.mobile-webkit\.spec\.ts$/;
const wikiDesktopTest =
  /wiki-(?!edit\.mobile(?:-webkit)?\.spec\.ts$).*\.spec\.ts$/;
// Historical runtime split: these files are about half of desktop Wiki time.
const wikiEditorCoreTest =
  /wiki-edit(?:\.(?:autosave|block-commands|hydration|shell))?\.spec\.ts$/;

// Point this process (and the spec workers it forks) at the isolated db so
// fixtures land in the same db the webServer reads. Specs load .env.local with
// dotenv's default override:false, which keeps this value.
if (E2E_DATABASE_URL) process.env.DATABASE_URL = E2E_DATABASE_URL;

export default defineConfig({
  testDir: "./e2e",
  // A worker owns one isolated database. CI splits files across separate
  // jobs/databases instead of racing shared fixtures in one process.
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
    ...(useCiGroups
      ? [
          {
            name: "chromium-general",
            testIgnore: [campusBusTest, wikiDesktopTest, mobileWebKitTest],
            use: { ...devices["Desktop Chrome"] },
          },
          {
            name: "campus-bus",
            testMatch: campusBusTest,
            use: { ...devices["Desktop Chrome"] },
          },
          {
            name: "chromium-wiki",
            testMatch: wikiDesktopTest,
            testIgnore: wikiEditorCoreTest,
            use: { ...devices["Desktop Chrome"] },
          },
          {
            name: "chromium-wiki-editor",
            testMatch: wikiEditorCoreTest,
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
