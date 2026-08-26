# ADR 0030: Stop scoped observations at bounded refresh horizons

## Status

Accepted

## Context

ADR 0026 made meal-period observations recur at provider publication
boundaries or after a 45-minute fallback throughout the enclosing breakfast,
lunch, or dinner period. This follows same-period publication changes, but it
also assumes another provider read can remain useful until the coarse period
ends.

Production disproved that assumption for PINME store 4899. A non-empty dinner
observation succeeded at 19:44 HKT while the bounded broad group pool showed
that its last service window ended at 20:00. Later scheduler wakes still used
the coarse dinner window, requested the provider after 20:00, received an empty
current menu, and correctly escalated the genuine failed observations through
the existing retry limit. The clocks, empty-menu guard, and retry policy each
performed their contracts; the scheduler lacked evidence for when recurring
reads had stopped being useful.

The broad group pool can describe future service windows without making its
products part of the customer-visible menu. A terminal scheduling hint must
preserve that distinction and fail closed when the provider evidence cannot
prove a same-day bound.

## Decision

1. Normalized snapshot scope evidence may carry a provider-neutral
   `refreshUntilMinute`: the last same-day HKT minute at which another provider
   read may be useful in the current coarse meal window. It is advisory
   scheduling evidence, not menu-content or absence authority.
2. PINME derives the hint from the maximum end time across its bounded broad
   group pool only when every group supplies a valid, non-empty, non-wrapping
   same-day service window. Products remain authoritative only when referenced
   by the current `menu_group`.
3. At or after a valid horizon, a previous meal-period success is not due for
   another observation in that coarse window. The scheduler makes no claim,
   provider request, run, snapshot, or menu projection from that wake. An
   initial observation with no preceding success remains governed by the
   ordinary coarse-window claim rules.
4. Before the horizon, validated publication boundaries, the ten-minute minimum
   repeat interval, and the 45-minute fallback from ADR 0026 continue to apply.
   Catalog observations remain one-shot.
5. Missing, malformed, out-of-range, ambiguous, incomplete, or cross-midnight
   horizon evidence is ignored. The existing ADR 0026 fallback remains in
   force. `EMPTY_PINME_MENU` remains a failed provider observation, and genuine
   failures before the horizon retain the three-attempt retry limit.
6. Provider adapters own provider-specific evidence normalization. The
   scheduler reads only the provider-neutral field and must not branch on a
   provider, store, canteen, or hard-coded operating time.

This decision narrows ADR 0026 decision 3 only after a successful scoped
observation carries a trustworthy terminal horizon. It extends ADR 0026
decision 4's advisory refresh evidence without changing its menu-authority
boundary. ADR 0028 and ADR 0029 continue to own clocks and transport evidence;
they do not decide whether a menu source is due.

## Consequences

- Late wakes no longer turn a legitimate provider closure into empty-menu
  failures or `MENU_SYNC_RETRY_LIMIT`, while failures inside the useful refresh
  interval remain visible.
- Historical snapshots and providers without a trustworthy horizon continue
  using the existing boundary and 45-minute fallback behavior.
- The last accepted menu remains intact after the horizon; stopping a read does
  not infer absence or deactivate an item.
- No schema migration is required because the hint uses the existing JSONB
  scope-evidence column.
