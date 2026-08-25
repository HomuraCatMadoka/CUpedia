# Change the database safely

This guide covers Drizzle schema changes and custom SQL migrations. `src/db/schema.ts` describes the current application schema; `src/db/migrations/` records the ordered history that reproduces it.

## Choose the migration path

Use a schema-generated migration when Drizzle can express the change:

```bash
pnpm drizzle-kit generate
```

Use a new custom migration for SQL outside the Drizzle schema model, such as extensions, repair statements, row-level-security policies, grants, or data backfills:

```bash
pnpm drizzle-kit generate --custom --name your_migration_name
```

Treat every migration already committed or applied in any environment as immutable. Correct a later problem with another migration instead of rewriting history.

## Apply a schema change

Complete the workflow in order:

1. Edit `src/db/schema.ts`.
2. Run `pnpm drizzle-kit generate`.
3. Inspect the new SQL and generated metadata. If the output is wrong, correct the schema and regenerate before applying it.
4. Run `pnpm drizzle-kit migrate` against the intended local database.
5. Run the relevant database or library tests, followed by the Ready baseline.
6. Commit `schema.ts`, the SQL migration, and generated migration metadata together.

For custom SQL, generate an empty custom migration, add the SQL to that new file, apply it locally, and add a focused compatibility or integration test when the behavior warrants one.

## Use migrate as the canonical path

Local setup, CI, and deployment replay the migration journal. Use:

```bash
pnpm drizzle-kit migrate
```

Do not use `drizzle-kit push`. `push` compares the present schema with one database, but it cannot reproduce migration-only extensions, repairs, policies, grants, and backfills. A database created with `push` can therefore differ from CI and production even when its tables look similar.

## Verify database work

Run the [Ready baseline](testing.md#run-the-ready-baseline), then run the focused test files for the affected tables or migration. Database integration tests require the local `db` service:

```bash
docker compose up -d --wait db
pnpm test tests/db/canteen-menu-source-sync.test.ts
```

Choose the existing focused test for the affected area. For a compatibility-sensitive migration, verify both a clean migration chain and the legacy state covered by its dedicated test.

## Find the right source

- Read `src/db/schema.ts` for current tables, columns, relations, and indexes.
- Read `drizzle.config.ts` for the schema and migration output paths.
- Read `scripts/run-db-migrations.ts` for deployment migration behavior.
- Read a historical migration only when the task depends on how an older database reaches the current state.
