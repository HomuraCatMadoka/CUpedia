# Campus Map canonical fact store

Issues #717 and #865 implement the persistence boundary described by ADR 0034,
ADR 0035, ADR 0038, and ADR 0039. Provider objects are evidence about canonical
entities; they are not the identity of a Building, Floor, or Place.

## Ownership and interfaces

`src/lib/campus-map/fact-store.ts` is the public read boundary. It returns
domain read models for:

- one active Current Place;
- active Places filtered by canonical building, floor, Place type, or viewport;
- immutable Place history with revision-local field metadata;
- a source identity resolved through complete revision history to one still
  public, active Place;
- one public Changeset and the cursor-paged Changeset feed.

The read boundary never returns Drizzle rows, provider IDs, moderation
references, user-account foreign keys, idempotency keys, or request
fingerprints. Current reads join revision visibility and return only public
facts; missing visibility metadata fails closed as redacted.

Database migrations are the only owner of canonical schema and display
metadata. The read and publish boundaries require exactly one active V2 schema;
missing, draft, or otherwise inconsistent metadata fails closed instead of
being invented by application code. Historical V1 revisions keep their
original schema version and decode through the V1 codec; they are never
rewritten into V2. Schema lifecycle remains explicit and version-addressable.
The V2 activation migration first asserts the production-audited condition that
no V1 row remains in Current and aborts if that condition is false. After
activation, Current accepts V2 only while the immutable revision ledger accepts
both versions.

`src/lib/campus-map/publish.ts` owns the sole application publishing seam,
`publishCampusMapChangeset`. Routes, server actions, importers, and admin tools
must submit intent through that function rather than calling the storage writer
or updating fact tables. Its private implementation modules own command
validation and the persistent actor/IP rate policy.

`representative-facility-manifest.ts` is a small, manually reviewed V2 example
payload. Its [source ledger](representative-facility-import.md) records the
included facts and official sources. `representative-facility-import.ts`
reconciles each stable source identity against all immutable revisions, requires
the uniquely matched Place to remain public and active, sends a new set through
the administrator bulk publisher. A retry by the same or another admin therefore
reuses canonical Places even when the source is no longer attached to the
current revision; retired or ambiguous matches fail closed. A database advisory
lock allows only one first-import attempt for that manifest version; a
concurrent attempt returns a retryable result. The sample import neither creates
provider mappings nor consumes AMap data; the existing mapping registry remains
the separate owner of AMap-to-canonical bindings. The importer is not a second
fact writer, crawler, scheduler, or direct-database shortcut.

`src/lib/campus-map/fact-store-transaction.ts` is an internal storage mechanism
behind that seam. One Changeset command locks stable Place rows in canonical ID
order, validates every base revision, resolves immutable provenance identities,
appends Changeset/change/revision/provenance/visibility, and advances Current
revision and Current fact atomically. It does not authenticate a caller or
expose a second application publish path.

`src/lib/campus-map/provider-mapping-registry.ts` is the sole owner of active
provider mappings and their private governance history. Its exact public query
returns only a canonical Building/Place selection target or `null`. Its
bind/unlink/rebind command locks one provider identity, rechecks the actor's
current admin status, validates previous targets by stable canonical identity
and new targets by public eligibility, updates the active projection, and
appends an actor/reason/time/provenance decision in one transaction.
No React or public server action exposes mapping commands. Accepted mappings
are written only by a trusted QA or future admin command. Names,
aliases, distances, and coordinates may be reviewed as evidence outside the
runtime, but they never create an active mapping or participate in a map click.

For repeatable linked/unlinked browser acceptance, use the audited fixture
runner from the fixed QA worktree. Keep its JSON manifest outside the
repository; it contains a provenance record, one real AMap identity for a
Building target, one for a Place target, and at least one identity that must
remain unmapped. Configure `CAMPUS_MAP_PROVIDER_MAPPING_QA_ACTOR_ID` in that
worktree's local environment as the trusted operator; it is not accepted from
the fixture payload, and the registry rechecks its current admin status. The
runner never reads an AMap key and never writes mapping tables directly:

```bash
pnpm qa:campus-map-provider-mappings -- apply /absolute/path/manifest.json
pnpm qa:campus-map-provider-mappings -- verify /absolute/path/manifest.json
pnpm qa:campus-map-provider-mappings -- cleanup /absolute/path/manifest.json
```

The manifest shape is:

```json
{
  "version": 1,
  "provenanceId": "provider-candidate-provenance-uuid",
  "reason": "Fixed Campus Map QA",
  "mapped": [
    {
      "label": "building",
      "managed": true,
      "identity": {
        "provider": "amap",
        "providerObjectId": "real-building-poi-id"
      },
      "target": { "kind": "building", "buildingId": "building-uuid" }
    },
    {
      "label": "place",
      "managed": false,
      "identity": {
        "provider": "amap",
        "providerObjectId": "real-place-poi-id"
      },
      "target": { "kind": "place", "placeId": "place-uuid" }
    }
  ],
  "unmapped": [
    {
      "label": "transient",
      "identity": {
        "provider": "amap",
        "providerObjectId": "real-unmapped-poi-id"
      }
    }
  ]
}
```

