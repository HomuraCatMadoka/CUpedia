# ADR 0026: Refresh current menus across provider publication windows

## Status

Accepted

## Context

ADR 0014 treated breakfast, lunch, and dinner as both public UI scopes and
recurring synchronization completion windows. Production observation of PINME
store 5198 disproved that equivalence. At about 11:36 HKT the official customer
page exposed a 61-item noon publication; at about 15:35 HKT the same broad
`lunch` UI period exposed a 39-item afternoon-tea publication. Only 19 product
IDs overlapped. The official frontend does not send a requested observation
time: `/api/home/product-menus` selects the current `menu_group` on the server.

A single successful lunch run therefore cannot drain lunch for the rest of the
window. Waiting for tomorrow leaves CUpedia stale, while importing every product
from PINME's broad `group` pool invents a catalog that the customer page did not
publish. Treating the 42 missing noon IDs and 20 new tea IDs as unexplained bulk
identity churn also blocks a real, provider-declared publication transition.

Breakfast has a related observation-validity boundary. Its logical comparison
window starts at midnight, but a pre-opening read must remain diagnostic and
must not drain the authoritative 08:17 observation.

## Decision

1. A public meal period and a provider publication window are separate concepts.
   Breakfast, lunch, and dinner remain CUpedia UI scopes. A provider may publish
   several current menus inside one scope.
2. A valid meal-period observation immediately patches only that period. Present
   identities gain it, missing managed identities lose only it, and other
   configured periods remain unchanged. Losing the last current period makes an
   item unavailable without deleting its UUID or history.
3. Meal-period observations may recur within one coarse period. The production
   workflow wakes every 30 minutes from 08:17 through 23:47 HKT, covering the
   whole claimable dinner window. A scoped success becomes due after a validated
   provider boundary or a 45-minute fallback, whichever comes first, but never
   less than 10 minutes after its preceding success. Queue timing means the
   practical maximum staleness is normally about one hour. A tick with no due
   source makes no provider request. Catalog observations remain one-shot within
   a coarse period.
4. Refresh hints are bounded, validated, and advisory. PINME may contribute
   service-window boundaries from both the selected menu and its broad group
   metadata, but only products referenced by the current `menu_group` are menu
   authority. Broad-pool products are never imported merely because their time
   metadata was useful for scheduling.
5. PINME snapshots record a deterministic key for the current selected
   publication plus publication IDs and windows. When the key changes, the
   current-activity projection may accept a large new-and-missing composition
   change as a publication switch. One-to-one same-name product-ID replacement,
   malformed identity, and reconciliation conflicts still fail closed before
   that relaxation. Without explicit evidence, the existing bulk churn guard
   remains in force.
6. During rollout, an older PINME snapshot without the new key can compare its
   already-recorded referenced group IDs and service windows with the new
   observation. This compatibility path can prove the first noon/tea switch; it
   does not infer a transition from item counts or names.
7. Raw snapshots retain their provider-declared completeness, observation scope,
   database observation time, and scope evidence. Derived current-activity
   authority is not persisted as a complete catalog. An observation outside its
   claim-validity boundary is diagnostic only and cannot project activity or
   drain the later scheduled cycle.

This decision supersedes ADR 0014 decisions 5 and 11, and narrows decision 8 for
an explicit provider publication transition. All other ADR 0014 identity,
history, audit, and transaction decisions remain in force.

## Consequences

- The public menu can follow noon, afternoon-tea, and similar same-period
  publication changes without provider-specific cron edits or manual data work.
- Scoped providers receive low-frequency reads throughout operating hours;
  GitHub scheduling remains bounded but is not real-time.
- Accepted observations and inactive rows accumulate as history. A naturally
  reappearing external product restores the same CUpedia UUID.
- A provider that exposes no trustworthy publication identity can still refresh,
  but an unexplained simultaneous bulk ID replacement remains review-required.
- No schema migration is required; new evidence is stored in the existing JSON
  snapshot field.
