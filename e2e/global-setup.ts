import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { Client } from "pg";

// `playwright test` doesn't preload .env.local; load it so a local run inherits
// DATABASE_URL. In CI the var comes from the job env — dotenv's default
// override:false keeps it.
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

/**
 * Deterministic e2e baseline on an ISOLATED database: the suite never touches
 * the dev database, and parallel worktrees don't collide.
 *
 * Target db defaults to `<dev-db>_e2e`; set E2E_DATABASE_URL to give a worktree
 * its own db. We ensure it exists (installing the zhparser 'chinese' config on
 * first create), migrate it, wipe every table to a clean slate (so residue from
 * a prior run — sessions, spec fixtures — can't break the idempotent seed or
 * skew assertions), drop Next's data cache, then seed — pointing DATABASE_URL at
 * it so the webServer Playwright spawns inherits the same db.
 */
export default async function globalSetup() {
  const root = path.resolve(__dirname, "..");
  const e2eUrl =
    process.env.E2E_DATABASE_URL ??
    withSuffix(requireEnv("DATABASE_URL"), "_e2e");

  await ensureDatabase(e2eUrl, root);

  // Point migrate / seed / webServer at the isolated db.
  process.env.DATABASE_URL = e2eUrl;
  execSync("pnpm drizzle-kit migrate", { cwd: root, stdio: "inherit" });
  await resetData(e2eUrl);
  rmSync(path.join(root, ".next", "cache"), { recursive: true, force: true });
  execSync("pnpm seed", { cwd: root, stdio: "inherit" });
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required for e2e global setup`);
  return value;
}

/** Append a suffix to the database name in a Postgres connection URL. */
function withSuffix(url: string, suffix: string): string {
  const u = new URL(url);
  u.pathname = u.pathname.replace(/\/?$/, "") + suffix;
  return u.toString();
}

/** Same URL pointing at a different database. */
function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

/** Truncate every application table so each run starts from a clean slate. */
async function resetData(url: string) {
  const client = new Client({ connectionString: url });
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

/** Create the e2e db if missing, installing zhparser on first create. */
async function ensureDatabase(url: string, root: string) {
  const dbName = new URL(url).pathname.slice(1);
  const admin = new Client({ connectionString: withDatabase(url, "postgres") });
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

  const target = new Client({ connectionString: url });
  await target.connect();
  try {
    await target.query(
      readFileSync(path.join(root, "init-zhparser.sql"), "utf8"),
    );
  } finally {
    await target.end();
  }
}
