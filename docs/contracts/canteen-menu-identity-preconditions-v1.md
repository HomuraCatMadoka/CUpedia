# Canteen menu identity preconditions v1

- Contract identifier: `canteen-menu-identity-preconditions/v1`
- Report schema: `canteen-menu-identity-preflight-report/v1`
- Target: GitHub issue #643

This contract is the mandatory, read-only gate before the #643 contract
migration may be deployed. The #643 migration SQL and its parity tests must
reuse the fixture/result matrix at
`tests/db/fixtures/canteen-menu-identity-preflight-v1.json` and reproduce every
v1 failure category. Its logical canteen/source/item rows, vote/comment counts,
and exact expected result counts are executable fixture input; the referenced
0081 historical DDL is part of that input. Changing these predicates or rows
requires a new contract version; it must not silently change v1.

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
4. `ROLLOUT_SHADOW_MISMATCH`: a manual row has no shadow pair; a managed row's
   shadow source resolves to its authoritative source and its shadow key
   canonicalizes to its authoritative product/offering ID.
5. `UNSUPPORTED_LEGACY_IDENTITY`: shadow columns are symmetric and use a
   supported provider namespace/key. Source namespaces are
   `provider:store`, `qmai:owner:store`, plus the historical
   `order-place:store` Aigens alias. Key canonicalization reuses
   `normalizePublishedProviderIdentity`; it is not a second provider rule set.
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
`docs/contracts/canteen-menu-identity-preflight-report-v1.schema.json`.
Configuration and database errors contain no database exception text.

## Non-mutation invariant

The preflight reads only menu items, source identity fields, and aggregate
vote/comment counts. It does not read provider credentials or full source
configuration. It does not call a provider, preview/apply sync, write source
health or sync runs, change rollout shadows, touch the Drizzle journal, or run
repair logic. PostgreSQL enforces this boundary with a read-only transaction.
