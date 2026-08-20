# Supabase Data API boundary

Last audited: 2026-08-20

## Decision

CUpedia is a server-side PostgreSQL application. Next.js and Drizzle connect
directly with `DATABASE_URL`; browser code does not use the Supabase Data API.
Only the production Supabase project is supported. The former preview project
was permanently deleted on 2026-08-20, and Vercel preview deployments have no
`DATABASE_URL` binding. Do not point preview deployments at production data.
The Supabase `public` schema may remain in the platform's exposed-schema list,
but it is a default-deny surface:

- every application table in `public` has row-level security enabled;
- `anon` and `authenticated` have no `USAGE` on `public` and no table grants;
- no RLS policies grant Supabase client roles access to application rows; and
- migration 0025 continues to revoke schema, table, sequence, and default
  privileges so future objects are not granted to client roles automatically.

The absence of client policies is intentional. The server connection continues
to use the database owner and is therefore unaffected by RLS. Introducing any
browser-side Supabase access requires a separate security review, an explicit
minimal grant, and an ownership-aware RLS policy in the same migration.

This follows Supabase's two-layer model: grants determine whether a role can
reach an object, while RLS determines which rows it can access. Supabase also
recommends enabling RLS on every table in an exposed schema even when grants
are restricted.

## Production and preview audit

The audit used the Supabase Management API for Data API configuration and
read-only SQL for database grants and catalog state. Vercel environment metadata
was used only to confirm which project each deployment target uses; credentials
were not recorded.

| Deployment                | Supabase state   | Data API audit                      | Database role audit                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ---------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production (`cupedia-sg`) | `ACTIVE_HEALTHY` | `public,graphql_public` are exposed | `anon` and `authenticated` have neither `USAGE`/`CREATE` on `public` nor effective relation or sequence privileges in either exposed schema. `graphql_public` grants `USAGE`, but not `CREATE`; it contains no relations or sequences and exposes only the platform `graphql(...)` routine, which is `SECURITY INVOKER`. Nineteen post-0025 application tables lacked RLS before migration 0086. |
| Preview                   | Not provisioned  | No Supabase project or Data API     | The former `cupedia-preview` project was permanently deleted and its Vercel preview `DATABASE_URL` binding was removed on 2026-08-20.                                                                                                                                                                                                                                                            |

Both client roles inherit `EXECUTE` on routines in `public`, including
`pg_trgm` extension routines and the campus-bus mutation-prevention trigger
function. None is `SECURITY DEFINER`, and the roles cannot resolve them because
they have no `USAGE` on `public`. The executable `graphql_public.graphql(...)`
routine is also `SECURITY INVOKER`, so it retains the caller's lack of access to
application relations. There is no privileged routine path around the table
grant and RLS boundary.

Preview is intentionally not an application environment. If a preview database
is introduced again, provision a new isolated project, apply the complete
migration chain, and complete this audit before adding a Vercel binding. Never
reuse the production database for previews.

## Continuous enforcement

Drizzle's `.enableRLS()` is part of every `pgTable` declaration in
`src/db/schema.ts`. This makes RLS part of generated migrations for new tables.
A schema unit test fails if a future Drizzle-managed table omits it.

CI also creates a real PostgreSQL database, applies the complete migration
chain, and runs `tests/db/public-data-api-security.test.ts`. That integration
test fails if any physical `public` table lacks RLS or if locally available
`anon` / `authenticated` roles regain schema or table privileges. CI creates
both Supabase client roles before applying migrations and requires the test to
observe them, so this assertion cannot pass vacuously. The catalog query covers
hand-written migration tables that are not represented in Drizzle.

## Re-audit procedure

1. In production Supabase **Integrations → Data API**, record whether the Data
   API is enabled and the exact exposed-schema list.
2. Query `pg_class` / `pg_namespace` for tables in each
   exposed schema and confirm `relrowsecurity = true`.
3. Query effective schema, relation, sequence, and routine privileges for `anon`
   and `authenticated` across every exposed schema. `public` must have no schema
   usage or relation/sequence privileges under this server-only model. Any
   executable routine in a schema with usage must be reviewed for
   `SECURITY DEFINER` and access to application data.
4. Run `pnpm drizzle-kit migrate`, followed by:

   ```bash
   DATABASE_URL=<isolated-migrated-db> \
     pnpm exec vitest run tests/db/public-data-api-security.test.ts
   ```

5. If an exposed schema gains a table, add RLS and an intentional policy before
   granting access. If no Data API consumer exists, keep the role ungranted.
6. Confirm Vercel preview has no `DATABASE_URL`. Treat any request to introduce
   a preview database as new infrastructure requiring an isolated project and a
   pre-launch Data API audit.

References: [Securing your API](https://supabase.com/docs/guides/api/securing-your-api),
[Using custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas),
and [the 2026 explicit-grants rollout](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
