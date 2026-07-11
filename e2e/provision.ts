import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { assertDatabaseReady, assertSafeE2eDatabase } from "./runtime";

/**
 * Provision the ISOLATED e2e database, run from the Playwright webServer command
 * so it completes BEFORE the server boots. (Playwright starts the webServer
 * before globalSetup, and the production server migrates on startup — so the db
 * must already exist by then.) DATABASE_URL is injected by playwright.config and
 * already points at the isolated db; we use it as-is.
 *
 * Steps: create the db if missing (installing the zhparser 'chinese' config on
 * first create), migrate, wipe every table to a clean slate (so residue from a
 * prior run — sessions, spec fixtures — can't break the idempotent seed or skew
 * assertions), drop Next's data cache, then seed.
 */
async function main() {
  const root = path.resolve(__dirname, "..");
  const url = requireEnv("DATABASE_URL");

  assertSafeE2eDatabase(url);
  await assertDatabaseReady(withDatabase(url, "postgres"));
  await ensureDatabase(url, root);
  execSync("pnpm drizzle-kit migrate", { cwd: root, stdio: "inherit" });
  await resetData(url);
  rmSync(path.join(root, ".next", "cache"), { recursive: true, force: true });
  execSync("pnpm seed", { cwd: root, stdio: "inherit" });
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required for e2e provisioning`);
  return value;
}

/** Same URL pointing at a different database. */
function withDatabase(connectionUrl: string, name: string): string {
  const u = new URL(connectionUrl);
  u.pathname = `/${name}`;
  return u.toString();
}

/** Create the e2e db if missing, installing zhparser on first create. */
async function ensureDatabase(connectionUrl: string, projectRoot: string) {
  const dbName = new URL(connectionUrl).pathname.slice(1);
  const admin = new Client({
    connectionString: withDatabase(connectionUrl, "postgres"),
  });
  await admin.connect();
  let created = false;
  try {
    const { rowCount } = await admin.query(
      "select 1 from pg_database where datname = $1",
      [dbName],
    );
    if (!rowCount) {
      await admin.query(`create database "${dbName}"`);
      created = true;
    }
  } finally {
    await admin.end();
  }
  if (!created) return;

  const target = new Client({ connectionString: connectionUrl });
  await target.connect();
  try {
    await target.query(
      readFileSync(path.join(projectRoot, "init-zhparser.sql"), "utf8"),
    );
  } finally {
    await target.end();
  }
}

/** Truncate every application table so each run starts from a clean slate. */
async function resetData(connectionUrl: string) {
  const client = new Client({ connectionString: connectionUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string }>(
      "select tablename as name from pg_tables where schemaname = 'public'",
    );
    if (!rows.length) return;
    const tables = rows.map((r) => `"${r.name}"`).join(", ");
    await client.query(`truncate table ${tables} restart identity cascade`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
