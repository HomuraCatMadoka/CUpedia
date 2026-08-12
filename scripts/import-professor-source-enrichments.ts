import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const snapshotPaths = [
  "src/db/data/department-professor-aliases.sql",
  "src/db/data/research-portal-profile-images.sql",
].map((path) => resolve(process.cwd(), path));
const settingKey = "professor_source_enrichments_snapshot_sha256";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const snapshots = await Promise.all(
    snapshotPaths.map((path) => readFile(path, "utf8")),
  );
  const checksum = createHash("sha256")
    .update(snapshots.join("\n"))
    .digest("hex");
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      settingKey,
    ]);
    const current = await client.query<{ value: string }>(
      "select value from site_settings where key = $1",
      [settingKey],
    );
    if (current.rows[0]?.value !== checksum) {
      for (const snapshot of snapshots) await client.query(snapshot);
      await client.query(
        `insert into site_settings (key, value) values ($1, $2)
         on conflict (key) do update set value = excluded.value`,
        [settingKey, checksum],
      );
    }
    await client.query("commit");
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
