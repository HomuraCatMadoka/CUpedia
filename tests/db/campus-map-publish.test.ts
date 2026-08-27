import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  publishCampusMapChangeset,
  reconcileCampusMapPublishReceipt,
  type CampusMapPublishCommand,
} from "@/lib/campus-map/publish";
import {
  getCampusMapChangeset,
  getCampusMapCurrentPlace,
  getCampusMapPlaceHistory,
  getCampusMapPlaceRevision,
  listCampusMapChangesets,
  listCampusMapCurrentPlaces,
} from "@/lib/campus-map/fact-store";

const hasDb = Boolean(process.env.DATABASE_URL);

function createCommand(): CampusMapPublishCommand {
  return {
    kind: "single",
    idempotencyKey: randomUUID(),
    comment: "新增大学图书馆饮水点",
    sourceSummary: "现场观察",
    reviewRequested: false,
    client: { name: "campus-map-test", version: "1" },
    warningAcknowledgements: [],
    changes: [
      {
        operation: "create",
        fact: {
          name: "大学图书馆饮水点",
          buildingId: "00000000-0000-4000-8000-000000000802",
          floorId: null,
          pinType: "water",
          capabilities: [],
          gender: "unknown",
          wheelchairAccess: "unknown",
          audience: "cuhk-member",
          credentialRequirement: "library-card",
          accessSchedule: { kind: "unknown" },
          reservationRequirement: "none",
          temporaryStatus: "normal",
          location: { kind: "building" },
          observedAt: "2026-08-24T00:00:00.000Z",
        },
        sources: [
          {
            kind: "field-observation",
            ref: `test:campus-map-publish:${randomUUID()}`,
            url: null,
            owner: "CUpedia test",
            version: null,
            snapshotHash: null,
            accessedOn: "2026-08-24",
            observedAt: "2026-08-24T00:00:00.000Z",
            rightsStatus: "original-observation",
            limitations: null,
            note: null,
            sourceCoordinate: null,
          },
        ],
      },
    ],
  };
}

function placeCreateAtPreciseOutdoorPoint(
  command: CampusMapPublishCommand,
  longitude = 114.207209,
  latitude = 22.420129,
): void {
  const change = command.changes[0];
  if (change.operation !== "create") throw new Error("bad fixture");
  change.fact.buildingId = null;
  change.fact.floorId = null;
  change.fact.location = {
    kind: "outdoor-point",
    longitude,
    latitude,
    crs: "wgs84",
    precision: "precise",
  };
}

