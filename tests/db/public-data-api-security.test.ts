import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("public Data API security", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("enables RLS on every public table", async () => {
    const result = await pool.query<{ table_name: string }>(
      `select c.relname as table_name
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind in ('r', 'p')
         and not c.relrowsecurity
       order by c.relname`,
    );

    expect(result.rows).toEqual([]);
  });

  it("blocks Supabase client roles from the public schema", async () => {
    const roles = await pool.query<{ rolname: string }>(
      `select rolname
       from pg_roles
       where rolname in ('anon', 'authenticated')
       order by rolname`,
    );

    for (const { rolname } of roles.rows) {
      const result = await pool.query<{
        schema_usage: boolean;
        table_grants: string;
      }>(
        `select
           has_schema_privilege($1, 'public', 'USAGE') as schema_usage,
           coalesce(string_agg(privilege_type, ',' order by privilege_type), '') as table_grants
         from information_schema.role_table_grants
         where table_schema = 'public' and grantee = $1`,
        [rolname],
      );

      expect(result.rows).toEqual([{ schema_usage: false, table_grants: "" }]);
    }
  });
});
