import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const SNAPSHOT_PATH = resolve(
  process.cwd(),
  "src/db/data/department-professor-profiles.sql",
);
const SNAPSHOT_SETTING_KEY = "department_professor_profiles_snapshot_sha256";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const snapshotSql = await readFile(SNAPSHOT_PATH, "utf8");
  const checksum = createHash("sha256").update(snapshotSql).digest("hex");
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      SNAPSHOT_SETTING_KEY,
    ]);

    const current = await client.query<{ value: string }>(
      "select value from site_settings where key = $1",
      [SNAPSHOT_SETTING_KEY],
    );
    if (current.rows[0]?.value === checksum) {
      await client.query("commit");
      console.info("Department professor profile snapshot is already applied");
      return;
    }

    await client.query(snapshotSql);
    await client.query(
      `insert into site_settings (key, value)
       values ($1, $2)
       on conflict (key) do update set value = excluded.value`,
      [SNAPSHOT_SETTING_KEY, checksum],
    );
    await client.query("commit");
    console.info("Applied department professor profile snapshot");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
