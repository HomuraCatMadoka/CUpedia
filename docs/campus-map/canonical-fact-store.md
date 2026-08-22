# Campus Map canonical fact store

Issue #717 implements the persistence boundary described by ADR 0021 and ADR 0022. Provider objects are evidence about canonical entities; they are not the
identity of a Building, Floor, or Place.

## Ownership and interfaces

`src/lib/campus-map/fact-store.ts` is the public read boundary. It returns
domain read models for:

- one active Current Place;
- active Places filtered by canonical building, floor, pin type, or viewport;
- immutable Place history with revision-local field metadata;
- one public Changeset and the cursor-paged Changeset feed.

The read boundary never returns Drizzle rows, provider IDs, moderation
references, user-account foreign keys, idempotency keys, or request
fingerprints. Missing visibility metadata fails closed as redacted.

The canonical V1 schema and display metadata are available from the read
boundary on a fresh database. The first V1 append idempotently persists that
active schema inside the same storage transaction before its revision FK is
written; later schema lifecycle remains explicit and version-addressable.

`src/lib/campus-map/fact-store-transaction.ts` is the internal publishing seam.
One Changeset command locks stable Place rows in canonical ID order, validates
every base revision, appends Changeset/change/revision/provenance/visibility,
and advances Current revision and Current fact atomically. #718 owns
authentication, command validation, rate limits, and idempotency orchestration
around this storage command; it does not write fact tables directly.

## Persistence invariants

- Building, Floor, and Place use UUID primary keys. Provider mappings have a
  separate `(provider, provider_object_id)` identity.
- Changesets, Place changes, and Fact revisions are immutable through the
  module contract. Current revision is the only canonical pointer; Current fact
  is a replaceable active-only projection.
- A revision stores its schema version, display metadata, full fact snapshot,
  previous revision, Changeset, actor snapshot, provenance links, and separate
  visibility state.
- Location checks form a discriminated union. Outdoor coordinates are canonical
  WGS84 with explicit evidence precision and no Building containment; floor
  references must belong to the selected Building. Viewport reads keep outdoor
  coordinates and Building/Floor anchor containment on separate query paths.
- Provenance optionally records a source coordinate pair, controlled source
  CRS, and minimal conversion method/version. Non-WGS84 source coordinates
  cannot be stored without conversion lineage.
- Retired and merged revisions remain Current-revision targets but have no
  Current fact. A merge locks both stable Place rows in ID order, keeps the
  survivor active, and points the loser at that survivor's stable Place ID.
- User foreign keys use `ON DELETE SET NULL`; actor ID and nickname snapshots
  remain in public history.
- The private publish-request table owns actor-scoped idempotency keys and
  fingerprints. Public Changeset reads cannot join or expose them.
- Redacted revisions retain their chain and operation placeholder, while public
  history and Changeset projections suppress both fact snapshots and field
  diffs so before/after values cannot recover the hidden payload.
- Projection replacement deletes the old Current fact before advancing Current
  revision, then inserts a new fact only for an active revision. The immediate
  FK remains representable by `schema.ts`; transaction isolation hides all
  intermediate statements from readers.

## Hot query catalogue

| Query                    | Shape                                            | Supporting index or key                         |
| ------------------------ | ------------------------------------------------ | ----------------------------------------------- |
| Place detail             | Current fact by `place_id`                       | Current fact primary key                        |
| Building directory       | `building_id`, optional `pin_type`               | `campus_map_current_facts_building_type_idx`    |
| Floor directory          | `building_id`, `floor_id`, optional `pin_type`   | `campus_map_current_facts_floor_type_idx`       |
| Outdoor viewport         | longitude/latitude range                         | partial `campus_map_current_facts_geo_idx`      |
| Building-anchor viewport | anchor longitude/latitude range                  | partial `campus_map_buildings_anchor_geo_idx`   |
| Place history            | `place_id`, descending `created_at`, `id` cursor | `campus_map_fact_revisions_place_created_idx`   |
| Changeset feed           | descending `published_at`, `id` cursor           | `campus_map_changesets_feed_idx`                |
| Review feed              | review flag plus feed cursor                     | partial `campus_map_changesets_review_feed_idx` |
| Provider lookup          | provider and provider object ID                  | `campus_map_provider_mappings_identity_uq`      |
| Publish retry            | actor snapshot and idempotency key               | `campus_map_publish_requests_actor_key_uq`      |

Current Place list reads use one projection query and one batched provenance
query per page; they do not issue per-Place queries. History and feed cursors
include both timestamp and UUID to remain stable when timestamps tie.

Plan verification uses real PostgreSQL `EXPLAIN (FORMAT JSON)` after migration.
Tests disable sequential scans locally to prove that the critical directory,
outdoor and Building-anchor viewport, history, feed, provider, and idempotency
query shapes have usable index paths without freezing costs or a complete
planner tree. Catalog checks separately ensure the expected indexes are
installed.
