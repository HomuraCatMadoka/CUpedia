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
fingerprints. Current reads join revision visibility and return only public
facts; missing visibility metadata fails closed as redacted.

The canonical V1 schema and display metadata are available from the read
boundary on a fresh database. The first V1 append idempotently persists that
active schema inside the same storage transaction before its revision FK is
written; later schema lifecycle remains explicit and version-addressable.

`src/lib/campus-map/publish.ts` owns the sole application publishing seam,
`publishCampusMapChangeset`. Routes, server actions, importers, and admin tools
must submit intent through that function rather than calling the storage writer
or updating fact tables. Its private implementation modules own command
validation and the persistent actor/IP rate policy.

`src/lib/campus-map/fact-store-transaction.ts` is an internal storage mechanism
behind that seam. One Changeset command locks stable Place rows in canonical ID
order, validates every base revision, resolves immutable provenance identities,
appends Changeset/change/revision/provenance/visibility, and advances Current
revision and Current fact atomically. It does not authenticate a caller or
expose a second application publish path.

## Persistence invariants

- Building, Floor, and Place use UUID primary keys. Provider mappings have a
  separate `(provider, provider_object_id)` identity.
- Changesets, Place changes, Fact revisions, and revision provenance are
  append-only in PostgreSQL: ordinary `UPDATE`, `DELETE`, and `TRUNCATE`
  statements fail. The only allowed Changeset update is the referential
  `actor_user_id` nulling caused by deletion of the linked User; actor snapshots
  and every other historical field remain immutable.
- Current revision is the only canonical pointer; Current fact is a replaceable
  active-only projection. PostgreSQL validates every Current fact insert or
  update against the complete Fact revision snapshot and its Changeset
  publication timestamp, so the projection cannot become a second truth.
- A revision stores its schema version, display metadata, full fact snapshot,
  previous revision, Changeset, actor snapshot, provenance links, and separate
  visibility state.
- Location checks form a discriminated union. Outdoor coordinates are canonical
  WGS84 with explicit evidence precision and no Building containment; floor
  references must belong to the selected Building. Viewport reads keep outdoor
  coordinates and Building/Floor anchor containment on separate query paths.
- Provenance optionally records a source coordinate pair, controlled source
  CRS, and minimal conversion method/version. Non-WGS84 source coordinates
  cannot be stored without conversion lineage, and no source CRS accepts
  non-finite coordinates.
- Retired and merged revisions remain Current-revision targets but have no
  Current fact. A merge locks both stable Place rows in ID order, keeps the
  survivor active, and points the loser at that survivor's stable Place ID.
- User foreign keys use `ON DELETE SET NULL`; actor ID and nickname snapshots
  remain in public history.
- The private publish-request table owns actor-scoped idempotency keys,
  fingerprints, and the completed typed result needed for exact replay. A
  `processing` row and every fact write share one transaction, so rollback
  cannot leave a stuck request. Public Changeset reads cannot join or expose
  this state.
- The private rate table stores only HMAC-derived actor/IP subjects and the
  fixed burst/sustained windows. Exact completed replays are resolved before
  quota is consumed; validation, warning, and conflict attempts remain subject
  to abuse policy.
- Redacted revisions retain their chain and operation placeholder, while public
  Current, history, Changeset, and duplicate-warning projections suppress fact
  snapshots, provenance, and field diffs so no read or warning can recover the
  hidden payload.
- Projection replacement deletes the old Current fact before advancing Current
  revision, then inserts a new fact only for an active revision. The immediate
  FK remains representable by `schema.ts`; transaction isolation hides all
  intermediate statements from readers.

Operation/status transitions, active merge-survivor checks, and required
revision provenance/visibility remain owned by the fact-store storage
mechanism. Fresh authorization, command validation, warnings, rate policy, and
idempotency remain owned by the sole publish seam. They are intentionally not
duplicated as a second set of cross-table trigger rules.

The publisher acquires locks in a stable order: actor-scoped idempotency
advisory lock, fresh User and credential eligibility rows, actor/IP rate rows in
fixed policy order, existing Place and Current visibility rows in canonical
Place UUID order, then provenance advisory locks in numeric key order. Exact
completed replay returns before eligibility and quota because it does not
create a new publication. No network request or slow external adapter runs
inside the transaction.

Duplicate warnings compare both public Current facts and facts proposed earlier
in the same bulk command. Their HMAC fingerprints bind the proposed fact to each
candidate's warning-relevant location and, for Current candidates, revision ID,
so acknowledgements cannot survive a relevant candidate change.

The projection-hardening migration validates every existing Current fact while
installing the trigger. This takes a write lock and rewrites that projection;
the table is new and expected to be empty or small before #718 enables public
publishing, so the bounded rollout cost is intentional.

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