describe.skipIf(!hasDb)("Campus Map atomic publish seam", () => {
  let pool: Pool;
  const actorIds: string[] = [];

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  async function cleanupPublishedFacts() {
    if (!pool || actorIds.length === 0) return;
    const targetPlaces = await pool.query<{ place_id: string }>(
      `select distinct pc.place_id
         from campus_map_place_changes pc
         join campus_map_changesets cs on cs.id = pc.changeset_id
        where cs.actor_id_snapshot = any($1::uuid[])`,
      [actorIds],
    );
    const placeIds = targetPlaces.rows.map((row) => row.place_id);
    const client = await pool.connect();
    await client.query("begin");
    try {
      await client.query("set local session_replication_role = replica");
      if (placeIds.length > 0) {
        await client.query(
          "delete from campus_map_current_facts where place_id = any($1::uuid[])",
          [placeIds],
        );
        await client.query(
          "delete from campus_map_current_revisions where place_id = any($1::uuid[])",
          [placeIds],
        );
      }
      await client.query(
        `delete from campus_map_revision_visibility
          where revision_id in (
            select id from campus_map_fact_revisions
             where actor_id_snapshot = any($1::uuid[])
          )`,
        [actorIds],
      );
      await client.query(
        `delete from campus_map_revision_provenance
          where revision_id in (
            select id from campus_map_fact_revisions
             where actor_id_snapshot = any($1::uuid[])
          )`,
        [actorIds],
      );
      await client.query(
        "delete from campus_map_fact_revisions where actor_id_snapshot = any($1::uuid[])",
        [actorIds],
      );
      await client.query(
        `delete from campus_map_place_changes
          where changeset_id in (
            select id from campus_map_changesets
             where actor_id_snapshot = any($1::uuid[])
          )`,
        [actorIds],
      );
      await client.query(
        "delete from campus_map_publish_requests where actor_id_snapshot = any($1::uuid[])",
        [actorIds],
      );
      await client.query("delete from campus_map_publish_rate_limits");
      await client.query(
        "delete from campus_map_changesets where actor_id_snapshot = any($1::uuid[])",
        [actorIds],
      );
      if (placeIds.length > 0) {
        await client.query(
          "delete from campus_map_places where id = any($1::uuid[])",
          [placeIds],
        );
      }
      await client.query(
        "delete from campus_map_provenance_sources where source_ref like 'test:campus-map-publish:%'",
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  afterEach(cleanupPublishedFacts);

  afterAll(async () => {
    if (!pool) return;
    await cleanupPublishedFacts();
    await pool.query("delete from campus_map_floors where id = $1", [
      "00000000-0000-4000-8000-000000000803",
    ]);
    await pool.query("delete from campus_map_floors where id = $1", [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0803",
    ]);
    await pool.query(
      "delete from campus_map_buildings where id = any($1::uuid[])",
      [
        [
          "00000000-0000-4000-8000-000000000802",
          "00000000-0000-4000-8000-000000000804",
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0802",
        ],
      ],
    );
    if (actorIds.length > 0) {
      await pool.query("delete from users where id = any($1::uuid[])", [
        actorIds,
      ]);
    }
    await pool.end();
  });

  beforeAll(async () => {
    await pool.query(
      `insert into campus_map_buildings (id, name, code)
       values
         ($1, '大学图书馆', 'UL'),
         ($2, '科学馆', 'SC'),
         ($3, '大小写测试楼', 'CASE')
       on conflict (id) do nothing`,
      [
        "00000000-0000-4000-8000-000000000802",
        "00000000-0000-4000-8000-000000000804",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0802",
      ],
    );
    await pool.query(
      `insert into campus_map_floors (id, building_id, display_label, sort_order)
       values
         ($1, $2, 'G/F', 0),
         ($3, $4, '1/F', 1)
       on conflict (id) do nothing`,
      [
        "00000000-0000-4000-8000-000000000803",
        "00000000-0000-4000-8000-000000000802",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0803",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0802",
      ],
    );
  });

  async function createActor(
    input: {
      banned?: boolean;
      email?: string;
      emailVerified?: boolean;
      nickname?: string;
      role?: string;
      withCredential?: boolean;
    } = {},
  ): Promise<string> {
    const actorId = randomUUID();
    actorIds.push(actorId);
    await pool.query(
      `insert into users
         (id, email, email_verified, nickname, role, banned)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        actorId,
        input.email ?? `campus-map-publish-${actorId}@cuhk.edu.hk`,
        input.emailVerified ?? true,
        input.nickname ?? "地图贡献者",
        input.role ?? "user",
        input.banned ?? false,
      ],
    );
    if (input.withCredential !== false) {
      await pool.query(
        `insert into accounts
           (id, account_id, provider_id, user_id, password)
         values ($1, $2, 'credential', $3, 'test-credential')`,
        [randomUUID(), actorId, actorId],
      );
    }
    return actorId;
  }

  async function waitForBlockedPublishQueries(minimum: number): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const result = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from pg_stat_activity
          where datname = current_database()
            and pid <> pg_backend_pid()
            and wait_event_type = 'Lock'
            and (
              query like '%campus_map_places%'
              or query like '%campus_map_publish_requests%'
              or query like '%campus_map_publish_rate_limits%'
              or query like '%pg_advisory_xact_lock%'
            )`,
      );
      if (Number(result.rows[0]?.count ?? 0) >= minimum) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error(`Timed out waiting for ${minimum} blocked publish queries`);
  }

  async function waitForBlockedQuery(queryFragment: string): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const result = await pool.query<{ count: string }>(
        `select count(*)::text as count
           from pg_stat_activity
          where datname = current_database()
            and pid <> pg_backend_pid()
            and wait_event_type = 'Lock'
            and query like $1`,
        [`%${queryFragment}%`],
      );
      if (Number(result.rows[0]?.count ?? 0) >= 1) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error(`Timed out waiting for blocked query: ${queryFragment}`);
  }

  it("installs the query-shaped duplicate warning index", async () => {
    const index = await pool.query<{ indexdef: string }>(
      `select indexdef
         from pg_indexes
        where schemaname = current_schema()
          and indexname = 'campus_map_current_facts_duplicate_warning_idx'`,
    );
    expect(index.rows).toEqual([
      {
        indexdef: expect.stringMatching(
          /USING btree \(lower\(btrim\(name\)\), pin_type\)/,
        ),
      },
    ]);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local enable_seqscan = off");
      const plan = await client.query(
        `explain (format json)
         select place_id
          from campus_map_current_facts
          where pin_type = 'water'
            and btrim(name) <> ''
            and lower(btrim(name)) = lower(btrim('大学图书馆饮水点'))`,
      );
      expect(JSON.stringify(plan.rows)).toContain(
        "campus_map_current_facts_duplicate_warning_idx",
      );
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("requires an authenticated actor from trusted server context", async () => {
    await expect(
      publishCampusMapChangeset(createCommand(), {
        actorId: null,
        clientIp: "203.0.113.1",
      }),
    ).resolves.toEqual({
      status: "authentication-required",
      code: "authentication-required",
    });
  });

  it("forbids an actor that is no longer present in PostgreSQL", async () => {
    await expect(
      publishCampusMapChangeset(createCommand(), {
        actorId: "00000000-0000-4000-8000-000000000899",
        clientIp: "203.0.113.2",
      }),
    ).resolves.toEqual({
      status: "forbidden",
      code: "actor-not-eligible",
    });
  });

  it("publishes once after an authentication round trip with the same key", async () => {
    const actorId = await createActor();
    const command = createCommand();
    await expect(
      publishCampusMapChangeset(command, {
        actorId: null,
        clientIp: "203.0.113.2",
      }),
    ).resolves.toMatchObject({ status: "authentication-required" });

    const published = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.2",
    });
    expect(published).toMatchObject({ status: "published" });
    const retried = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.2",
    });
    expect(retried).toEqual(published);
  });

  it("replays a completed admin bulk result after the actor role changes", async () => {
    const actorId = await createActor({ role: "admin" });
    const command = createCommand();
    const second = createCommand();
    const secondChange = second.changes[0];
    if (secondChange.operation !== "create") throw new Error("bad fixture");
    secondChange.fact.name = "科学馆饮水点";
    secondChange.fact.buildingId = "00000000-0000-4000-8000-000000000804";
    command.kind = "bulk";
    command.changes.push(secondChange);

    const published = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.3",
    });
    expect(published).toMatchObject({ status: "published" });
    await pool.query("update users set role = 'user' where id = $1", [actorId]);

    await expect(
      publishCampusMapChangeset(command, {
        actorId,
        clientIp: "203.0.113.3",
      }),
    ).resolves.toEqual(published);

    const newRequest = structuredClone(command);
    newRequest.idempotencyKey = randomUUID();
    await expect(
      publishCampusMapChangeset(newRequest, {
        actorId,
        clientIp: "203.0.113.3",
      }),
    ).resolves.toEqual({ status: "forbidden", code: "admin-required" });
  });

  it("forbids a freshly banned contributor", async () => {
    const actorId = await createActor();
    const created = await publishCampusMapChangeset(createCommand(), {
      actorId,
      clientIp: "203.0.113.3",
    });
    if (created.status !== "published") throw new Error("create failed");
    const [{ placeId, revisionId }] = created.changes;
    const draft = createCommand();
    const draftCreate = draft.changes[0];
    if (draftCreate.operation !== "create") throw new Error("bad fixture");
    draft.changes = [
      {
        operation: "update",
        placeId,
        baseRevisionId: revisionId,
        fact: { ...draftCreate.fact, name: "封禁后不得出现" },
        sources: draftCreate.sources,
      },
    ];
    await pool.query("update users set banned = true where id = $1", [actorId]);

    await expect(
      publishCampusMapChangeset(draft, {
        actorId,
        clientIp: "203.0.113.3",
      }),
    ).resolves.toEqual({
      status: "forbidden",
      code: "actor-banned",
    });
    await expect(getCampusMapPlaceHistory(placeId)).resolves.toMatchObject({
      items: [
        {
          id: revisionId,
          actor: { id: actorId, nickname: "地图贡献者" },
        },
      ],
    });
  });

  it("linearizes concurrent eligibility mutations after locked fresh authorization", async () => {
    const actorId = await createActor();
    const created = await publishCampusMapChangeset(createCommand(), {
      actorId,
      clientIp: "203.0.113.4",
    });
    if (created.status !== "published") throw new Error("create failed");
    const [{ placeId, revisionId: baseRevisionId }] = created.changes;
    const command = createCommand();
    const create = command.changes[0];
    if (create.operation !== "create") throw new Error("bad fixture");
    command.changes = [
      {
        operation: "update",
        placeId,
        baseRevisionId,
        fact: { ...create.fact, name: "授权锁内发布" },
        sources: create.sources,
      },
    ];

    const placeLocker = await pool.connect();
    const banClient = await pool.connect();
    const credentialClient = await pool.connect();
    await placeLocker.query("begin");
    await banClient.query("begin");
    await credentialClient.query("begin");
    await placeLocker.query(
      "select id from campus_map_places where id = $1 for update",
      [placeId],
    );
    let placeLockerOpen = true;
    let banClientOpen = true;
    let credentialClientOpen = true;
    let publishPromise:
      | ReturnType<typeof publishCampusMapChangeset>
      | undefined;
    try {
      publishPromise = publishCampusMapChangeset(command, {
        actorId,
        clientIp: "203.0.113.4",
      });
      await waitForBlockedPublishQueries(1);
      const banPromise = banClient.query(
        "update users set banned = true where id = $1 /* issue-718-ban-race */",
        [actorId],
      );
      await waitForBlockedQuery("issue-718-ban-race");
      const credentialPromise = credentialClient.query(
        "update accounts set password = null where user_id = $1 and provider_id = 'credential' /* issue-718-credential-race */",
        [actorId],
      );
      await waitForBlockedQuery("issue-718-credential-race");

      await placeLocker.query("commit");
      placeLockerOpen = false;
      const published = await publishPromise;
      expect(published).toMatchObject({ status: "published" });
      await Promise.all([banPromise, credentialPromise]);
      await banClient.query("commit");
      banClientOpen = false;
      await credentialClient.query("commit");
      credentialClientOpen = false;

      const next = createCommand();
      await expect(
        publishCampusMapChangeset(next, {
          actorId,
          clientIp: "203.0.113.4",
        }),
      ).resolves.toEqual({ status: "forbidden", code: "actor-banned" });
    } finally {
      if (placeLockerOpen) await placeLocker.query("rollback");
      if (banClientOpen) await banClient.query("rollback");
      if (credentialClientOpen) await credentialClient.query("rollback");
      if (publishPromise) await publishPromise.catch(() => undefined);
      placeLocker.release();
      banClient.release();
      credentialClient.release();
    }
  }, 10_000);

  it("freshly requires a verified CUHK email", async () => {
    const [unverifiedId, externalId] = await Promise.all([
      createActor({ emailVerified: false }),
      createActor({ email: `campus-map-${randomUUID()}@example.com` }),
    ]);

    for (const [index, actorId] of [unverifiedId, externalId].entries()) {
      await expect(
        publishCampusMapChangeset(createCommand(), {
          actorId,
          clientIp: `203.0.113.${7 + index}`,
        }),
      ).resolves.toEqual({
        status: "forbidden",
        code: "actor-not-eligible",
      });
    }
  });

  it("requires a completed nickname and credential profile", async () => {
    const [missingNickname, missingCredential] = await Promise.all([
      createActor({ nickname: "" }),
      createActor({ withCredential: false }),
    ]);

    const results = await Promise.all(
      [missingNickname, missingCredential].map((actorId, index) =>
        publishCampusMapChangeset(createCommand(), {
          actorId,
          clientIp: `203.0.113.${10 + index}`,
        }),
      ),
    );

    expect(results).toEqual([
      { status: "forbidden", code: "profile-incomplete" },
      { status: "forbidden", code: "profile-incomplete" },
    ]);
  });

  it("fails closed when the fresh database role is not user or admin", async () => {
    const actorId = await createActor({ role: "moderator" });

    await expect(
      publishCampusMapChangeset(createCommand(), {
        actorId,
        clientIp: "203.0.113.12",
      }),
    ).resolves.toEqual({
      status: "forbidden",
      code: "role-not-eligible",
    });
  });

  it("returns a stable field anchor when the Changeset comment is missing", async () => {
    const actorId = await createActor();
    const command = createCommand();
    command.comment = "";

    await expect(
      publishCampusMapChangeset(command, {
        actorId,
        clientIp: "203.0.113.13",
      }),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "comment-required",
          anchor: { field: "comment" },
        },
      ],
      warnings: [],
      suggestions: [],
    });
  });

  it("requires the fresh admin role for a bulk command", async () => {
    const actorId = await createActor({ role: "admin" });
    await pool.query("update users set role = 'user' where id = $1", [actorId]);
    const command = createCommand();
    command.kind = "bulk";
    command.changes.push(structuredClone(command.changes[0]));

    await expect(
      publishCampusMapChangeset(command, {
        actorId,
        clientIp: "203.0.113.14",
      }),
    ).resolves.toEqual({
      status: "forbidden",
      code: "admin-required",
    });
  });

  it("requires a single command to contain exactly one Place change", async () => {
    const actorId = await createActor();
    const command = createCommand();
    command.changes.push(structuredClone(command.changes[0]));

    await expect(
      publishCampusMapChangeset(command, {
        actorId,
        clientIp: "203.0.113.15",
      }),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "single-place-required",
          anchor: { field: "changes" },
        },
      ],
      warnings: [],
      suggestions: [],
    });
  });

  it("enforces the Changeset comment limit in UTF-8 bytes", async () => {
    const actorId = await createActor();
    const command = createCommand();
    command.comment = "中".repeat(667);

    const result = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.16",
    });

    expect(result).toMatchObject({
      status: "validation-failed",
      errors: [
        {
          code: "comment-too-long",
          anchor: { field: "comment" },
        },
      ],
    });
  });

  it("validates bounded Changeset metadata at the publish seam", async () => {
    const actorId = await createActor();
    const command = createCommand();
    command.sourceSummary = "源".repeat(2_001);
    command.client.name = "";
    command.client.version = "v".repeat(121);
    command.reviewRequested = "yes" as unknown as boolean;
    command.warningAcknowledgements = [
      {
        changeIndex: 99,
        code: "possible-duplicate",
        fingerprint: "not-a-server-fingerprint",
      },
    ];

    await expect(
      publishCampusMapChangeset(command, {
        actorId,
        clientIp: "203.0.113.16",
      }),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "source-summary-too-long",
          anchor: { field: "sourceSummary" },
        },
        { code: "client-name-required", anchor: { field: "client.name" } },
        {
          code: "client-version-too-long",
          anchor: { field: "client.version" },
        },
        {
          code: "invalid-review-requested",
          anchor: { field: "reviewRequested" },
        },
        {
          code: "warning-acknowledgement-invalid",
          anchor: { changeIndex: 99, field: "warningAcknowledgements" },
        },
      ],
      warnings: [],
      suggestions: [],
    });
  });

  it("returns invalid-command for a structurally malformed payload", async () => {
    const actorId = await createActor();
    const malformed = {
      ...createCommand(),
      changes: undefined,
    } as unknown as CampusMapPublishCommand;

    await expect(
      publishCampusMapChangeset(malformed, {
        actorId,
        clientIp: "203.0.113.16",
      }),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [{ code: "invalid-command", anchor: { field: "command" } }],
      warnings: [],
      suggestions: [],
    });
  });

  it("fails closed on malformed nested command values", async () => {
    const actorId = await createActor();

    const malformedAcknowledgement = createCommand();
    malformedAcknowledgement.warningAcknowledgements = [
      null as unknown as CampusMapPublishCommand["warningAcknowledgements"][number],
    ];
    await expect(
      publishCampusMapChangeset(malformedAcknowledgement, {
        actorId,
        clientIp: "203.0.113.16",
      }),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "warning-acknowledgement-invalid",
          anchor: { field: "warningAcknowledgements" },
        },
      ],
      warnings: [],
      suggestions: [],
    });

    const malformedSchedule = createCommand();
    const scheduleChange = malformedSchedule.changes[0];
    if (scheduleChange.operation !== "create") throw new Error("bad fixture");
    scheduleChange.fact.accessSchedule = {
      kind: "weekly",
      timezone: "Asia/Hong_Kong",
      intervals: [
        null as unknown as Extract<
          typeof scheduleChange.fact.accessSchedule,
          { kind: "weekly" }
        >["intervals"][number],
      ],
    };
    await expect(
      publishCampusMapChangeset(malformedSchedule, {
        actorId,
        clientIp: "203.0.113.16",
      }),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [
        {
          code: "invalid-access-schedule",
          anchor: { changeIndex: 0, field: "accessSchedule" },
        },
      ],
    });

    const malformedCoordinate = createCommand();
    const coordinateChange = malformedCoordinate.changes[0];
    if (coordinateChange.operation !== "create") throw new Error("bad fixture");
    coordinateChange.sources[0].sourceCoordinate = {
      x: 836_000,
      y: 819_000,
      crs: "hk80",
      conversion: undefined as unknown as null,
    };
    await expect(
      publishCampusMapChangeset(malformedCoordinate, {
        actorId,
        clientIp: "203.0.113.16",
      }),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [
        {
          code: "invalid-source-coordinate-lineage",
          anchor: { changeIndex: 0, field: "sources.0.sourceCoordinate" },
        },
      ],
    });

    const extendedSchedule = createCommand();
    const extendedScheduleChange = extendedSchedule.changes[0];
    if (extendedScheduleChange.operation !== "create") {
      throw new Error("bad fixture");
    }
    extendedScheduleChange.fact.accessSchedule = {
      kind: "weekly",
      timezone: "Asia/Hong_Kong",
      intervals: [
        {
          days: ["mon"],
          opensAt: "09:00",
          closesAt: "17:00",
          untrusted: "extra",
        } as unknown as Extract<
          typeof extendedScheduleChange.fact.accessSchedule,
          { kind: "weekly" }
        >["intervals"][number],
      ],
    };
    await expect(
      publishCampusMapChangeset(extendedSchedule, {
        actorId,
        clientIp: "203.0.113.16",
      }),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [
        {
          code: "invalid-access-schedule",
          anchor: { changeIndex: 0, field: "accessSchedule" },
        },
      ],
    });
  });

  it("charges validation attempts while exempting only exact completed replays", async () => {
    const actorId = await createActor();
    const context = { actorId, clientIp: "203.0.113.17" };
    const actorBurstAttempts = async () => {
      const result = await pool.query<{ attempt_count: number }>(
        `select attempt_count
           from campus_map_publish_rate_limits
          where scope = 'actor' and window_kind = 'burst'`,
      );
      return result.rows[0]?.attempt_count ?? 0;
    };

    const malformed = {
      ...createCommand(),
      changes: null,
    } as unknown as CampusMapPublishCommand;
    await expect(
      publishCampusMapChangeset(malformed, context),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [{ code: "invalid-command" }],
    });
    await expect(actorBurstAttempts()).resolves.toBe(1);

    const invalidKey = createCommand();
    invalidKey.idempotencyKey = "not-a-uuid";
    await expect(
      publishCampusMapChangeset(invalidKey, context),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [{ code: "invalid-idempotency-key" }],
    });
    await expect(actorBurstAttempts()).resolves.toBe(2);

    const command = createCommand();
    const published = await publishCampusMapChangeset(command, context);
    expect(published).toMatchObject({ status: "published" });
    await expect(actorBurstAttempts()).resolves.toBe(3);

    await expect(publishCampusMapChangeset(command, context)).resolves.toEqual(
      published,
    );
    await expect(actorBurstAttempts()).resolves.toBe(3);

    const reused = structuredClone(command);
    reused.comment = "同一幂等键的不同请求";
    await expect(
      publishCampusMapChangeset(reused, context),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [{ code: "idempotency-key-reused" }],
    });
    await expect(actorBurstAttempts()).resolves.toBe(4);
  });

  it("rejects PostgreSQL-invalid NUL text before storage", async () => {
    const actorId = await createActor();

    const badComment = createCommand();
    badComment.comment = "bad\u0000comment";
    await expect(
      publishCampusMapChangeset(badComment, {
        actorId,
        clientIp: "203.0.113.16",
      }),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [{ code: "comment-invalid", anchor: { field: "comment" } }],
    });

    const badFact = createCommand();
    const badFactChange = badFact.changes[0];
    if (badFactChange.operation !== "create") throw new Error("bad fixture");
    badFactChange.fact.name = "bad\u0000name";
    await expect(
      publishCampusMapChangeset(badFact, {
        actorId,
        clientIp: "203.0.113.16",
      }),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [
        {
          code: "fact-name-invalid",
          anchor: { changeIndex: 0, field: "name" },
        },
      ],
    });

    const badSurrogate = createCommand();
    const badSurrogateChange = badSurrogate.changes[0];
    if (badSurrogateChange.operation !== "create") {
      throw new Error("bad fixture");
    }
    badSurrogateChange.fact.name = "bad\ud800name";
    await expect(
      publishCampusMapChangeset(badSurrogate, {
        actorId,
        clientIp: "203.0.113.16",
      }),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "fact-name-invalid",
          anchor: { changeIndex: 0, field: "name" },
        },
      ],
      warnings: [],
      suggestions: [],
    });

    const trailingHighSurrogate = createCommand();
    const trailingHighSurrogateChange = trailingHighSurrogate.changes[0];
    if (trailingHighSurrogateChange.operation !== "create") {
      throw new Error("bad fixture");
    }
    trailingHighSurrogateChange.fact.name = "bad\ud800";
    await expect(
      publishCampusMapChangeset(trailingHighSurrogate, {
        actorId,
        clientIp: "203.0.113.16",
      }),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "fact-name-invalid",
          anchor: { changeIndex: 0, field: "name" },
        },
      ],
      warnings: [],
      suggestions: [],
    });

    const badSource = createCommand();
    const badSourceChange = badSource.changes[0];
    if (badSourceChange.operation !== "create") throw new Error("bad fixture");
    badSourceChange.sources[0].ref = "bad\u0000source";
    await expect(
      publishCampusMapChangeset(badSource, {
        actorId,
        clientIp: "203.0.113.16",
      }),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [
        {
          code: "source-ref-invalid",
          anchor: { changeIndex: 0, field: "sources.0.ref" },
        },
      ],
    });
  });

  it("enforces the smaller total byte ceiling for a single command", async () => {
    const actorId = await createActor();
    const command = createCommand();
    const source = command.changes[0].sources[0];
    command.changes[0].sources = Array.from({ length: 8 }, (_, index) => ({
      ...source,
      ref: `test:campus-map-publish:large-${index}-${randomUUID()}`,
      url: `https://example.com/${"a".repeat(1_900)}`,
      owner: "o".repeat(200),
      version: "v".repeat(100),
      snapshotHash: "h".repeat(200),
      limitations: "l".repeat(1_900),
      note: "n".repeat(1_900),
    }));

    const result = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.16",
    });

    expect(result).toMatchObject({
      status: "validation-failed",
      errors: [
        {
          code: "command-too-large",
          anchor: { field: "command" },
        },
      ],
    });
  });

  it("caps an admin bulk command at 25 Place changes", async () => {
    const adminId = await createActor({ role: "admin" });
    const command = createCommand();
    const change = command.changes[0];
    command.kind = "bulk";
    command.changes = Array.from({ length: 26 }, () => {
      const copy = structuredClone(change);
      copy.sources[0].ref = `test:campus-map-publish:${randomUUID()}`;
      return copy;
    });

    const result = await publishCampusMapChangeset(command, {
      actorId: adminId,
      clientIp: "203.0.113.16",
    });

    expect(result).toMatchObject({
      status: "validation-failed",
      errors: [
        {
          code: "bulk-limit-exceeded",
          anchor: { field: "changes" },
        },
      ],
    });
  });

  it("validates CAS identities and rejects duplicate bulk targets", async () => {
    const adminId = await createActor({ role: "admin" });
    const invalidIdentity = createCommand();
    const create = invalidIdentity.changes[0];
    if (create.operation !== "create") throw new Error("bad fixture");
    invalidIdentity.changes = [
      {
        operation: "update",
        placeId: "not-a-place-id",
        baseRevisionId: "not-a-revision-id",
        fact: create.fact,
        sources: create.sources,
      },
    ];
    await expect(
      publishCampusMapChangeset(invalidIdentity, {
        actorId: adminId,
        clientIp: "203.0.113.17",
      }),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "invalid-place-id",
          anchor: { changeIndex: 0, field: "placeId" },
        },
        {
          code: "invalid-base-revision-id",
          anchor: { changeIndex: 0, field: "baseRevisionId" },
        },
      ],
      warnings: [],
      suggestions: [],
    });

    const duplicateTarget = createCommand();
    const duplicateCreate = duplicateTarget.changes[0];
    if (duplicateCreate.operation !== "create") throw new Error("bad fixture");
    const placeId = randomUUID();
    const baseRevisionId = randomUUID();
    const update = {
      operation: "update" as const,
      placeId,
      baseRevisionId,
      fact: duplicateCreate.fact,
      sources: duplicateCreate.sources,
    };
    duplicateTarget.kind = "bulk";
    duplicateTarget.changes = [update, structuredClone(update)];
    await expect(
      publishCampusMapChangeset(duplicateTarget, {
        actorId: adminId,
        clientIp: "203.0.113.17",
      }),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "duplicate-place-change",
          anchor: { changeIndex: 1, placeId, field: "placeId" },
        },
      ],
      warnings: [],
      suggestions: [],
    });
  });

  it("canonicalizes UUID casing before references, CAS, and bulk deduplication", async () => {
    const adminId = await createActor({ role: "admin" });
    const initial = createCommand();
    const initialResult = await publishCampusMapChangeset(initial, {
      actorId: adminId,
      clientIp: "203.0.113.17",
    });
    if (initialResult.status !== "published") throw new Error("setup failed");

    const update = createCommand();
    const updateCreate = update.changes[0];
    if (updateCreate.operation !== "create") throw new Error("bad fixture");
    updateCreate.fact.name = "大小写 CAS 更新";
    update.changes = [
      {
        operation: "update",
        placeId: initialResult.changes[0].placeId.toUpperCase(),
        baseRevisionId: initialResult.changes[0].revisionId.toUpperCase(),
        fact: updateCreate.fact,
        sources: updateCreate.sources,
      },
    ];
    const updateResult = await publishCampusMapChangeset(update, {
      actorId: adminId.toUpperCase(),
      clientIp: "203.0.113.17",
    });

    const floorCreate = createCommand();
    const floorChange = floorCreate.changes[0];
    if (floorChange.operation !== "create") throw new Error("bad fixture");
    floorChange.fact.name = "大小写楼层地点";
    floorChange.fact.buildingId =
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0802".toUpperCase();
    floorChange.fact.floorId =
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0803".toUpperCase();
    floorChange.fact.location = { kind: "floor" };
    const floorResult = await publishCampusMapChangeset(floorCreate, {
      actorId: adminId,
      clientIp: "203.0.113.17",
    });

    const currentRevisionId =
      updateResult.status === "published"
        ? updateResult.changes[0].revisionId
        : initialResult.changes[0].revisionId;
    const duplicate = createCommand();
    const duplicateCreate = duplicate.changes[0];
    if (duplicateCreate.operation !== "create") throw new Error("bad fixture");
    duplicate.kind = "bulk";
    duplicate.changes = [
      {
        operation: "update",
        placeId: initialResult.changes[0].placeId,
        baseRevisionId: currentRevisionId,
        fact: { ...duplicateCreate.fact, name: "大小写批量目标" },
        sources: duplicateCreate.sources,
      },
      {
        operation: "update",
        placeId: initialResult.changes[0].placeId.toUpperCase(),
        baseRevisionId: currentRevisionId.toUpperCase(),
        fact: { ...duplicateCreate.fact, name: "大小写批量目标" },
        sources: duplicateCreate.sources,
      },
    ];
    const duplicateResult = await publishCampusMapChangeset(duplicate, {
      actorId: adminId,
      clientIp: "203.0.113.17",
    });

    expect({
      updateStatus: updateResult.status,
      floorStatus: floorResult.status,
      duplicateResult,
    }).toEqual({
      updateStatus: "published",
      floorStatus: "published",
      duplicateResult: {
        status: "validation-failed",
        errors: [
          {
            code: "duplicate-place-change",
            anchor: {
              changeIndex: 1,
              placeId: initialResult.changes[0].placeId,
              field: "placeId",
            },
          },
        ],
        warnings: [],
        suggestions: [],
      },
    });
  });

  it("caps structured sources at the single-command limit", async () => {
    const actorId = await createActor();
    const command = createCommand();
    const source = command.changes[0].sources[0];
    command.changes[0].sources = Array.from({ length: 9 }, () => ({
      ...source,
      ref: `test:campus-map-publish:${randomUUID()}`,
    }));

    const result = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.16",
    });

    expect(result).toMatchObject({
      status: "validation-failed",
      errors: [
        {
          code: "source-limit-exceeded",
          anchor: { changeIndex: 0, field: "sources" },
        },
      ],
    });
  });

  it("requires structured provenance for every Place change", async () => {
    const actorId = await createActor();
    const command = createCommand();
    command.changes[0].sources = [];

    const result = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.17",
    });

    expect(result).toMatchObject({
      status: "validation-failed",
      errors: [
        {
          code: "source-required",
          anchor: { changeIndex: 0, field: "sources" },
        },
      ],
    });
  });

  it("rejects duplicate provenance identities within one revision", async () => {
    const actorId = await createActor();
    const command = createCommand();
    const change = command.changes[0];
    if (change.operation !== "create") throw new Error("bad fixture");
    change.sources.push(structuredClone(change.sources[0]));

    await expect(
      publishCampusMapChangeset(command, {
        actorId,
        clientIp: "203.0.113.18",
      }),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "duplicate-source-reference",
          anchor: { changeIndex: 0, field: "sources.1.ref" },
        },
      ],
      warnings: [],
      suggestions: [],
    });
  });

  it("atomically publishes a create and exposes it through canonical reads", async () => {
    const actorId = await createActor();
    const command = createCommand();

    const result = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.18",
    });

    expect(result).toMatchObject({
      status: "published",
      changesetId: expect.any(String),
      changes: [
        {
          placeId: expect.any(String),
          revisionId: expect.any(String),
        },
      ],
    });
    if (result.status !== "published") throw new Error("publish failed");
    const [{ placeId, revisionId }] = result.changes;
    await expect(getCampusMapCurrentPlace(placeId)).resolves.toMatchObject({
      id: placeId,
      revisionId,
      name: "大学图书馆饮水点",
      location: {
        kind: "building",
        building: { id: "00000000-0000-4000-8000-000000000802" },
      },
    });
    await expect(getCampusMapPlaceHistory(placeId)).resolves.toMatchObject({
      items: [
        {
          id: revisionId,
          changesetId: result.changesetId,
          operation: "create",
        },
      ],
    });
    await expect(
      getCampusMapChangeset(result.changesetId),
    ).resolves.toMatchObject({
      comment: command.comment,
      reviewRequested: false,
      counts: { affected: 1, created: 1 },
    });
  });

  it("updates from the locked Current revision and computes the server diff", async () => {
    const actorId = await createActor();
    const created = await publishCampusMapChangeset(createCommand(), {
      actorId,
      clientIp: "203.0.113.19",
    });
    if (created.status !== "published") throw new Error("create failed");
    const [{ placeId, revisionId: baseRevisionId }] = created.changes;
    const command = createCommand();
    const createChange = command.changes[0];
    if (createChange.operation !== "create") throw new Error("invalid fixture");
    command.changes = [
      {
        operation: "update",
        placeId,
        baseRevisionId,
        fact: { ...createChange.fact, name: "大学图书馆补水站" },
        sources: createChange.sources,
      },
    ];

    const updated = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.19",
    });

    expect(updated).toMatchObject({ status: "published" });
    if (updated.status !== "published") throw new Error("update failed");
    const [{ revisionId }] = updated.changes;
    await expect(getCampusMapCurrentPlace(placeId)).resolves.toMatchObject({
      revisionId,
      name: "大学图书馆补水站",
    });
    await expect(getCampusMapPlaceHistory(placeId)).resolves.toMatchObject({
      items: [
        { id: revisionId, previousRevisionId: baseRevisionId },
        { id: baseRevisionId, previousRevisionId: null },
      ],
    });
    await expect(
      getCampusMapChangeset(updated.changesetId),
    ).resolves.toMatchObject({
      changes: [
        {
          placeId,
          operation: "update",
          diff: {
            fields: {
              name: {
                before: "大学图书馆饮水点",
                after: "大学图书馆补水站",
                label: "名称",
              },
            },
          },
        },
      ],
    });
  });

  it("publishes an observed-at-only correction with a typed field diff", async () => {
    const actorId = await createActor();
    const create = createCommand();
    const createChange = create.changes[0];
    if (createChange.operation !== "create") throw new Error("bad fixture");
    createChange.fact.observedAt = null;
    const created = await publishCampusMapChangeset(create, {
      actorId,
      clientIp: "203.0.113.192",
    });
    if (created.status !== "published") throw new Error("create failed");
    const [{ placeId, revisionId: baseRevisionId }] = created.changes;

    const observedAt = "2026-08-25T03:00:00.000Z";
    const update = createCommand();
    const updateFixture = update.changes[0];
    if (updateFixture.operation !== "create") throw new Error("bad fixture");
    update.comment = "补充现场观察时间";
    update.changes = [
      {
        operation: "update",
        placeId,
        baseRevisionId,
        fact: { ...structuredClone(createChange.fact), observedAt },
        sources: updateFixture.sources,
      },
    ];

    const updated = await publishCampusMapChangeset(update, {
      actorId,
      clientIp: "203.0.113.192",
    });
    expect(updated).toMatchObject({ status: "published" });
    if (updated.status !== "published") throw new Error("update failed");
    await expect(getCampusMapCurrentPlace(placeId)).resolves.toMatchObject({
      revisionId: updated.changes[0].revisionId,
      observedAt: new Date(observedAt),
    });
    await expect(
      getCampusMapChangeset(updated.changesetId),
    ).resolves.toMatchObject({
      changes: [
        {
          placeId,
          operation: "update",
          diff: {
            fields: {
              observedAt: {
                before: null,
                after: observedAt,
                label: "观察时间",
              },
            },
          },
        },
      ],
    });
  });

  it("rejects an update whose server-computed fact diff is empty", async () => {
    const actorId = await createActor();
    const created = await publishCampusMapChangeset(createCommand(), {
      actorId,
      clientIp: "203.0.113.19",
    });
    if (created.status !== "published") throw new Error("create failed");
    const [{ placeId, revisionId: baseRevisionId }] = created.changes;
    const command = createCommand();
    const createChange = command.changes[0];
    if (createChange.operation !== "create") throw new Error("bad fixture");
    command.comment = "只有说明变化，不是事实变化";
    command.changes = [
      {
        operation: "update",
        placeId,
        baseRevisionId,
        fact: createChange.fact,
        sources: createChange.sources,
      },
    ];

    const result = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.19",
    });

    expect(result).toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "no-fact-changes",
          anchor: { changeIndex: 0, placeId, field: "fact" },
        },
      ],
      warnings: [],
      suggestions: [],
    });
    await expect(getCampusMapPlaceHistory(placeId)).resolves.toMatchObject({
      items: [{ id: baseRevisionId }],
    });
  });

  it("treats equivalent multi-select and schedule representations as no fact change", async () => {
    const actorId = await createActor();
    const create = createCommand();
    const createChange = create.changes[0];
    if (createChange.operation !== "create") throw new Error("bad fixture");
    createChange.fact.pinType = "printer";
    createChange.fact.capabilities = ["print", "scan"];
    createChange.fact.accessSchedule = {
      kind: "weekly",
      timezone: "Asia/Hong_Kong",
      intervals: [
        {
          days: ["mon", "wed"],
          opensAt: "09:00",
          closesAt: "12:00",
        },
        {
          days: ["tue"],
          opensAt: "13:00",
          closesAt: "17:00",
        },
      ],
    };
    const created = await publishCampusMapChangeset(create, {
      actorId,
      clientIp: "203.0.113.191",
    });
    if (created.status !== "published") throw new Error("create failed");
    const [{ placeId, revisionId: baseRevisionId }] = created.changes;

    const update = createCommand();
    const updateFixture = update.changes[0];
    if (updateFixture.operation !== "create") throw new Error("bad fixture");
    update.comment = "确认同一事实的不同 JSON 表示";
    update.changes = [
      {
        operation: "update",
        placeId,
        baseRevisionId,
        fact: {
          ...structuredClone(createChange.fact),
          capabilities: ["scan", "print"],
          accessSchedule: {
            intervals: [
              {
                closesAt: "17:00",
                opensAt: "13:00",
                days: ["tue"],
              },
              {
                closesAt: "12:00",
                opensAt: "09:00",
                days: ["wed", "mon"],
              },
            ],
            timezone: "Asia/Hong_Kong",
            kind: "weekly",
          },
        },
        sources: updateFixture.sources,
      },
    ];

    await expect(
      publishCampusMapChangeset(update, {
        actorId,
        clientIp: "203.0.113.191",
      }),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "no-fact-changes",
          anchor: { changeIndex: 0, placeId, field: "fact" },
        },
      ],
      warnings: [],
      suggestions: [],
    });
    await expect(getCampusMapPlaceHistory(placeId)).resolves.toMatchObject({
      items: [{ id: baseRevisionId }],
    });
  });

  it("represents a position correction as a typed location diff on update", async () => {
    const actorId = await createActor();
    const created = await publishCampusMapChangeset(createCommand(), {
      actorId,
      clientIp: "203.0.113.20",
    });
    if (created.status !== "published") throw new Error("create failed");
    const [{ placeId, revisionId: baseRevisionId }] = created.changes;
    const command = createCommand();
    const createChange = command.changes[0];
    if (createChange.operation !== "create") throw new Error("invalid fixture");
    const longitude = 114.2092;
    const latitude = 22.4196;
    command.changes = [
      {
        operation: "update",
        placeId,
        baseRevisionId,
        fact: {
          ...createChange.fact,
          buildingId: null,
          floorId: null,
          location: {
            kind: "outdoor-point",
            longitude,
            latitude,
            crs: "wgs84",
            precision: "approximate",
          },
        },
        sources: [
          {
            ...createChange.sources[0],
            sourceCoordinate: {
              x: longitude,
              y: latitude,
              crs: "wgs84",
              conversion: null,
            },
          },
        ],
      },
    ];

    const corrected = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.20",
    });

    expect(corrected).toMatchObject({ status: "published" });
    if (corrected.status !== "published") throw new Error("update failed");
    await expect(getCampusMapCurrentPlace(placeId)).resolves.toMatchObject({
      location: {
        kind: "outdoor-point",
        point: { longitude, latitude, crs: "wgs84", precision: "approximate" },
      },
    });
    const changeset = await getCampusMapChangeset(corrected.changesetId);
    expect(changeset?.changes[0]).toMatchObject({ operation: "update" });
    const change = changeset?.changes[0];
    expect(change?.visibility).toBe("public");
    if (change?.visibility !== "public") throw new Error("change is hidden");
    expect(change.diff.position).toEqual({
      before: {
        kind: "building",
        buildingId: "00000000-0000-4000-8000-000000000802",
      },
      after: {
        kind: "outdoor-point",
        longitude,
        latitude,
        crs: "wgs84",
        precision: "approximate",
      },
      label: "位置",
    });
  });

  it("retires and restores by appending revisions through the same seam", async () => {
    const actorId = await createActor();
    const create = createCommand();
    const created = await publishCampusMapChangeset(create, {
      actorId,
      clientIp: "203.0.113.21",
    });
    if (created.status !== "published") throw new Error("create failed");
    const [{ placeId, revisionId: createdRevisionId }] = created.changes;

    const retire = createCommand();
    const retireSource = retire.changes[0].sources;
    retire.comment = "永久停用饮水点";
    retire.changes = [
      {
        operation: "retire",
        placeId,
        baseRevisionId: createdRevisionId,
        sources: retireSource,
      },
    ];
    const retired = await publishCampusMapChangeset(retire, {
      actorId,
      clientIp: "203.0.113.21",
    });
    expect(retired).toMatchObject({ status: "published" });
    if (retired.status !== "published") throw new Error("retire failed");
    const retiredRevisionId = retired.changes[0].revisionId;
    await expect(getCampusMapCurrentPlace(placeId)).resolves.toBeNull();

    const restore = createCommand();
    const restoreChange = restore.changes[0];
    if (restoreChange.operation !== "create") throw new Error("bad fixture");
    restore.comment = "恢复饮水点";
    restore.reviewRequested = true;
    restore.changes = [
      {
        operation: "restore",
        placeId,
        baseRevisionId: retiredRevisionId,
        fact: { ...restoreChange.fact, name: "恢复后的饮水点" },
        sources: restoreChange.sources,
      },
    ];
    const restored = await publishCampusMapChangeset(restore, {
      actorId,
      clientIp: "203.0.113.21",
    });
    expect(restored).toMatchObject({ status: "published" });
    if (restored.status !== "published") throw new Error("restore failed");

    await expect(getCampusMapCurrentPlace(placeId)).resolves.toMatchObject({
      revisionId: restored.changes[0].revisionId,
      name: "恢复后的饮水点",
    });
    await expect(getCampusMapPlaceHistory(placeId)).resolves.toMatchObject({
      items: [
        { status: "active", previousRevisionId: retiredRevisionId },
        { status: "retired", previousRevisionId: createdRevisionId },
        { status: "active", previousRevisionId: null },
      ],
    });
    await expect(
      getCampusMapChangeset(restored.changesetId),
    ).resolves.toMatchObject({ reviewRequested: true });
  });

  it("returns a validation error for an operation disallowed by Current status", async () => {
    const actorId = await createActor();
    const created = await publishCampusMapChangeset(createCommand(), {
      actorId,
      clientIp: "203.0.113.21",
    });
    if (created.status !== "published") throw new Error("create failed");
    const [{ placeId, revisionId: createdRevisionId }] = created.changes;
    const retire = createCommand();
    retire.changes = [
      {
        operation: "retire",
        placeId,
        baseRevisionId: createdRevisionId,
        sources: retire.changes[0].sources,
      },
    ];
    const retired = await publishCampusMapChangeset(retire, {
      actorId,
      clientIp: "203.0.113.21",
    });
    if (retired.status !== "published") throw new Error("retire failed");

    const update = createCommand();
    const updateCreate = update.changes[0];
    if (updateCreate.operation !== "create") throw new Error("bad fixture");
    update.changes = [
      {
        operation: "update",
        placeId,
        baseRevisionId: retired.changes[0].revisionId,
        fact: { ...updateCreate.fact, name: "不能直接更新 retired" },
        sources: updateCreate.sources,
      },
    ];
    const result = await publishCampusMapChangeset(update, {
      actorId,
      clientIp: "203.0.113.21",
    });

    expect(result).toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "operation-not-allowed",
          anchor: { changeIndex: 0, placeId, field: "operation" },
        },
      ],
      warnings: [],
      suggestions: [],
    });
  });

  it("never republishes a redacted Current revision through the public seam", async () => {
    const actorId = await createActor();
    const active = await publishCampusMapChangeset(createCommand(), {
      actorId,
      clientIp: "203.0.113.21",
    });
    if (active.status !== "published") throw new Error("create failed");
    const [{ placeId, revisionId }] = active.changes;
    await pool.query(
      "update campus_map_revision_visibility set visibility = 'redacted', redaction_ref = 'test:#718' where revision_id = $1",
      [revisionId],
    );
    await expect(getCampusMapCurrentPlace(placeId)).resolves.toBeNull();
    await expect(
      listCampusMapCurrentPlaces({
        buildingId: "00000000-0000-4000-8000-000000000802",
      }),
    ).resolves.not.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: placeId })]),
    });

    const hiddenDuplicate = await publishCampusMapChangeset(createCommand(), {
      actorId,
      clientIp: "203.0.113.21",
    });
    expect(hiddenDuplicate).toMatchObject({
      status: "published",
      warnings: [],
    });

    for (const operation of ["update", "retire"] as const) {
      const command = createCommand();
      const create = command.changes[0];
      if (create.operation !== "create") throw new Error("bad fixture");
      command.changes = [
        operation === "update"
          ? {
              operation,
              placeId,
              baseRevisionId: revisionId,
              fact: { ...create.fact, name: "不得重新公开" },
              sources: create.sources,
            }
          : {
              operation,
              placeId,
              baseRevisionId: revisionId,
              sources: create.sources,
            },
      ];
      await expect(
        publishCampusMapChangeset(command, {
          actorId,
          clientIp: "203.0.113.21",
        }),
      ).resolves.toEqual({
        status: "validation-failed",
        errors: [
          {
            code: "redacted-revision-not-editable",
            anchor: { changeIndex: 0, placeId, field: "baseRevisionId" },
          },
        ],
        warnings: [],
        suggestions: [],
      });
    }

    const restoreFixture = createCommand();
    const restoreCreate = restoreFixture.changes[0];
    if (restoreCreate.operation !== "create") throw new Error("bad fixture");
    restoreCreate.fact.name = "待恢复的 redacted 地点";
    restoreCreate.fact.buildingId = "00000000-0000-4000-8000-000000000804";
    const restoreCreated = await publishCampusMapChangeset(restoreFixture, {
      actorId,
      clientIp: "203.0.113.21",
    });
    if (restoreCreated.status !== "published") throw new Error("create failed");
    const restorePlace = restoreCreated.changes[0];
    const retire = createCommand();
    retire.changes = [
      {
        operation: "retire",
        placeId: restorePlace.placeId,
        baseRevisionId: restorePlace.revisionId,
        sources: retire.changes[0].sources,
      },
    ];
    const retired = await publishCampusMapChangeset(retire, {
      actorId,
      clientIp: "203.0.113.21",
    });
    if (retired.status !== "published") throw new Error("retire failed");
    await pool.query(
      "update campus_map_revision_visibility set visibility = 'redacted', redaction_ref = 'test:#718' where revision_id = $1",
      [retired.changes[0].revisionId],
    );

    const restore = createCommand();
    const restoreFact = restore.changes[0];
    if (restoreFact.operation !== "create") throw new Error("bad fixture");
    restore.changes = [
      {
        operation: "restore",
        placeId: restorePlace.placeId,
        baseRevisionId: retired.changes[0].revisionId,
        fact: restoreCreate.fact,
        sources: restoreFact.sources,
      },
    ];
    await expect(
      publishCampusMapChangeset(restore, {
        actorId,
        clientIp: "203.0.113.21",
      }),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [
        {
          code: "redacted-revision-not-editable",
          anchor: {
            changeIndex: 0,
            placeId: restorePlace.placeId,
            field: "baseRevisionId",
          },
        },
      ],
    });

    const counts = await pool.query<{ place_id: string; revisions: number }>(
      `select place_id, count(*)::int as revisions
         from campus_map_fact_revisions
        where place_id = any($1::uuid[])
        group by place_id
        order by place_id`,
      [[placeId, restorePlace.placeId]],
    );
    expect(counts.rows.map((row) => row.revisions).sort()).toEqual([1, 2]);
  });

  it("hides a redacted outdoor point from Changeset detail and feed bbox", async () => {
    const actorId = await createActor();
    const command = createCommand();
    const change = command.changes[0];
    if (change.operation !== "create") throw new Error("bad fixture");
    change.fact.name = "需遮蔽坐标的室外点";
    change.fact.buildingId = null;
    change.fact.floorId = null;
    change.fact.location = {
      kind: "outdoor-point",
      longitude: 114.209718,
      latitude: 22.419941,
      crs: "wgs84",
      precision: "precise",
    };
    const published = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.21",
    });
    if (published.status !== "published") throw new Error("create failed");
    await expect(
      getCampusMapChangeset(published.changesetId),
    ).resolves.toMatchObject({
      bbox: {
        west: 114.209718,
        south: 22.419941,
        east: 114.209718,
        north: 22.419941,
      },
    });

    await pool.query(
      "update campus_map_revision_visibility set visibility = 'redacted', redaction_ref = 'test:#718-bbox' where revision_id = $1",
      [published.changes[0].revisionId],
    );

    await expect(
      getCampusMapChangeset(published.changesetId),
    ).resolves.toMatchObject({
      bbox: null,
      changes: [{ visibility: "redacted" }],
    });
    const feed = await listCampusMapChangesets({
      scope: { kind: "recent" },
      limit: 100,
    });
    expect(
      feed.items.find((item) => item.id === published.changesetId),
    ).toMatchObject({ bbox: null });
    const bboxFeed = await listCampusMapChangesets({
      scope: {
        kind: "bbox",
        bounds: { west: 114.2, south: 22.4, east: 114.22, north: 22.43 },
      },
      limit: 100,
    });
    expect(
      bboxFeed.items.some((item) => item.id === published.changesetId),
    ).toBe(false);
  });

  it("hides a public correction whose predecessor was later redacted", async () => {
    const actorId = await createActor();
    const create = createCommand();
    const createChange = create.changes[0];
    if (createChange.operation !== "create") throw new Error("bad fixture");
    createChange.fact.name = "后来需要遮蔽的旧名称";
    createChange.fact.buildingId = null;
    createChange.fact.floorId = null;
    createChange.fact.location = {
      kind: "outdoor-point",
      longitude: 114.209,
      latitude: 22.419,
      crs: "wgs84",
      precision: "approximate",
    };
    const created = await publishCampusMapChangeset(create, {
      actorId,
      clientIp: "203.0.113.193",
    });
    if (created.status !== "published") throw new Error("create failed");
    const [{ placeId, revisionId: baseRevisionId }] = created.changes;

    const update = createCommand();
    const updateFixture = update.changes[0];
    if (updateFixture.operation !== "create") throw new Error("bad fixture");
    update.changes = [
      {
        operation: "update",
        placeId,
        baseRevisionId,
        fact: {
          ...structuredClone(createChange.fact),
          name: "公开的新名称",
          location: {
            kind: "outdoor-point",
            longitude: 114.21,
            latitude: 22.42,
            crs: "wgs84",
            precision: "approximate",
          },
        },
        sources: updateFixture.sources,
      },
    ];
    const updated = await publishCampusMapChangeset(update, {
      actorId,
      clientIp: "203.0.113.193",
    });
    if (updated.status !== "published") throw new Error("update failed");

    await pool.query(
      "update campus_map_revision_visibility set visibility = 'redacted', redaction_ref = 'test:#719-predecessor' where revision_id = $1",
      [baseRevisionId],
    );

    const detail = await getCampusMapChangeset(updated.changesetId);
    expect(detail).toMatchObject({
      bbox: null,
      changes: [{ visibility: "redacted" }],
    });
    expect(JSON.stringify(detail)).not.toContain("后来需要遮蔽的旧名称");
    const revision = await getCampusMapPlaceRevision(
      placeId,
      updated.changes[0].revisionId,
    );
    expect(revision?.fieldDiff).toBeNull();
    expect(JSON.stringify(revision)).not.toContain("后来需要遮蔽的旧名称");
    const bbox = await listCampusMapChangesets({
      scope: {
        kind: "bbox",
        bounds: { west: 114.2, south: 22.4, east: 114.22, north: 22.43 },
      },
      limit: 100,
    });
    expect(bbox.items.map((item) => item.id)).not.toContain(
      updated.changesetId,
    );
  });

  it("serializes a concurrent redaction before reading Current visibility", async () => {
    const actorId = await createActor();
    const created = await publishCampusMapChangeset(createCommand(), {
      actorId,
      clientIp: "203.0.113.21",
    });
    if (created.status !== "published") throw new Error("create failed");
    const [{ placeId, revisionId }] = created.changes;
    const command = createCommand();
    const create = command.changes[0];
    if (create.operation !== "create") throw new Error("bad fixture");
    command.changes = [
      {
        operation: "update",
        placeId,
        baseRevisionId: revisionId,
        fact: { ...create.fact, name: "并发 redaction 不得重新公开" },
        sources: create.sources,
      },
    ];

    const redactor = await pool.connect();
    await redactor.query("begin");
    let redactorOpen = true;
    let publishPromise:
      | ReturnType<typeof publishCampusMapChangeset>
      | undefined;
    try {
      await redactor.query(
        "update campus_map_revision_visibility set visibility = 'redacted', redaction_ref = 'test:#718-race' where revision_id = $1",
        [revisionId],
      );
      publishPromise = publishCampusMapChangeset(command, {
        actorId,
        clientIp: "203.0.113.21",
      });
      await waitForBlockedQuery("campus_map_revision_visibility");
      await redactor.query("commit");
      redactorOpen = false;

      await expect(publishPromise).resolves.toMatchObject({
        status: "validation-failed",
        errors: [{ code: "redacted-revision-not-editable" }],
      });
      await expect(getCampusMapPlaceHistory(placeId)).resolves.toMatchObject({
        items: [{ id: revisionId }],
      });
    } finally {
      if (redactorOpen) await redactor.query("rollback");
      if (publishPromise) await publishPromise.catch(() => undefined);
      redactor.release();
    }
  }, 10_000);

  it("returns a safe Current snapshot for a stale base without partial writes", async () => {
    const [firstActorId, staleActorId] = await Promise.all([
      createActor(),
      createActor(),
    ]);
    const created = await publishCampusMapChangeset(createCommand(), {
      actorId: firstActorId,
      clientIp: "203.0.113.22",
    });
    if (created.status !== "published") throw new Error("create failed");
    const [{ placeId, revisionId: baseRevisionId }] = created.changes;

    const firstCommand = createCommand();
    const firstCreate = firstCommand.changes[0];
    if (firstCreate.operation !== "create") throw new Error("bad fixture");
    firstCommand.changes = [
      {
        operation: "update",
        placeId,
        baseRevisionId,
        fact: { ...firstCreate.fact, name: "先发布的名称" },
        sources: firstCreate.sources,
      },
    ];
    const staleCommand = createCommand();
    const staleCreate = staleCommand.changes[0];
    if (staleCreate.operation !== "create") throw new Error("bad fixture");
    staleCommand.changes = [
      {
        operation: "update",
        placeId,
        baseRevisionId,
        fact: { ...staleCreate.fact, name: "陈旧草稿名称" },
        sources: staleCreate.sources,
      },
    ];
    const first = await publishCampusMapChangeset(firstCommand, {
      actorId: firstActorId,
      clientIp: "203.0.113.22",
    });
    if (first.status !== "published") throw new Error("update failed");

    const conflict = await publishCampusMapChangeset(staleCommand, {
      actorId: staleActorId,
      clientIp: "203.0.113.23",
    });

    expect(conflict).toEqual({
      status: "conflict",
      code: "base-revision-conflict",
      conflicts: [
        {
          code: "base-revision-conflict",
          anchor: { changeIndex: 0, placeId, field: "baseRevisionId" },
          placeId,
          expectedRevisionId: baseRevisionId,
          currentRevisionId: first.changes[0].revisionId,
          currentStatus: "active",
          currentSnapshot: expect.objectContaining({
            factSchemaVersion: 1,
            name: "先发布的名称",
            location: {
              kind: "building",
              buildingId: "00000000-0000-4000-8000-000000000802",
            },
          }),
        },
      ],
    });
    if (conflict.status !== "conflict") throw new Error("expected conflict");
    expect(conflict.conflicts[0].currentSnapshot).not.toHaveProperty(
      "provenance",
    );
    await expect(getCampusMapCurrentPlace(placeId)).resolves.toMatchObject({
      revisionId: first.changes[0].revisionId,
      name: "先发布的名称",
    });
    await expect(getCampusMapPlaceHistory(placeId)).resolves.toMatchObject({
      items: [{ id: first.changes[0].revisionId }, { id: baseRevisionId }],
    });
  });

  it("returns a safe conflict when the target Place no longer exists", async () => {
    const actorId = await createActor();
    const command = createCommand();
    const create = command.changes[0];
    if (create.operation !== "create") throw new Error("bad fixture");
    const placeId = randomUUID();
    const baseRevisionId = randomUUID();
    command.changes = [
      {
        operation: "update",
        placeId,
        baseRevisionId,
        fact: create.fact,
        sources: create.sources,
      },
    ];

    await expect(
      publishCampusMapChangeset(command, {
        actorId,
        clientIp: "203.0.113.23",
      }),
    ).resolves.toEqual({
      status: "conflict",
      code: "base-revision-conflict",
      conflicts: [
        {
          code: "base-revision-conflict",
          anchor: { changeIndex: 0, placeId, field: "baseRevisionId" },
          placeId,
          expectedRevisionId: baseRevisionId,
          currentRevisionId: null,
          currentStatus: null,
          currentSnapshot: null,
        },
      ],
    });
    await expect(getCampusMapCurrentPlace(placeId)).resolves.toBeNull();
    await expect(getCampusMapPlaceHistory(placeId)).resolves.toMatchObject({
      items: [],
    });
  });

  it("rejects invalid controlled facts before they reach storage", async () => {
    const actorId = await createActor();
    const command = createCommand();
    const change = command.changes[0];
    if (change.operation !== "create") throw new Error("bad fixture");
    change.fact.name = "   ";
    change.fact.pinType = "atm" as typeof change.fact.pinType;
    change.fact.location = {
      kind: "outdoor-point",
      longitude: 114.2,
      latitude: 100,
      crs: "wgs84",
      precision: "approximate",
    };

    const result = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.24",
    });

    expect(result).toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "fact-name-required",
          anchor: { changeIndex: 0, field: "name" },
        },
        {
          code: "invalid-pin-type",
          anchor: { changeIndex: 0, field: "pinType" },
        },
        {
          code: "invalid-location",
          anchor: { changeIndex: 0, field: "location" },
        },
      ],
      warnings: [],
      suggestions: [],
    });
  });

  it("enforces pin-type applicable fields from the active fact schema", async () => {
    const actorId = await createActor();
    const command = createCommand();
    const change = command.changes[0];
    if (change.operation !== "create") throw new Error("bad fixture");
    change.fact.capabilities = ["print"];
    change.fact.gender = "female";

    await expect(
      publishCampusMapChangeset(command, {
        actorId,
        clientIp: "203.0.113.24",
      }),
    ).resolves.toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "field-not-applicable",
          anchor: { changeIndex: 0, field: "capabilities" },
        },
        {
          code: "field-not-applicable",
          anchor: { changeIndex: 0, field: "gender" },
        },
      ],
      warnings: [],
      suggestions: [],
    });
  });

  it("validates source byte limits, dates, and coordinate lineage", async () => {
    const actorId = await createActor();
    const command = createCommand();
    const source = command.changes[0].sources[0];
    source.ref = "源".repeat(171);
    source.accessedOn = "24-08-2026";
    source.sourceCoordinate = {
      x: 114.2,
      y: 22.4,
      crs: "gcj02",
      conversion: null,
    };

    const result = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.25",
    });

    expect(result).toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "source-ref-too-long",
          anchor: { changeIndex: 0, field: "sources.0.ref" },
        },
        {
          code: "invalid-source-accessed-on",
          anchor: { changeIndex: 0, field: "sources.0.accessedOn" },
        },
        {
          code: "invalid-source-coordinate-lineage",
          anchor: { changeIndex: 0, field: "sources.0.sourceCoordinate" },
        },
      ],
      warnings: [],
      suggestions: [],
    });
  });

  it("rejects PostgreSQL-unrepresentable dates as charged validation", async () => {
    const previous = {
      actorBurst: process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT,
      actorSustained: process.env.CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT,
      ipBurst: process.env.CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT,
      ipSustained: process.env.CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT,
    };
    process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT = "3";
    process.env.CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT = "100";
    process.env.CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT = "100";
    process.env.CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT = "100";
    try {
      const actorId = await createActor();
      const invalidDate = createCommand();
      invalidDate.changes[0].sources[0].accessedOn = "0000-01-01";

      await expect(
        publishCampusMapChangeset(invalidDate, {
          actorId,
          clientIp: "203.0.113.251",
        }),
      ).resolves.toEqual({
        status: "validation-failed",
        errors: [
          {
            code: "invalid-source-accessed-on",
            anchor: { changeIndex: 0, field: "sources.0.accessedOn" },
          },
        ],
        warnings: [],
        suggestions: [],
      });

      const invalidFactObservedAt = createCommand();
      const invalidFactChange = invalidFactObservedAt.changes[0];
      if (invalidFactChange.operation !== "create") {
        throw new Error("bad fixture");
      }
      invalidFactChange.fact.observedAt = "-010000-01-01T00:00:00.000Z";
      await expect(
        publishCampusMapChangeset(invalidFactObservedAt, {
          actorId,
          clientIp: "203.0.113.251",
        }),
      ).resolves.toEqual({
        status: "validation-failed",
        errors: [
          {
            code: "invalid-observed-at",
            anchor: { changeIndex: 0, field: "observedAt" },
          },
        ],
        warnings: [],
        suggestions: [],
      });

      const invalidSourceObservedAt = createCommand();
      invalidSourceObservedAt.changes[0].sources[0].observedAt =
        "-010000-01-01T00:00:00.000Z";
      await expect(
        publishCampusMapChangeset(invalidSourceObservedAt, {
          actorId,
          clientIp: "203.0.113.251",
        }),
      ).resolves.toEqual({
        status: "validation-failed",
        errors: [
          {
            code: "invalid-source-observed-at",
            anchor: { changeIndex: 0, field: "sources.0.observedAt" },
          },
        ],
        warnings: [],
        suggestions: [],
      });

      await expect(
        publishCampusMapChangeset(createCommand(), {
          actorId,
          clientIp: "203.0.113.251",
        }),
      ).resolves.toMatchObject({
        status: "rate-limited",
        scope: "actor",
        policy: "burst",
      });
    } finally {
      for (const [name, value] of [
        ["CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT", previous.actorBurst],
        ["CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT", previous.actorSustained],
        ["CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT", previous.ipBurst],
        ["CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT", previous.ipSustained],
      ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("rejects changed metadata for an existing structured source identity", async () => {
    const actorId = await createActor();
    const create = createCommand();
    const createChange = create.changes[0];
    if (createChange.operation !== "create") throw new Error("bad fixture");
    createChange.sources[0].ref = "test:campus-map-publish:stable-source";
    const created = await publishCampusMapChangeset(create, {
      actorId,
      clientIp: "203.0.113.25",
    });
    if (created.status !== "published") throw new Error("create failed");
    const [{ placeId, revisionId }] = created.changes;

    const update = createCommand();
    const updateCreate = update.changes[0];
    if (updateCreate.operation !== "create") throw new Error("bad fixture");
    updateCreate.sources[0].ref = "test:campus-map-publish:stable-source";
    updateCreate.sources[0].owner = "伪造的新 owner";
    update.changes = [
      {
        operation: "update",
        placeId,
        baseRevisionId: revisionId,
        fact: { ...updateCreate.fact, name: "来源冲突更新" },
        sources: updateCreate.sources,
      },
    ];

    const result = await publishCampusMapChangeset(update, {
      actorId,
      clientIp: "203.0.113.25",
    });

    expect(result).toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "source-ref-mismatch",
          anchor: { changeIndex: 0, field: "sources.0.ref" },
        },
      ],
      warnings: [],
      suggestions: [],
    });
    await expect(getCampusMapPlaceHistory(placeId)).resolves.toMatchObject({
      items: [{ id: revisionId }],
    });
  });

  it("rejects a Floor that does not belong to the declared Building", async () => {
    const actorId = await createActor();
    const command = createCommand();
    const change = command.changes[0];
    if (change.operation !== "create") throw new Error("bad fixture");
    change.fact.buildingId = "00000000-0000-4000-8000-000000000804";
    change.fact.floorId = "00000000-0000-4000-8000-000000000803";
    change.fact.location = { kind: "floor" };

    const result = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.26",
    });

    expect(result).toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "floor-building-mismatch",
          anchor: { changeIndex: 0, field: "location" },
        },
      ],
      warnings: [],
      suggestions: [],
    });
  });

  it("rejects point precision that is higher than its evidence", async () => {
    const actorId = await createActor();
    const command = createCommand();
    const change = command.changes[0];
    if (change.operation !== "create") throw new Error("bad fixture");
    change.fact.buildingId = null;
    change.fact.location = {
      kind: "outdoor-point",
      longitude: 114.2092,
      latitude: 22.4196,
      crs: "wgs84",
      precision: "precise",
    };
    change.sources[0].kind = "provider-candidate";
    change.sources[0].rightsStatus = "unknown";

    const result = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.27",
    });

    expect(result).toEqual({
      status: "validation-failed",
      errors: [
        {
          code: "precision-not-supported",
          anchor: { changeIndex: 0, field: "location.precision" },
        },
      ],
      warnings: [],
      suggestions: [],
    });
  });

  it("publishes separate Places of the same type in one Building", async () => {
    const [firstActorId, secondActorId] = await Promise.all([
      createActor(),
      createActor(),
    ]);

    const firstResult = await publishCampusMapChangeset(createCommand(), {
      actorId: firstActorId,
      clientIp: "203.0.113.27",
    });
    const secondResult = await publishCampusMapChangeset(createCommand(), {
      actorId: secondActorId,
      clientIp: "203.0.113.28",
    });

    expect(firstResult).toMatchObject({ status: "published", warnings: [] });
    expect(secondResult).toMatchObject({ status: "published", warnings: [] });
    if (
      firstResult.status !== "published" ||
      secondResult.status !== "published"
    ) {
      throw new Error("Building Places were not published");
    }
    expect(secondResult.changes[0].placeId).not.toBe(
      firstResult.changes[0].placeId,
    );
  });

  it("publishes separate approximate Places at the same coordinates", async () => {
    const [firstActorId, secondActorId] = await Promise.all([
      createActor(),
      createActor(),
    ]);
    const first = createCommand();
    const second = createCommand();
    for (const command of [first, second]) {
      const change = command.changes[0];
      if (change.operation !== "create") throw new Error("bad fixture");
      change.fact.name = "洗手间";
      change.fact.pinType = "toilet";
      change.fact.buildingId = null;
      change.fact.floorId = null;
      change.fact.location = {
        kind: "outdoor-point",
        longitude: 114.207209,
        latitude: 22.420129,
        crs: "wgs84",
        precision: "approximate",
      };
    }

    const firstResult = await publishCampusMapChangeset(first, {
      actorId: firstActorId,
      clientIp: "203.0.113.27",
    });
    const secondResult = await publishCampusMapChangeset(second, {
      actorId: secondActorId,
      clientIp: "203.0.113.28",
    });

    expect(firstResult).toMatchObject({ status: "published", warnings: [] });
    expect(secondResult).toMatchObject({ status: "published", warnings: [] });
    if (
      firstResult.status !== "published" ||
      secondResult.status !== "published"
    ) {
      throw new Error("approximate Places were not published");
    }
    expect(secondResult.changes[0].placeId).not.toBe(
      firstResult.changes[0].placeId,
    );
  });

  it("warns on duplicates proposed inside one admin bulk command", async () => {
    const actorId = await createActor({ role: "admin" });
    const command = createCommand();
    placeCreateAtPreciseOutdoorPoint(command);
    const first = command.changes[0];
    if (first.operation !== "create") throw new Error("bad fixture");
    const second = structuredClone(first);
    second.sources[0].ref = `test:campus-map-publish:${randomUUID()}`;
    command.kind = "bulk";
    command.changes = [first, second];

    const unacknowledged = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.28",
    });
    expect(unacknowledged).toMatchObject({
      status: "validation-failed",
      errors: [],
      warnings: [
        {
          code: "possible-duplicate",
          anchor: { changeIndex: 1, field: "name" },
          fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      ],
    });
    if (unacknowledged.status !== "validation-failed") {
      throw new Error("warning was not returned");
    }
    command.warningAcknowledgements = [
      {
        changeIndex: 1,
        code: "possible-duplicate",
        fingerprint: unacknowledged.warnings[0].fingerprint,
      },
    ];

    await expect(
      publishCampusMapChangeset(command, {
        actorId,
        clientIp: "203.0.113.28",
      }),
    ).resolves.toMatchObject({
      status: "published",
      changes: [
        { placeId: expect.any(String) },
        { placeId: expect.any(String) },
      ],
      warnings: [{ code: "possible-duplicate" }],
    });
  });

  it("uses PostgreSQL name normalization for bulk duplicate warnings", async () => {
    const actorId = await createActor({ role: "admin" });
    const command = createCommand();
    placeCreateAtPreciseOutdoorPoint(command);
    const first = command.changes[0];
    if (first.operation !== "create") throw new Error("bad fixture");
    const second = structuredClone(first);
    first.fact.name = "I";
    second.fact.name = "İ";
    second.sources[0].ref = `test:campus-map-publish:${randomUUID()}`;
    command.kind = "bulk";
    command.changes = [first, second];

    await expect(
      publishCampusMapChangeset(command, {
        actorId,
        clientIp: "203.0.113.28",
      }),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [],
      warnings: [
        {
          code: "possible-duplicate",
          anchor: { changeIndex: 1, field: "name" },
        },
      ],
    });
  });

  it("serializes concurrent creates in the same duplicate warning domain", async () => {
    const [actorA, actorB] = await Promise.all([createActor(), createActor()]);
    const commandA = createCommand();
    const commandB = createCommand();
    placeCreateAtPreciseOutdoorPoint(commandA);
    placeCreateAtPreciseOutdoorPoint(commandB);
    const changeA = commandA.changes[0];
    const changeB = commandB.changes[0];
    if (changeA.operation !== "create" || changeB.operation !== "create") {
      throw new Error("bad fixture");
    }
    changeA.fact.name = "并发重复域测试";
    changeB.fact = structuredClone(changeA.fact);
    changeB.fact.name = `${changeA.fact.name}\t`;

    const barrierKey = 718_002;
    await pool.query(
      `create function campus_map_publish_warning_barrier() returns trigger
       language plpgsql as $$
       begin
         perform pg_advisory_xact_lock(${barrierKey});
         return new;
       end
       $$`,
    );
    await pool.query(
      `create trigger campus_map_publish_warning_barrier_trigger
       before insert on campus_map_publish_requests
       for each row execute function campus_map_publish_warning_barrier()`,
    );
    const locker = await pool.connect();
    await locker.query("begin");
    await locker.query("select pg_advisory_xact_lock($1)", [barrierKey]);
    let lockerOpen = true;
    let publishA: ReturnType<typeof publishCampusMapChangeset> | undefined;
    let publishB: ReturnType<typeof publishCampusMapChangeset> | undefined;
    let results: Awaited<ReturnType<typeof publishCampusMapChangeset>>[] = [];
    try {
      publishA = publishCampusMapChangeset(commandA, {
        actorId: actorA,
        clientIp: "203.0.113.28",
      });
      await waitForBlockedPublishQueries(1);
      publishB = publishCampusMapChangeset(commandB, {
        actorId: actorB,
        clientIp: "203.0.113.29",
      });
      await waitForBlockedPublishQueries(2);
      await locker.query("commit");
      lockerOpen = false;
      results = await Promise.all([publishA, publishB]);
    } finally {
      if (lockerOpen) await locker.query("rollback");
      locker.release();
      if (publishA && publishB && results.length === 0) {
        await Promise.allSettled([publishA, publishB]);
      }
      await pool.query(
        "drop trigger campus_map_publish_warning_barrier_trigger on campus_map_publish_requests",
      );
      await pool.query("drop function campus_map_publish_warning_barrier()");
    }

    expect(results.map((result) => result.status).sort()).toEqual([
      "published",
      "validation-failed",
    ]);
    expect(
      results.find((result) => result.status === "validation-failed"),
    ).toMatchObject({
      status: "validation-failed",
      errors: [],
      warnings: [{ code: "possible-duplicate" }],
    });
  }, 10_000);

  it("requires the current server-issued duplicate warning fingerprint", async () => {
    const [existingActorId, candidateActorId] = await Promise.all([
      createActor(),
      createActor(),
    ]);
    const existingCommand = createCommand();
    placeCreateAtPreciseOutdoorPoint(existingCommand);
    const existing = await publishCampusMapChangeset(existingCommand, {
      actorId: existingActorId,
      clientIp: "203.0.113.28",
    });
    if (existing.status !== "published") throw new Error("create failed");
    const existingPlaceId = existing.changes[0].placeId;
    const candidate = createCommand();
    placeCreateAtPreciseOutdoorPoint(candidate);

    const unacknowledged = await publishCampusMapChangeset(candidate, {
      actorId: candidateActorId,
      clientIp: "203.0.113.29",
    });

    expect(unacknowledged).toMatchObject({
      status: "validation-failed",
      errors: [],
      warnings: [
        {
          code: "possible-duplicate",
          anchor: {
            changeIndex: 0,
            placeId: existingPlaceId,
            field: "name",
          },
          fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      ],
    });
    if (unacknowledged.status !== "validation-failed") {
      throw new Error("warning was not returned");
    }
    const fingerprint = unacknowledged.warnings[0].fingerprint;

    candidate.warningAcknowledgements = [
      {
        changeIndex: 0,
        code: "possible-duplicate",
        fingerprint: "0".repeat(64),
      },
    ];
    const forged = await publishCampusMapChangeset(candidate, {
      actorId: candidateActorId,
      clientIp: "203.0.113.29",
    });
    expect(forged).toMatchObject({
      status: "validation-failed",
      errors: [
        {
          code: "warning-acknowledgement-invalid",
          anchor: { changeIndex: 0, field: "warningAcknowledgements" },
        },
      ],
    });

    const candidateChange = candidate.changes[0];
    if (candidateChange.operation !== "create") throw new Error("bad fixture");
    if (candidateChange.fact.location.kind !== "outdoor-point") {
      throw new Error("bad location fixture");
    }
    candidate.warningAcknowledgements[0].fingerprint = fingerprint;
    candidateChange.fact.location.longitude = 114.2072;
    const stale = await publishCampusMapChangeset(candidate, {
      actorId: candidateActorId,
      clientIp: "203.0.113.29",
    });
    expect(stale).toMatchObject({
      status: "validation-failed",
      errors: [{ code: "warning-acknowledgement-invalid" }],
    });

    candidateChange.fact.location.longitude = 114.207209;
    const acknowledged = await publishCampusMapChangeset(candidate, {
      actorId: candidateActorId,
      clientIp: "203.0.113.29",
    });
    expect(acknowledged).toMatchObject({
      status: "published",
      warnings: [{ code: "possible-duplicate", fingerprint }],
    });
    if (acknowledged.status !== "published") throw new Error("publish failed");
    expect(acknowledged.changes[0].placeId).not.toBe(existingPlaceId);
    await expect(
      getCampusMapCurrentPlace(acknowledged.changes[0].placeId),
    ).resolves.toMatchObject({ name: "大学图书馆饮水点" });
  });

  it("invalidates a warning acknowledgement when candidate location changes", async () => {
    const [existingActorId, candidateActorId] = await Promise.all([
      createActor(),
      createActor(),
    ]);
    const existingCommand = createCommand();
    const existingChange = existingCommand.changes[0];
    if (existingChange.operation !== "create") throw new Error("bad fixture");
    existingChange.fact.name = "位置候选重复测试";
    existingChange.fact.buildingId = null;
    existingChange.fact.floorId = null;
    existingChange.fact.location = {
      kind: "outdoor-point",
      longitude: 114.2,
      latitude: 22.4,
      crs: "wgs84",
      precision: "precise",
    };
    const existing = await publishCampusMapChangeset(existingCommand, {
      actorId: existingActorId,
      clientIp: "203.0.113.29",
    });
    if (existing.status !== "published") throw new Error("create failed");

    const candidate = createCommand();
    const candidateChange = candidate.changes[0];
    if (candidateChange.operation !== "create") throw new Error("bad fixture");
    candidateChange.fact = structuredClone(existingChange.fact);
    const warning = await publishCampusMapChangeset(candidate, {
      actorId: candidateActorId,
      clientIp: "203.0.113.30",
    });
    if (
      warning.status !== "validation-failed" ||
      warning.warnings.length !== 1
    ) {
      throw new Error("warning was not returned");
    }
    candidate.warningAcknowledgements = [
      {
        changeIndex: 0,
        code: "possible-duplicate",
        fingerprint: warning.warnings[0].fingerprint,
      },
    ];

    const moved = createCommand();
    const movedCreate = moved.changes[0];
    if (movedCreate.operation !== "create") throw new Error("bad fixture");
    moved.changes = [
      {
        operation: "update",
        placeId: existing.changes[0].placeId,
        baseRevisionId: existing.changes[0].revisionId,
        fact: {
          ...structuredClone(existingChange.fact),
          location: {
            kind: "outdoor-point",
            longitude: 114.2001,
            latitude: 22.4,
            crs: "wgs84",
            precision: "precise",
          },
        },
        sources: movedCreate.sources,
      },
    ];
    await expect(
      publishCampusMapChangeset(moved, {
        actorId: existingActorId,
        clientIp: "203.0.113.29",
      }),
    ).resolves.toMatchObject({ status: "published" });

    await expect(
      publishCampusMapChangeset(candidate, {
        actorId: candidateActorId,
        clientIp: "203.0.113.30",
      }),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [{ code: "warning-acknowledgement-invalid" }],
    });
  });

  it("returns source Errors before an otherwise unconfirmed duplicate Warning", async () => {
    const [existingActorId, candidateActorId] = await Promise.all([
      createActor(),
      createActor(),
    ]);
    const existing = await publishCampusMapChangeset(createCommand(), {
      actorId: existingActorId,
      clientIp: "203.0.113.29",
    });
    if (existing.status !== "published") throw new Error("create failed");

    const candidate = createCommand();
    const change = candidate.changes[0];
    change.sources.push(structuredClone(change.sources[0]));

    await expect(
      publishCampusMapChangeset(candidate, {
        actorId: candidateActorId,
        clientIp: "203.0.113.30",
      }),
    ).resolves.toMatchObject({
      status: "validation-failed",
      errors: [
        {
          code: "duplicate-source-reference",
          anchor: { changeIndex: 0, field: "sources.1.ref" },
        },
      ],
      warnings: [],
    });
  });

  it("returns Suggestions without blocking publication", async () => {
    const actorId = await createActor();
    const command = createCommand();
    const change = command.changes[0];
    if (change.operation !== "create") throw new Error("bad fixture");
    change.fact.observedAt = null;
    change.sources[0].observedAt = null;

    const result = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.30",
    });

    expect(result).toMatchObject({
      status: "published",
      suggestions: [
        {
          code: "observed-at-recommended",
          anchor: { changeIndex: 0, field: "observedAt" },
        },
      ],
    });
  });

  it("replays the original result after a simulated response timeout", async () => {
    const actorId = await createActor();
    const command = createCommand();

    const first = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.31",
    });
    expect(first).toMatchObject({ status: "published" });
    if (first.status !== "published") throw new Error("publish failed");

    const retried = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.31",
    });
    expect(retried).toEqual(first);

    const changedPayload = structuredClone(command);
    changedPayload.comment = "同一个 key 的不同 payload";
    const rejected = await publishCampusMapChangeset(changedPayload, {
      actorId,
      clientIp: "203.0.113.31",
    });
    expect(rejected).toMatchObject({
      status: "validation-failed",
      errors: [
        {
          code: "idempotency-key-reused",
          anchor: { field: "idempotencyKey" },
        },
      ],
    });

    const [{ placeId, revisionId }] = first.changes;
    await expect(getCampusMapPlaceHistory(placeId)).resolves.toMatchObject({
      items: [{ id: revisionId }],
    });
    const publicChangeset = await getCampusMapChangeset(first.changesetId);
    expect(publicChangeset).not.toHaveProperty("idempotencyKey");
    expect(publicChangeset).not.toHaveProperty("requestFingerprint");
  });

  it("reconciles a committed receipt and distinguishes an uncommitted key", async () => {
    const actorId = await createActor();
    const otherActorId = await createActor();
    const command = createCommand();
    const published = await publishCampusMapChangeset(command, {
      actorId,
      clientIp: "203.0.113.31",
    });
    if (published.status !== "published") throw new Error("publish failed");

    await expect(
      reconcileCampusMapPublishReceipt(command, actorId),
    ).resolves.toEqual({ status: "committed", receipt: published });
    await expect(
      reconcileCampusMapPublishReceipt(
        { ...command, comment: "same key, different private draft" },
        actorId,
      ),
    ).resolves.toEqual({ status: "identity-mismatch" });
    await expect(
      reconcileCampusMapPublishReceipt(
        { ...command, idempotencyKey: randomUUID() },
        actorId,
      ),
    ).resolves.toEqual({ status: "not-committed" });
    await expect(
      reconcileCampusMapPublishReceipt(command, otherActorId),
    ).resolves.toEqual({ status: "not-committed" });
    await expect(
      reconcileCampusMapPublishReceipt(command, null),
    ).resolves.toEqual({ status: "authentication-required" });
  });

  it("deduplicates concurrent create double-clicks without allocating a second Place", async () => {
    const actorId = await createActor();
    const initializeRateState = createCommand();
    initializeRateState.comment = "";
    await expect(
      publishCampusMapChangeset(initializeRateState, {
        actorId,
        clientIp: "203.0.113.32",
      }),
    ).resolves.toMatchObject({ status: "validation-failed" });
    const rateState = await pool.query<{ subject_hash: string }>(
      `select subject_hash
         from campus_map_publish_rate_limits
        where scope = 'actor' and window_kind = 'burst'`,
    );
    if (!rateState.rows[0]) throw new Error("rate fixture missing");

    const locker = await pool.connect();
    await locker.query("begin");
    await locker.query(
      `select subject_hash
         from campus_map_publish_rate_limits
        where scope = 'actor'
          and subject_hash = $1
          and window_kind = 'burst'
        for update`,
      [rateState.rows[0].subject_hash],
    );
    const command = createCommand();
    let firstPromise: ReturnType<typeof publishCampusMapChangeset> | undefined;
    let secondPromise: ReturnType<typeof publishCampusMapChangeset> | undefined;
    try {
      firstPromise = publishCampusMapChangeset(command, {
        actorId,
        clientIp: "203.0.113.32",
      });
      await waitForBlockedPublishQueries(1);
      secondPromise = publishCampusMapChangeset(command, {
        actorId,
        clientIp: "203.0.113.32",
      });
      await waitForBlockedPublishQueries(2);
    } finally {
      await locker.query("commit");
      locker.release();
    }
    if (!firstPromise || !secondPromise)
      throw new Error("publish did not start");

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first).toMatchObject({ status: "published" });
    expect(second).toEqual(first);
    if (first.status !== "published") throw new Error("publish failed");
    const [{ placeId, revisionId }] = first.changes;
    await expect(getCampusMapCurrentPlace(placeId)).resolves.toMatchObject({
      id: placeId,
      revisionId,
    });
    await expect(getCampusMapPlaceHistory(placeId)).resolves.toMatchObject({
      items: [{ id: revisionId, previousRevisionId: null }],
    });
    const quota = await pool.query<{ attempt_count: number }>(
      `select attempt_count
         from campus_map_publish_rate_limits
        where scope = 'actor' and window_kind = 'burst'`,
    );
    expect(quota.rows).toEqual([{ attempt_count: 2 }]);
  }, 10_000);

  it("deduplicates concurrent double-clicks at a deterministic PostgreSQL barrier", async () => {
    const actorId = await createActor();
    const created = await publishCampusMapChangeset(createCommand(), {
      actorId,
      clientIp: "203.0.113.32",
    });
    if (created.status !== "published") throw new Error("create failed");
    const [{ placeId, revisionId: baseRevisionId }] = created.changes;
    const command = createCommand();
    const createChange = command.changes[0];
    if (createChange.operation !== "create") throw new Error("bad fixture");
    command.changes = [
      {
        operation: "update",
        placeId,
        baseRevisionId,
        fact: { ...createChange.fact, name: "双击只发布一次" },
        sources: createChange.sources,
      },
    ];

    const locker = await pool.connect();
    await locker.query("begin");
    await locker.query(
      "select id from campus_map_places where id = $1 for update",
      [placeId],
    );
    let firstPromise: ReturnType<typeof publishCampusMapChangeset> | undefined;
    let secondPromise: ReturnType<typeof publishCampusMapChangeset> | undefined;
    try {
      firstPromise = publishCampusMapChangeset(command, {
        actorId,
        clientIp: "203.0.113.32",
      });
      await waitForBlockedPublishQueries(1);
      secondPromise = publishCampusMapChangeset(command, {
        actorId,
        clientIp: "203.0.113.32",
      });
      await waitForBlockedPublishQueries(2);
    } finally {
      await locker.query("commit");
      locker.release();
    }
    if (!firstPromise || !secondPromise)
      throw new Error("publish did not start");

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first).toMatchObject({ status: "published" });
    expect(second).toEqual(first);
    if (first.status !== "published") throw new Error("publish failed");
    await expect(getCampusMapPlaceHistory(placeId)).resolves.toMatchObject({
      items: [
        { id: first.changes[0].revisionId, previousRevisionId: baseRevisionId },
        { id: baseRevisionId, previousRevisionId: null },
      ],
    });
    const quota = await pool.query<{
      scope: string;
      window_kind: string;
      attempt_count: number;
    }>(
      `select scope, window_kind, attempt_count
         from campus_map_publish_rate_limits
        order by scope, window_kind`,
    );
    expect(quota.rows).toEqual([
      { scope: "actor", window_kind: "burst", attempt_count: 2 },
      { scope: "actor", window_kind: "sustained", attempt_count: 2 },
      { scope: "ip", window_kind: "burst", attempt_count: 2 },
      { scope: "ip", window_kind: "sustained", attempt_count: 2 },
    ]);
  }, 10_000);

  it("allows only one concurrent publisher from the same base revision", async () => {
    const [actorA, actorB] = await Promise.all([createActor(), createActor()]);
    const created = await publishCampusMapChangeset(createCommand(), {
      actorId: actorA,
      clientIp: "203.0.113.33",
    });
    if (created.status !== "published") throw new Error("create failed");
    const [{ placeId, revisionId: baseRevisionId }] = created.changes;
    const commands = ["并发候选 A", "并发候选 B"].map((name) => {
      const command = createCommand();
      const createChange = command.changes[0];
      if (createChange.operation !== "create") throw new Error("bad fixture");
      command.changes = [
        {
          operation: "update",
          placeId,
          baseRevisionId,
          fact: { ...createChange.fact, name },
          sources: createChange.sources,
        },
      ];
      return command;
    });

    const locker = await pool.connect();
    await locker.query("begin");
    await locker.query(
      "select id from campus_map_places where id = $1 for update",
      [placeId],
    );
    let publishA: ReturnType<typeof publishCampusMapChangeset> | undefined;
    let publishB: ReturnType<typeof publishCampusMapChangeset> | undefined;
    try {
      publishA = publishCampusMapChangeset(commands[0], {
        actorId: actorA,
        clientIp: "203.0.113.33",
      });
      await waitForBlockedPublishQueries(1);
      publishB = publishCampusMapChangeset(commands[1], {
        actorId: actorB,
        clientIp: "203.0.113.34",
      });
      await waitForBlockedPublishQueries(2);
    } finally {
      await locker.query("commit");
      locker.release();
    }
    if (!publishA || !publishB) throw new Error("publish did not start");

    const results = await Promise.all([publishA, publishB]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "conflict",
      "published",
    ]);
    const winner = results.find((result) => result.status === "published");
    const loser = results.find((result) => result.status === "conflict");
    if (
      !winner ||
      winner.status !== "published" ||
      !loser ||
      loser.status !== "conflict"
    ) {
      throw new Error("unexpected concurrency result");
    }
    expect(loser.conflicts).toEqual([
      expect.objectContaining({
        placeId,
        expectedRevisionId: baseRevisionId,
        currentRevisionId: winner.changes[0].revisionId,
        currentStatus: "active",
      }),
    ]);
    await expect(getCampusMapPlaceHistory(placeId)).resolves.toMatchObject({
      items: [{ id: winner.changes[0].revisionId }, { id: baseRevisionId }],
    });

    const loserIndex = results[0].status === "conflict" ? 0 : 1;
    const rebasedChange = commands[loserIndex].changes[0];
    if (rebasedChange.operation !== "update") throw new Error("bad fixture");
    rebasedChange.baseRevisionId = winner.changes[0].revisionId;
    const rebased = await publishCampusMapChangeset(commands[loserIndex], {
      actorId: loserIndex === 0 ? actorA : actorB,
      clientIp: loserIndex === 0 ? "203.0.113.33" : "203.0.113.34",
    });
    expect(rebased).toMatchObject({ status: "published" });
  }, 10_000);

  it("rolls back an admin bulk command when any target is stale", async () => {
    const [creatorId, adminId, otherActorId] = await Promise.all([
      createActor(),
      createActor({ role: "admin" }),
      createActor(),
    ]);
    const createA = createCommand();
    const createB = createCommand();
    const createBChange = createB.changes[0];
    if (createBChange.operation !== "create") throw new Error("bad fixture");
    createBChange.fact.name = "科学馆饮水点";
    createBChange.fact.buildingId = "00000000-0000-4000-8000-000000000804";
    const [createdA, createdB] = await Promise.all([
      publishCampusMapChangeset(createA, {
        actorId: creatorId,
        clientIp: "203.0.113.35",
      }),
      publishCampusMapChangeset(createB, {
        actorId: creatorId,
        clientIp: "203.0.113.35",
      }),
    ]);
    if (createdA.status !== "published" || createdB.status !== "published") {
      throw new Error("setup create failed");
    }
    const placeA = createdA.changes[0];
    const placeB = createdB.changes[0];

    const advanceB = createCommand();
    const advanceBCreate = advanceB.changes[0];
    if (advanceBCreate.operation !== "create") throw new Error("bad fixture");
    advanceB.changes = [
      {
        operation: "update",
        placeId: placeB.placeId,
        baseRevisionId: placeB.revisionId,
        fact: {
          ...advanceBCreate.fact,
          name: "科学馆补水站",
          buildingId: "00000000-0000-4000-8000-000000000804",
        },
        sources: advanceBCreate.sources,
      },
    ];
    const advancedB = await publishCampusMapChangeset(advanceB, {
      actorId: otherActorId,
      clientIp: "203.0.113.36",
    });
    if (advancedB.status !== "published") throw new Error("advance failed");

    const bulk = createCommand();
    const bulkCreate = bulk.changes[0];
    if (bulkCreate.operation !== "create") throw new Error("bad fixture");
    bulk.kind = "bulk";
    bulk.comment = "管理员批量校正两个地点";
    bulk.changes = [
      {
        operation: "update",
        placeId: placeA.placeId,
        baseRevisionId: placeA.revisionId,
        fact: { ...bulkCreate.fact, name: "管理员更新 A" },
        sources: bulkCreate.sources,
      },
      {
        operation: "update",
        placeId: placeB.placeId,
        baseRevisionId: placeB.revisionId,
        fact: {
          ...bulkCreate.fact,
          name: "管理员更新 B",
          buildingId: "00000000-0000-4000-8000-000000000804",
        },
        sources: [
          {
            ...bulkCreate.sources[0],
            ref: `test:campus-map-publish:${randomUUID()}`,
          },
        ],
      },
    ];

    const result = await publishCampusMapChangeset(bulk, {
      actorId: adminId,
      clientIp: "203.0.113.37",
    });

    expect(result).toMatchObject({
      status: "conflict",
      code: "base-revision-conflict",
      conflicts: [
        {
          code: "base-revision-conflict",
          anchor: {
            changeIndex: 1,
            placeId: placeB.placeId,
            field: "baseRevisionId",
          },
          placeId: placeB.placeId,
          expectedRevisionId: placeB.revisionId,
          currentRevisionId: advancedB.changes[0].revisionId,
        },
      ],
    });
    await expect(
      getCampusMapCurrentPlace(placeA.placeId),
    ).resolves.toMatchObject({
      revisionId: placeA.revisionId,
      name: "大学图书馆饮水点",
    });
    await expect(
      getCampusMapPlaceHistory(placeA.placeId),
    ).resolves.toMatchObject({
      items: [{ id: placeA.revisionId }],
    });

    const rebasedB = bulk.changes[1];
    if (rebasedB.operation !== "update") throw new Error("bad fixture");
    rebasedB.baseRevisionId = advancedB.changes[0].revisionId;
    const published = await publishCampusMapChangeset(bulk, {
      actorId: adminId,
      clientIp: "203.0.113.37",
    });
    expect(published).toMatchObject({
      status: "published",
      changes: expect.arrayContaining([
        { placeId: placeA.placeId, revisionId: expect.any(String) },
        { placeId: placeB.placeId, revisionId: expect.any(String) },
      ]),
    });
    if (published.status !== "published") throw new Error("bulk failed");
    await expect(
      getCampusMapChangeset(published.changesetId),
    ).resolves.toMatchObject({
      actor: { id: adminId, nickname: "地图贡献者" },
      counts: { affected: 2, updated: 2 },
    });
    await expect(
      getCampusMapCurrentPlace(placeA.placeId),
    ).resolves.toMatchObject({
      name: "管理员更新 A",
    });
    await expect(
      getCampusMapCurrentPlace(placeB.placeId),
    ).resolves.toMatchObject({
      name: "管理员更新 B",
    });
  });

  it("enforces actor burst policy without charging idempotent replays", async () => {
    const previous = {
      actorBurst: process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT,
      actorSustained: process.env.CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT,
      ipBurst: process.env.CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT,
      ipSustained: process.env.CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT,
    };
    process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT = "2";
    process.env.CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT = "100";
    process.env.CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT = "100";
    process.env.CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT = "100";
    try {
      const actorId = await createActor();
      const commands = ["限流地点 A", "限流地点 B", "限流地点 C"].map(
        (name) => {
          const command = createCommand();
          const change = command.changes[0];
          if (change.operation !== "create") throw new Error("bad fixture");
          change.fact.name = name;
          return command;
        },
      );
      const first = await publishCampusMapChangeset(commands[0], {
        actorId,
        clientIp: "203.0.113.40",
      });
      const second = await publishCampusMapChangeset(commands[1], {
        actorId,
        clientIp: "203.0.113.41",
      });
      expect([first.status, second.status]).toEqual(["published", "published"]);

      const replay = await publishCampusMapChangeset(commands[0], {
        actorId,
        clientIp: "203.0.113.40",
      });
      expect(replay).toEqual(first);

      const limited = await publishCampusMapChangeset(commands[2], {
        actorId,
        clientIp: "203.0.113.42",
      });
      expect(limited).toMatchObject({
        status: "rate-limited",
        code: "publish-rate-limit",
        scope: "actor",
        policy: "burst",
        retryAfter: expect.any(Number),
      });
      if (limited.status !== "rate-limited") throw new Error("not limited");
      expect(limited.retryAfter).toBeGreaterThan(0);
      expect(limited.retryAfter).toBeLessThanOrEqual(60);
    } finally {
      if (previous.actorBurst === undefined) {
        delete process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT;
      } else {
        process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT = previous.actorBurst;
      }
      if (previous.actorSustained === undefined) {
        delete process.env.CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT;
      } else {
        process.env.CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT =
          previous.actorSustained;
      }
      if (previous.ipBurst === undefined) {
        delete process.env.CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT;
      } else {
        process.env.CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT = previous.ipBurst;
      }
      if (previous.ipSustained === undefined) {
        delete process.env.CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT;
      } else {
        process.env.CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT =
          previous.ipSustained;
      }
    }
  });

  it("does not materialize new IP subjects after the actor limit is exhausted", async () => {
    const previous = {
      actorBurst: process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT,
      actorSustained: process.env.CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT,
      ipBurst: process.env.CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT,
      ipSustained: process.env.CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT,
    };
    process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT = "1";
    process.env.CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT = "100";
    process.env.CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT = "100";
    process.env.CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT = "100";
    try {
      const actorId = await createActor();
      await expect(
        publishCampusMapChangeset(createCommand(), {
          actorId,
          clientIp: "203.0.113.70",
        }),
      ).resolves.toMatchObject({ status: "published" });

      const limited = await Promise.all(
        ["203.0.113.71", "203.0.113.72", "203.0.113.73"].map((clientIp) =>
          publishCampusMapChangeset(createCommand(), { actorId, clientIp }),
        ),
      );
      const rateRows = await pool.query<{ scope: string; count: string }>(
        `select scope, count(*)::text as count
           from campus_map_publish_rate_limits
          group by scope
          order by scope`,
      );

      expect({
        limited: limited.map((result) => ({
          status: result.status,
          scope: result.status === "rate-limited" ? result.scope : null,
        })),
        rateRows: rateRows.rows,
      }).toEqual({
        limited: [
          { status: "rate-limited", scope: "actor" },
          { status: "rate-limited", scope: "actor" },
          { status: "rate-limited", scope: "actor" },
        ],
        rateRows: [
          { scope: "actor", count: "2" },
          { scope: "ip", count: "2" },
        ],
      });
    } finally {
      for (const [name, value] of [
        ["CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT", previous.actorBurst],
        ["CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT", previous.actorSustained],
        ["CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT", previous.ipBurst],
        ["CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT", previous.ipSustained],
      ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("reclaims rate subjects inactive beyond the longest policy window", async () => {
    const firstActor = await createActor();
    await expect(
      publishCampusMapChangeset(createCommand(), {
        actorId: firstActor,
        clientIp: "203.0.113.74",
      }),
    ).resolves.toMatchObject({ status: "published" });
    await pool.query(
      `update campus_map_publish_rate_limits
          set updated_at = now() - interval '2 hours'`,
    );

    const secondActor = await createActor();
    const secondCommand = createCommand();
    const secondChange = secondCommand.changes[0];
    if (secondChange.operation !== "create") throw new Error("bad fixture");
    secondChange.fact.name = "限流回收后的地点";
    await expect(
      publishCampusMapChangeset(secondCommand, {
        actorId: secondActor,
        clientIp: "203.0.113.75",
      }),
    ).resolves.toMatchObject({ status: "published" });
    const rateRows = await pool.query<{ scope: string; count: string }>(
      `select scope, count(*)::text as count
         from campus_map_publish_rate_limits
        group by scope
        order by scope`,
    );

    expect(rateRows.rows).toEqual([
      { scope: "actor", count: "2" },
      { scope: "ip", count: "2" },
    ]);
  });

  it("avoids inverse cleanup locks for concurrent actors sharing an expired IP", async () => {
    const previous = {
      actorBurst: process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT,
      actorSustained: process.env.CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT,
      ipBurst: process.env.CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT,
      ipSustained: process.env.CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT,
    };
    process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT = "100";
    process.env.CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT = "100";
    process.env.CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT = "100";
    process.env.CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT = "100";
    const sharedIp = "203.0.113.76";
    const barrierKey = 718_003;
    let cleanupLocker: PoolClient | undefined;
    let barrierLocker: PoolClient | undefined;
    let cleanupLockerOpen = false;
    let barrierLockerOpen = false;
    let publishA: ReturnType<typeof publishCampusMapChangeset> | undefined;
    let publishB: ReturnType<typeof publishCampusMapChangeset> | undefined;
    let results: Awaited<ReturnType<typeof publishCampusMapChangeset>>[] = [];
    try {
      const rateActor = await createActor();
      const initializeRateState = createCommand();
      initializeRateState.comment = "";
      await expect(
        publishCampusMapChangeset(initializeRateState, {
          actorId: rateActor,
          clientIp: sharedIp,
        }),
      ).resolves.toMatchObject({ status: "validation-failed" });
      await pool.query(
        `update campus_map_publish_rate_limits
            set updated_at = now() - interval '2 hours'`,
      );

      await pool.query(
        `create function campus_map_publish_rate_sustained_barrier()
         returns trigger language plpgsql as $$
         begin
           if new.scope = 'ip' and new.window_kind = 'sustained' then
             perform pg_advisory_xact_lock(${barrierKey});
           end if;
           return new;
         end
         $$`,
      );
      await pool.query(
        `create trigger campus_map_publish_rate_sustained_barrier_trigger
         before insert on campus_map_publish_rate_limits
         for each row execute function campus_map_publish_rate_sustained_barrier()`,
      );

      cleanupLocker = await pool.connect();
      await cleanupLocker.query("begin");
      await cleanupLocker.query(
        `select pg_advisory_xact_lock(
           hashtextextended('campus-map-publish-rate-cleanup', 0)
         )`,
      );
      cleanupLockerOpen = true;

      barrierLocker = await pool.connect();
      await barrierLocker.query("begin");
      await barrierLocker.query("select pg_advisory_xact_lock($1)", [
        barrierKey,
      ]);
      barrierLockerOpen = true;

      const [actorA, actorB] = await Promise.all([
        createActor(),
        createActor(),
      ]);
      const commandA = createCommand();
      const commandB = createCommand();
      const changeA = commandA.changes[0];
      const changeB = commandB.changes[0];
      if (changeA.operation !== "create" || changeB.operation !== "create") {
        throw new Error("bad fixture");
      }
      changeA.fact.name = "共享 IP 锁序地点 A";
      changeB.fact.name = "共享 IP 锁序地点 B";

      publishB = publishCampusMapChangeset(commandB, {
        actorId: actorB,
        clientIp: sharedIp,
      });
      await waitForBlockedQuery("campus_map_publish_rate_limits");

      await cleanupLocker.query("commit");
      cleanupLockerOpen = false;

      publishA = publishCampusMapChangeset(commandA, {
        actorId: actorA,
        clientIp: sharedIp,
      });
      await waitForBlockedPublishQueries(2);

      await barrierLocker.query("commit");
      barrierLockerOpen = false;
      results = await Promise.all([publishA, publishB]);

      expect(results.map((result) => result.status).sort()).toEqual([
        "published",
        "published",
      ]);
      for (const result of results) {
        if (result.status !== "published") throw new Error("publish failed");
        await expect(
          getCampusMapCurrentPlace(result.changes[0].placeId),
        ).resolves.toMatchObject({
          revisionId: result.changes[0].revisionId,
        });
      }
      const rateRows = await pool.query<{
        scope: string;
        window_kind: string;
        attempt_count: number;
      }>(
        `select scope, window_kind, attempt_count
           from campus_map_publish_rate_limits
          order by scope, window_kind, subject_hash`,
      );
      expect(rateRows.rows).toEqual([
        { scope: "actor", window_kind: "burst", attempt_count: 1 },
        { scope: "actor", window_kind: "burst", attempt_count: 1 },
        { scope: "actor", window_kind: "sustained", attempt_count: 1 },
        { scope: "actor", window_kind: "sustained", attempt_count: 1 },
        { scope: "ip", window_kind: "burst", attempt_count: 3 },
        { scope: "ip", window_kind: "sustained", attempt_count: 3 },
      ]);
    } finally {
      if (cleanupLockerOpen) await cleanupLocker?.query("rollback");
      if (barrierLockerOpen) await barrierLocker?.query("rollback");
      if (publishA && publishB && results.length === 0) {
        await Promise.allSettled([publishA, publishB]);
      }
      cleanupLocker?.release();
      barrierLocker?.release();
      await pool.query(
        "drop trigger if exists campus_map_publish_rate_sustained_barrier_trigger on campus_map_publish_rate_limits",
      );
      await pool.query(
        "drop function if exists campus_map_publish_rate_sustained_barrier()",
      );
      for (const [name, value] of [
        ["CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT", previous.actorBurst],
        ["CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT", previous.actorSustained],
        ["CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT", previous.ipBurst],
        ["CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT", previous.ipSustained],
      ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  }, 15_000);

  it("enforces sustained policy across actors sharing one trusted IP", async () => {
    const previous = {
      actorBurst: process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT,
      actorSustained: process.env.CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT,
      ipBurst: process.env.CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT,
      ipSustained: process.env.CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT,
    };
    process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT = "100";
    process.env.CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT = "100";
    process.env.CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT = "100";
    process.env.CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT = "2";
    try {
      const actors = await Promise.all([
        createActor(),
        createActor(),
        createActor(),
      ]);
      const commands = [
        "共享 IP 地点 A",
        "共享 IP 地点 B",
        "共享 IP 地点 C",
      ].map((name) => {
        const command = createCommand();
        const change = command.changes[0];
        if (change.operation !== "create") throw new Error("bad fixture");
        change.fact.name = name;
        return command;
      });
      const first = await publishCampusMapChangeset(commands[0], {
        actorId: actors[0],
        clientIp: "203.0.113.50",
      });
      const second = await publishCampusMapChangeset(commands[1], {
        actorId: actors[1],
        clientIp: "203.0.113.50",
      });
      expect([first.status, second.status]).toEqual(["published", "published"]);

      const limited = await publishCampusMapChangeset(commands[2], {
        actorId: actors[2],
        clientIp: "203.0.113.50",
      });
      expect(limited).toMatchObject({
        status: "rate-limited",
        code: "publish-rate-limit",
        scope: "ip",
        policy: "sustained",
        retryAfter: expect.any(Number),
      });
      if (limited.status !== "rate-limited") throw new Error("not limited");
      expect(limited.retryAfter).toBeGreaterThan(0);
      expect(limited.retryAfter).toBeLessThanOrEqual(3_600);
    } finally {
      for (const [name, value] of [
        ["CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT", previous.actorBurst],
        ["CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT", previous.actorSustained],
        ["CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT", previous.ipBurst],
        ["CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT", previous.ipSustained],
      ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("shares IP quota across canonical IPv6 and IPv4-mapped representations", async () => {
    const previous = {
      actorBurst: process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT,
      actorSustained: process.env.CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT,
      ipBurst: process.env.CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT,
      ipSustained: process.env.CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT,
    };
    process.env.CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT = "100";
    process.env.CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT = "100";
    process.env.CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT = "1";
    process.env.CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT = "100";
    try {
      const [firstActor, secondActor, ipv4Actor, mappedActor] =
        await Promise.all([
          createActor(),
          createActor(),
          createActor(),
          createActor(),
        ]);
      const first = createCommand();
      const second = createCommand();
      const ipv4 = createCommand();
      const mapped = createCommand();
      const firstChange = first.changes[0];
      const secondChange = second.changes[0];
      const ipv4Change = ipv4.changes[0];
      const mappedChange = mapped.changes[0];
      if (
        firstChange.operation !== "create" ||
        secondChange.operation !== "create" ||
        ipv4Change.operation !== "create" ||
        mappedChange.operation !== "create"
      ) {
        throw new Error("bad fixture");
      }
      firstChange.fact.name = "IPv6 配额地点 A";
      secondChange.fact.name = "IPv6 配额地点 B";
      ipv4Change.fact.name = "IPv4 配额地点 A";
      mappedChange.fact.name = "IPv4 配额地点 B";

      await expect(
        publishCampusMapChangeset(first, {
          actorId: firstActor,
          clientIp: "2001:db8::1",
        }),
      ).resolves.toMatchObject({ status: "published" });
      await expect(
        publishCampusMapChangeset(second, {
          actorId: secondActor,
          clientIp: "2001:0db8:0:0:0:0:0:1",
        }),
      ).resolves.toMatchObject({
        status: "rate-limited",
        scope: "ip",
        policy: "burst",
      });

      await expect(
        publishCampusMapChangeset(ipv4, {
          actorId: ipv4Actor,
          clientIp: "192.0.2.1",
        }),
      ).resolves.toMatchObject({ status: "published" });
      await expect(
        publishCampusMapChangeset(mapped, {
          actorId: mappedActor,
          clientIp: "::ffff:192.0.2.1",
        }),
      ).resolves.toMatchObject({
        status: "rate-limited",
        scope: "ip",
        policy: "burst",
      });
    } finally {
      for (const [name, value] of [
        ["CAMPUS_MAP_PUBLISH_ACTOR_BURST_LIMIT", previous.actorBurst],
        ["CAMPUS_MAP_PUBLISH_ACTOR_SUSTAINED_LIMIT", previous.actorSustained],
        ["CAMPUS_MAP_PUBLISH_IP_BURST_LIMIT", previous.ipBurst],
        ["CAMPUS_MAP_PUBLISH_IP_SUSTAINED_LIMIT", previous.ipSustained],
      ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("rolls back every write on a transient mid-Changeset database failure", async () => {
    const [creatorId, adminId] = await Promise.all([
      createActor(),
      createActor({ role: "admin" }),
    ]);
    const createA = createCommand();
    const createB = createCommand();
    const createBChange = createB.changes[0];
    if (createBChange.operation !== "create") throw new Error("bad fixture");
    createBChange.fact.name = "回滚地点 B";
    createBChange.fact.buildingId = "00000000-0000-4000-8000-000000000804";
    const createdA = await publishCampusMapChangeset(createA, {
      actorId: creatorId,
      clientIp: "203.0.113.60",
    });
    const createdB = await publishCampusMapChangeset(createB, {
      actorId: creatorId,
      clientIp: "203.0.113.60",
    });
    if (createdA.status !== "published" || createdB.status !== "published") {
      throw new Error("setup failed");
    }
    const places = [createdA.changes[0], createdB.changes[0]].sort(
      (left, right) => left.placeId.localeCompare(right.placeId),
    );
    const bulk = createCommand();
    const bulkCreate = bulk.changes[0];
    if (bulkCreate.operation !== "create") throw new Error("bad fixture");
    bulk.kind = "bulk";
    bulk.comment = "验证原子回滚";
    bulk.changes = places.map((place, index) => ({
      operation: "update" as const,
      placeId: place.placeId,
      baseRevisionId: place.revisionId,
      fact: {
        ...bulkCreate.fact,
        name: `回滚后不应出现 ${index}`,
        buildingId:
          place.placeId === createdB.changes[0].placeId
            ? "00000000-0000-4000-8000-000000000804"
            : "00000000-0000-4000-8000-000000000802",
      },
      sources: [
        {
          ...bulkCreate.sources[0],
          ref: `test:campus-map-publish:${randomUUID()}`,
        },
      ],
    }));

    const failingPlaceId = places[1].placeId;
    await pool.query(
      `create function campus_map_publish_test_failure() returns trigger
       language plpgsql as $$
       begin
         if new.place_id = '${failingPlaceId}'::uuid then
           raise exception 'forced Campus Map publish failure';
         end if;
         return new;
       end
       $$`,
    );
    await pool.query(
      `create trigger campus_map_publish_test_failure_trigger
       before insert on campus_map_fact_revisions
       for each row execute function campus_map_publish_test_failure()`,
    );
    let failed;
    try {
      failed = await publishCampusMapChangeset(bulk, {
        actorId: adminId,
        clientIp: "203.0.113.61",
      });
    } finally {
      await pool.query(
        "drop trigger campus_map_publish_test_failure_trigger on campus_map_fact_revisions",
      );
      await pool.query("drop function campus_map_publish_test_failure()");
    }

    expect(failed).toEqual({
      status: "temporarily-unavailable",
      code: "publish-unavailable",
      retryable: true,
    });
    for (const place of places) {
      await expect(
        getCampusMapCurrentPlace(place.placeId),
      ).resolves.toMatchObject({
        revisionId: place.revisionId,
      });
      await expect(
        getCampusMapPlaceHistory(place.placeId),
      ).resolves.toMatchObject({
        items: [{ id: place.revisionId }],
      });
    }

    const retried = await publishCampusMapChangeset(bulk, {
      actorId: adminId,
      clientIp: "203.0.113.61",
    });
    expect(retried).toMatchObject({
      status: "published",
      changes: expect.arrayContaining(
        places.map((place) => ({
          placeId: place.placeId,
          revisionId: expect.any(String),
        })),
      ),
    });
  });
});
