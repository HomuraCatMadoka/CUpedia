# ADR 0014: External menu sync preserves dish identity and history

## Status

Accepted

## Context

External ordering systems publish complete menu snapshots. Re-importing those
snapshots as inserts creates duplicates. Deleting the old menu first is worse:
votes and comments reference menu item IDs with cascading foreign keys, so a
replacement import destroys the dish history.

Names are not stable external identities. They can be corrected or renamed, and
the same name may appear in more than one meal period.

## Decision

1. An externally managed menu item stores `externalSource` and `externalKey`.
   Their non-null pair is unique within a canteen. The source adapter builds a
   key from the upstream product ID and the CUpedia meal period.
2. Sync is a two-stage admin operation: preview a deterministic plan, then apply
   the same snapshot in one transaction. A conflicting legacy-name match blocks
   the entire apply.
3. Existing source-bound rows are updated in place. Missing rows become
   `isAvailable = false`; they are not deleted. A later snapshot can reactivate
   the same row and recover its public vote/comment history.
4. A first migration may explicitly set `takeOverLegacyItems: true`. This makes
   unmatched, source-less legacy rows unavailable. The preview must expose every
   affected row before apply.
5. Public menu reads and new vote/comment writes only accept available items.
   Historical rows remain available to server-side admin workflows.

## Consequences

- Upstream renames and price changes preserve the CUpedia menu item UUID.
- Votes and comments survive temporary or permanent removal from a source menu.
- Manual items and items managed by another source remain untouched unless an
  explicit first takeover is requested.
- Sync payloads need stable upstream IDs; name-only scraped spreadsheets are not
  safe for recurring synchronization.
