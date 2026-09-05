import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { assertDatabaseReady, assertSafeE2eDatabase } from "./runtime";

const campusMapBuildingSourceRef =
  "cuhk-campus-map:buildings:20161006:sha256:3307c3936e3b8a787607c0c708454f52c2f5767e49f2a6e3062e949b5ce12cda";
const campusMapMigrationProviderSourceRefs = [
  "amap:poi:B0J2RXUQB6:hotspotclick:2026-08-26",
] as const;

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
 * assertions), while preserving migration-owned schema rows and their optional
 * creator accounts; drop Next's data cache, then seed.
 */
async function main() {
  const root = path.resolve(__dirname, "..");
  const url = requireEnv("DATABASE_URL");
  const distDir = path.resolve(root, process.env.NEXT_DIST_DIR ?? ".next");
  if (path.dirname(distDir) !== root) {
    throw new Error("NEXT_DIST_DIR must be a direct child of the project root");
  }

  assertSafeE2eDatabase(url);
  await assertDatabaseReady(withDatabase(url, "postgres"));
  await ensureDatabase(url, root);
  execFileSync(
    process.execPath,
    ["node_modules/drizzle-kit/bin.cjs", "migrate"],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  for (const cacheDir of [
    path.join(distDir, "cache", "fetch-cache"),
    path.join(distDir, "dev", "cache", "fetch-cache"),
  ]) {
    rmSync(cacheDir, { recursive: true, force: true });
  }
  await resetData(url);
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      "./scripts/css-stub.mjs",
      "scripts/seed.ts",
    ],
    { cwd: root, stdio: "inherit" },
  );
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

/**
 * Truncate mutable application data while preserving migration-owned reference
 * rows such as the active Campus Map fact schema.
 */
async function resetData(connectionUrl: string) {
  const client = new Client({ connectionString: connectionUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string }>(
      `select tablename as name
         from pg_tables
        where schemaname = 'public'
          and tablename not in ('campus_map_fact_schemas', 'users')`,
    );
    if (!rows.length) return;
    const tables = rows.map((r) => `"${r.name}"`).join(", ");
    await client.query("begin");
    try {
      // The Campus Map ledger rejects ordinary mutation. E2E provisioning is
      // an explicit maintenance operation against a disposable local database.
      await client.query("set local session_replication_role = replica");
      // Drizzle does not rerun an applied data migration after a truncate.
      // Snapshot the reference rows owned by migrations, then restore them
      // after clearing user-created facts and stale test fixtures.
      await client.query(
        `create temporary table e2e_campus_map_reference_provenance
           on commit drop as
         select source.*
           from campus_map_provenance_sources source
          where (
                  source.source_kind = 'official'
              and (
                    source.source_ref = $1
                 or source.source_ref like $1 || ':building:%'
              )
          ) or (
                  source.source_kind = 'provider-candidate'
              and source.source_ref = any($2::text[])
          )`,
        [campusMapBuildingSourceRef, campusMapMigrationProviderSourceRefs],
      );
      await client.query(
        `create temporary table e2e_campus_map_reference_buildings
           on commit drop as
         select distinct building.*
           from campus_map_buildings building
           join campus_map_building_provenance link
             on link.building_id = building.id
           join e2e_campus_map_reference_provenance source
             on source.id = link.provenance_id
          where source.source_kind = 'official'
            and source.source_ref like $1 || ':building:%'`,
        [campusMapBuildingSourceRef],
      );
      await client.query(
        `create temporary table e2e_campus_map_reference_building_links
           on commit drop as
         select link.*
           from campus_map_building_provenance link
           join e2e_campus_map_reference_buildings building
             on building.id = link.building_id
           join e2e_campus_map_reference_provenance source
             on source.id = link.provenance_id`,
      );
      // Do not use CASCADE here: campus_map_fact_schemas.created_by references
      // users, so PostgreSQL would also truncate the schema table even though
      // it is absent from `tables`. All other public tables are included in
      // one statement, which lets their mutual foreign keys be truncated
      // safely without CASCADE.
      await client.query(`truncate table ${tables} restart identity`);
      await client.query(
        `insert into campus_map_provenance_sources
         select * from e2e_campus_map_reference_provenance`,
      );
      await client.query(
        `insert into campus_map_buildings
         select * from e2e_campus_map_reference_buildings`,
      );
      await client.query(
        `insert into campus_map_building_provenance
         select * from e2e_campus_map_reference_building_links`,
      );
      await client.query(
        `delete from users
          where id not in (
            select created_by
              from campus_map_fact_schemas
             where created_by is not null
          )`,
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
