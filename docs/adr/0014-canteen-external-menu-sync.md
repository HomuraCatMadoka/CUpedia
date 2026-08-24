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

Names and meal periods are not stable external identities. Both PinMe product
IDs and Aigens backend product IDs identify dishes independently of the menu
period or category in which providers publish them. Period-specific names and
prices are occurrence facts that must be aggregated or rejected when they
cannot be represented without ambiguity.

Provider category trees can also reference the same offering more than once.
These raw occurrences are not independent identities: recommendation and
ordinary categories may overlap, and multiple category aliases may point to the
same Aigens group.

## Decision

1. An externally managed menu item stores `menuSourceId` and
   `externalProductId`. Their non-null pair is unique. A composite database
   foreign key also requires the menu source and item to belong to the same
   canteen. Adapters emit the provider's stable product identity: PinMe uses its
   product ID and Aigens uses its backend product ID. Meal period, name,
   pricing, classification and ordering never form identity. Compatible
   occurrences of one product aggregate onto one CUpedia UUID; incompatible
   facts fail closed instead of splitting or guessing history.
2. Adapters aggregate repeated raw category occurrences before enforcing final
   offering uniqueness. Repeated PinMe products merge meal periods only when
   normalized names and prices agree. Repeated Aigens category and period
   references merge the same backend product, retaining distinct contextual
   prices as deterministically labeled options. Conflicting names, conflicting
   PinMe prices, and duplicate product IDs inside one raw provider group fail
   closed; an Aigens category label that maps to two prices is likewise
   ambiguous and fails closed. Category never becomes part of the stable
   identity. Canonical category selection and price ordering make the normalized
   result independent of raw occurrence order.
3. Every adapter labels its normalized response `complete` or `partial` and
   declares whether absence applies to the catalog or one meal period, using
   verified provider semantics. Aigens exposes the menu visible to an ordering
   customer in the current service context, not an authoritative master
   catalog. Its responses are therefore partial even when store, menu and all
   declared period locators validate: an absent item may belong to another meal
   period, be temporarily unavailable, or be omitted while the store is closed.
   Repeated reads, `open` parameter parity, item counts and period/category/group
   presence do not turn that observation into global inactivity evidence. The
   bounded store/menu/period evidence remains diagnostic and participates in
   transition audit and fingerprinting. Only a complete snapshot may deactivate
   managed identities that are absent. A partial snapshot may update, create or
   reactivate identities that are present, but preserves absent rows unchanged.
   Completeness participates in preview and snapshot fingerprints; it is never
   inferred from counts, time, thresholds or provider branching inside
   reconciliation. PinMe `product-menus` is partial until the upstream supplies
   a verified full-catalog response or completeness signal. A Qmai point-in-time
   response is complete only within the claimed meal-period scope; a product
   without a provider-declared sale window inherits that observed period rather
   than `allday`.
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
   Each history write locks and rechecks the available menu row in the same
   short transaction as its insert/upsert. The shared row lock permits
   concurrent public history writes but makes an audited transition wait until
   they commit, so no new history can land on a retired UUID after its merge
   scan. Historical rows remain available to server-side admin workflows.
8. Product-ID churn is observed before aliasing is introduced. Each scheduled
   run stores bounded new/missing ID samples, counts and one-to-one same-name
   candidates. Suspected replacement always fails closed. Bulk churn based on
   new/missing volume fails closed only for complete snapshots, where absence
   is evidence that an old identity disappeared. In a partial observation,
   absence has no identity meaning and a pure addition surge is ordinary menu
   growth; it may create new identities but cannot deactivate absent ones.
9. Resolving a blocked identity transition requires a versioned artifact that
   separates deterministic audit facts from reviewer decisions. Current
   decisions authorize only UUID-preserving replacements, historical alias
   canonicalizations, and explicit many-to-one UUID merges. New identities use
   the ordinary partial-sync create path; identities absent from the observation
   keep their current activity. Application locks the
   canteen, source, and existing menu rows covered by the projection in that
   order. The canteen parent lock serializes inserts that no existing-row lock
   can cover. Application verifies its locator and exact fingerprints, rejects
   incomplete identity mappings or ambiguous evidence, and then reuses the normal menu
   writes in one transaction. The artifact is a one-snapshot authorization,
   not a permanent alias or a relaxation of the global churn threshold.
   The evaluator retains independent blocking reasons. This authorization is
   only applicable when identity churn is present and may resolve that reason,
   but never conflicts or a suspicious-drop-only snapshot. Version 4 artifacts
   remain an exact legacy replay boundary and must not be newly issued.
10. Aigens period-scoped external IDs are historical aliases, not current dish
    identities. Ordinary synchronization must not silently choose a UUID when
    multiple aliases already represent one backend product. The audited
    transition boundary fingerprints every alias and requires an explicit
    survivor and history-merge decision before converging them to the bare
    backend product ID. The same reviewed transition canonicalizes aliases for
    currently absent products, leaving one unavailable source-bound survivor
    that an ordinary future snapshot can reactivate.
11. A claimed recurring read carries one immutable database-time observation
    context through adapter requests, bounded retries, snapshot persistence and
    projection. For meal-period-scoped sources, reconciliation receives the
    union of the newest accepted snapshot for every configured period, not the
    current point-in-time response. Replacing one scope can remove only that
    period's occurrence. Occurrences share one product identity and UUID;
    mutable facts such as name, price, classification and ordering come from the
    newest observation, while meal periods are unioned across scopes. Conflicts
    inside one provider response remain adapter errors, but ordinary changes
    between observations must converge. Until every configured period has an
    accepted scoped snapshot, the union is globally partial. Once all periods
    are represented, the union is authoritative only for reversible current
    activity, even when each immutable raw observation remains partial catalog
    evidence. This activity authority bypasses the catalog suspicious-drop
    threshold but not identity conflicts or product-ID churn protection. Manual
    preview and transition flows downgrade a meal-period observation to
    non-authoritative absence unless they use the recurring scoped projection.

## Consequences

- Upstream renames and price changes preserve the CUpedia menu item UUID.
- A dish published in several meal periods retains one CUpedia menu item UUID;
  period-specific prices remain contextual price options on that dish.
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
- One partial provider response cannot make a dish globally inactive merely
  because it is outside that service or availability window. After every
  configured period has a latest accepted observation, their union may
  reversibly deactivate identities absent from the current published
  projection without claiming permanent catalog deletion.
- A complete meal-period observation can retire an occurrence from that period
  without retiring the same dish from periods retained by the scoped union.
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
