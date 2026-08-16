# ADR 0014: External menu sync preserves dish identity and history

## Status

Accepted

## Context

External ordering systems publish menu observations with different scope. Some
responses are complete catalogs; others contain only the current service window
or available subset. Re-importing those observations as inserts creates
duplicates. Deleting the old menu first is worse:
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
3. Every adapter labels its normalized response `complete` or `partial` from
   verified provider semantics. Only a complete snapshot may deactivate managed
   identities that are absent. A partial snapshot may update, create or
   reactivate identities that are present, but preserves absent rows unchanged.
   Completeness participates in preview and snapshot fingerprints; it is never
   inferred from counts, time, thresholds or provider branching inside
   reconciliation. PinMe `product-menus` is partial until the upstream supplies
   a verified full-catalog response or completeness signal.
4. Sync is a two-stage admin operation: preview a deterministic plan, then apply
   the same snapshot in one transaction. A conflicting legacy-name match blocks
   the entire apply.
5. Existing source-bound rows are updated in place. In a complete snapshot,
   missing rows become
   `isAvailable = false`; they are not deleted. A later snapshot can reactivate
   the same row and recover its public vote/comment history.
6. A first migration may explicitly set `takeOverLegacyItems: true`. This makes
   unmatched, source-less legacy rows unavailable. The preview must expose every
   affected row before apply, a persisted timestamp prevents the same source
   from performing another legacy takeover, and partial snapshots cannot request
   takeover.
7. Public menu reads and new vote/comment writes only accept available items.
   Historical rows remain available to server-side admin workflows.
8. Product-ID churn is observed before aliasing is introduced. Each scheduled
   run stores bounded new/missing ID samples, counts and one-to-one same-name
   candidates. Suspected replacement or bulk churn fails closed: the last
   successful public menu remains visible and no vote/comment identity moves.
9. Resolving a blocked identity transition requires a versioned artifact that
   separates deterministic audit facts from reviewer decisions. The decisions
   classify every missing and new identity exactly once as a UUID-preserving
   replacement, expected addition, or expected removal. Application locks the
   canteen, source, and existing menu rows covered by the projection in that
   order. The canteen parent lock serializes inserts that no existing-row lock
   can cover. Application verifies its locator and exact fingerprints, rejects
   incomplete or ambiguous classifications, and then reuses the normal menu
   writes in one transaction. The artifact is a one-snapshot authorization,
   not a permanent alias or a relaxation of the global churn threshold.
   The evaluator retains independent blocking reasons. This authorization is
   only applicable when identity churn is present; after exact scope and removal
   review it may resolve churn and suspicious-drop for that fingerprinted
   snapshot, but never conflicts or a suspicious-drop-only snapshot.
10. Historical bare Aigens product IDs are not valid current offering
    identities. The audited transition boundary may preserve them as
    fingerprinted evidence so an operator can classify the migration to
    period-scoped IDs. Ordinary synchronization still rejects them, and an
    ambiguous split or merge remains non-executable.

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
- A partial provider response cannot retire a dish merely because that dish is
  outside the current service or availability window. This can retain stale
  offerings until a complete source or separate reviewed retirement policy
  supplies removal evidence.
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
