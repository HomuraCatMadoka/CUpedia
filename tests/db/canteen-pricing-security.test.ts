import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("canteen pricing database security", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("enables RLS on the normalized price table", async () => {
    const result = await pool.query<{ relrowsecurity: boolean }>(
      `select relrowsecurity
       from pg_class
       where oid = 'public.canteen_menu_item_prices'::regclass`,
    );

    expect(result.rows).toEqual([{ relrowsecurity: true }]);
  });
});
