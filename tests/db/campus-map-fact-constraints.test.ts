import type { PoolClient } from "pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

const ids = {
  actor: "00000000-0000-4000-8000-000000000711",
  user: "00000000-0000-4000-8000-000000000712",
  building: "00000000-0000-4000-8000-000000000713",
  otherBuilding: "00000000-0000-4000-8000-000000000714",
  floor: "00000000-0000-4000-8000-000000000715",
  place: "00000000-0000-4000-8000-000000000716",
  changeset: "00000000-0000-4000-8000-000000000717",
  placeChange: "00000000-0000-4000-8000-000000000718",
  revision: "00000000-0000-4000-8000-000000000719",
  secondChangeset: "00000000-0000-4000-8000-000000000720",
  secondPlaceChange: "00000000-0000-4000-8000-000000000721",
  secondRevision: "00000000-0000-4000-8000-000000000722",
} as const;

function collectPlanIndexNames(value: unknown, names: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectPlanIndexNames(item, names);
    return names;
  }
  if (value === null || typeof value !== "object") return names;
  for (const [key, child] of Object.entries(value)) {
    if (key === "Index Name" && typeof child === "string") names.push(child);
    collectPlanIndexNames(child, names);
  }
  return names;
}

describe.skipIf(!hasDb)(
  "Campus Map fact-store PostgreSQL invariants (#717)",
  () => {
    let pool: Pool;

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL });
    });

    afterAll(async () => {
      await pool?.end();
    });

    async function inFixture(
      assertion: (client: PoolClient) => Promise<void>,
    ): Promise<void> {
      const client = await pool.connect();
      await client.query("begin");
      try {
        await client.query(
          `insert into users (id, email, nickname)
         values ($1, 'campus-map-717@test.invalid', '事实贡献者')`,
          [ids.user],
        );
        await client.query(
          `insert into campus_map_fact_schemas
           (version, status, definition, display_metadata, created_by)
         values (717, 'draft',
           '{"pinTypes":{"toilet":{"applicableFields":[],"requiredFields":[]},"water":{"applicableFields":[],"requiredFields":[]},"printer":{"applicableFields":[],"requiredFields":[]},"common-space":{"applicableFields":[],"requiredFields":[]},"classroom":{"applicableFields":[],"requiredFields":[]}}}',
           '{"name":{"label":"名称"}}', $1)`,
          [ids.user],
        );
        await client.query(
          `insert into campus_map_buildings (id, name)
         values ($1, '大学图书馆'), ($2, '科学馆')`,
          [ids.building, ids.otherBuilding],
        );
        await client.query(
          `insert into campus_map_floors (id, building_id, display_label, sort_order)
         values ($1, $2, 'G/F', 0)`,
          [ids.floor, ids.building],
        );
        await client.query(`insert into campus_map_places (id) values ($1)`, [
          ids.place,
        ]);
        await client.query(
          `insert into campus_map_changesets
           (id, actor_user_id, actor_id_snapshot, actor_nickname_snapshot,
            comment, source_summary, client_name, client_version,
            affected_count, created_count)
         values ($1, $2, $3, '事实贡献者', '测试', '现场观察', 'test', '1', 1, 1)`,
          [ids.changeset, ids.user, ids.actor],
        );
        await client.query(
          `insert into campus_map_place_changes
           (id, changeset_id, place_id, operation, field_diff)
         values ($1, $2, $3, 'create', '{}')`,
          [ids.placeChange, ids.changeset, ids.place],
        );
        await assertion(client);
      } finally {
        await client.query("rollback");
        client.release();
      }
    }

    function insertRevisionSql(extraColumns: string, extraValues: string) {
      return `insert into campus_map_fact_revisions
      (id, place_id, changeset_id, place_change_id, fact_schema_version,
       field_metadata, status, actor_id_snapshot, actor_nickname_snapshot,
       name, pin_type, location_kind${extraColumns})
     values ($1, $2, $3, $4, 717, '{"name":{"label":"名称"}}',
       'active', $5, '事实贡献者', '测试地点', 'water', 'floor'${extraValues})`;
    }

    it("rejects a Floor that belongs to a different Building", async () => {
      await inFixture(async (client) => {
        await expect(
          client.query(
            insertRevisionSql(", building_id, floor_id", ", $6, $7"),
            [
              ids.revision,
              ids.place,
              ids.changeset,
              ids.placeChange,
              ids.actor,
              ids.otherBuilding,
              ids.floor,
            ],
          ),
        ).rejects.toMatchObject({ code: "23503" });
      });
    });

    it("rejects coordinate and CRS combinations that overstate evidence", async () => {
      await inFixture(async (client) => {
        await expect(
          client.query(
            `insert into campus_map_fact_revisions
            (id, place_id, changeset_id, place_change_id, fact_schema_version,
             field_metadata, status, actor_id_snapshot, actor_nickname_snapshot,
             name, pin_type, location_kind, point_precision, longitude, latitude,
             coordinate_crs)
           values ($1, $2, $3, $4, 717, '{}', 'active', $5, '事实贡献者',
             '测试地点', 'water', 'outdoor-point', 'precise', 114.2, 22.4,
             'gcj02')`,
            [
              ids.revision,
              ids.place,
              ids.changeset,
              ids.placeChange,
              ids.actor,
            ],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      });
    });

    it("keeps outdoor point evidence separate from Building containment", async () => {
      await inFixture(async (client) => {
        await expect(
          client.query(
            `insert into campus_map_fact_revisions
            (id, place_id, changeset_id, place_change_id, fact_schema_version,
             field_metadata, status, actor_id_snapshot, actor_nickname_snapshot,
             name, pin_type, location_kind, building_id, point_precision,
             longitude, latitude, coordinate_crs)
           values ($1, $2, $3, $4, 717, '{}', 'active', $5, '事实贡献者',
             '范围外室外点', 'water', 'outdoor-point', $6, 'precise', 0, 0,
             'wgs84')`,
            [
              ids.revision,
              ids.place,
              ids.changeset,
              ids.placeChange,
              ids.actor,
              ids.building,
            ],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      });
    });

    it("rejects open-ended values outside the controlled fact schema", async () => {
      await inFixture(async (client) => {
        await expect(
          client.query(
            `insert into campus_map_fact_revisions
            (id, place_id, changeset_id, place_change_id, fact_schema_version,
             field_metadata, status, actor_id_snapshot, actor_nickname_snapshot,
             name, pin_type, location_kind, building_id, access_schedule)
           values ($1, $2, $3, $4, 717, '{}', 'active', $5, '事实贡献者',
             '测试地点', 'water', 'building', $6,
             '{"kind":"structured","summary":"","guess":true}')`,
            [
              ids.revision,
              ids.place,
              ids.changeset,
              ids.placeChange,
              ids.actor,
              ids.building,
            ],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      });
    });

    it("accepts a controlled weekly access schedule", async () => {
      await inFixture(async (client) => {
        await expect(
          client.query(
            `insert into campus_map_fact_revisions
            (id, place_id, changeset_id, place_change_id, fact_schema_version,
             field_metadata, status, actor_id_snapshot, actor_nickname_snapshot,
             name, pin_type, location_kind, building_id, access_schedule)
           values ($1, $2, $3, $4, 717, '{}', 'active', $5, '事实贡献者',
             '测试地点', 'water', 'building', $6,
             '{"kind":"weekly","timezone":"Asia/Hong_Kong","intervals":[{"days":["mon","tue"],"opensAt":"08:30","closesAt":"22:00"}]}')`,
            [
              ids.revision,
              ids.place,
              ids.changeset,
              ids.placeChange,
              ids.actor,
              ids.building,
            ],
          ),
        ).resolves.toMatchObject({ rowCount: 1 });
      });
    });

    it("rejects malformed weekly access intervals", async () => {
      await inFixture(async (client) => {
        await expect(
          client.query(
            `insert into campus_map_fact_revisions
            (id, place_id, changeset_id, place_change_id, fact_schema_version,
             field_metadata, status, actor_id_snapshot, actor_nickname_snapshot,
             name, pin_type, location_kind, building_id, access_schedule)
           values ($1, $2, $3, $4, 717, '{}', 'active', $5, '事实贡献者',
             '测试地点', 'water', 'building', $6,
             '{"kind":"weekly","timezone":"Asia/Hong_Kong","intervals":[{"days":["weekday"],"opensAt":"8:30","closesAt":"late"}]}')`,
            [
              ids.revision,
              ids.place,
              ids.changeset,
              ids.placeChange,
              ids.actor,
              ids.building,
            ],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      });
    });

    it("stores controlled source coordinates and conversion lineage", async () => {
      await inFixture(async (client) => {
        await expect(
          client.query(
            `insert into campus_map_provenance_sources
            (id, source_kind, source_ref, accessed_on, rights_status,
             source_coordinate_x, source_coordinate_y, source_coordinate_crs,
             conversion_method, conversion_version)
           values ($1, 'official', 'diagnosis:hk80', '2026-08-22',
             'permission-granted', 836694.05, 819069.8, 'hk80',
             'proj', 'EPSG:2326-to-4326')`,
            [ids.secondRevision],
          ),
        ).resolves.toMatchObject({ rowCount: 1 });
      });
    });

    it.each(["NaN", "Infinity", "-Infinity"])(
      "rejects non-finite source coordinate %s",
      async (coordinate) => {
        await inFixture(async (client) => {
          await expect(
            client.query(
              `insert into campus_map_provenance_sources
              (source_kind, source_ref, accessed_on, rights_status,
               source_coordinate_x, source_coordinate_y, source_coordinate_crs,
               conversion_method, conversion_version)
             values ('official', $1, '2026-08-22', 'permission-granted',
               $2::double precision, 819069.8, 'hk80', 'proj',
               'EPSG:2326-to-4326')`,
              [`diagnosis:non-finite:${coordinate}`, coordinate],
            ),
          ).rejects.toMatchObject({ code: "23514" });
        });
      },
    );

    it("rejects transformed source coordinates without conversion lineage", async () => {
      await inFixture(async (client) => {
        await expect(
          client.query(
            `insert into campus_map_provenance_sources
            (id, source_kind, source_ref, accessed_on, rights_status,
             source_coordinate_x, source_coordinate_y, source_coordinate_crs)
           values ($1, 'official', 'diagnosis:missing-lineage', '2026-08-22',
             'permission-granted', 836694.05, 819069.8, 'hk80')`,
            [ids.secondRevision],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      });
    });

    it("keeps provider identity separate and globally unique per provider", async () => {
      await inFixture(async (client) => {
        await client.query(
          `insert into campus_map_provider_mappings
           (provider, provider_object_id, target_kind, building_id)
         values ('amap', 'B123', 'building', $1)`,
          [ids.building],
        );
        await expect(
          client.query(
            `insert into campus_map_provider_mappings
             (provider, provider_object_id, target_kind, place_id)
           values ('amap', 'B123', 'place', $1)`,
            [ids.place],
          ),
        ).rejects.toMatchObject({ code: "23505" });
      });
    });

    it("rejects reuse of a stable Place ID", async () => {
      await inFixture(async (client) => {
        await expect(
          client.query(`insert into campus_map_places (id) values ($1)`, [
            ids.place,
          ]),
        ).rejects.toMatchObject({ code: "23505" });
      });
    });

    it("rejects ordinary SQL mutations of the fact ledger", async () => {
      await inFixture(async (client) => {
        await client.query(
          `insert into campus_map_provenance_sources
           (id, source_kind, source_ref, accessed_on, rights_status)
         values ($1, 'field-observation', 'test:immutable-ledger',
           '2026-08-22', 'original-observation')`,
          [ids.secondRevision],
        );
        await client.query(
          insertRevisionSql(", building_id, floor_id", ", $6, $7"),
          [
            ids.revision,
            ids.place,
            ids.changeset,
            ids.placeChange,
            ids.actor,
            ids.building,
            ids.floor,
          ],
        );
        await client.query(
          `insert into campus_map_revision_provenance
           (revision_id, provenance_id) values ($1, $2)`,
          [ids.revision, ids.secondRevision],
        );

        const mutations = [
          `update campus_map_changesets set comment = 'rewritten' where id = '${ids.changeset}'`,
          `update campus_map_changesets set actor_user_id = null where id = '${ids.changeset}'`,
          `delete from campus_map_changesets where id = '${ids.changeset}'`,
          `truncate campus_map_changesets cascade`,
          `update campus_map_place_changes set field_diff = '{"rewritten":true}' where id = '${ids.placeChange}'`,
          `delete from campus_map_place_changes where id = '${ids.placeChange}'`,
          `truncate campus_map_place_changes cascade`,
          `update campus_map_fact_revisions set name = 'rewritten' where id = '${ids.revision}'`,
          `delete from campus_map_fact_revisions where id = '${ids.revision}'`,
          `truncate campus_map_fact_revisions cascade`,
          `update campus_map_revision_provenance set provenance_id = '${ids.actor}' where revision_id = '${ids.revision}'`,
          `delete from campus_map_revision_provenance where revision_id = '${ids.revision}'`,
          `truncate campus_map_revision_provenance cascade`,
        ];

        for (const [index, mutation] of mutations.entries()) {
          const savepoint = `ledger_mutation_${index}`;
          await client.query(`savepoint ${savepoint}`);
          try {
            await expect(client.query(mutation)).rejects.toMatchObject({
              code: "55000",
              message: expect.stringContaining("append-only"),
            });
          } finally {
            await client.query(`rollback to savepoint ${savepoint}`);
            await client.query(`release savepoint ${savepoint}`);
          }
        }
      });
    });

    it("keeps safe actor snapshots when the user account is deleted", async () => {
      await inFixture(async (client) => {
        await client.query(`delete from users where id = $1`, [ids.user]);
        const result = await client.query(
          `select actor_user_id, actor_id_snapshot, actor_nickname_snapshot
         from campus_map_changesets where id = $1`,
          [ids.changeset],
        );

        expect(result.rows).toEqual([
          {
            actor_user_id: null,
            actor_id_snapshot: ids.actor,
            actor_nickname_snapshot: "事实贡献者",
          },
        ]);
      });
    });

    it("advances Current revision and Current fact atomically", async () => {
      await inFixture(async (client) => {
        await client.query(
          insertRevisionSql(", building_id, floor_id", ", $6, $7"),
          [
            ids.revision,
            ids.place,
            ids.changeset,
            ids.placeChange,
            ids.actor,
            ids.building,
            ids.floor,
          ],
        );
        await client.query(
          `insert into campus_map_current_revisions (place_id, revision_id, status)
         values ($1, $2, 'active')`,
          [ids.place, ids.revision],
        );
        await client.query(
          `insert into campus_map_current_facts
           (place_id, revision_id, fact_schema_version, name, building_id,
            floor_id, pin_type, location_kind, published_at)
         values ($1, $2, 717, '测试地点', $3, $4, 'water', 'floor', now())`,
          [ids.place, ids.revision, ids.building, ids.floor],
        );
        await client.query(
          `insert into campus_map_changesets
           (id, actor_id_snapshot, actor_nickname_snapshot, comment,
            source_summary, client_name, client_version, affected_count,
            updated_count)
         values ($1, $2, '事实贡献者', '更新', '现场观察', 'test', '1', 1, 1)`,
          [ids.secondChangeset, ids.actor],
        );
        await client.query(
          `insert into campus_map_place_changes
           (id, changeset_id, place_id, operation, field_diff)
         values ($1, $2, $3, 'update', '{}')`,
          [ids.secondPlaceChange, ids.secondChangeset, ids.place],
        );
        await client.query(
          `insert into campus_map_fact_revisions
           (id, place_id, changeset_id, place_change_id, previous_revision_id,
            fact_schema_version, field_metadata, status, actor_id_snapshot,
            actor_nickname_snapshot, name, building_id, floor_id, pin_type,
            location_kind)
         values ($1, $2, $3, $4, $5, 717, '{}', 'active', $6,
           '事实贡献者', '更新地点', $7, $8, 'water', 'floor')`,
          [
            ids.secondRevision,
            ids.place,
            ids.secondChangeset,
            ids.secondPlaceChange,
            ids.revision,
            ids.actor,
            ids.building,
            ids.floor,
          ],
        );

        await client.query(
          `delete from campus_map_current_facts where place_id = $1`,
          [ids.place],
        );
        await client.query(
          `update campus_map_current_revisions
         set revision_id = $2, advanced_at = now() where place_id = $1`,
          [ids.place, ids.secondRevision],
        );
        await client.query(
          `insert into campus_map_current_facts
           (place_id, revision_id, fact_schema_version, name, building_id,
            floor_id, pin_type, location_kind, published_at)
         values ($1, $2, 717, '更新地点', $3, $4, 'water', 'floor', now())`,
          [ids.place, ids.secondRevision, ids.building, ids.floor],
        );

        const result = await client.query(
          `select r.revision_id as current_revision_id,
                f.revision_id as current_fact_revision_id
         from campus_map_current_revisions r
         join campus_map_current_facts f using (place_id)
         where r.place_id = $1`,
          [ids.place],
        );
        expect(result.rows).toEqual([
          {
            current_revision_id: ids.secondRevision,
            current_fact_revision_id: ids.secondRevision,
          },
        ]);
      });
    });

    it("rejects a Current fact that differs from its active revision", async () => {
      await inFixture(async (client) => {
        await client.query(
          insertRevisionSql(", building_id, floor_id", ", $6, $7"),
          [
            ids.revision,
            ids.place,
            ids.changeset,
            ids.placeChange,
            ids.actor,
            ids.building,
            ids.floor,
          ],
        );
        await client.query(
          `insert into campus_map_current_revisions
           (place_id, revision_id, status) values ($1, $2, 'active')`,
          [ids.place, ids.revision],
        );

        await expect(
          client.query(
            `insert into campus_map_current_facts
             (place_id, revision_id, fact_schema_version, name, building_id,
              floor_id, pin_type, location_kind, published_at)
           values ($1, $2, 717, '伪造投影', $3, $4, 'water', 'floor', now())`,
            [ids.place, ids.revision, ids.building, ids.floor],
          ),
        ).rejects.toMatchObject({
          code: "23514",
          message: expect.stringContaining("does not match Fact revision"),
        });
      });
    });

    it("installs the query-shaped indexes and immediate projection constraint", async () => {
      const requiredIndexes = [
        "campus_map_current_facts_building_type_idx",
        "campus_map_current_facts_floor_type_idx",
        "campus_map_current_facts_geo_idx",
        "campus_map_buildings_anchor_geo_idx",
        "campus_map_fact_revisions_place_created_idx",
        "campus_map_changesets_feed_idx",
        "campus_map_changesets_actor_feed_idx",
        "campus_map_changesets_review_feed_idx",
        "campus_map_provider_mappings_identity_uq",
        "campus_map_publish_requests_actor_key_uq",
      ];
      const indexes = await pool.query<{ indexname: string }>(
        `select indexname from pg_indexes
       where schemaname = 'public' and indexname = any($1::text[])`,
        [requiredIndexes],
      );
      expect(indexes.rows.map((row) => row.indexname).sort()).toEqual(
        requiredIndexes.sort(),
      );

      const actorIndex = await pool.query<{ indexdef: string }>(
        `select indexdef from pg_indexes
         where schemaname = 'public'
           and indexname = 'campus_map_changesets_actor_feed_idx'`,
      );
      expect(actorIndex.rows[0]?.indexdef).toContain(
        "(actor_id_snapshot, published_at, id)",
      );

      const constraint = await pool.query<{ condeferrable: boolean }>(
        `select condeferrable from pg_constraint
       where conname = 'campus_map_current_facts_current_revision_fk'`,
      );
      expect(constraint.rows).toEqual([{ condeferrable: false }]);
    });

    it("keeps critical read plans on their query-shaped index paths", async () => {
      const client = await pool.connect();
      await client.query("begin");
      try {
        await client.query("set local enable_seqscan = off");
        const plans = [
          {
            name: "building directory",
            sql: `select place_id from campus_map_current_facts
            where status = 'active' and building_id = $1 and pin_type = 'water'`,
            params: [ids.building],
            indexes: [
              "campus_map_current_facts_building_type_idx",
              "campus_map_current_facts_floor_type_idx",
            ],
          },
          {
            name: "floor directory",
            sql: `select place_id from campus_map_current_facts
            where status = 'active' and building_id = $1 and floor_id = $2
              and pin_type = 'water'`,
            params: [ids.building, ids.floor],
            indexes: ["campus_map_current_facts_floor_type_idx"],
          },
          {
            name: "outdoor viewport",
            sql: `select place_id from campus_map_current_facts
            where status = 'active' and location_kind = 'outdoor-point'
              and longitude between 114.1 and 114.3
              and latitude between 22.3 and 22.5`,
            params: [],
            indexes: ["campus_map_current_facts_geo_idx"],
          },
          {
            name: "Building-anchor viewport",
            sql: `select fact.place_id
            from campus_map_buildings building
            inner join campus_map_current_facts fact
              on building.id = fact.building_id
            where fact.status = 'active'
              and fact.location_kind in ('building', 'floor')
              and building.anchor_crs = 'wgs84'
              and building.anchor_longitude between 114.1 and 114.3
              and building.anchor_latitude between 22.3 and 22.5
            order by fact.place_id limit 51`,
            params: [],
            indexes: ["campus_map_buildings_anchor_geo_idx"],
          },
          {
            name: "Place history",
            sql: `select id from campus_map_fact_revisions
            where place_id = $1 order by created_at desc, id desc limit 51`,
            params: [ids.place],
            indexes: ["campus_map_fact_revisions_place_created_idx"],
          },
          {
            name: "Changeset feed",
            sql: `select id from campus_map_changesets
            order by published_at desc, id desc limit 51`,
            params: [],
            indexes: ["campus_map_changesets_feed_idx"],
          },
          {
            name: "actor Changeset feed",
            sql: `select id from campus_map_changesets
            where actor_id_snapshot = $1
            order by published_at desc, id desc limit 51`,
            params: [ids.actor],
            indexes: ["campus_map_changesets_actor_feed_idx"],
          },
          {
            name: "review-requested Changeset feed",
            sql: `select id from campus_map_changesets
            where review_requested = true
            order by published_at desc, id desc limit 51`,
            params: [],
            indexes: ["campus_map_changesets_review_feed_idx"],
          },
          {
            name: "bbox Changeset feed",
            sql: `select id from campus_map_changesets
            where bbox_west is not null and bbox_west <= 114.3
              and bbox_east >= 114.1 and bbox_south <= 22.5
              and bbox_north >= 22.3
              and not exists (
                select 1 from campus_map_place_changes public_change
                inner join campus_map_fact_revisions public_revision
                  on public_revision.place_change_id = public_change.id
                left join campus_map_revision_visibility public_visibility
                  on public_visibility.revision_id = public_revision.id
                where public_change.changeset_id = campus_map_changesets.id
                  and coalesce(public_visibility.visibility, 'redacted') <> 'public'
              )
            order by published_at desc, id desc limit 51`,
            params: [],
            indexes: ["campus_map_changesets_feed_idx"],
          },
          {
            name: "provider identity",
            sql: `select id from campus_map_provider_mappings
            where provider = 'amap' and provider_object_id = 'B123'`,
            params: [],
            indexes: ["campus_map_provider_mappings_identity_uq"],
          },
          {
            name: "publish retry",
            sql: `select id from campus_map_publish_requests
            where actor_id_snapshot = $1 and idempotency_key = $2`,
            params: [ids.actor, ids.user],
            indexes: ["campus_map_publish_requests_actor_key_uq"],
          },
        ];

        for (const plan of plans) {
          const result = await client.query<{ "QUERY PLAN": unknown }>(
            `explain (format json) ${plan.sql}`,
            plan.params,
          );
          const usedIndexes = collectPlanIndexNames(
            result.rows[0]?.["QUERY PLAN"],
          );
          expect(
            usedIndexes.some((indexName) => plan.indexes.includes(indexName)),
            `${plan.name} plan used indexes: ${usedIndexes.join(", ") || "none"}`,
          ).toBe(true);
        }
      } finally {
        await client.query("rollback");
        client.release();
      }
    });
  },
);
