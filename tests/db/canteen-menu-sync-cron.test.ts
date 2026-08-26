import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

const migrationSql = readFileSync(
  "src/db/migrations/0094_supabase-canteen-menu-sync-cron.sql",
  "utf8",
);
const runbookText = readFileSync(
  "docs/operations/canteen-menu-sync-scheduling.md",
  "utf8",
);
const hasSupabaseSchedulerDb =
  process.env.SUPABASE_SCHEDULER_TEST === "1" &&
  Boolean(process.env.DATABASE_URL);

const JOB_NAME = "cupedia-canteen-menu-sync-wakeup";
const JOB_SCHEDULE = "17-32 0,3,9 * * *";
const JOB_COMMAND =
  "SELECT canteen_menu_scheduler.enqueue_canteen_menu_sync_wakeup()";
const WRONG_OWNER_ROLE = "canteen_scheduler_wrong_owner";
const WRONG_OWNER_PASSWORD = "scheduler-test-only-password";
const VAULT_SECRET_NAME = "cupedia_canteen_menu_sync_bearer";
const FIXED_TARGET = "https://cupedia.org/api/internal/canteen-menu-sync/next";
const TEST_WINDOW = "2026-08-24/lunch";
const TEST_TICK = new Date("2026-08-24T03:17:00.000Z");
const TEST_RECOVERY_TICK = new Date("2026-08-24T03:32:00.000Z");

