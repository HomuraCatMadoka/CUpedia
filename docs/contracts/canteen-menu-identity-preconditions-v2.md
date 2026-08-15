# Canteen menu identity preconditions v2

- Contract identifier: `canteen-menu-identity-preconditions/v2`
- Report schema: `canteen-menu-identity-preflight-report/v2`
- Target: GitHub issue #643

This contract is the mandatory, read-only gate before the #643 contract
migration may be deployed. It evolves the v1 interpreter and report shape for
the #665 compatibility release. The v1 contract and fixture remain immutable;
v2 reuses their complete unsafe-state matrix and adds the authoritative-only
case in `tests/db/fixtures/canteen-menu-identity-preflight-v2.json`.

## Preconditions

All predicates apply to the same `REPEATABLE READ READ ONLY` snapshot.

1. `SOURCE_CANTEEN_OWNERSHIP_MISMATCH`: every non-null
   `canteen_menu_items.menu_source_id` resolves to a source whose `canteen_id`
   equals the item's `canteen_id`.
2. `AUTHORITATIVE_IDENTITY_NULL_ASYMMETRY`: `menu_source_id` and
   `external_product_id` are either both null (manual) or both non-null
   (managed).
3. `DUPLICATE_AUTHORITATIVE_IDENTITY`: no two menu UUIDs share the same
   non-null `menu_source_id + external_product_id`.
4. `ROLLOUT_SHADOW_MISMATCH`: a manual row has no shadow pair. A managed row
   may have no shadow pair (authoritative-only), or may have a complete shadow
   pair that resolves to and agrees with its authoritative identity. Partial,
   contradictory, or unresolvable shadows fail closed.
5. `UNSUPPORTED_LEGACY_IDENTITY`: any present shadow pair must use a supported
   provider namespace/key and resolve to exactly one source in the item's
   canteen. Namespace and key interpretation reuses the existing persisted
   identity interpreter; v2 does not add a second provider rule set.
6. `MERGE_OR_UUID_REPLACEMENT_REQUIRED`: neither authoritative identities nor
   canonical shadow projections may map multiple menu UUIDs to one identity.
   Any such state fails closed. The preflight never merges, repairs, replaces,
   or reassigns a UUID.

Every failed category reports the number of risky menu rows and aggregate
attached vote/comment counts. Samples are limited to five and contain only a
one-way menu-row fingerprint, provider enum when known, and a fixed reason
code. Store/owner/product IDs, menu UUIDs, users, comment bodies, credentials,
and source configuration are never report fields.

## Result contract

- `PREFLIGHT_SAFE` exits `0`.
- `PREFLIGHT_UNSAFE` exits `2`.
- `PREFLIGHT_CONFIGURATION_ERROR` exits `3`.
- `PREFLIGHT_DATABASE_ERROR` exits `4`.

The stable JSON shape is defined by
`docs/contracts/canteen-menu-identity-preflight-report-v2.schema.json`.
Configuration and database errors contain no database exception text.

## Non-mutation invariant

The preflight reads only menu items, source identity fields, and aggregate
vote/comment counts. It does not read provider credentials or full source
configuration. It does not call a provider, preview/apply sync, write source
health or sync runs, change rollout shadows, touch the Drizzle journal, or run
repair logic. PostgreSQL enforces this boundary with a read-only transaction.
