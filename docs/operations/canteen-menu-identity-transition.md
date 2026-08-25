# Canteen menu identity transition

Use this procedure only after the ordinary menu snapshot evaluator blocks a
source for product-identity churn. It does not change the global safeguard.

## Preconditions

- Keep recurring Production synchronization disabled.
- Use a least-privilege database connection for the audit. Do not place a
  connection string in a command argument, shell history, artifact, or log.
- Re-fetch the provider menu when generating the audit. Provider menus are
  time-varying; do not reuse an earlier raw response.
- Produce one artifact per menu source and review it in its own issue/PR.

## Generate the read-only draft

Run:

```bash
pnpm canteen:identity-transition:audit -- --source-id <source-uuid>
```

The command prints a version-5 JSON draft. It contains only the source locator
and its non-reversible configuration fingerprint, bounded menu facts, current
CUpedia UUIDs, before/after fingerprints, and empty decisions. It omits source
configuration, raw provider payloads, errors, credentials, votes, comments, and
user data. Audit generation fails closed if either side exceeds 500 identities;
do not raise that bound without separately reviewing the provider scope.

The audit boundary retains historical period-scoped Aigens IDs as evidence.
They are aliases of the bare backend product ID, but ordinary synchronization
still rejects them so it cannot silently choose among existing UUIDs.

`snapshotCompleteness` is fingerprinted with the audit and incoming snapshot.
Apply rejects a value that differs from the provider boundary. A reviewer cannot
promote a partial menu observation to `complete` by editing the artifact JSON.

Save the output under a reviewed operations-artifact path. The empty decision
arrays are intentionally invalid for a non-empty diff, so generation alone can
never authorize a write.

For Aigens, the audit also contains bounded `scopeEvidence`: requested external
store ID, provider store/menu names, declared provider/category period codes,
and category/group counts. The fetch rejects mismatched, archived, terminated,
slim, undeclared-period, or unbounded responses. Scope evidence is part of the
incoming fingerprint, but it does not turn an ordering observation into a full
catalog.

## Review every identity change

Approve every replacement, canonicalization, and merge exactly once:

- `replacements`: a stable logical dish whose new provider ID must inherit the
  listed CUpedia UUID. Record a concise evidence-based `rationale`.
- `canonicalizations`: one historical Aigens period alias converging to its
  bare backend ID. Review these even when the current observation does not
  contain the dish, so the same UUID remains reactivatable later.
- `merges`: Aigens period aliases that the reviewer has confirmed are one
  backend dish. Explicitly select the surviving UUID and every retired UUID,
  including groups absent from the current observation.
  Votes and comments move to the survivor; duplicate votes from the same actor
  may be deduplicated only when their values agree. Conflicting votes abort the
  transaction. Retired UUID rows remain stored but become detached and
  unavailable.
  Audit `additions` and `removals` remain bounded diagnostic facts, not decisions.
  The ordinary partial sync creates observed new identities and does not change an
  absent identity's activity. Do not approve an audit containing `ambiguities`;
  investigate provider semantics instead. Candidate mappings are evidence for
  review, not automatic approval.

When one complete, catalog-scoped published iCHEF menu replaces every snapshot
UUID, repeated dish names may still represent distinct lunch and dinner setting
items. A partial or meal-period-scoped observation never receives this
authority. The audit may split such a same-name group only when meal periods and
canonical prices form a complete one-to-one mapping. These mutable facts are
review evidence, not a new identity rule: every resulting old snapshot UUID to
`ichefUuid` replacement still requires an explicit reviewed decision. Any
duplicate, incomplete, or many-to-many fact match remains an ambiguity and
fails closed.

## Apply the reviewed artifact

With the separately reviewed artifact checked out and the write credential
provided outside command arguments, run:

```bash
pnpm canteen:identity-transition:apply -- \
  --source-id <source-uuid> \
  --artifact <reviewed-artifact.json>
```

Application re-fetches the provider menu, then locks the canteen, source, and
existing menu rows in that order. The canteen parent lock also serializes new
menu-item inserts, which cannot be covered by existing-row locks. Concurrent
menu edits complete before the artifact is verified or wait until the
transition commits; they cannot be silently overwritten. The transition
also waits for any in-flight public vote/comment transaction holding a shared
menu-row lock; later public history writes recheck availability after the
transition and reject retired UUIDs. The transition
fails before menu writes if the source configuration, current menu projection,
incoming projection, artifact version, decisions, or ambiguity status differs
from the reviewed artifact. Successful replacements and reviewed merges update
the existing rows and UUID-bound history in one transaction.

The transition path is available only when the ordinary evaluator reports
product-identity churn or the audit contains historical Aigens aliases/merges.
Version 5 resolves only reviewed identity changes. It cannot clear conflicts,
authorize deactivation from absence, or authorize a snapshot blocked only for
suspicious drop. Version 4 is retained solely to replay already-reviewed legacy
artifacts; do not issue new version-4 approvals.

## Verify and resume rollout

After applying all reviewed artifacts:

1. Run the ordinary controlled synchronization from the rollout procedure.
2. Require each audited source to report `applied` or `unchanged` through the
   normal evaluator; do not add a threshold override.
3. Compare public UUIDs, prices, meal periods, and additions with the reviewed
   identity mappings; confirm identities absent from the observation were not
   deactivated.
4. Keep recurring synchronization disabled if any source remains blocked or an
   artifact becomes stale.
