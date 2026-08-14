import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import fixtureMatrix from "./fixtures/canteen-menu-identity-preflight-v1.json";
import reportSchema from "../../docs/contracts/canteen-menu-identity-preflight-report-v1.schema.json";
import {
  canteenMenuIdentityPreflightExitCode,
  formatCanteenMenuIdentityPreflightHuman,
  runCanteenMenuIdentityPreflight,
} from "@/lib/canteen-menu-identity-preflight";

const hasDb = Boolean(process.env.DATABASE_URL);
const requiresDb = process.env.MENU_IDENTITY_PREFLIGHT_TEST === "1";
const execFileAsync = promisify(execFile);
const validateReport = addFormats(new Ajv2020({ allErrors: true })).compile(
  reportSchema,
);
if (requiresDb && !hasDb) {
  throw new Error(
    "DATABASE_URL is required when MENU_IDENTITY_PREFLIGHT_TEST=1",
  );
}

describe.skipIf(!hasDb)(
  "canteen menu identity production preflight (#639)",
  () => {
    let client: Client;
    let historicalFixtureSql: string;
    const schemas = new Set<string>();

    beforeAll(async () => {
      client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      historicalFixtureSql = await readFile(
        path.resolve(
          "tests/db/fixtures/canteen-menu-identity-history-0081.sql",
        ),
        "utf8",
      );
    });

    afterAll(async () => {
      for (const schema of schemas) {
        await client.query(`drop schema if exists ${schema} cascade`);
      }
      await client.end();
    });

    it.each(fixtureMatrix.supportedHistoricalIdentities)(
      "accepts supported historical identity: $name",
      async (identity) => {
        const fixture = await createFixture();
        const sourceId = await insertSource(fixture, {
          provider: identity.provider,
          externalOwnerId: identity.externalOwnerId ?? undefined,
          externalStoreId: identity.externalStoreId,
        });
        await insertItem(fixture, {
          menuSourceId: sourceId,
          externalSource: identity.externalSource,
          externalKey: identity.externalKey,
          externalProductId: identity.externalProductId,
        });

        const report = await runCanteenMenuIdentityPreflight(client, {
          schema: fixture.schema,
          applicationCommit: "0123456789abcdef",
          generatedAt: new Date("2026-08-14T08:00:00.000Z"),
        });

        expect(report.resultCode).toBe("PREFLIGHT_SAFE");
        expect(report.checks.every((check) => check.status === "pass")).toBe(
          true,
        );
      },
    );

    it.each(fixtureMatrix.parityCases)(
      "enforces versioned parity fixture: $name",
      async (matrixCase) => {
        const fixture = await createMatrixFixture(matrixCase);

        const report = await preflight(fixture);
        const failedChecks = Object.fromEntries(
          report.checks
            .filter((candidate) => candidate.status === "fail")
            .map((candidate) => [
              candidate.code,
              {
                count: candidate.count,
                voteCount: candidate.voteCount,
                commentCount: candidate.commentCount,
              },
            ]),
        );

        expect(report.resultCode).toBe(matrixCase.expected.resultCode);
        expect(failedChecks).toEqual(matrixCase.expected.failedChecks);
        if ("diagnosticReason" in matrixCase.expected) {
          expect(
            check(report, "UNSUPPORTED_LEGACY_IDENTITY").samples[0]?.reason,
          ).toBe(matrixCase.expected.diagnosticReason);
        }
      },
    );

    it("fails closed for contradictory rollout shadows", async () => {
      const fixture = await createFixture();
      const sourceId = await insertSource(fixture, {
        provider: "pinme",
        externalStoreId: "store-a",
      });
      await insertItem(fixture, {
        menuSourceId: sourceId,
        externalProductId: "product-42",
        externalSource: "pinme:store-a",
        externalKey: "different-product:lunch",
      });

      const report = await preflight(fixture);

      expect(report.resultCode).toBe("PREFLIGHT_UNSAFE");
      expect(check(report, "ROLLOUT_SHADOW_MISMATCH")).toMatchObject({
        status: "fail",
        count: 1,
      });
    });

    it("fails closed for duplicate authoritative identity and required merge", async () => {
      const fixture = await createFixture();
      const sourceId = await insertSource(fixture, {
        provider: "ichef",
        externalStoreId: "store-a",
      });
      for (let index = 0; index < 2; index += 1) {
        await insertItem(fixture, {
          menuSourceId: sourceId,
          externalProductId: "duplicate-product",
          externalSource: "ichef:store-a",
          externalKey: "duplicate-product",
        });
      }

      const report = await preflight(fixture);

      expect(check(report, "DUPLICATE_AUTHORITATIVE_IDENTITY").count).toBe(2);
      expect(check(report, "MERGE_OR_UUID_REPLACEMENT_REQUIRED")).toMatchObject(
        {
          status: "fail",
          count: 2,
        },
      );
    });

    it("fails closed when distinct UUIDs project to one shadow identity", async () => {
      const fixture = await createFixture();
      const sourceId = await insertSource(fixture, {
        provider: "pinme",
        externalStoreId: "store-a",
      });
      for (const externalProductId of ["product-a", "product-b"]) {
        await insertItem(fixture, {
          menuSourceId: sourceId,
          externalProductId,
          externalSource: "pinme:store-a",
          externalKey: "shared-product:lunch",
        });
      }

      const report = await preflight(fixture);

      expect(check(report, "DUPLICATE_AUTHORITATIVE_IDENTITY").count).toBe(0);
      expect(check(report, "MERGE_OR_UUID_REPLACEMENT_REQUIRED")).toMatchObject(
        {
          status: "fail",
          count: 2,
        },
      );
    });

    it("reports source ownership mismatch and authoritative null asymmetry", async () => {
      const fixture = await createFixture();
      const otherCanteenId = randomUUID();
      await client.query(
        `insert into ${fixture.schema}.canteens (id, name) values ($1, 'other')`,
        [otherCanteenId],
      );
      const sourceId = await insertSource(fixture, {
        provider: "pinme",
        externalStoreId: "store-a",
        canteenId: otherCanteenId,
      });
      await insertItem(fixture, {
        menuSourceId: sourceId,
        externalProductId: null,
        externalSource: "pinme:store-a",
        externalKey: "product-42",
      });

      const report = await preflight(fixture);

      expect(check(report, "SOURCE_CANTEEN_OWNERSHIP_MISMATCH").count).toBe(1);
      expect(check(report, "AUTHORITATIVE_IDENTITY_NULL_ASYMMETRY").count).toBe(
        1,
      );
    });

    it("reports unsupported namespace/key with bounded redacted diagnostics and risk counts", async () => {
      const fixture = await createFixture();
      const sensitiveUserId = randomUUID();
      const sensitiveComment = "do-not-leak-comment-body";
      const sensitiveConfig = "do-not-leak-provider-secret";
      for (let index = 0; index < 8; index += 1) {
        const sourceId = await insertSource(fixture, {
          provider: "qmai",
          externalOwnerId: `owner-${index}`,
          externalStoreId: `store-${index}`,
          config: { credential: sensitiveConfig },
        });
        const itemId = await insertItem(fixture, {
          menuSourceId: sourceId,
          externalProductId: `product-${index}`,
          externalSource: `unsupported:${index}`,
          externalKey: `secret-key-${index}#unsupported`,
        });
        await client.query(
          `insert into ${fixture.schema}.canteen_dish_votes
          (id, menu_item_id, user_id) values ($1, $2, $3)`,
          [randomUUID(), itemId, sensitiveUserId],
        );
        await client.query(
          `insert into ${fixture.schema}.canteen_dish_comments
          (id, menu_item_id, user_id, content) values ($1, $2, $3, $4)`,
          [randomUUID(), itemId, sensitiveUserId, sensitiveComment],
        );
      }

      const report = await preflight(fixture);
      const unsupported = check(report, "UNSUPPORTED_LEGACY_IDENTITY");
      const serialized = JSON.stringify(report);

      expect(unsupported).toMatchObject({
        status: "fail",
        count: 8,
        voteCount: 8,
        commentCount: 8,
      });
      expect(unsupported.samples).toHaveLength(5);
      expect(serialized).not.toContain(sensitiveUserId);
      expect(serialized).not.toContain(sensitiveComment);
      expect(serialized).not.toContain(sensitiveConfig);
      expect(serialized).not.toContain("secret-key");
      expect(serialized).not.toContain("owner-");
      expect(serialized).not.toContain("store-");
    });

    it.each(["pass", "fail"] as const)(
      "leaves every protected table row-for-row unchanged after a %s report",
      async (outcome) => {
        const fixture = await createFixture();
        const sourceId = await insertSource(fixture, {
          provider: "pinme",
          externalStoreId: "store-a",
        });
        await client.query(
          `update ${fixture.schema}.canteen_menu_sources
         set last_attempt_id = $2,
             last_attempt_at = '2026-08-14T07:00:00Z',
             last_success_at = '2026-08-14T06:00:00Z',
             last_snapshot_hash = 'health-snapshot',
             observed_state = 'healthy',
             last_error_code = 'historical-code',
             last_error = 'historical error detail'
         where id = $1`,
          [sourceId, randomUUID()],
        );
        const itemId = await insertItem(fixture, {
          menuSourceId: sourceId,
          externalProductId: "product-42",
          externalSource:
            outcome === "pass" ? "pinme:store-a" : "unsupported:store-a",
          externalKey: "product-42:lunch",
        });
        await client.query(
          `insert into ${fixture.schema}.canteen_menu_item_prices
          (id, menu_item_id, amount_minor) values ($1, $2, 4200)`,
          [randomUUID(), itemId],
        );
        await client.query(
          `insert into ${fixture.schema}.canteen_dish_votes
          (id, menu_item_id, anonymous_session_id) values ($1, $2, $3)`,
          [randomUUID(), itemId, randomUUID()],
        );
        await client.query(
          `insert into ${fixture.schema}.canteen_dish_comments
          (id, menu_item_id, user_id, content) values ($1, $2, $3, 'history')`,
          [randomUUID(), itemId, randomUUID()],
        );
        await client.query(
          `insert into ${fixture.schema}.canteen_menu_sync_runs
          (id, menu_source_id, status, observation)
         values ($1, $2, 'applied', '{"bounded":true}')`,
          [randomUUID(), sourceId],
        );
        await client.query(
          `insert into ${fixture.schema}.__drizzle_migrations (hash, created_at)
         values ('migration-hash', 123456789)`,
        );
        const before = await snapshotProtectedTables(fixture.schema);

        const report = await preflight(fixture);
        const after = await snapshotProtectedTables(fixture.schema);

        expect(report.result).toBe(outcome);
        expect(after).toEqual(before);
      },
    );

    it("runs successfully as a least-privilege read-only role", async () => {
      const fixture = await createFixture();
      const sourceId = await insertSource(fixture, {
        provider: "pinme",
        externalStoreId: "store-a",
      });
      await insertItem(fixture, {
        menuSourceId: sourceId,
        externalProductId: "product-42",
        externalSource: "pinme:store-a",
        externalKey: "product-42",
      });
      const role = `preflight_reader_${randomUUID().replaceAll("-", "")}`;
      await client.query(`
      alter table ${fixture.schema}.canteen_menu_items enable row level security;
      alter table ${fixture.schema}.canteen_menu_sources enable row level security;
      alter table ${fixture.schema}.canteen_dish_votes enable row level security;
      alter table ${fixture.schema}.canteen_dish_comments enable row level security;
    `);
      await client.query(`create role ${role} nologin bypassrls`);
      try {
        await client.query(
          `grant usage on schema ${fixture.schema} to ${role}`,
        );
        await grantPreflightColumns(fixture.schema, role);
        await client.query(`set role ${role}`);
        const roleState = await client.query<{
          rolsuper: boolean;
          rolbypassrls: boolean;
        }>(
          `select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
        );
        await expect(
          client.query(
            `select config from ${fixture.schema}.canteen_menu_sources`,
          ),
        ).rejects.toThrow(/permission denied/);
        await expect(
          client.query(
            `select content from ${fixture.schema}.canteen_dish_comments`,
          ),
        ).rejects.toThrow(/permission denied/);
        await expect(
          client.query(
            `select * from ${fixture.schema}.canteen_menu_sync_runs`,
          ),
        ).rejects.toThrow(/permission denied/);

        const report = await preflight(fixture);

        expect(roleState.rows[0].rolsuper).toBe(false);
        expect(roleState.rows[0].rolbypassrls).toBe(true);
        expect(report.resultCode).toBe("PREFLIGHT_SAFE");
      } finally {
        await client.query("reset role");
        await revokePreflightColumns(fixture.schema, role);
        await client.query(
          `revoke usage on schema ${fixture.schema} from ${role}`,
        );
        await client.query(`drop role ${role}`);
      }
    });

    it("rejects an RLS-filtered role instead of reporting a false safe result", async () => {
      const fixture = await createFixture();
      const sourceId = await insertSource(fixture, {
        provider: "pinme",
        externalStoreId: "store-a",
      });
      await insertItem(fixture, {
        menuSourceId: sourceId,
        externalProductId: "product-42",
        externalSource: "pinme:store-a",
        externalKey: "product-42",
      });
      await client.query(`
      alter table ${fixture.schema}.canteen_menu_items enable row level security;
      alter table ${fixture.schema}.canteen_menu_sources enable row level security;
      alter table ${fixture.schema}.canteen_dish_votes enable row level security;
      alter table ${fixture.schema}.canteen_dish_comments enable row level security;
    `);
      const role = `preflight_filtered_${randomUUID().replaceAll("-", "")}`;
      await client.query(`create role ${role} nologin`);
      try {
        await client.query(
          `grant usage on schema ${fixture.schema} to ${role}`,
        );
        await grantPreflightColumns(fixture.schema, role);
        await client.query(`set role ${role}`);

        await expect(preflight(fixture)).rejects.toThrow(
          "PREFLIGHT_RLS_VISIBILITY_REQUIRED",
        );
      } finally {
        await client.query("reset role");
        await revokePreflightColumns(fixture.schema, role);
        await client.query(
          `revoke usage on schema ${fixture.schema} from ${role}`,
        );
        await client.query(`drop role ${role}`);
      }
    });

    it("keeps the JSON schema, human report, and safe/unsafe exit codes stable", async () => {
      const passingFixture = await createFixture();
      const passing = await preflight(passingFixture);
      const failingFixture = await createFixture();
      await insertItem(failingFixture, {
        menuSourceId: null,
        externalProductId: "orphan-product",
        externalSource: null,
        externalKey: null,
      });
      const failing = await preflight(failingFixture);

      expect(Object.keys(passing)).toEqual([
        "schemaVersion",
        "contractVersion",
        "targetIssue",
        "applicationCommit",
        "generatedAt",
        "result",
        "resultCode",
        "transaction",
        "sampleLimit",
        "totals",
        "checks",
      ]);
      expect(passing).toMatchObject({
        schemaVersion: "canteen-menu-identity-preflight-report/v1",
        contractVersion: "canteen-menu-identity-preconditions/v1",
        targetIssue: 643,
        applicationCommit: "0123456789abcdef",
        generatedAt: "2026-08-14T08:00:00.000Z",
        resultCode: "PREFLIGHT_SAFE",
        transaction: { isolationLevel: "REPEATABLE READ", readOnly: true },
        sampleLimit: 5,
      });
      expect(canteenMenuIdentityPreflightExitCode(passing)).toBe(0);
      expect(canteenMenuIdentityPreflightExitCode(failing)).toBe(2);
      expect(formatCanteenMenuIdentityPreflightHuman(failing)).toContain(
        "PREFLIGHT_UNSAFE",
      );
      expect(formatCanteenMenuIdentityPreflightHuman(failing)).toContain(
        "Target issue: #643",
      );
    });

    it("runs the real CLI with schema-valid JSON/human output and exit 0/2", async () => {
      const databaseName = `preflight_cli_${randomUUID().replaceAll("-", "")}`;
      const databaseUrl = new URL(process.env.DATABASE_URL!);
      databaseUrl.pathname = `/${databaseName}`;
      const cliClient = new Client({
        connectionString: databaseUrl.toString(),
      });
      await client.query(`create database ${databaseName}`);
      try {
        await cliClient.connect();
        await cliClient.query(
          historicalFixtureSql.replaceAll("__SCHEMA__", "public"),
        );

        const passing = await runCli(databaseUrl.toString(), "json");
        const passingJson = JSON.parse(passing.stdout) as Record<
          string,
          unknown
        >;

        expect(passing.exitCode).toBe(0);
        expectJsonReportMatchesCommittedSchema(passingJson);
        expect(passingJson.resultCode).toBe("PREFLIGHT_SAFE");

        await cliClient.query(
          `insert into public.canteen_menu_items
            (id, canteen_id, external_product_id)
           values ($1, $2, 'orphan-product')`,
          [randomUUID(), randomUUID()],
        );
        const failing = await runCli(databaseUrl.toString(), "json");
        const failingJson = JSON.parse(failing.stdout) as Record<
          string,
          unknown
        >;
        const human = await runCli(databaseUrl.toString(), "human");

        expect(failing.exitCode).toBe(2);
        expectJsonReportMatchesCommittedSchema(failingJson);
        expect(failingJson.resultCode).toBe("PREFLIGHT_UNSAFE");
        expect(human).toMatchObject({
          exitCode: 2,
          stderr: "",
        });
        expect(human.stdout).toContain("PREFLIGHT_UNSAFE");
      } finally {
        await cliClient.end().catch(() => undefined);
        await client.query(`drop database ${databaseName}`);
      }
    });

    async function createFixture() {
      const schema = `preflight_${randomUUID().replaceAll("-", "")}`;
      schemas.add(schema);
      await client.query(`create schema ${schema}`);
      await client.query(historicalFixtureSql.replaceAll("__SCHEMA__", schema));
      const canteenId = randomUUID();
      await client.query(
        `insert into ${schema}.canteens (id, name) values ($1, 'fixture canteen')`,
        [canteenId],
      );
      return { schema, canteenId };
    }

    async function preflight(fixture: { schema: string }) {
      return runCanteenMenuIdentityPreflight(client, {
        schema: fixture.schema,
        applicationCommit: "0123456789abcdef",
        generatedAt: new Date("2026-08-14T08:00:00.000Z"),
      });
    }

    async function createMatrixFixture(
      matrixCase: (typeof fixtureMatrix.parityCases)[number],
    ) {
      const fixture = await createFixture();
      const canteens = new Map<string, string>();
      for (const canteenKey of matrixCase.canteens) {
        const canteenId = randomUUID();
        canteens.set(canteenKey, canteenId);
        await client.query(
          `insert into ${fixture.schema}.canteens (id, name)
           values ($1, $2)`,
          [canteenId, canteenKey],
        );
      }
      const sources = new Map<string, string>();
      for (const source of matrixCase.sources) {
        const sourceId = randomUUID();
        sources.set(source.key, sourceId);
        await client.query(
          `insert into ${fixture.schema}.canteen_menu_sources
            (id, canteen_id, provider, external_owner_id, external_store_id)
           values ($1, $2, $3, $4, $5)`,
          [
            sourceId,
            canteens.get(source.canteen),
            source.provider,
            source.externalOwnerId,
            source.externalStoreId,
          ],
        );
      }
      for (const item of matrixCase.items) {
        const itemId = await insertItem(fixture, {
          canteenId: canteens.get(item.canteen),
          menuSourceId:
            item.source === null ? null : (sources.get(item.source) ?? null),
          externalProductId: item.externalProductId,
          externalSource: item.externalSource,
          externalKey: item.externalKey,
        });
        for (let index = 0; index < item.voteCount; index += 1) {
          await client.query(
            `insert into ${fixture.schema}.canteen_dish_votes
              (id, menu_item_id, anonymous_session_id)
             values ($1, $2, $3)`,
            [randomUUID(), itemId, randomUUID()],
          );
        }
        for (let index = 0; index < item.commentCount; index += 1) {
          await client.query(
            `insert into ${fixture.schema}.canteen_dish_comments
              (id, menu_item_id, user_id, content)
             values ($1, $2, $3, 'matrix comment')`,
            [randomUUID(), itemId, randomUUID()],
          );
        }
      }
      return fixture;
    }

    function check(
      report: Awaited<ReturnType<typeof preflight>>,
      code: (typeof report.checks)[number]["code"],
    ) {
      return report.checks.find((candidate) => candidate.code === code)!;
    }

    async function insertSource(
      fixture: { schema: string; canteenId: string },
      source: {
        provider: string;
        externalStoreId: string;
        externalOwnerId?: string;
        canteenId?: string;
        config?: Record<string, unknown>;
      },
    ) {
      const sourceId = randomUUID();
      await client.query(
        `insert into ${fixture.schema}.canteen_menu_sources
        (id, canteen_id, provider, external_owner_id, external_store_id, config)
       values ($1, $2, $3, $4, $5, $6)`,
        [
          sourceId,
          source.canteenId ?? fixture.canteenId,
          source.provider,
          source.externalOwnerId ?? null,
          source.externalStoreId,
          source.config ?? {},
        ],
      );
      return sourceId;
    }

    async function insertItem(
      fixture: { schema: string; canteenId: string },
      identity: {
        menuSourceId: string | null;
        externalProductId: string | null;
        externalSource: string | null;
        externalKey: string | null;
        canteenId?: string;
      },
    ) {
      const itemId = randomUUID();
      await client.query(
        `insert into ${fixture.schema}.canteen_menu_items
        (id, canteen_id, menu_source_id, external_product_id,
         external_source, external_key)
       values ($1, $2, $3, $4, $5, $6)`,
        [
          itemId,
          identity.canteenId ?? fixture.canteenId,
          identity.menuSourceId,
          identity.externalProductId,
          identity.externalSource,
          identity.externalKey,
        ],
      );
      return itemId;
    }

    async function snapshotProtectedTables(schema: string) {
      const tables = [
        "canteens",
        "canteen_menu_sources",
        "canteen_menu_items",
        "canteen_menu_item_prices",
        "canteen_dish_votes",
        "canteen_dish_comments",
        "canteen_menu_sync_runs",
        "__drizzle_migrations",
      ];
      const snapshots: Record<string, unknown[]> = {};
      for (const table of tables) {
        const result = await client.query<{ row: unknown }>(
          `select to_jsonb(snapshot) as row
         from ${schema}.${table} snapshot
         order by to_jsonb(snapshot)::text`,
        );
        snapshots[table] = result.rows.map(({ row }) => row);
      }
      return snapshots;
    }

    async function grantPreflightColumns(schema: string, role: string) {
      await client.query(`
        grant select
          (id, canteen_id, menu_source_id, external_product_id,
           external_source, external_key)
          on ${schema}.canteen_menu_items to ${role};
        grant select
          (id, canteen_id, provider, external_owner_id, external_store_id)
          on ${schema}.canteen_menu_sources to ${role};
        grant select (menu_item_id)
          on ${schema}.canteen_dish_votes to ${role};
        grant select (menu_item_id)
          on ${schema}.canteen_dish_comments to ${role};
      `);
    }

    async function revokePreflightColumns(schema: string, role: string) {
      await client.query(`
        revoke select
          (id, canteen_id, menu_source_id, external_product_id,
           external_source, external_key)
          on ${schema}.canteen_menu_items from ${role};
        revoke select
          (id, canteen_id, provider, external_owner_id, external_store_id)
          on ${schema}.canteen_menu_sources from ${role};
        revoke select (menu_item_id)
          on ${schema}.canteen_dish_votes from ${role};
        revoke select (menu_item_id)
          on ${schema}.canteen_dish_comments from ${role};
      `);
    }

    async function runCli(connectionString: string, format: "json" | "human") {
      const script = path.resolve("scripts/preflight-canteen-menu-identity.ts");
      try {
        const result = await execFileAsync(
          process.execPath,
          ["--import", "tsx", script, `--format=${format}`],
          {
            env: {
              ...process.env,
              DATABASE_URL: connectionString,
              PREFLIGHT_APPLICATION_COMMIT: "0123456789abcdef",
            },
          },
        );
        return { ...result, exitCode: 0 };
      } catch (error) {
        const failure = error as Error & {
          code: number;
          stdout: string;
          stderr: string;
        };
        return {
          exitCode: failure.code,
          stdout: failure.stdout,
          stderr: failure.stderr,
        };
      }
    }

    function expectJsonReportMatchesCommittedSchema(
      report: Record<string, unknown>,
    ) {
      expect(
        validateReport(report),
        JSON.stringify(validateReport.errors),
      ).toBe(true);
    }
  },
);