describe("Supabase canteen menu scheduler migration #757", () => {
  it("installs the reviewed fixed, inactive scheduler contract", () => {
    expect(migrationSql).toContain("CREATE EXTENSION IF NOT EXISTS pg_cron");
    expect(migrationSql).toContain("CREATE EXTENSION IF NOT EXISTS pg_net");
    expect(migrationSql).toContain(JOB_NAME);
    expect(migrationSql).toContain(JOB_SCHEDULE);
    expect(migrationSql).toContain(JOB_COMMAND);
    expect(migrationSql.split(FIXED_TARGET)).toHaveLength(2);
    expect(migrationSql).toContain("timeout_milliseconds := 65000");
    expect(migrationSql).toContain(`name = '${VAULT_SECRET_NAME}'`);
    expect(migrationSql).toContain("interval '14 days'");
    expect(migrationSql).toContain("LIMIT 500");
    expect(migrationSql).toContain("details.runid = audit.cron_run_id");
    expect(migrationSql).toContain("primary_completed_at timestamptz");
  });

  it("uses supported cron functions and keeps all privileged helpers private", () => {
    expect(migrationSql).toMatch(/cron\.schedule\(/);
    expect(migrationSql).toMatch(/cron\.alter_job\(/);
    expect(migrationSql).toMatch(/cron\.unschedule\(/);
    expect(migrationSql).not.toMatch(/insert\s+into\s+cron\.job\b/i);
    expect(migrationSql).not.toMatch(/update\s+cron\.job\b/i);
    expect(migrationSql).not.toMatch(/security\s+definer/i);
    expect(
      migrationSql.match(/SECURITY INVOKER/g)?.length,
    ).toBeGreaterThanOrEqual(8);
    expect(migrationSql).toContain(
      "REVOKE ALL ON SCHEMA canteen_menu_scheduler FROM PUBLIC",
    );
    expect(migrationSql).not.toMatch(/MENU_SYNC_TRIGGER_SECRET\s*=/);
    expect(JOB_COMMAND).not.toContain("Authorization");
    expect(JOB_COMMAND).not.toContain(FIXED_TARGET);
  });

  it("documents repeatable activation, observation, and named-job rollback", () => {
    expect(runbookText).toContain(
      "SELECT canteen_menu_scheduler.reconcile_job();",
    );
    expect(runbookText).toContain("SELECT canteen_menu_scheduler.activate();");
    expect(runbookText).toContain(
      "SELECT canteen_menu_scheduler.deactivate();",
    );
    expect(runbookText).toContain(`SELECT cron.unschedule('${JOB_NAME}');`);
    expect(runbookText).toContain("Seven-day observation gate");
    expect(runbookText).toMatch(/fails the\s+scheduler acceptance gate/);
    expect(runbookText).toContain("Do not query `vault.decrypted_secrets`");
    expect(runbookText).toContain("current_setting('cron.timezone')");
    expect(runbookText).toContain("all 16 Supabase ticks missing");
    expect(runbookText).toContain("evidence-unmatched");
  });
});

type AuditRow = {
  request_id: string;
  http_status: number | null;
  delivery_error: string | null;
  endpoint_disposition: string | null;
  business_code: string | null;
  completed_at: Date | null;
};

describe.skipIf(!hasSupabaseSchedulerDb)(
  "Supabase canteen menu scheduler integration #757",
  () => {
    let pool: Pool;
    let httpDouble: Server;
    let httpDoublePort: number;
    const receivedAuthorizationHeaders: string[] = [];

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query(`
        DO $role$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_roles WHERE rolname = '${WRONG_OWNER_ROLE}'
          ) THEN
            CREATE ROLE ${WRONG_OWNER_ROLE}
              LOGIN PASSWORD '${WRONG_OWNER_PASSWORD}';
          END IF;
        END
        $role$
      `);
      await pool.query(
        `ALTER ROLE ${WRONG_OWNER_ROLE}
         WITH LOGIN PASSWORD '${WRONG_OWNER_PASSWORD}'`,
      );
      await pool.query(`GRANT USAGE ON SCHEMA cron TO ${WRONG_OWNER_ROLE}`);
      await pool.query(
        `GRANT CONNECT ON DATABASE postgres TO ${WRONG_OWNER_ROLE}`,
      );
      await pool.query(
        `GRANT EXECUTE ON FUNCTION cron.schedule(text, text, text)
         TO ${WRONG_OWNER_ROLE}`,
      );
      httpDouble = createServer((request, response) => {
        const authorization = request.headers.authorization;
        if (authorization) receivedAuthorizationHeaders.push(authorization);

        const sendJson = (status: number, value: unknown) => {
          response.writeHead(status, { "content-type": "application/json" });
          response.end(JSON.stringify(value));
        };
        const window = TEST_WINDOW;
        switch (request.url) {
          case "/continue":
            sendJson(200, {
              disposition: "continue",
              window,
              sourceId: "source-1",
              result: {
                sourceId: "source-1",
                status: "applied",
                code: "MENU_SYNC_APPLIED",
                itemCount: 1,
              },
            });
            break;
          case "/retry-later":
            sendJson(200, {
              disposition: "retry-later",
              window,
              sourceId: "source-1",
              code: "PROVIDER_TIMEOUT",
              result: {
                sourceId: "source-1",
                status: "provider-failure",
                code: "PROVIDER_TIMEOUT",
              },
            });
            break;
          case "/stop-for-review":
            sendJson(200, {
              disposition: "stop-for-review",
              window,
              sourceId: "source-1",
              code: "MENU_SYNC_IDENTITY_CHURN",
              result: {
                sourceId: "source-1",
                status: "blocked",
                code: "MENU_SYNC_IDENTITY_CHURN",
              },
            });
            break;
          case "/retry-limit":
            sendJson(200, {
              disposition: "stop-for-review",
              window,
              sourceId: "source-1",
              code: "MENU_SYNC_RETRY_LIMIT",
              result: {
                sourceId: "source-1",
                status: "provider-failure",
                code: "PROVIDER_TIMEOUT",
              },
            });
            break;
          case "/no-work":
            sendJson(200, { disposition: "no-work", window });
            break;
          case "/truncated-continue":
            sendJson(200, {
              disposition: "continue",
              window,
              result: { code: "MENU_SYNC_APPLIED" },
            });
            break;
          case "/mismatched-result":
            sendJson(200, {
              disposition: "continue",
              window,
              sourceId: "source-1",
              result: {
                sourceId: "source-2",
                status: "applied",
                code: "MENU_SYNC_APPLIED",
                itemCount: 1,
              },
            });
            break;
          case "/unauthorized":
            sendJson(401, { error: "UNAUTHORIZED" });
            break;
          case "/invalid-json":
            response.writeHead(200, { "content-type": "application/json" });
            response.end("not-json");
            break;
          case "/unsupported-disposition":
            sendJson(200, { disposition: "unknown", window });
            break;
          case "/wrong-window":
            sendJson(200, {
              disposition: "no-work",
              window: "2026-08-24/dinner",
            });
            break;
          case "/slow":
            setTimeout(
              () => sendJson(200, { disposition: "no-work", window }),
              250,
            );
            break;
          default:
            sendJson(404, { error: "NOT_FOUND" });
        }
      });
      await listen(httpDouble);
      httpDoublePort = (httpDouble.address() as AddressInfo).port;
    });

    afterAll(async () => {
      await pool?.query("delete from vault.secrets where name = $1", [
        VAULT_SECRET_NAME,
      ]);
      await pool?.end();
      await close(httpDouble);
    });

    it("replays the full Supabase setup to one reviewed inactive job", async () => {
      const extensionRows = await pool.query<{
        extname: string;
        extversion: string;
      }>(
        `select extname, extversion
         from pg_extension
         where extname in ('pg_cron', 'pg_net', 'supabase_vault')
         order by extname`,
      );
      expect(extensionRows.rows).toEqual([
        { extname: "pg_cron", extversion: "1.6.4" },
        { extname: "pg_net", extversion: "0.20.3" },
        { extname: "supabase_vault", extversion: "0.3.1" },
      ]);

      const initialJob = await readReviewedJobs(pool);
      expect(initialJob).toEqual([
        {
          jobid: expect.any(String),
          jobname: JOB_NAME,
          schedule: JOB_SCHEDULE,
          command: JOB_COMMAND,
          database: "postgres",
          username: "postgres",
          active: false,
        },
      ]);
      expect(await queueCount(pool)).toBe(0);
      expect(await readAuditRows(pool)).toEqual([]);

      await pool.query(
        `select cron.alter_job(
           $1,
           schedule := '0 0 1 1 *',
           command := 'SELECT 1',
           active := true
         )`,
        [initialJob[0].jobid],
      );
      const queuedBeforeReplay = await queueCount(pool);

      await pool.query(migrationSql);
      expect(await readReviewedJobs(pool)).toEqual([
        {
          jobid: initialJob[0].jobid,
          jobname: JOB_NAME,
          schedule: JOB_SCHEDULE,
          command: JOB_COMMAND,
          database: "postgres",
          username: "postgres",
          active: false,
        },
      ]);

      await pool.query("select cron.unschedule($1::bigint)", [
        initialJob[0].jobid,
      ]);
      const membershipBeforeReconcile = await readWrongOwnerMemberships(pool);
      const wrongOwnerJobId = await scheduleWrongOwnerJob(
        "0 0 1 1 *",
        "SELECT 1",
      );
      await pool.query(migrationSql);
      await pool.query(migrationSql);

      const reconciledJobs = await readReviewedJobs(pool);
      expect(reconciledJobs).toEqual([
        {
          jobid: expect.any(String),
          jobname: JOB_NAME,
          schedule: JOB_SCHEDULE,
          command: JOB_COMMAND,
          database: "postgres",
          username: "postgres",
          active: false,
        },
      ]);
      expect(reconciledJobs[0].jobid).not.toBe(wrongOwnerJobId);
      expect(await readWrongOwnerMemberships(pool)).toEqual(
        membershipBeforeReconcile,
      );
      expect(await queueCount(pool)).toBe(queuedBeforeReplay);
      const activation = await pool.query<{
        environment: string;
        active: boolean;
      }>(
        `select environment, active
         from canteen_menu_scheduler.activation`,
      );
      expect(activation.rows).toEqual([
        { environment: "unconfigured", active: false },
      ]);
    });

    it("fails closed until production activation and the named Vault secret exist", async () => {
      await pool.query("delete from vault.secrets where name = $1", [
        VAULT_SECRET_NAME,
      ]);
      const queuedBefore = await queueCount(pool);

      const inactiveCall = await pool.query<{ request_id: string | null }>(
        `select canteen_menu_scheduler.enqueue_canteen_menu_sync_wakeup()
           as request_id`,
      );
      expect(inactiveCall.rows).toEqual([{ request_id: null }]);
      await expect(
        pool.query("select canteen_menu_scheduler.activate()"),
      ).rejects.toMatchObject({
        message: "CANTEEN_MENU_SYNC_VAULT_SECRET_MISSING",
      });
      expect(await queueCount(pool)).toBe(queuedBefore);

      const runtimeToken = randomBytes(32).toString("hex");
      await pool.query(
        "select vault.create_secret($1, $2, 'CUpedia scheduler test')",
        [runtimeToken, VAULT_SECRET_NAME],
      );
      await scheduleWrongOwnerJob("0 0 1 1 *", "SELECT 1");
      expect(await readReviewedJobs(pool)).toHaveLength(2);
      await expect(
        pool.query("select canteen_menu_scheduler.activate()"),
      ).rejects.toMatchObject({
        message: "CANTEEN_MENU_SYNC_CRON_JOB_NOT_REVIEWED",
      });
      await pool.query("select canteen_menu_scheduler.reconcile_job()");
      expect(await readReviewedJobs(pool)).toMatchObject([
        {
          jobname: JOB_NAME,
          schedule: JOB_SCHEDULE,
          command: JOB_COMMAND,
          username: "postgres",
          active: false,
        },
      ]);
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select canteen_menu_scheduler.activate()");
        const activeState = await client.query<{
          environment: string;
          scheduler_active: boolean;
          job_active: boolean;
        }>(
          `select activation.environment,
                  activation.active as scheduler_active,
                  job.active as job_active
           from canteen_menu_scheduler.activation as activation
           cross join cron.job as job
           where activation.singleton
             and job.jobname = $1`,
          [JOB_NAME],
        );
        expect(activeState.rows).toEqual([
          {
            environment: "production",
            scheduler_active: true,
            job_active: true,
          },
        ]);
      } finally {
        await client.query("rollback");
        client.release();
      }

      expect(await queueCount(pool)).toBe(queuedBefore);
      expect(JSON.stringify(await readAuditRows(pool))).not.toContain(
        runtimeToken,
      );
      await pool.query("delete from vault.secrets where name = $1", [
        VAULT_SECRET_NAME,
      ]);
    });

    it("rehearses repeatable activation, deactivation, and named-job rollback", async () => {
      const runtimeToken = randomBytes(32).toString("hex");
      await pool.query(
        "select vault.create_secret($1, $2, 'CUpedia rollback rehearsal')",
        [runtimeToken, VAULT_SECRET_NAME],
      );
      const queuedBefore = await queueCount(pool);
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(
          `insert into canteen_menu_scheduler.delivery_audit (
             expected_tick_at,
             sync_window_key,
             request_id
           ) values ($1, $2, -900002)`,
          [TEST_TICK, TEST_WINDOW],
        );

        await client.query("select canteen_menu_scheduler.activate()");
        await client.query("select canteen_menu_scheduler.activate()");
        await client.query("select canteen_menu_scheduler.deactivate()");
        await client.query("select canteen_menu_scheduler.deactivate()");
        const inactiveState = await client.query<{
          scheduler_active: boolean;
          job_active: boolean;
        }>(
          `select activation.active as scheduler_active,
                  job.active as job_active
           from canteen_menu_scheduler.activation as activation
           cross join cron.job as job
           where activation.singleton
             and job.jobname = $1`,
          [JOB_NAME],
        );
        expect(inactiveState.rows).toEqual([
          { scheduler_active: false, job_active: false },
        ]);

        await client.query("select cron.unschedule($1)", [JOB_NAME]);
        expect(
          await client.query("select 1 from cron.job where jobname = $1", [
            JOB_NAME,
          ]),
        ).toMatchObject({ rowCount: 0 });
        const preservedBeforeReinstall = await client.query<{
          activation_table: string;
          audit_table: string;
          audit_rows: number;
        }>(
          `select
             to_regclass('canteen_menu_scheduler.activation')::text
               as activation_table,
             to_regclass('canteen_menu_scheduler.delivery_audit')::text
               as audit_table,
             count(*)::integer as audit_rows
           from canteen_menu_scheduler.delivery_audit
           where request_id = -900002`,
        );
        expect(preservedBeforeReinstall.rows).toEqual([
          {
            activation_table: "canteen_menu_scheduler.activation",
            audit_table: "canteen_menu_scheduler.delivery_audit",
            audit_rows: 1,
          },
        ]);

        await client.query("select canteen_menu_scheduler.reconcile_job()");
        const reinstalled = await client.query<{
          jobname: string;
          username: string;
          active: boolean;
          environment: string;
          audit_rows: number;
        }>(
          `select job.jobname,
                  job.username,
                  job.active,
                  activation.environment,
                  (
                    select count(*)::integer
                    from canteen_menu_scheduler.delivery_audit
                    where request_id = -900002
                  ) as audit_rows
           from cron.job as job
           cross join canteen_menu_scheduler.activation as activation
           where job.jobname = $1
             and activation.singleton`,
          [JOB_NAME],
        );
        expect(reinstalled.rows).toEqual([
          {
            jobname: JOB_NAME,
            username: "postgres",
            active: false,
            environment: "unconfigured",
            audit_rows: 1,
          },
        ]);
      } finally {
        await client.query("rollback");
        client.release();
        await pool.query("delete from vault.secrets where name = $1", [
          VAULT_SECRET_NAME,
        ]);
      }

      expect(await queueCount(pool)).toBe(queuedBefore);
      expect(JSON.stringify(await readAuditRows(pool))).not.toContain(
        runtimeToken,
      );
    });

    it("retains fourteen days of delivery evidence and prunes in bounded batches", async () => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(
          `insert into canteen_menu_scheduler.delivery_audit (
             expected_tick_at,
             sync_window_key,
             request_id,
             request_created_at
           )
           select $1, $2, -910000 - sequence, clock_timestamp() - interval '15 days'
           from generate_series(1, 501) as sequence`,
          [TEST_TICK, TEST_WINDOW],
        );
        await client.query(
          `insert into canteen_menu_scheduler.delivery_audit (
             expected_tick_at,
             sync_window_key,
             request_id,
             request_created_at
           ) values ($1, $2, -920000, clock_timestamp() - interval '13 days')`,
          [TEST_TICK, TEST_WINDOW],
        );

        const firstPrune = await client.query<{ deleted: number }>(
          `select canteen_menu_scheduler.prune_delivery_evidence(jobid)
             as deleted
           from cron.job
           where jobname = $1
             and username = 'postgres'`,
          [JOB_NAME],
        );
        expect(firstPrune.rows).toEqual([{ deleted: 500 }]);
        expect(await readRetentionFixtureCounts(client)).toEqual({
          expired: 1,
          retained: 1,
        });

        const secondPrune = await client.query<{ deleted: number }>(
          `select canteen_menu_scheduler.prune_delivery_evidence(jobid)
             as deleted
           from cron.job
           where jobname = $1
             and username = 'postgres'`,
          [JOB_NAME],
        );
        expect(secondPrune.rows).toEqual([{ deleted: 1 }]);
        expect(await readRetentionFixtureCounts(client)).toEqual({
          expired: 0,
          retained: 1,
        });
      } finally {
        await client.query("rollback");
        client.release();
      }
    });

    it("correlates an audit to its cron run identity when one is recorded", async () => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(
          `delete from canteen_menu_scheduler.delivery_audit
           where sync_window_key = $1`,
          [TEST_WINDOW],
        );
        await client.query(
          `delete from cron.job_run_details
           where jobid = (
               select jobid from cron.job where jobname = $1
             )
             and start_time >= $2
             and start_time < $2::timestamptz + interval '1 minute'`,
          [JOB_NAME, TEST_TICK],
        );
        await ensureCronTick(client, TEST_TICK, -940001);
        await client.query(
          `insert into canteen_menu_scheduler.delivery_audit (
             expected_tick_at,
             sync_window_key,
             cron_run_id,
             request_id,
             http_status,
             endpoint_disposition,
             completed_at
           ) values ($1, $2, -940002, -940003, 200, 'no-work', $1)`,
          [TEST_TICK, TEST_WINDOW],
        );

        expect(await readDeliveryHealth(client)).toBe("evidence-unmatched");
        await client.query(
          `update canteen_menu_scheduler.delivery_audit
           set cron_run_id = -940001
           where request_id = -940003`,
        );
        expect(await readDeliveryHealth(client)).toBe("primary-no-work");
      } finally {
        await client.query("rollback");
        client.release();
      }
    });

    it("keeps the audit and helper privilege boundary outside client roles", async () => {
      const tables = await pool.query<{
        table_name: string;
        row_security: boolean;
      }>(
        `select class.relname as table_name,
                class.relrowsecurity as row_security
         from pg_class as class
         join pg_namespace as namespace on namespace.oid = class.relnamespace
         where namespace.nspname = 'canteen_menu_scheduler'
           and class.relkind = 'r'
         order by class.relname`,
      );
      expect(tables.rows).toEqual([
        { table_name: "activation", row_security: true },
        { table_name: "delivery_audit", row_security: true },
      ]);

      const auditColumns = await pool.query<{ column_name: string }>(
        `select column_name
         from information_schema.columns
         where table_schema = 'canteen_menu_scheduler'
           and table_name = 'delivery_audit'
         order by ordinal_position`,
      );
      expect(auditColumns.rows.map((row) => row.column_name)).toEqual([
        "id",
        "expected_tick_at",
        "sync_window_key",
        "cron_run_id",
        "request_id",
        "request_created_at",
        "http_status",
        "delivery_error",
        "endpoint_disposition",
        "business_code",
        "completed_at",
      ]);

      const functions = await pool.query<{
        proname: string;
        security_definer: boolean;
        config: string[] | null;
        acl: string | null;
      }>(
        `select procedure.proname,
                procedure.prosecdef as security_definer,
                procedure.proconfig as config,
                procedure.proacl as acl
         from pg_proc as procedure
         join pg_namespace as namespace
           on namespace.oid = procedure.pronamespace
         where namespace.nspname = 'canteen_menu_scheduler'
         order by procedure.proname`,
      );
      expect(functions.rows).toHaveLength(8);
      for (const fn of functions.rows) {
        expect(fn.security_definer).toBe(false);
        expect(fn.config).toContain("search_path=pg_catalog");
        expect(fn.acl).toBe("{postgres=X/postgres}");
      }

      for (const role of ["anon", "authenticated"]) {
        const privileges = await pool.query<{
          schema_usage: boolean;
          table_access: boolean;
          function_access: boolean;
        }>(
          `select
             has_schema_privilege($1, 'canteen_menu_scheduler', 'USAGE')
               as schema_usage,
             has_table_privilege(
               $1,
               'canteen_menu_scheduler.delivery_audit',
               'SELECT'
             ) as table_access,
             has_function_privilege(
               $1,
               'canteen_menu_scheduler.enqueue_canteen_menu_sync_wakeup()',
               'EXECUTE'
             ) as function_access`,
          [role],
        );
        expect(privileges.rows).toEqual([
          {
            schema_usage: false,
            table_access: false,
            function_access: false,
          },
        ]);
      }

      const trigger = await pool.query<{
        name: string;
        security_definer: boolean;
      }>(
        `select trigger.tgname as name,
                procedure.prosecdef as security_definer
         from pg_trigger as trigger
         join pg_proc as procedure on procedure.oid = trigger.tgfoid
         where trigger.tgrelid = 'net._http_response'::regclass
           and trigger.tgname = 'canteen_menu_scheduler_capture_response'`,
      );
      expect(trigger.rows).toEqual([
        {
          name: "canteen_menu_scheduler_capture_response",
          security_definer: false,
        },
      ]);
      const timezone = await pool.query<{ cron_timezone: string }>(
        "select current_setting('cron.timezone') as cron_timezone",
      );
      expect(timezone.rows[0].cron_timezone).toMatch(/^(?:GMT|UTC)$/);
    });

    it("durably classifies every endpoint disposition through a local HTTP double", async () => {
      receivedAuthorizationHeaders.length = 0;
      const runtimeToken = randomBytes(32).toString("hex");
      const cases = [
        ["continue", "continue", "MENU_SYNC_APPLIED"],
        ["retry-later", "retry-later", "PROVIDER_TIMEOUT"],
        ["stop-for-review", "stop-for-review", "MENU_SYNC_IDENTITY_CHURN"],
        ["retry-limit", "stop-for-review", "MENU_SYNC_RETRY_LIMIT"],
        ["no-work", "no-work", null],
      ] as const;

      for (const [path, disposition, businessCode] of cases) {
        const row = await queueHttpDoubleRequest(
          pool,
          httpDoublePort,
          path,
          runtimeToken,
        );
        expect(row).toMatchObject({
          http_status: 200,
          delivery_error: null,
          endpoint_disposition: disposition,
          business_code: businessCode,
          completed_at: expect.any(Date),
        });
      }

      expect(receivedAuthorizationHeaders).toHaveLength(cases.length);
      expect(
        receivedAuthorizationHeaders.every(
          (header) => header === `Bearer ${runtimeToken}`,
        ),
      ).toBe(true);
      expect(JSON.stringify(await readAuditRows(pool))).not.toContain(
        runtimeToken,
      );
    });

    it("rejects malformed and unsupported endpoint responses", async () => {
      const runtimeToken = randomBytes(32).toString("hex");
      const invalidJson = await queueHttpDoubleRequest(
        pool,
        httpDoublePort,
        "invalid-json",
        runtimeToken,
      );
      expect(invalidJson).toMatchObject({
        http_status: 200,
        delivery_error: "malformed-json",
        endpoint_disposition: null,
      });
      expect(await readDeliveryHealth(pool)).toBe("endpoint-malformed");

      const unsupportedDisposition = await queueHttpDoubleRequest(
        pool,
        httpDoublePort,
        "unsupported-disposition",
        runtimeToken,
      );
      expect(unsupportedDisposition).toMatchObject({
        http_status: 200,
        delivery_error: "unsupported-disposition",
        endpoint_disposition: null,
      });
      expect(await readDeliveryHealth(pool)).toBe("endpoint-malformed");

      const wrongWindow = await queueHttpDoubleRequest(
        pool,
        httpDoublePort,
        "wrong-window",
        runtimeToken,
      );
      expect(wrongWindow).toMatchObject({
        http_status: 200,
        delivery_error: "malformed-json",
        endpoint_disposition: null,
      });
      expect(await readDeliveryHealth(pool)).toBe("endpoint-malformed");

      for (const path of ["truncated-continue", "mismatched-result"]) {
        const malformedContract = await queueHttpDoubleRequest(
          pool,
          httpDoublePort,
          path,
          runtimeToken,
        );
        expect(malformedContract).toMatchObject({
          http_status: 200,
          delivery_error: "malformed-json",
          endpoint_disposition: null,
          business_code: null,
        });
        expect(await readDeliveryHealth(pool)).toBe("endpoint-malformed");
      }

      expect(JSON.stringify(await readAuditRows(pool))).not.toContain(
        runtimeToken,
      );
    }, 15_000);

    it("separates timeout, connection, and non-2xx HTTP failures", async () => {
      const runtimeToken = randomBytes(32).toString("hex");
      const unauthorized = await queueHttpDoubleRequest(
        pool,
        httpDoublePort,
        "unauthorized",
        runtimeToken,
      );
      expect(unauthorized).toMatchObject({
        http_status: 401,
        delivery_error: "http-non-2xx",
        endpoint_disposition: null,
      });
      expect(await readDeliveryHealth(pool)).toBe("endpoint-auth-rejected");

      const timedOut = await queueHttpDoubleRequest(
        pool,
        httpDoublePort,
        "slow",
        runtimeToken,
        50,
      );
      expect(timedOut).toMatchObject({
        http_status: null,
        delivery_error: "timeout",
        endpoint_disposition: null,
      });
      expect(await readDeliveryHealth(pool)).toBe("http-timeout");

      const unusedPort = await findUnusedPort();
      const connectionFailed = await queueHttpDoubleRequest(
        pool,
        unusedPort,
        "connection-failure",
        runtimeToken,
        250,
      );
      expect(connectionFailed).toMatchObject({
        http_status: null,
        delivery_error: "connection-failed",
        endpoint_disposition: null,
      });
      expect(await readDeliveryHealth(pool)).toBe("http-failed");
      expect(JSON.stringify(await readAuditRows(pool))).not.toContain(
        runtimeToken,
      );
    });

    it("reports business completion instead of treating no-work or HTTP 2xx as success", async () => {
      const client = await pool.connect();
      const canteenId = randomUUID();
      const sourceId = randomUUID();
      const runId = randomUUID();
      try {
        await client.query("begin");
        await client.query(
          `delete from canteen_menu_scheduler.delivery_audit
           where sync_window_key = $1`,
          [TEST_WINDOW],
        );
        await client.query(
          `delete from cron.job_run_details
           where jobid = (
               select jobid
               from cron.job
               where jobname = $1
                 and username = 'postgres'
             )
             and start_time >= $2
             and start_time < $2::timestamptz + interval '1 minute'`,
          [JOB_NAME, TEST_TICK],
        );
        await client.query(
          "update public.canteen_menu_sources set enabled = false",
        );
        await client.query(
          `insert into public.canteens (id, name)
           values ($1, 'Scheduler health fixture')`,
          [canteenId],
        );
        await client.query(
          `insert into public.canteen_menu_sources (
             id,
             canteen_id,
             provider,
             external_store_id,
             sync_meal_periods
           ) values ($1, $2, 'pinme', $3, array['lunch']::text[])`,
          [sourceId, canteenId, `scheduler-${sourceId}`],
        );
        await client.query(
          `insert into public.canteen_menu_sync_runs (
             id,
             menu_source_id,
             status,
             item_count,
             started_at,
             completed_at
           ) values ($1, $2, 'applied', 1, $3, $4)`,
          [
            runId,
            sourceId,
            new Date("2026-08-24T03:20:00.000Z"),
            new Date("2026-08-24T03:25:00.000Z"),
          ],
        );
        await client.query(
          `insert into public.canteen_menu_sync_snapshots (
             run_id,
             menu_source_id,
             snapshot_hash,
             snapshot_completeness,
             item_count,
             sync_window_key,
             meal_period,
             hkt_weekday,
             observed_minute_of_day,
             observed_at
           ) values (
             $1,
             $2,
             $3,
             'partial',
             1,
             $4,
             'lunch',
             1,
             680,
             $5
           )`,
          [
            runId,
            sourceId,
            "a".repeat(64),
            TEST_WINDOW,
            new Date("2026-08-24T03:20:00.000Z"),
          ],
        );

        expect(await readWindowHealth(client)).toMatchObject({
          required_source_count: 1,
          primary_completed_source_count: 1,
          primary_completed_at: null,
          fallback_completed_source_count: 1,
          missing_tick_count: 16,
          classification: "cron-tick-missing",
        });

        await client.query(
          `insert into canteen_menu_scheduler.delivery_audit (
             expected_tick_at,
             sync_window_key,
             request_id,
             http_status,
             endpoint_disposition,
             business_code,
             completed_at
           ) values ($1, $2, -1000, 200, 'continue', 'MENU_SYNC_APPLIED', $1)`,
          [TEST_TICK, TEST_WINDOW],
        );
        expect(await readWindowHealth(client)).toMatchObject({
          missing_tick_count: 16,
          primary_completed_at: null,
          classification: "cron-tick-missing",
        });

        await ensureCronTick(client);
        expect(await readWindowHealth(client)).toMatchObject({
          missing_tick_count: 15,
          primary_completed_at: null,
          classification: "cron-tick-missing",
        });

        await client.query(
          `insert into canteen_menu_scheduler.delivery_audit (
             expected_tick_at,
             sync_window_key,
             request_id,
             http_status,
             endpoint_disposition,
             completed_at
           ) values ($1, $2, -1002, 200, 'no-work', $1)`,
          [TEST_RECOVERY_TICK, TEST_WINDOW],
        );
        await ensureCronTick(client, TEST_RECOVERY_TICK, -930002);
        expect(await readWindowHealth(client)).toMatchObject({
          missing_tick_count: 14,
          primary_completed_at: new Date("2026-08-24T03:25:00.000Z"),
          classification: "primary-drained-window",
        });

        await client.query(
          `update public.canteen_menu_sync_runs
           set completed_at = $2
           where id = $1`,
          [runId, new Date("2026-08-24T03:40:00.000Z")],
        );
        expect(await readWindowHealth(client)).toMatchObject({
          primary_completed_source_count: 0,
          primary_completed_at: null,
          fallback_completed_source_count: 1,
          classification: "fallback-completed-window",
        });

        await client.query(
          `update public.canteen_menu_sync_snapshots
           set item_count = 0
           where run_id = $1`,
          [runId],
        );
        await client.query(
          `insert into canteen_menu_scheduler.delivery_audit (
             expected_tick_at,
             sync_window_key,
             request_id,
             http_status,
             endpoint_disposition,
             completed_at
           ) values ($1, $2, -1001, 200, 'no-work', $1)`,
          [TEST_TICK, TEST_WINDOW],
        );
        const noWorkOnly = await readWindowHealth(client);
        expect(noWorkOnly.primary_completed_source_count).toBe(0);
        expect(noWorkOnly.fallback_completed_source_count).toBe(0);
        expect(noWorkOnly.classification).not.toMatch(/drained-window$/);

        await client.query(
          `update canteen_menu_scheduler.delivery_audit
           set endpoint_disposition = 'retry-later',
               business_code = 'PROVIDER_TIMEOUT'
           where request_id = -1001`,
        );
        expect(await readWindowHealth(client)).toMatchObject({
          retry_later_count: 1,
          classification: "retry-still-due",
        });

        await client.query(
          `update canteen_menu_scheduler.delivery_audit
           set endpoint_disposition = 'no-work',
               business_code = null
           where request_id = -1001`,
        );
        await client.query(
          `update public.canteen_menu_sync_runs
           set status = 'failed',
               error_code = 'PROVIDER_TIMEOUT'
           where id = $1`,
          [runId],
        );
        expect(await readWindowHealth(client)).toMatchObject({
          provider_failure_count: 1,
          classification: "provider-application-failed",
        });

        await client.query(
          `update public.canteen_menu_sync_runs
           set error_code = 'INVALID_MENU_SYNC_FAILURE_HISTORY'
           where id = $1`,
          [runId],
        );
        expect(await readWindowHealth(client)).toMatchObject({
          review_required_count: 1,
          classification: "review-required",
        });

        await client.query(
          `update public.canteen_menu_sync_runs
           set error_code = 'MENU_SYNC_IDENTITY_CHURN'
           where id = $1`,
          [runId],
        );
        expect(await readWindowHealth(client)).toMatchObject({
          review_required_count: 1,
          classification: "review-required",
        });

        const additionalFailureIds = [randomUUID(), randomUUID()];
        await client.query(
          `update public.canteen_menu_sync_runs
           set error_code = 'PROVIDER_TIMEOUT'
           where id = $1`,
          [runId],
        );
        await client.query(
          `insert into public.canteen_menu_sync_runs (
             id,
             menu_source_id,
             status,
             error_code,
             started_at,
             completed_at
           ) values
             ($1, $3, 'failed', 'PROVIDER_TIMEOUT', $4, $4),
             ($2, $3, 'failed', 'PROVIDER_TIMEOUT', $5, $5)`,
          [
            ...additionalFailureIds,
            sourceId,
            new Date("2026-08-24T03:26:00.000Z"),
            new Date("2026-08-24T03:27:00.000Z"),
          ],
        );
        expect(await readWindowHealth(client)).toMatchObject({
          provider_failure_count: 0,
          review_required_count: 1,
          classification: "review-required",
        });
        await client.query(
          `delete from public.canteen_menu_sync_runs
           where id = any($1::uuid[])`,
          [additionalFailureIds],
        );

        await client.query(
          `update public.canteen_menu_sync_runs
           set status = 'applied', error_code = null
           where id = $1`,
          [runId],
        );
        await client.query(
          `update public.canteen_menu_sources
           set closed_weekdays = array[1]::integer[]
           where id = $1`,
          [sourceId],
        );
        expect(await readWindowHealth(client)).toMatchObject({
          required_source_count: 0,
          inapplicable_run_count: 1,
          classification: "inapplicable-source-ran",
        });
      } finally {
        await client.query("rollback");
        client.release();
      }
    });
  },
);

