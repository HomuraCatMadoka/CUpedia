# ADR 0029: Bound Supabase pg_net transport evidence

## Status

Accepted

## Context

ADR 0028 selected Vault plus asynchronous `pg_net` delivery for the Supabase
Cron menu-sync clock. Its decisions 3 and 4 described the Authorization header
and full HTTP response as never persisted. That is not how `pg_net` works:

- `net.http_request_queue` is an UNLOGGED table containing the prepared headers
  and body until the worker consumes the request; and
- `net._http_response` is an UNLOGGED table containing response headers and
  content until `pg_net.ttl` cleanup.

Supabase owns the `net` schema and restores platform grants when it installs the
extension. On the pinned Supabase PostgreSQL image, client roles have schema
usage and the extension tables have `PUBLIC` privileges. An application
migration cannot truthfully promise to revoke those owner-managed ACLs. The
roles are `NOLOGIN`, and production exposes only `public,graphql_public` through
the Data API, but that live configuration is part of the security boundary.

Supabase also generally warns against triggers on `pg_net` internal tables
because a failing trigger can stop the background worker. Issue 757 separately
requires bounded durable HTTP correlation before the delayed fallback, so the
response classifier needs an explicit, tested exception rather than an
unrecorded dependency on extension internals.

Migration 0094 was already committed and applied by CI before this correction.
Repository policy treats it as immutable, so the hardening must arrive through
a later migration.

## Decision

1. ADR 0028 decisions 1, 2, 5, 6, and 7 remain accepted. This ADR supersedes
   its decisions 3 and 4 only where they describe `pg_net` storage and the
   response trigger's safety.
2. Vault remains the only durable source for the bearer under the stable name
   `cupedia_canteen_menu_sync_bearer`. Cron command text, scheduler audit,
   application tables, logs, migrations, and test fixtures never copy the
   bearer, request header, or full response. `pg_net` necessarily holds a
   short-lived transport copy in its UNLOGGED extension tables.
3. Production activation requires `net` to remain outside the Data API list of
   exposed schemas, `anon` and `authenticated` to remain `NOLOGIN`, and no
   exposed routine to proxy arbitrary SQL into `net`. The runbook makes those
   live checks an activation gate because application migrations do not own the
   extension ACLs.
4. Migration 0095 adds a private activation-table guard. Any transition to an
   active scheduler fails unless the `pg_net` worker is running and the response
   TTL is positive and no greater than six hours. Operations also monitor queue
   depth; routine rotation waits for an empty queue, while emergency rotation
   invalidates the old endpoint credential before changing its remaining
   copies.
5. The response trigger remains a narrow infrastructure exception. It handles
   only request IDs already recorded in scheduler audit, calls no `pg_net`
   function, uses caller privileges with a pinned search path, and downgrades
   ordinary classifier or audit errors instead of re-raising them into the
   worker. It copies only bounded status, error class, endpoint disposition,
   business code, timestamps, and correlation IDs.
6. Migration 0094 remains byte-for-byte identical to its committed form.
   Migration 0095 replaces the classifier function and adds the activation guard
   so both fresh databases and databases that already recorded 0094 converge on
   the hardened behavior.

## Consequences

- The design records the real secret-retention boundary instead of treating an
  asynchronous queue as memory-only transport.
- A stopped worker can still leave a request header queued after a race with the
  health check. Queue monitoring, fail-closed future activation, and credential
  invalidation are required operational controls; operators must not edit
  extension-owned queue rows.
- Full responses remain in `net._http_response` only for the configured bounded
  TTL. Scheduler audit stays useful for the seven-day acceptance window without
  copying full bodies or headers.
- The Data API exposed-schema list is now an explicit production dependency and
  must be rechecked before activation or any future browser-side Supabase work.
- The narrow exception to Supabase's trigger guidance is covered by integration
  tests against the pinned real worker, including a classifier constraint
  failure that must not abort the extension-table insert.

References: [Supabase pg_net storage and
TTL](https://supabase.com/docs/guides/database/extensions/pg_net), [Supabase
webhook debugging guidance](https://supabase.com/docs/guides/troubleshooting/webhook-debugging-guide-M8sk47),
and the [CUpedia Data API boundary](../operations/supabase-data-api-boundary.md).
