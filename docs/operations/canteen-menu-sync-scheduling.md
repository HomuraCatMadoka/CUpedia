# Production canteen menu-sync scheduling

Status: Current
Last verified: 2026-08-26 against migrations 0094–0095 and
`.github/workflows/canteen-menu-sync.yml`

Supabase Cron is the primary clock for the first breakfast, lunch, and dinner
drains. GitHub Actions starts later as an independent fallback and continues to
wake publication refreshes during the rest of the day. Both transports call the
same fixed production `/next` endpoint. The endpoint and database, not either
clock, decide which source is due and safely claim one source at a time.

This runbook is the only supported activation, rotation, observation, and
rollback path. There is no dashboard toggle for scheduler state.

## Fixed contract

All schedules use UTC. Hong Kong time is UTC+8.

| Owner          | UTC schedule                | Hong Kong time                        | Purpose                                                           |
| -------------- | --------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Supabase Cron  | `17-32 0,3,9 * * *`         | 08:17–08:32, 11:17–11:32, 17:17–17:32 | Primary initial drains, one asynchronous wake per minute          |
| GitHub Actions | `37,47 0,3,9 * * *`         | 08:37/08:47, 11:37/11:47, 17:37/17:47 | Delayed fallback at minute 37 plus the existing minute-47 refresh |
| GitHub Actions | `17,47 1-2,4-8,10-15 * * *` | Remaining 09:17–23:47 wake-ups        | Existing publication refresh coverage                             |
| GitHub Actions | `workflow_dispatch`         | Manual                                | Recovery without caller-controlled URL, source, provider, or time |

The database job contract is exact:

- name: `cupedia-canteen-menu-sync-wakeup`
- command: `SELECT canteen_menu_scheduler.enqueue_canteen_menu_sync_wakeup()`
- target: `https://cupedia.org/api/internal/canteen-menu-sync/next`
- bearer secret name: `cupedia_canteen_menu_sync_bearer`
- HTTP timeout: 65 seconds

Meal-period snapshots may carry a provider-neutral `refreshUntilMinute` hint
derived from bounded, unambiguous same-day service windows. At or after that
horizon, the endpoint stops claiming repeat observations for that source in the
current coarse meal window. This suppresses a provider read only: it does not
deactivate menu items, prove that a menu is empty, or change initial-window
completion evidence. Missing, malformed, out-of-range, ambiguous, or
cross-midnight evidence keeps the existing provider-boundary and 45-minute
fallback behavior. [ADR 0030](../adr/0030-stop-scoped-observations-at-refresh-horizons.md)
records this menu-domain boundary; neither production clock owns it.

Do not create a second job, change the origin for a preview deployment, write
`cron.job` directly, or put a source ID into a cron command. The database claim
and run history make repeated wake-ups safe; the clocks do not implement menu
business rules.

## Fail-closed installation state

Migration 0094 installs available `pg_cron` and `pg_net` extensions, private
scheduler objects, the response classifier, and the one named job. Migration
0095 hardens response classification and guards every transition to active
state with the reviewed `pg_net` runtime bounds. Every full replay reconciles
the reviewed job and leaves both controls off:

- `cron.job.active = false`
- `canteen_menu_scheduler.activation.environment = 'unconfigured'`
- `canteen_menu_scheduler.activation.active = false`

No migration or database replay sends a production request. Activation requires
the exact job, the `postgres` owner, exactly one non-empty Vault secret with the
fixed name, a running `pg_net` worker, and a positive `pg_net.ttl` no greater
than six hours. The activation row and cron job must both be active before an
enqueue is allowed.

Run production SQL below as the database `postgres` role. Client roles cannot
see the private schema, tables, or functions.

## Short-lived `pg_net` transport storage

Vault is the only durable source for the bearer, and scheduler audit never
stores a token, header, request body, or full response body. The asynchronous
transport still has an unavoidable private boundary: `pg_net` writes the
prepared Authorization header and empty body to its UNLOGGED request queue
until the worker consumes the row, and stores each response in its UNLOGGED
response table until TTL cleanup. Supabase owns the `net` schema and restores
platform grants that give its client roles schema usage and give `PUBLIC` table
privileges, so application migrations cannot reliably revoke those ACLs. The
actual API boundary is that `net` is not an exposed Data API schema; `anon` and
`authenticated` are also `NOLOGIN`, and CUpedia exposes no routine that proxies
arbitrary SQL into `net`. Production preflight must verify those facts and a
response TTL no greater than six hours before activation.