async function scheduleWrongOwnerJob(
  schedule: string,
  command: string,
): Promise<string> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_MISSING");
  const connectionUrl = new URL(process.env.DATABASE_URL);
  connectionUrl.username = WRONG_OWNER_ROLE;
  connectionUrl.password = WRONG_OWNER_PASSWORD;
  const ownerPool = new Pool({ connectionString: connectionUrl.toString() });
  try {
    const result = await ownerPool.query<{ jobid: string }>(
      `select cron.schedule($1, $2, $3)::text as jobid`,
      [JOB_NAME, schedule, command],
    );
    if (!result.rows[0]) throw new Error("WRONG_OWNER_JOB_NOT_CREATED");
    return result.rows[0].jobid;
  } finally {
    await ownerPool.end();
  }
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function close(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function findUnusedPort(): Promise<number> {
  const server = createServer();
  await listen(server);
  const port = (server.address() as AddressInfo).port;
  await close(server);
  return port;
}

async function queueHttpDoubleRequest(
  pool: Pool,
  port: number,
  path: string,
  runtimeToken: string,
  timeoutMilliseconds = 2_000,
): Promise<AuditRow> {
  await ensureCronTick(pool);
  const host = process.env.SCHEDULER_HTTP_DOUBLE_HOST ?? "host.docker.internal";
  const queued = await pool.query<{ request_id: string }>(
    `with request as (
       select net.http_post(
         url := $1::text,
         body := '{}'::jsonb,
         params := '{}'::jsonb,
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'Authorization', 'Bearer ' || $2::text
         ),
         timeout_milliseconds := $3::integer
       ) as request_id
     )
     insert into canteen_menu_scheduler.delivery_audit (
       expected_tick_at,
       sync_window_key,
       request_id
     )
     select $4::timestamptz, $5::text, request_id
     from request
     returning request_id`,
    [
      `http://${host}:${port}/${path}`,
      runtimeToken,
      timeoutMilliseconds,
      TEST_TICK,
      TEST_WINDOW,
    ],
  );
  return waitForAudit(pool, queued.rows[0].request_id);
}

async function ensureCronTick(
  client: Pool | PoolClient,
  tick = TEST_TICK,
  runId = -930000,
): Promise<void> {
  await client.query(
    `insert into cron.job_run_details (
       jobid,
       runid,
       database,
       username,
       command,
       status,
       start_time,
       end_time
     )
     select job.jobid,
            $3::bigint,
            job.database,
            job.username,
            job.command,
            'succeeded',
            $2::timestamptz,
            $2::timestamptz
     from cron.job as job
     where job.jobname = $1
       and job.username = 'postgres'
       and not exists (
         select 1
         from cron.job_run_details as details
         where details.jobid = job.jobid
           and details.start_time >= $2::timestamptz
           and details.start_time < $2::timestamptz + interval '1 minute'
       )`,
    [JOB_NAME, tick, runId],
  );
}

async function waitForAudit(pool: Pool, requestId: string): Promise<AuditRow> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await pool.query<AuditRow>(
      `select request_id,
              http_status,
              delivery_error,
              endpoint_disposition,
              business_code,
              completed_at
       from canteen_menu_scheduler.delivery_audit
       where request_id = $1`,
      [requestId],
    );
    if (result.rows[0]?.completed_at) return result.rows[0];
    await delay(25);
  }
  throw new Error(`Scheduler HTTP response ${requestId} was not collected`);
}

