# Roll out canonical canteen identity evolution

Status: Proposed
Last verified: 2026-08-27

Issue #784 ships the transaction and audit model with production writes gated
off. Issue #785 owns approval and activation.

## Read-only dry-run

Run against the intended database:

```bash
pnpm canteen:identity-dry-run
```

The command starts a read-only transaction and prints every normalized-name
merge group, deterministic survivor UUID, retired UUIDs, provider product IDs,
comment moves and vote conflict/deletion/move counts. Its fingerprint excludes
the generation time, so two unchanged reports have the same SHA-256 value. It
does not change `site_settings`, menu rows, user history or audit rows.

The 2026-08-27 16:35 HKT production dry-run found 51 groups and 52 UUIDs to
retire. No affected group contained comments or votes, so the projected user
history impact was zero.

| Source     | Provider store   | Groups | UUIDs retired | Active rows before | Inactive rows before |
| ---------- | ---------------- | -----: | ------------: | -----------------: | -------------------: |
| mc-can     | iCHEF `UQftKWxU` |      6 |             6 |                 12 |                    0 |
| CU CAFE    | Aigens `112891`  |      2 |             2 |                  2 |                    2 |
| 開心軒茶社 | PINME `5203`     |      2 |             2 |                  4 |                    0 |
| ws-can     | PINME `4898`     |     37 |            38 |                 18 |                   57 |
| na-can     | PINME `5500`     |      4 |             4 |                  4 |                    4 |

Re-run the command immediately before approval. A changed fingerprint means the
report must be reviewed again.

## Activation owned by #785

1. Confirm migration 0098 and the application deployment are Ready.
2. Capture a Supabase backup/PITR restore point.
3. Run the production dry-run and attach its full output and fingerprint to
   #785. Confirm every survivor is the earliest `created_at` row.
4. Enable the rollout only with the exact reviewed fingerprint:

   ```bash
   pnpm canteen:identity-enable -- \
     --expected-fingerprint <reviewed-sha256> \
     --confirm-enable
   ```

   The command takes row locks on every enabled source, refuses to run while a
   live sync claim exists, recomputes the dry-run in the same serializable
   transaction, and changes `site_settings.canteen_menu_identity_evolution`
   only when the fingerprint is unchanged.

5. Trigger one menu drain. Stop if any source returns a new safety error.
6. Run the #785 invariants and a second dry-run:

   ```bash
   pnpm canteen:menu-invariants -- --strict
   pnpm canteen:identity-dry-run
   ```

   The second dry-run must contain zero merge groups. The invariant report must
   have `ok: true`; for each enabled source it reports configured-period
   freshness, snapshot-union/active/inactive counts, ambiguous or unmapped
   provider IDs, duplicate active normalized names, configuration-out periods,
   projection drift, source errors and live claims. Its top-level history totals
   let the reviewer compare menu-item, comment, vote and transition counts with
   the reviewed pre-activation plan.

## Acceptance sequence

1. Save the pre-activation dry-run JSON and invariant JSON on #785, together
   with the backup/PITR evidence and exact application commit.
2. Record the pre-activation total rows for menu items, comments, votes and
   identity transitions. The dry-run already states expected retired UUIDs,
   comment moves and vote deletions/moves.
3. After activation and one successful drain, require:
   - snapshot canonical union and public active UUIDs have no difference;
   - every snapshot product ID has exactly one canonical target;
   - no active normalized-name duplicate or configuration-out meal period;
   - the second identity dry-run has zero groups;
   - retired UUID rows remain present and inactive;
   - comment totals are unchanged, and vote totals changed only by the reviewed
     duplicate-vote deletion count;
   - identity-transition rows explain every retired UUID.
4. Check Cafe Tolo has no breakfast authority and inspect PINME `5203` and
   iCHEF `UQftKWxU` by normalized name, not price or provider product ID.
5. Repeat the strict invariant report after the next normal breakfast, lunch
   and dinner windows. The public page must show the selected period's latest
   successful time and warn when that HKT date is yesterday or older.

## Rollback and containment

- Any error inside one source sync rolls its entire identity change back.
- Before a successful activation, remove or change the rollout setting to stop
  all identity writes; ordinary sync returns to fail-closed behavior.
- After committed merges, first disable the setting and stop synchronization.
  Exact restoration uses the pre-activation Supabase backup/PITR point. The
  dry-run output and `canteen_menu_identity_transitions` rows identify every
  affected UUID and provider ID for verification. Do not hand-reverse only part
  of a merge because comments and latest-vote selection were atomic with it.