Supabase [generally warns against triggers on `pg_net` internal
tables](https://supabase.com/docs/guides/troubleshooting/webhook-debugging-guide-M8sk47).
This reviewed exception reads only rows whose request IDs are already in
scheduler audit, calls no `pg_net` API, and downgrades ordinary classifier/audit
errors instead of re-raising them into the worker. It copies bounded result
metadata into the 14-day audit. Do not add other triggers to `pg_net` tables or
manually update/delete their rows.

## Production preflight

Complete and record every item before activation.

1. Confirm the intended application commit is the current Vercel Production
   deployment and is **Ready**. The deployment must contain the current `/next`
   route and its production-only `MENU_SYNC_TRIGGER_SECRET`. Keep the existing
   GitHub fallback secret and workflow enabled.

   Record the live default-branch commit and deployed workflow schedule, not
   just the local checkout:

   ```bash
   gh api repos/HomuraCatMadoka/CUpedia/commits/main --jq .sha
   gh api \
     -H 'Accept: application/vnd.github.raw+json' \
     'repos/HomuraCatMadoka/CUpedia/contents/.github/workflows/canteen-menu-sync.yml?ref=main' \
     | sed -n '/schedule:/,/workflow_dispatch:/p'
   ```

   The recorded workflow must contain exactly `37,47 0,3,9 * * *` and
   `17,47 1-2,4-8,10-15 * * *`, and the recorded commit must be the intended
   rollout commit. Do not activate before the default-branch `:37` stagger is
   live; a local or pending workflow change does not make the first cycle
   attributable to Supabase.

2. In Supabase **Integrations → Data API**, record the current exposed-schema
   list. Expected: `public,graphql_public`, matching the current [server-only
   boundary audit](./supabase-data-api-boundary.md). `net` must not appear in the
   Data API exposed-schema list. Stop if it is exposed; changing extension table
   grants from an application migration is not a supported substitute for this
   gate.

3. Confirm the migration completed, required extensions are present, and the
   short-lived `pg_net` transport boundary is healthy:

   ```sql
   SELECT extname, extversion
   FROM pg_extension
   WHERE extname IN ('pg_cron', 'pg_net', 'supabase_vault')
   ORDER BY extname;

   SELECT current_setting('pg_net.ttl', true) AS pg_net_ttl;
   SELECT net.check_worker_is_up();

   SELECT role.rolname, role.rolcanlogin,
          has_schema_privilege(role.rolname, 'net', 'USAGE')
            AS net_schema_usage,
          has_table_privilege(
            role.rolname,
            'net.http_request_queue',
            'SELECT'
          ) AS request_queue_select
   FROM pg_roles AS role
   WHERE role.rolname IN ('anon', 'authenticated')
   ORDER BY role.rolname;

   SELECT class.relname, class.relpersistence
   FROM pg_class AS class
   JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
   WHERE namespace.nspname = 'net'
     AND class.relname IN ('http_request_queue', '_http_response')
   ORDER BY class.relname;
   ```

   Expected: all three extensions exist; `pg_net_ttl` is greater than zero and
   no more than `6 hours`; `net.check_worker_is_up()` completes without error;
   `anon` and `authenticated` both have `rolcanlogin = false`; and both transport
   rows have `relpersistence = 'u'` (UNLOGGED). `net_schema_usage` and
   `request_queue_select` are expected to be true on the pinned Supabase image:
   they expose the platform-owned ACL exception that makes step 2 mandatory,
   not an alternate access approval. Do not activate if any other result
   differs.

4. Confirm the Cron clock is UTC and exactly one reviewed, inactive job exists:

   ```sql
   SELECT current_setting('cron.timezone') AS cron_timezone;

   SELECT jobid, jobname, schedule, command, database, username, active
   FROM cron.job
   WHERE jobname = 'cupedia-canteen-menu-sync-wakeup';
   ```

   Expected: `cron_timezone` is `GMT`, `UTC`, `Etc/GMT`, or `Etc/UTC`; the job
   query returns one row with the exact fixed contract above, current database,
   `username = 'postgres'`, and `active = false`. Activation fails closed for a
   different Cron timezone. If the job row is missing or wrong, run the
   repeatable repair below and review the result again:

   ```sql
   SELECT canteen_menu_scheduler.reconcile_job();
   ```

   `reconcile_job()` deliberately returns the installation to inactive and
   unconfigured state.

5. Capture the source baseline. Review intentionally enabled sources, meal
   periods, closed weekdays, stale claims, last successes, and current errors:

   ```sql
   SELECT id, provider, external_owner_id, external_store_id,
          sync_meal_periods, closed_weekdays, enabled,
          sync_claim_token IS NOT NULL AS has_claim,
          sync_claim_expires_at, last_success_at, last_error_code
   FROM public.canteen_menu_sources
   ORDER BY enabled DESC, provider, external_store_id;
   ```

   Resolve unexpected active claims, disabled sources, meal periods, closed
   weekdays, or review-required errors before using scheduler results as a
   baseline.

   Record the expected applicable-source count for every HKT weekday and meal
   period. This is the denominator used by the natural-window checks:

   ```sql
   WITH weekdays AS (
     SELECT generate_series(0, 6)::integer AS hkt_weekday
   ),
   meal_periods(meal_period) AS (
     VALUES ('breakfast'), ('lunch'), ('dinner')
   )
   SELECT weekday.hkt_weekday,
          meal.meal_period,
          count(source.id)::integer AS applicable_source_count
   FROM weekdays AS weekday
   CROSS JOIN meal_periods AS meal
   LEFT JOIN public.canteen_menu_sources AS source
     ON source.enabled
    AND meal.meal_period = ANY(source.sync_meal_periods)
    AND weekday.hkt_weekday <> ALL(source.closed_weekdays)
   GROUP BY weekday.hkt_weekday, meal.meal_period
   ORDER BY weekday.hkt_weekday, meal.meal_period;
   ```

6. Capture the preceding seven-day business baseline:

   ```sql
   SELECT source.id, source.provider, source.external_store_id,
          snapshot.observation_scope,
          max(snapshot.observed_at) AS latest_snapshot_at,
          count(snapshot.run_id) FILTER (
            WHERE snapshot.observed_at >= now() - interval '7 days'
          ) AS snapshots_7d,
          count(snapshot.run_id) FILTER (
            WHERE snapshot.observed_at >= now() - interval '7 days'
              AND snapshot.item_count > 0
          ) AS nonempty_snapshots_7d
   FROM public.canteen_menu_sources AS source
   LEFT JOIN public.canteen_menu_sync_snapshots AS snapshot
     ON snapshot.menu_source_id = source.id
   WHERE source.enabled
   GROUP BY source.id, source.provider, source.external_store_id,
            snapshot.observation_scope
   ORDER BY source.provider, source.external_store_id,
            snapshot.observation_scope;

   WITH accepted_snapshots AS (
     SELECT snapshot.*
     FROM public.canteen_menu_sync_snapshots AS snapshot
     JOIN public.canteen_menu_sync_runs AS run ON run.id = snapshot.run_id
     WHERE run.status IN ('applied', 'unchanged')
       AND snapshot.item_count > 0
   ),
   ranked_snapshots AS (
     SELECT source.id AS menu_source_id,
            source.provider,
            source.external_store_id,
            snapshot.run_id,
            snapshot.observation_scope,
            snapshot.snapshot_completeness,
            snapshot.snapshot_hash,
            snapshot.item_count,
            snapshot.sync_window_key,
            snapshot.meal_period,
            snapshot.hkt_weekday,
            snapshot.observed_minute_of_day,
            snapshot.observed_at,
            row_number() OVER (
              PARTITION BY source.id, snapshot.observation_scope
              ORDER BY snapshot.observed_at DESC NULLS LAST,
                       snapshot.run_id DESC NULLS LAST
            ) AS rank
     FROM public.canteen_menu_sources AS source
     LEFT JOIN accepted_snapshots AS snapshot
       ON snapshot.menu_source_id = source.id
     WHERE source.enabled
   )
   SELECT *
   FROM ranked_snapshots
   WHERE rank = 1
   ORDER BY provider, external_store_id, observation_scope;

   SELECT source.id, source.provider, source.external_store_id,
          count(item.id) FILTER (WHERE item.is_available) AS active_items,
          count(item.id) FILTER (WHERE NOT item.is_available) AS inactive_items
   FROM public.canteen_menu_sources AS source
   LEFT JOIN public.canteen_menu_items AS item
     ON item.menu_source_id = source.id
   WHERE source.enabled
   GROUP BY source.id, source.provider, source.external_store_id
   ORDER BY source.provider, source.external_store_id;

   SELECT status, error_code, count(*)
   FROM public.canteen_menu_sync_runs
   WHERE completed_at IS NULL
      OR completed_at >= now() - interval '7 days'
   GROUP BY status, error_code
   ORDER BY status, error_code;
   ```

7. Record database headroom before adding the clock:

   ```sql
   SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;

   SELECT count(*) AS connections,
          count(*) FILTER (WHERE state = 'active') AS active_connections
   FROM pg_stat_activity
   WHERE datname = current_database();
   ```

8. Provision the bearer through the approved Supabase Vault secret-entry UI or
   secret-management channel. Use the stable name
   `cupedia_canteen_menu_sync_bearer` and the same securely generated value as
   the production endpoint expects. Never paste the value into SQL, shell
   history, an issue, a pull request, or a chat.
9. Verify only non-secret Vault metadata:

   ```sql
   SELECT id, name, created_at, updated_at
   FROM vault.secrets
   WHERE name = 'cupedia_canteen_menu_sync_bearer';
   ```

   Expected: exactly one row. Do not query `vault.decrypted_secrets`,
   `vault.secrets.secret`, or columns from `net.http_request_queue` during
   operations; those views or columns can reveal the bearer or its header. The
   bounded `count(*)` health check below is the only approved queue read.

## Activate

Choose a time outside the three primary minute-17-to-32 ranges, complete the
preflight, then run:

```sql
SELECT canteen_menu_scheduler.activate();
```

The call is repeatable. It verifies the UTC Cron timezone, exact sole job, Vault
secret, bounded `pg_net` TTL, and running worker, then changes the activation
guard and cron state in one transaction. Verify both controls:

```sql
SELECT environment, active, activated_at, deactivated_at, updated_at
FROM canteen_menu_scheduler.activation
WHERE singleton;

SELECT jobid, schedule, command, database, username, active
FROM cron.job
WHERE jobname = 'cupedia-canteen-menu-sync-wakeup';
```

Expected: `environment = 'production'` and both active flags are true. Do not
manually update either table.

## Deactivate

This is the first response to unexpected delivery, auth failures, load, or a
secret incident:

```sql
SELECT canteen_menu_scheduler.deactivate();
```

The call is repeatable and stops future primary ticks without deleting audit or
business history. Verify the activation row and named job are both inactive
using the queries above. GitHub's delayed fallback and manual dispatch remain
available.

If the Vault secret is missing at activation time, `activate()` fails. If it is
removed after activation, each cron invocation fails with the generic
`CANTEEN_MENU_SYNC_VAULT_SECRET_MISSING` code before calling `pg_net`; no
request, header, or token is written to scheduler audit.

## Rotate or revoke the bearer

There is no safe need to read the current value.

For routine rotation:

1. Pick a gap between scheduled wakes and deactivate Supabase Cron.
2. Confirm `SELECT count(*) FROM net.http_request_queue;` returns zero. If it
   does not, investigate the worker; changing Vault does not rewrite a header
   already queued inside `pg_net`, and operators must not delete queue rows.
3. Generate a new high-entropy value in the approved secret manager.
4. In one short maintenance window, replace the value in Vercel Production,
   the GitHub Actions secret, and the existing Vault secret with the stable
   name. Because the endpoint accepts one value, avoid a scheduled GitHub run
   during this three-system update.
5. Verify only Vault metadata and deployment readiness. Never test by printing
   or selecting the value.
6. Use `workflow_dispatch` once and confirm its business run and non-empty
   snapshot, then activate Supabase Cron and begin the health checks below.

For emergency revocation, deactivate first and invalidate the old endpoint
credential before changing its Vault and GitHub copies. That makes any request
already queued with the old header fail authentication when the worker resumes.
Keep the scheduler inactive until the request queue is empty and a manual
fallback run plus business snapshot succeed. Deleting only the Vault copy blocks
future primary enqueues but does not erase a queued header or revoke copies used
by the endpoint and GitHub fallback.

## Four-layer health checks

Scheduler delivery evidence is kept for 14 days. Inspect a seven-day range so
there is recovery margin. Start at a UTC day boundary; this avoids interpreting
a partial first primary window as a whole window.

```sql
WITH bounds AS (
  SELECT
    (date_trunc('day', now() AT TIME ZONE 'UTC') - interval '7 days')
      AT TIME ZONE 'UTC' AS from_time,
    now() AS to_time
)
SELECT health.*
FROM bounds
CROSS JOIN LATERAL canteen_menu_scheduler.delivery_health(
  bounds.from_time,
  bounds.to_time
) AS health
ORDER BY health.expected_tick_at;

SELECT count(*) AS pending_pg_net_requests
FROM net.http_request_queue;
```

`delivery_health` covers the first three layers:

1. **Cron tick:** every expected minute has a `cron.job_run_details` row.
   `cron-tick-missing` means the primary clock did not run. When an audit row
   contains `cron_run_id`, health joins that exact run rather than another run
   from the same minute; `evidence-unmatched` means the stored identity has no
   matching reviewed-job history.
2. **HTTP enqueue/delivery:** the tick created a correlated `pg_net` request and
   received a result. Investigate `enqueue-failed`, `http-pending`,
   `http-timeout`, or `http-failed`. The audit stores only bounded metadata;
   `pg_net` removes a consumed request queue row and retains the private full
   response only until its configured TTL.
3. **Endpoint contract:** 401/403, malformed JSON, unknown dispositions,
   `retry-later`, and `stop-for-review` remain distinct. A 2xx response is not
   yet proof of menu completion.

The fourth layer joins scheduler evidence to the menu domain's durable runs and
snapshots:

```sql
WITH bounds AS (
  SELECT
    (date_trunc('day', now() AT TIME ZONE 'UTC') - interval '7 days')
      AT TIME ZONE 'UTC' AS from_time,
    now() AS to_time
)
SELECT health.*
FROM bounds
CROSS JOIN LATERAL canteen_menu_scheduler.window_health(
  bounds.from_time,
  bounds.to_time
) AS health
ORDER BY health.primary_starts_at;
```

4. **Business completion:** every enabled source applicable to that HKT weekday
   and meal period must have an `applied` or `unchanged` run joined to a
   snapshot with `item_count > 0` and the exact sync-window key. HTTP 2xx,
   `continue`, and `no-work` do not replace this proof. For a healthy primary,
   `primary_completed_at` is the completion time of the last applicable source;
   a no-applicable-source window uses its first correlated `no-work` completion.

Interpret final window classifications as follows:

| Classification                                                             | Meaning and action                                                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `primary-drained-window`                                                   | All applicable sources completed with non-empty snapshots by minute 35; every missing tick was followed by a successful later primary tick. Healthy primary result. |
| `fallback-completed-window`                                                | Completion occurred after the primary cutoff and by minute 55. GitHub fallback recovered the window; investigate the primary gap.                                   |
| `retry-still-due`                                                          | A retry remained due at observation time. Recheck after its bounded backoff.                                                                                        |
| `review-required`                                                          | Identity churn, suspicious drop, conflict, or retry limit requires a human review. Do not force a success.                                                          |
| `inapplicable-source-ran`                                                  | A disabled, closed-day, or wrong-meal source ran. Treat as a correctness incident.                                                                                  |
| `provider-application-failed`                                              | Provider or application processing failed. Use the matching durable run and source error code.                                                                      |
| `endpoint-rejected-or-malformed`                                           | Authentication or response-contract failure. Deactivate if repeated.                                                                                                |
| `http-failed`, `enqueue-failed`, `evidence-unmatched`, `cron-tick-missing` | Transport or evidence correlation failed. GitHub may still recover by minute 55.                                                                                    |
| `incomplete`                                                               | No earlier class explains missing non-empty business completion. Inspect source runs and snapshots.                                                                 |

A window with no applicable sources is complete without inventing a snapshot.
For a window with applicable sources, do not declare success from a green cron
run, a queued request, HTTP 200, or `no-work` alone.

For an individual source, correlate the same `sync_window_key` in
`canteen_menu_sync_runs` and `canteen_menu_sync_snapshots`. Scheduler audit is
deliberately bounded and contains no headers, bodies, raw provider data, source
IDs, or bearer. Use business tables for detailed diagnosis.

## Seven-day observation gate

Record the following once after activation, then after every initial breakfast,
lunch, and dinner window for seven consecutive days:

- activation and exact named-job state;
- counts by `delivery_health.classification`;
- every row from `window_health`, including `primary_completed_at` and primary
  versus fallback completion;
- applicable-source count, non-empty completed-source count, and any source/run
  error code;
- database size and active connection count;
- GitHub fallback result at minute 37 and any manual dispatch;
- new Supabase database advisor warnings.

The seven-day gate passes only when:

- the job remains exact and no duplicate named job appears;
- no window has all 16 Supabase ticks missing; individual missing ticks are
  acceptable only when later primary ticks recover before minute 35 and the
  missing count remains visible;
- every applicable initial window reaches `primary-drained-window` by minute
  35; a `fallback-completed-window` preserves menu freshness but fails the
  scheduler acceptance gate and must restart or extend observation;
- no pending HTTP request, evidence-correlation, enqueue/HTTP/auth/malformed-
  response failure, inapplicable run, unresolved retry, provider failure, or
  review-required class remains;
- each intentionally enabled and operating source has a matching non-empty
  snapshot in every applicable observed window;
- no unexpected connection, database-size, scheduler-audit, or pending
  `pg_net` request-queue growth appears;
- no new advisor finding is introduced by the scheduler objects.

The observation must include at least one closed-day or otherwise inapplicable
source case. After a healthy primary drain, the minute-37 GitHub fallback must
return `no-work`; any window first completed by fallback fails acceptance even
when final data is repaired.

Only after all seven days pass, open a separate cleanup issue to remove GitHub
`schedule` while retaining `workflow_dispatch`. Consider an independent
failure-domain watchdog in another issue only if the recorded evidence still
shows that need.

## Data-safety comparison

Compare the preflight baseline after every natural cycle. The scheduler is only
a wake-up transport, so these menu invariants must remain unchanged:

- `(menu_source_id, external_product_id)` still identifies at most one managed
  row, and unchanged or restored identities keep the same CUpedia UUID;
- votes and comments attached to those UUIDs remain present;
- complete catalog observations deactivate only according to accepted catalog
  authority;
- partial meal-period observations update only their accepted period, and one
  period does not deactivate another period's visible items;
- public menu reads contain only active rows while inactive identity/history
  rows remain stored.

Before activation, save this managed-identity ledger; run the same query after
each natural cycle and compare by `(menu_source_id, external_product_id)`. The
`cupedia_uuid`, vote count, and comment count must not change for an existing
identity, including an identity that becomes inactive or later returns:

```sql
SELECT item.menu_source_id,
       item.external_product_id,
       item.id AS cupedia_uuid,
       item.is_available,
       item.meal_periods,
       count(DISTINCT vote.id)::integer AS vote_count,
       count(DISTINCT comment.id)::integer AS comment_count
FROM public.canteen_menu_items AS item
LEFT JOIN public.canteen_dish_votes AS vote ON vote.menu_item_id = item.id
LEFT JOIN public.canteen_dish_comments AS comment
  ON comment.menu_item_id = item.id
WHERE item.menu_source_id IS NOT NULL
  AND item.external_product_id IS NOT NULL
GROUP BY item.menu_source_id, item.external_product_id, item.id,
         item.is_available, item.meal_periods
ORDER BY item.menu_source_id, item.external_product_id;
```

For each completed natural window, replace the example key below and inspect
the accepted snapshot contract directly. `recorded_item_count` must equal
`item_count`; review the period, HKT weekday, completeness, scope, 64-character
hash, and provider scope evidence before accepting the window:

```sql
WITH target(sync_window_key) AS (
  VALUES ('2026-08-26/lunch')
)
SELECT source.id AS menu_source_id,
       source.provider,
       source.external_store_id,
       run.status,
       snapshot.run_id,
       snapshot.meal_period,
       snapshot.hkt_weekday,
       snapshot.observed_minute_of_day,
       snapshot.snapshot_completeness,
       snapshot.observation_scope,
       snapshot.snapshot_hash,
       snapshot.item_count,
       count(snapshot_item.external_product_id)::integer
         AS recorded_item_count,
       snapshot.scope_evidence,
       snapshot.observed_at
FROM target
JOIN public.canteen_menu_sync_snapshots AS snapshot
  ON snapshot.sync_window_key = target.sync_window_key
JOIN public.canteen_menu_sync_runs AS run ON run.id = snapshot.run_id
JOIN public.canteen_menu_sources AS source
  ON source.id = snapshot.menu_source_id
LEFT JOIN public.canteen_menu_sync_snapshot_items AS snapshot_item
  ON snapshot_item.run_id = snapshot.run_id
WHERE run.status IN ('applied', 'unchanged')
  AND snapshot.item_count > 0
GROUP BY source.id, source.provider, source.external_store_id, run.status,
         snapshot.run_id, snapshot.meal_period, snapshot.hkt_weekday,
         snapshot.observed_minute_of_day, snapshot.snapshot_completeness,
         snapshot.observation_scope, snapshot.snapshot_hash,
         snapshot.item_count, snapshot.scope_evidence, snapshot.observed_at
ORDER BY source.provider, source.external_store_id;
```

This duplicate check must return no rows:

```sql
SELECT menu_source_id, external_product_id, count(*)
FROM public.canteen_menu_items
WHERE menu_source_id IS NOT NULL
  AND external_product_id IS NOT NULL
GROUP BY menu_source_id, external_product_id
HAVING count(*) > 1;
```

## Database advisors

CI runs the advisors against the full Supabase PostgreSQL 17 replay. For a
linked production review, use the authenticated CLI without putting a database
password in shell history:

```bash
supabase db advisors --linked --type all --level warn
```

Compare known findings; do not waive a new scheduler finding merely because CI
already permits a separately documented pre-existing warning.

## Rollback and recovery

For immediate containment, deactivate. The delayed GitHub schedule continues
to provide fallback; use `workflow_dispatch` if a window needs recovery.

For a full clock rollback:

1. Run `canteen_menu_scheduler.deactivate()` and verify both active flags are
   false.
2. Restore the GitHub workflow schedule to `17,47 0-15 * * *`, preserving
   `workflow_dispatch`, the fixed production origin, concurrency, and drain
   script. Deploy that workflow change and confirm a non-empty business
   snapshot in an applicable window.
3. Keep the private audit and business history for diagnosis. Do not drop
   `pg_cron`, `pg_net`, Vault, or their shared schemas; other Supabase features
   may use them.
4. After the restored GitHub clock is proven, the named database job may be
   removed with the supported API only:

   ```sql
   SELECT cron.unschedule('cupedia-canteen-menu-sync-wakeup');
   ```

   Remove no other job. If the primary is installed again later, call
   `canteen_menu_scheduler.reconcile_job()`, review its inactive state, repeat
   the full preflight, and explicitly activate.

5. Remove or rotate the Vault secret only after deactivation and an empty
   `net.http_request_queue`. If the endpoint and GitHub fallback still operate,
   keep their credential valid.

Rollback never rewrites menu runs, snapshots, identities, votes, comments, or
current-menu projection. It changes only which clock wakes the existing
one-source endpoint.
