# ADR 0028: Use Supabase Cron as the primary menu-sync clock

## Status

Accepted

## Context

ADR 0026 requires recurring observations inside a coarse breakfast, lunch, or
dinner period. The existing GitHub Actions workflow can wake the one-source
production endpoint, but scheduled Actions may be delayed or dropped and are
disabled after a long period without repository activity. A green workflow or
an HTTP 200 also proves only that transport ran; it does not prove that every
applicable source produced a usable menu snapshot.

The application already owns the difficult parts: database-time source claims,
provider reads, retries, identity safeguards, durable runs, snapshots, and the
four endpoint dispositions. Moving those rules into a second scheduler would
create two competing menu domain models. The production Supabase database can
instead provide a small primary clock through `pg_cron`, asynchronous HTTP
delivery through `pg_net`, and encrypted bearer storage through Vault.

The cutover must fail closed. A migration may run during deployment or a full
database replay, before the production endpoint and secret are ready. Scheduler
helpers and delivery evidence also sit beside public Data API tables, so they
must not become callable or readable by client roles.

## Decision

1. Supabase Cron owns the initial breakfast, lunch, and dinner drain. One stable
   named job, `cupedia-canteen-menu-sync-wakeup`, uses the UTC expression
   `17-32 0,3,9 * * *`. Each tick calls the existing one-source `/next` endpoint
   at the fixed production origin. The scheduler never accepts a source,
   provider, time, URL, or other menu fact from its caller.
2. The migration installs and reconciles the exact named job through supported
   `cron.schedule`, `cron.alter_job`, and `cron.unschedule` functions. It never
   writes `cron.job` directly. Replaying setup converges the reviewed schedule,
   command, database, owner, and inactive state. Installation is always inactive
   and resets the separate production activation guard; activation is an
   explicit runbook step after deployment and Vault preflight.
3. Vault is the only durable source for the bearer, under the stable name
   `cupedia_canteen_menu_sync_bearer`; scheduler audit, cron command text, and
   application tables never copy it. `pg_net` necessarily places each prepared
   Authorization header and empty request body in its private UNLOGGED request
   queue until the worker consumes the row, then keeps the response in its
   private UNLOGGED response table until TTL cleanup. Supabase owns the `net`
   schema and restores platform grants that include client-role schema usage and
   `PUBLIC` table privileges, so this migration cannot truthfully revoke those
   extension ACLs. Instead, the runbook activation gate requires production's
   Data API list of exposed schemas to exclude `net`, while the platform client
   roles remain `NOLOGIN`. Activation also requires a healthy worker and a
   positive response TTL no greater than six hours. Missing activation, an
   unexpected owner, a missing secret, an unavailable worker, an unsafe TTL, or
   a changed job contract fails closed before outbound work.
4. Scheduler objects live in the private `canteen_menu_scheduler` schema. Tables
   use row-level security, public and client-role privileges are revoked, and
   helpers use caller privileges with pinned search paths. The HTTP response
   trigger is a narrow, recorded exception to Supabase's general warning not to
   add triggers to `pg_net` internals: it matches only request IDs already in
   scheduler audit, calls no `pg_net` function, uses caller privileges, and
   downgrades ordinary classifier/audit errors instead of re-raising them into
   the worker. It copies only a bounded status, error class, endpoint
   disposition, business code, timestamps, and correlation IDs; headers and
   full bodies remain only inside `pg_net` until its TTL cleanup. These
   extension-coupled objects are intentionally installed by a custom migration
   outside the application-owned Drizzle schema; application code never queries
   them through Drizzle.
5. Delivery and cron-run evidence is retained for 14 days, giving a seven-day
   observation period plus recovery margin. Health is evaluated in four layers:
   cron tick, HTTP enqueue, HTTP/endpoint result, and business completion. Final
   window success requires an `applied` or `unchanged` run joined to a non-empty
   snapshot for every applicable source. A successful request or `no-work`
   response alone cannot declare the window complete. SQL validates the existing
   endpoint response contract and projects canonical durable run outcomes into
   read-only health labels; it does not choose retries, claims, provider work,
   or menu mutations. Any future endpoint-contract change must update both
   transport consumers in the same change.
6. GitHub Actions remains an independent fallback and publication-refresh
   clock. Its initial-period tick moves from minute 17 to minute 37 so work after
   the primary cutoff is attributable to fallback. Existing minute-47 and
   non-primary refresh wakes remain, as does `workflow_dispatch` recovery.
7. The full migration chain and focused scheduler tests run on the pinned
   Supabase PostgreSQL 17 image. They cover inactive installation, replay and
   wrong-state convergence, grants, Vault behavior, real `pg_net` delivery to a
   local HTTP double, response failures, health classification, and database
   advisors without contacting production. Stock PostgreSQL replay skips
   unavailable Supabase extensions and does not create outbound work.

This decision supersedes only GitHub Actions as the sole clock in ADR 0026
decision 3. ADR 0014 and ADR 0026 continue to own source identity, claims,
provider observations, publication refreshes, snapshots, and current-menu
projection.

## Consequences

- An initial meal drain no longer depends on one external scheduled workflow,
  while GitHub remains available after a visible delay for recovery.
- Sixteen short asynchronous wake-ups per initial period can drain several
  sources without putting provider work inside PostgreSQL. Existing database
  claims make duplicate delivery safe.
- Operators must provision one Vault secret, explicitly activate the job, and
  review four-layer health for seven days. The checked-in runbook makes those
  actions repeatable and reversible.
- Scheduler audit data is intentionally less useful for debugging response
  bodies because retaining bodies or headers would create a secret-leak path.
  Business runs and snapshots remain the detailed source of truth.
- `pg_net` still has a short-lived transport copy of the request header and
  response body in UNLOGGED extension tables with platform-owned broad ACLs.
  Safety therefore also depends on `net` remaining outside the Data API list of
  exposed schemas and on there being no exposed routine that proxies arbitrary
  SQL into `net`. A stopped worker can extend the request copy's lifetime, so
  activation checks worker health, operations watch queue depth, and credential
  rotation waits for an empty queue or invalidates the old endpoint credential
  first.
- Local databases without `pg_cron`, `pg_net`, or Vault still replay the schema,
  but only a Supabase-compatible database installs the runnable job.