async function readReviewedJobs(pool: Pool) {
  const result = await pool.query<{
    jobid: string;
    jobname: string;
    schedule: string;
    command: string;
    database: string;
    username: string;
    active: boolean;
  }>(
    `select jobid, jobname, schedule, command, database, username, active
     from cron.job
     where jobname = $1
     order by jobid`,
    [JOB_NAME],
  );
  return result.rows;
}

async function readWrongOwnerMemberships(pool: Pool) {
  const result = await pool.query<{
    admin_option: boolean;
    grantor: string;
    inherit_option: boolean;
    set_option: boolean;
  }>(
    `select membership.admin_option,
            membership.inherit_option,
            membership.set_option,
            grantor.rolname as grantor
     from pg_auth_members as membership
     join pg_roles as granted_role on granted_role.oid = membership.roleid
     join pg_roles as member_role on member_role.oid = membership.member
     join pg_roles as grantor on grantor.oid = membership.grantor
     where granted_role.rolname = $1
       and member_role.rolname = 'postgres'
     order by grantor.rolname`,
    [WRONG_OWNER_ROLE],
  );
  return result.rows;
}

async function readRetentionFixtureCounts(client: PoolClient) {
  const result = await client.query<{
    expired: number;
    retained: number;
  }>(
    `select count(*) filter (
              where request_id between -910501 and -910001
            )::integer as expired,
            count(*) filter (where request_id = -920000)::integer as retained
     from canteen_menu_scheduler.delivery_audit`,
  );
  if (!result.rows[0]) throw new Error("Missing scheduler retention counts");
  return result.rows[0];
}

