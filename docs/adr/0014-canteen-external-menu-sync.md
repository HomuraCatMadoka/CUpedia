# ADR 0014: External menu sync preserves dish identity and history

## Status

Accepted

## Context

External ordering systems publish complete menu snapshots. Re-importing those
snapshots as inserts creates duplicates. Deleting the old menu first is worse:
votes and comments reference menu item IDs with cascading foreign keys, so a
replacement import destroys the dish history.

Names and meal periods alone are not stable external identities. Providers do
not all use product IDs at the same granularity: PinMe models one product across
periods, while Aigens can reuse a backend product ID for period-specific
offerings with different prices and independent CUpedia history.

Provider category trees can also reference the same offering more than once.
These raw occurrences are not independent identities: recommendation and
ordinary categories may overlap, and multiple category aliases may point to the
same Aigens group.

## Decision

1. An externally managed menu item stores `menuSourceId` and
   `externalProductId`. Their non-null pair is unique. A composite database
   foreign key also requires the menu source and item to belong to the same
   canteen. Adapters emit the provider's stable offering identity: PinMe uses
   its product ID, while Aigens namespaces its reused backend ID by period.
   Name, pricing, classification and ordering never form identity. A unique
   one-to-one period move may update an Aigens offering identity in place;
   ambiguous split/merge cases fail closed instead of moving history.
2. Adapters aggregate repeated raw category occurrences before enforcing final
   offering uniqueness. Repeated PinMe products merge meal periods only when
   normalized names and prices agree. Repeated Aigens category references merge
   the same backend product and normalized period, retaining distinct
   category-context prices as labeled options. Conflicting names, conflicting
   PinMe prices, and duplicate product IDs inside one raw provider group fail
   closed; an Aigens category label that maps to two prices is likewise
   ambiguous and fails closed. Category never becomes part of the stable
   identity. Canonical category selection and price ordering make the normalized
   result independent of raw occurrence order.
3. Sync is a two-stage admin operation: preview a deterministic plan, then apply
   the same snapshot in one transaction. A conflicting legacy-name match blocks
   the entire apply.
4. Existing source-bound rows are updated in place. Missing rows become
   `isAvailable = false`; they are not deleted. A later snapshot can reactivate
   the same row and recover its public vote/comment history.
5. A first migration may explicitly set `takeOverLegacyItems: true`. This makes
   unmatched, source-less legacy rows unavailable. The preview must expose every
   affected row before apply, and a persisted timestamp prevents the same source
   from performing another legacy takeover.
6. Public menu reads and new vote/comment writes only accept available items.
   Historical rows remain available to server-side admin workflows.
7. Product-ID churn is observed before aliasing is introduced. Each scheduled
   run stores bounded new/missing ID samples, counts and one-to-one same-name
   candidates. Suspected replacement or bulk churn fails closed: the last
   successful public menu remains visible and no vote/comment identity moves.
8. Resolving a blocked identity transition requires a versioned artifact that
   separates deterministic audit facts from reviewer decisions. The decisions
   classify every missing and new identity exactly once as a UUID-preserving
   replacement, expected addition, or expected removal. Application locks the
   source and existing menu rows covered by the projection, verifies its locator
   and exact before/after fingerprints, rejects
   incomplete or ambiguous classifications, and then reuses the normal menu
   writes in one transaction. The artifact is a one-snapshot authorization,
   not a permanent alias or a relaxation of the global churn threshold.
   The evaluator retains independent blocking reasons. This authorization is
   only applicable when identity churn is present; after exact scope and removal
   review it may resolve churn and suspicious-drop for that fingerprinted
   snapshot, but never conflicts or a suspicious-drop-only snapshot.

## Consequences

- Upstream renames and price changes preserve the CUpedia menu item UUID.
- An unambiguous upstream meal-period move preserves the same CUpedia menu item
  UUID. Distinct Aigens period offerings retain separate UUIDs, prices and
  voting history.
- Votes and comments survive temporary or permanent removal from a source menu.
- Manual items and items managed by another source remain untouched unless an
  explicit first takeover is requested.
- Sync payloads need stable upstream IDs; name-only scraped spreadsheets are not
  safe for recurring synchronization.
- `externalSource` and `externalKey` remain rollout shadow columns for one
  compatibility release, but reconciliation does not read them as identity.
- An approved identity transition becomes stale whenever the source or either
  audited menu projection changes. Operators must regenerate and review it;
  they cannot silently carry approval forward to a later provider snapshot.
- Identity backfill and audited canteen provisioning use versioned Drizzle
  custom migrations because they must update existing UUID-addressed rows in
  place; generated schema DDL alone cannot express those data decisions.
- Migration 0076 is corrected in place for the production database that failed
  before recording it. Migration 0080 repeats the compatibility repair
  idempotently for preview or local databases that had already recorded 0076,
  so every environment converges without rebuilding dish identity or history.
- Migration 0081 converges databases that already recorded 0080 onto the
  provider-specific offering identity and rollout-trigger behavior.
- Production namespaces from audited one-off static imports have no ordering
  provider identity. Migration 0076 keeps those rows and UUID-bound history but
  makes them manual items; it never guesses a provider from the source label.
