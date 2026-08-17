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

The command prints a version-4 JSON draft. It contains only the source locator
and its non-reversible configuration fingerprint, bounded menu facts, current
CUpedia UUIDs, before/after fingerprints, and empty decisions. It omits source
configuration, raw provider payloads, errors, credentials, votes, comments, and
user data. Audit generation fails closed if either side exceeds 500 identities;
do not raise that bound without separately reviewing the provider scope.

The audit boundary retains historical period-scoped Aigens IDs as evidence.
They are aliases of the bare backend product ID, but ordinary synchronization
still rejects them so it cannot silently choose among existing UUIDs.

`snapshotCompleteness` is fingerprinted with the audit and incoming snapshot.
Apply rejects a value that differs from the provider boundary. In particular,
PinMe remains `partial` until its adapter can attest a full-catalog response; a
reviewer cannot promote it to `complete` by editing the artifact JSON.

Save the output under a reviewed operations-artifact path. The empty decision
arrays are intentionally invalid for a non-empty diff, so generation alone can
never authorize a write.

For Aigens, the audit also contains bounded `scopeEvidence`: requested external
store ID, provider store/menu names, declared provider/category period codes,
and category/group counts. The fetch rejects mismatched, archived, terminated,
slim, undeclared-period, or unbounded responses before it can label the snapshot
complete. Scope evidence is part of the incoming fingerprint.

## Review every changed identity

Classify every old and new provider identity exactly once:

- `snapshotScope`: compare the fingerprinted `scopeEvidence` with the intended
  store and menu periods. Set to `complete` only when the store/menu names,
  external store ID, provider/category period codes and bounded catalog counts
  agree with the intended source; otherwise record `wrong-or-incomplete` and do
  not apply the artifact.

- `replacements`: a stable logical dish whose new provider ID must inherit the
  listed CUpedia UUID. Record a concise evidence-based `rationale`.
- `canonicalizations`: one historical Aigens period alias converging to its
  bare backend ID. Review these even when the complete snapshot no longer
  contains the dish, so an unavailable survivor remains reactivatable later.
- `merges`: Aigens period aliases that the reviewer has confirmed are one
  backend dish. Explicitly select the surviving UUID and every retired UUID,
  including groups absent from the current complete snapshot.
  Votes and comments move to the survivor; duplicate votes from the same actor
  may be deduplicated only when their values agree. Conflicting votes abort the
  transaction. Retired UUID rows remain stored but become detached and
  unavailable.
- `additions`: an expected new provider identity that may create a new UUID.
- `removals`: an expected discontinued identity whose existing UUID may become
  unavailable. It is deactivated, never deleted.
- `ambiguities`: old/new identities that the reviewer cannot safely classify as
  a one-to-one replacement, including renamed split/merge cases the deterministic
  audit could not infer. Record the related IDs and rationale; the artifact
  remains non-executable while this list is non-empty.

Do not approve an artifact containing audit or reviewer `ambiguities`.
Investigate snapshot scope or provider semantics instead. Candidate mappings are
evidence for review, not automatic approval.

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
product-identity churn. A complete artifact may resolve that exact snapshot's
identity-churn and suspicious-drop observations because every removal and the
snapshot scope were reviewed. It cannot clear conflicts or authorize a snapshot
that was blocked only for suspicious drop.

## Verify and resume rollout

After applying all reviewed artifacts:

1. Run the ordinary controlled synchronization from the rollout procedure.
2. Require each audited source to report `applied` or `unchanged` through the
   normal evaluator; do not add a threshold override.
3. Compare public UUIDs, prices, meal periods, additions, and deactivations with
   the reviewed artifacts.
4. Keep recurring synchronization disabled if any source remains blocked or an
   artifact becomes stale.
