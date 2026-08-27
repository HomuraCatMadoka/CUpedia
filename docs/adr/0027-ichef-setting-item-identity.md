# ADR 0027: Use iCHEF setting-item UUIDs as product identity

## Status

Superseded in part by [ADR 0031](0031-separate-canonical-dishes-from-provider-offerings.md)

## Context

The public iCHEF customer GraphQL response exposes two identifiers for a menu
item occurrence. `menuItemsSnapshot.uuid` identifies the item inside one
published menu snapshot. `ichefUuid` is described by the official customer
frontend as the original setting-item UUID.

CUpedia originally stored the snapshot UUID as `externalProductId`. A real
51-item publication refresh changed every snapshot UUID while names, meal
periods, prices, and all 51 non-null unique `ichefUuid` values remained stable.
The reconciliation guard correctly treated that observation as wholesale
identity churn and stopped before creating replacement CUpedia UUIDs or
detaching votes and comments from their history.

ADR 0014 requires each adapter to emit the provider's stable product identity
and forbids names, periods, prices, classifications, and ordering from becoming
identity. It did not previously record which of iCHEF's two UUID fields fulfills
that contract.

## Decision

1. The iCHEF adapter emits `ichefUuid` as its provider-scoped product identity.
   `menuItemsSnapshot.uuid` remains publication-occurrence evidence and never
   becomes `externalProductId`.
2. A missing, empty, malformed, or internally conflicting `ichefUuid` fails
   closed. The adapter never falls back to the snapshot UUID or a mutable fact.
   Compatible repeated occurrences aggregate their meal periods and select a
   category key deterministically; an exact repeat is idempotent. Conflicting
   names or prices still fail closed.
3. Existing rows created with snapshot UUIDs move to `ichefUuid` only through a
   checked-in version-5 reviewed identity-transition artifact. Application
   requires exact source configuration, existing-state, incoming-state, and
   decision fingerprints, and updates the existing CUpedia row in place.
4. Meal periods and canonical prices may separate repeated same-name candidates
   only for a complete, catalog-scoped iCHEF observation where every active old
   identity disappears and every incoming identity is new with the same total
   count. A meal-period-scoped observation never receives this authority. They
   remain review evidence rather than identity, and every one-to-one replacement
   needs an explicit decision. Other providers, partial observations,
   incremental replacements, duplicate fact sets, and incomplete matches remain
   ambiguous.
5. The public customer GraphQL API has no observed compatibility guarantee.
   Future absence or changed semantics of `ichefUuid` must stop synchronization
   for review rather than silently selecting another field.

This decision extends ADR 0014 for the iCHEF provider. It does not change ADR
0014's provider-neutral reconciliation, history, or fail-closed safeguards.

## Consequences

- Ordinary iCHEF publication refreshes retain one CUpedia UUID per setting item.
- The audited rollout preserves UUID-bound votes, comments, and inactive history.
- A true replacement of an iCHEF setting item still receives a new identity or
  stops for review; matching names and prices alone cannot inherit history.
- A future incompatible provider response may temporarily block the drain, but
  cannot silently corrupt identity.
