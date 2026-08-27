# ADR 0032: Audit canonical dish identity evolution

## Status

Accepted

## Context

ADR 0031 separates a user-facing dish UUID from provider offering IDs. That
model still needs deterministic rules when provider names change or when old
production rows already represent one dish with several UUIDs. Choosing a UUID
inside ordinary reconciliation without moving user history would split or lose
votes and comments. Automatically enabling a new merge rule before inspecting
production would also make the first deployment an unreviewed data migration.

## Decision

1. A pure identity-evolution module compares the current canonical/offering
   state with the new menu projection and returns rename, split and merge facts.
   The sync transaction evaluates normal safety rules against the projected
   state before it persists any identity change.
2. A dish with one remaining offering keeps its UUID when that offering is
   renamed. If aliases under one UUID diverge, the alias that retains the
   current normalized name keeps the UUID and changed aliases split from the
   observation time. For a complete catalog in which every alias changed, the
   earliest provider offering anchors the existing UUID; a partial observation
   cannot discard an unobserved active alias.
3. When several existing UUIDs converge on one normalized name, the earliest
   `canteen_menu_items.created_at` survives; UUID text is the deterministic
   tie-breaker. All provider offerings and comments move to the survivor.
   Candidate names come from stored canonical state as well as the current
   observation, so duplicate groups that are already fully inactive still
   converge during the first enabled sync.
4. Each voting actor has one effective vote after a merge. The row with the
   latest `updated_at` survives; `created_at` and vote UUID break exact ties.
   This applies equally to logged-in and anonymous actors.
5. Retired UUID rows are not deleted. They lose source ownership, become
   unavailable, and remain queryable. Immutable rename/split/merge records in
   `canteen_menu_identity_transitions` preserve the direction, normalized names
   and affected provider IDs. Each record has a SHA-256 event key derived from
   the source observation and exact transition fact: a retry is idempotent, but
   a later transition along the same UUID/name route remains a distinct event.
6. Identity evolution is idempotent and runs under the existing canteen/source/
   item mutation locks. A thrown error rolls back offering reassignment, user
   history changes, retired rows and audit records together.
7. The rollout is gated by the `site_settings` key
   `canteen_menu_identity_evolution`. Missing or non-`enabled` values retain the
   fail-closed ADR 0031 behavior. Issue #785 may set it to `enabled` only after
   reviewing a fresh read-only production dry-run. New code can therefore be
   deployed and verified without silently converging production data.

## Consequences

- Name changes no longer require a manual provider-specific identity artifact.
- Splits preserve all history before the split on the original UUID; new
  history starts on the new UUID.
- Merges keep user-visible history and provide a database redirect/audit fact
  without exposing retired rows in the public menu.
- A failed transaction needs no repair. After a successful production merge,
  emergency containment is to disable the rollout setting and stop new
  identity writes; restoring the exact pre-merge state uses the pre-activation
  Supabase backup/PITR point and the immutable dry-run/audit evidence rather
  than an unsafe ad-hoc reverse merge.
