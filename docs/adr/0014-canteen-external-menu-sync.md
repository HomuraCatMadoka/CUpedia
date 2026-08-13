# ADR 0014: External menu sync preserves dish identity and history

## Status

Accepted

## Context

External ordering systems publish complete menu snapshots. Re-importing those
snapshots as inserts creates duplicates. Deleting the old menu first is worse:
votes and comments reference menu item IDs with cascading foreign keys, so a
replacement import destroys the dish history.

Names and meal periods are not stable external identities. Both can change,
and the same product can be offered in several periods without becoming a new
CUpedia dish.

## Decision

1. An externally managed menu item stores `menuSourceId` and
   `externalProductId`. Their non-null pair is unique. A composite database
   foreign key also requires the menu source and item to belong to the same
   canteen. Name, pricing, classification, order and meal periods are mutable
   attributes and never form identity.
2. Sync is a two-stage admin operation: preview a deterministic plan, then apply
   the same snapshot in one transaction. A conflicting legacy-name match blocks
   the entire apply.
3. Existing source-bound rows are updated in place. Missing rows become
   `isAvailable = false`; they are not deleted. A later snapshot can reactivate
   the same row and recover its public vote/comment history.
4. A first migration may explicitly set `takeOverLegacyItems: true`. This makes
   unmatched, source-less legacy rows unavailable. The preview must expose every
   affected row before apply, and a persisted timestamp prevents the same source
   from performing another legacy takeover.
5. Public menu reads and new vote/comment writes only accept available items.
   Historical rows remain available to server-side admin workflows.
6. Product-ID churn is observed before aliasing is introduced. Each scheduled
   run stores bounded new/missing ID samples, counts and one-to-one same-name
   candidates. Suspected replacement or bulk churn fails closed: the last
   successful public menu remains visible and no vote/comment identity moves.

## Consequences

- Upstream renames and price changes preserve the CUpedia menu item UUID.
- Upstream meal-period changes preserve the same CUpedia menu item UUID.
- Votes and comments survive temporary or permanent removal from a source menu.
- Manual items and items managed by another source remain untouched unless an
  explicit first takeover is requested.
- Sync payloads need stable upstream IDs; name-only scraped spreadsheets are not
  safe for recurring synchronization.
- `externalSource` and `externalKey` remain rollout shadow columns for one
  compatibility release, but reconciliation does not read them as identity.
- Identity backfill and audited canteen provisioning use versioned Drizzle
  custom migrations because they must update existing UUID-addressed rows in
  place; generated schema DDL alone cannot express those data decisions.