async function queueCount(pool: Pool): Promise<number> {
  const result = await pool.query<{ count: number }>(
    "select count(*)::integer as count from net.http_request_queue",
  );
  return result.rows[0].count;
}

async function readAuditRows(pool: Pool): Promise<Record<string, unknown>[]> {
  const result = await pool.query<Record<string, unknown>>(
    `select *
     from canteen_menu_scheduler.delivery_audit
     order by id`,
  );
  return result.rows;
}

async function readDeliveryHealth(client: Pool | PoolClient): Promise<string> {
  const result = await client.query<{ classification: string }>(
    `select classification
     from canteen_menu_scheduler.delivery_health($1, $1)`,
    [TEST_TICK],
  );
  if (!result.rows[0]) throw new Error("Missing scheduler delivery health row");
  return result.rows[0].classification;
}

async function readWindowHealth(client: PoolClient) {
  const result = await client.query<{
    required_source_count: number;
    primary_completed_source_count: number;
    primary_completed_at: Date | null;
    fallback_completed_source_count: number;
    missing_tick_count: number;
    retry_later_count: number;
    provider_failure_count: number;
    review_required_count: number;
    inapplicable_run_count: number;
    classification: string;
  }>(
    `select required_source_count,
            primary_completed_source_count,
            primary_completed_at,
            fallback_completed_source_count,
            missing_tick_count,
            retry_later_count,
            provider_failure_count,
            review_required_count,
            inapplicable_run_count,
            classification
     from canteen_menu_scheduler.window_health($1, $2)`,
    [
      new Date("2026-08-24T03:17:00.000Z"),
      new Date("2026-08-24T03:32:00.000Z"),
    ],
  );
  if (!result.rows[0]) throw new Error("Missing scheduler window health row");
  return result.rows[0];
}
