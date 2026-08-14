import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import fixtureMatrix from "./fixtures/canteen-menu-identity-preflight-v1.json";
import {
  canteenMenuIdentityPreflightExitCode,
  formatCanteenMenuIdentityPreflightHuman,
  runCanteenMenuIdentityPreflight,
} from "@/lib/canteen-menu-identity-preflight";

const hasDb = Boolean(process.env.DATABASE_URL);
const requiresDb = process.env.MENU_IDENTITY_PREFLIGHT_TEST === "1";
if (requiresDb && !hasDb) {
  throw new Error(
    "DATABASE_URL is required when MENU_IDENTITY_PREFLIGHT_TEST=1",
  );
}

describe.skipIf(!hasDb)(
  "canteen menu identity production preflight (#639)",
  () => {
    let client: Client;
    const schemas = new Set<string>();

    beforeAll(async () => {
      client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
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
        await client.query(
          `grant select on all tables in schema ${fixture.schema} to ${role}`,
        );
        await client.query(`set role ${role}`);
        const roleState = await client.query<{
          rolsuper: boolean;
          rolbypassrls: boolean;
        }>(
          `select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
        );

        const report = await preflight(fixture);

        expect(roleState.rows[0].rolsuper).toBe(false);
        expect(roleState.rows[0].rolbypassrls).toBe(true);
        expect(report.resultCode).toBe("PREFLIGHT_SAFE");
      } finally {
        await client.query("reset role");
        await client.query(
          `revoke select on all tables in schema ${fixture.schema} from ${role}`,
        );
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
        await client.query(
          `grant select on all tables in schema ${fixture.schema} to ${role}`,
        );
        await client.query(`set role ${role}`);

        await expect(preflight(fixture)).rejects.toThrow(
          "PREFLIGHT_RLS_VISIBILITY_REQUIRED",
        );
      } finally {
        await client.query("reset role");
        await client.query(
          `revoke select on all tables in schema ${fixture.schema} from ${role}`,
        );
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

    async function createFixture() {
      const schema = `preflight_${randomUUID().replaceAll("-", "")}`;
      schemas.add(schema);
      await client.query(`create schema ${schema}`);
      await client.query(`
      create table ${schema}.canteens (
        id uuid primary key,
        name text not null
      );
      create table ${schema}.canteen_menu_sources (
        id uuid primary key,
        canteen_id uuid not null,
        provider text not null,
        external_owner_id text,
        external_store_id text not null,
        config jsonb not null default '{}'::jsonb,
        enabled boolean not null default true,
        last_attempt_id uuid,
        last_attempt_at timestamptz,
        last_success_at timestamptz,
        last_snapshot_hash text,
        observed_state text,
        last_error_code text,
        last_error text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table ${schema}.canteen_menu_items (
        id uuid primary key,
        canteen_id uuid not null,
        name text not null default 'fixture item',
        price integer,
        menu_source_id uuid,
        external_product_id text,
        external_source text,
        external_key text,
        is_available boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table ${schema}.canteen_menu_item_prices (
        id uuid primary key,
        menu_item_id uuid not null,
        amount_minor integer not null
      );
      create table ${schema}.canteen_dish_votes (
        id uuid primary key,
        menu_item_id uuid not null,
        user_id uuid,
        anonymous_session_id uuid
      );
      create table ${schema}.canteen_dish_comments (
        id uuid primary key,
        menu_item_id uuid not null,
        user_id uuid not null,
        content text not null
      );
      create table ${schema}.canteen_menu_sync_runs (
        id uuid primary key,
        menu_source_id uuid not null,
        status text not null,
        observation jsonb not null default '{}'::jsonb
      );
      create table ${schema}.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      );
    `);
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
  },
);
