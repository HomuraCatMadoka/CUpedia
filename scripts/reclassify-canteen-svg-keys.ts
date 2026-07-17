/**
 * One-shot: clear legacy `spicy` svg_key, then reclassify empty/legacy keys
 * by dish name. Leaves existing `default` rows untouched.
 *
 * Usage: npx tsx scripts/reclassify-canteen-svg-keys.ts [--dry-run]
 */
import { config } from "dotenv";
import { Pool } from "pg";
import { inferDishSvgKeyFromName } from "../src/lib/canteen-svg-keys";

config({ path: ".env.local" });

const dryRun = process.argv.includes("--dry-run");

const LEGACY_EMPTY_KEYS = new Set(["", "spicy"]);

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Check .env.local");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
  });

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Step 1: spicy → empty (so they enter the reclassify set)
      const cleared = await client.query(
        `UPDATE canteen_menu_items
         SET svg_key = '', updated_at = now()
         WHERE svg_key = 'spicy'
         RETURNING id, name, meal_period`,
      );
      console.log(`cleared spicy → empty: ${cleared.rowCount}`);
      for (const row of cleared.rows) {
        console.log(`  - ${row.name} (${row.meal_period})`);
      }

      // Step 2: reclassify empty / legacy empty keys; skip default
      const candidates = await client.query(
        `SELECT id, name, meal_period, svg_key
         FROM canteen_menu_items
         WHERE svg_key IS DISTINCT FROM 'default'
           AND (svg_key = '' OR svg_key = 'spicy' OR svg_key IS NULL)
         ORDER BY name`,
      );

      const updates: { id: string; name: string; from: string; to: string }[] =
        [];
      for (const row of candidates.rows) {
        if (row.svg_key === "default") continue;
        if (!LEGACY_EMPTY_KEYS.has(row.svg_key ?? "")) continue;
        const next = inferDishSvgKeyFromName(row.name);
        updates.push({
          id: row.id,
          name: row.name,
          from: row.svg_key ?? "",
          to: next,
        });
      }

      console.log(`reclassify empty (excl. default): ${updates.length}`);
      for (const u of updates) {
        console.log(`  - ${u.name}: "${u.from}" → ${u.to}`);
        if (!dryRun) {
          await client.query(
            `UPDATE canteen_menu_items
             SET svg_key = $1, updated_at = now()
             WHERE id = $2`,
            [u.to, u.id],
          );
        }
      }

      if (dryRun) {
        await client.query("ROLLBACK");
        console.log("dry-run: rolled back");
      } else {
        await client.query("COMMIT");
        console.log("committed");
      }
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