`managed: true` means the fixture runner may bind that missing identity during
`apply` and unlink its exact target during `cleanup`. `managed: false` means the
mapping must already exist and is verification-only; cleanup preserves it.
`verify` checks the public resolver used by Campus Map. Every mode fails closed
if an identity is already bound elsewhere; rebind remains a separate, explicit
governance decision. Run fixed-worktree QA serially, keep managed mappings
applied until linked Building, linked Place, and transient POI checks are
complete, and never run seed or bootstrap as part of this workflow.

## Persistence invariants

- Building, Floor, and Place use UUID primary keys. Provider mappings have a
  separate `(provider, provider_object_id)` identity with one active row at
  most. The unique index and identity-scoped advisory lock make conflicting
  concurrent commands fail closed.
- Provider mapping decisions and actor-scoped idempotency results are private,
  append-only ledgers. The active mapping is a replaceable projection; unlink
  removes only that projection, while the previous target remains in the
  decision ledger. RLS is enabled on all three provider-mapping tables, and
  Supabase `anon`/`authenticated` grants are revoked when those roles exist.
- Changesets, Place changes, Fact revisions, and revision provenance are
  append-only in PostgreSQL: ordinary `UPDATE`, `DELETE`, and `TRUNCATE`
  statements fail. Provenance source metadata cannot be updated, and referenced
  sources cannot be deleted because their immutable revision links retain them;
  this keeps the safe provenance projection of an old revision stable. The only
  allowed Changeset update is the referential
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
  to abuse policy. Actor windows are checked before IP windows, so an actor that
  is already limited cannot create unbounded IP subjects by rotating addresses.
  Inactive subjects older than the longest window are reclaimed in bounded,
  non-blocking batches.
- Redacted revisions retain their chain and operation placeholder, while public
  Current, history, Changeset, and duplicate-warning projections suppress fact
  snapshots, provenance, field diffs, and Changeset bounding boxes so no read or
  warning can recover the hidden payload.
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
advisory lock, fresh User and account-eligibility rows, actor/IP rate rows in
fixed policy order, a non-blocking rate-cleanup advisory lock, existing Place
and Current visibility rows in canonical Place UUID order, normalized warning
domains in name/Place-type order, then provenance advisory locks in numeric key order.
Exact completed replay returns before eligibility and quota because it does not
create a new publication. No network request or slow external adapter runs
inside the transaction.

UUID command identities are normalized to their canonical lowercase form once,
before request fingerprinting, deduplication, lock ordering, reference checks,
and Current-revision CAS. PostgreSQL UUID rendering therefore cannot disagree
with otherwise valid uppercase client input.

Server-computed field diffs compare canonical display values: controlled
multi-selects and weekly schedule days use schema order, weekly intervals and
JSON object keys are stable, and `observedAt` has revision-local typed metadata.
Representation-only reordering cannot create a Fact revision, while an
`observedAt`-only correction remains a real change.

Duplicate warnings compare both public Current facts and facts proposed earlier
in the same bulk command. Their HMAC fingerprints bind the proposed fact to each
candidate's warning-relevant location and, for Current candidates, revision ID,
so acknowledgements cannot survive a relevant candidate change. Transaction
locks serialize publishers in each warning domain before candidates are read,
preventing concurrent creates from both observing an empty Current set. The
persisted-name trim is normalized once by PostgreSQL and the result is reused by
domain locks, Current queries, bulk comparisons, and fingerprints.

The projection-hardening migration validates every existing Current fact while
installing the trigger. This takes a write lock and rewrites that projection;
the table is new and expected to be empty or small before #718 enables public
publishing, so the bounded rollout cost is intentional.

## Hot query catalogue

| Query                    | Shape                                            | Supporting index or key                             |
| ------------------------ | ------------------------------------------------ | --------------------------------------------------- |
| Place detail             | Current fact by `place_id`                       | Current fact primary key                            |
| Building directory       | `building_id`, optional Place type (`pin_type`)  | `campus_map_current_facts_building_type_idx`        |
| Floor directory          | Building/Floor, optional Place type (`pin_type`) | `campus_map_current_facts_floor_type_idx`           |
| Outdoor viewport         | longitude/latitude range                         | partial `campus_map_current_facts_geo_idx`          |
| Building-anchor viewport | anchor longitude/latitude range                  | partial `campus_map_buildings_anchor_geo_idx`       |
| Place history            | `place_id`, descending `created_at`, `id` cursor | `campus_map_fact_revisions_place_created_idx`       |
| Changeset feed           | descending `published_at`, `id` cursor           | `campus_map_changesets_feed_idx`                    |
| Review feed              | review flag plus feed cursor                     | partial `campus_map_changesets_review_feed_idx`     |
| Provider lookup          | provider and provider object ID                  | `campus_map_provider_mappings_identity_uq`          |
| Provider audit           | identity, ascending decision time and ID         | `campus_map_provider_mapping_events_identity_idx`   |
| Mapping retry            | actor snapshot and idempotency key               | `campus_map_provider_mapping_requests_actor_key_uq` |
| Publish retry            | actor snapshot and idempotency key               | `campus_map_publish_requests_actor_key_uq`          |

Current Place list reads use one projection query and one batched provenance
query per page; they do not issue per-Place queries. History and feed cursors
include both timestamp and UUID to remain stable when timestamps tie.

Plan verification uses real PostgreSQL `EXPLAIN (FORMAT JSON)` after migration.
Tests disable sequential scans locally to prove that the critical directory,
outdoor and Building-anchor viewport, history, feed, provider, and idempotency
query shapes have usable index paths without freezing costs or a complete
planner tree. Catalog checks separately ensure the expected indexes are
installed.
