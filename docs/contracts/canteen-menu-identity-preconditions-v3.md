# Canteen menu identity preconditions v3

- Contract identifier: `canteen-menu-identity-preconditions/v3`
- Report schema: `canteen-menu-identity-preflight-report/v2`
- Target migration: GitHub issue #643 (contract corrected by #679)

This contract keeps the v2 report shape and safety checks. It changes one
identity judgment: an Aigens `external_product_id` containing the historical
`#offering-period=` suffix is migration evidence, not a supported runtime
identity.

The v1 and v2 fixtures remain immutable historical records. The current matrix
in `tests/db/fixtures/canteen-menu-identity-preflight-v3.json` supersedes their
old Aigens-safe expectation. PinMe, iChef, and Qmai historical shadow formats
remain supported when they agree with the authoritative identity.

## Runtime boundary

- New Aigens snapshots identify a dish by the bare backend product ID.
- Ordinary synchronization does not accept period-scoped Aigens identities.
- The preflight reports a period-scoped persisted identity as
  `ROLLOUT_SHADOW_MISMATCH` and returns `PREFLIGHT_UNSAFE`.
- Only an audited identity transition may canonicalize or merge those rows.
- After transition, a production query for Aigens product IDs containing
  `#offering-period=` must return zero rows.

All other v2 preconditions, sanitization guarantees, result/exit codes, and the
read-only transaction invariant remain unchanged.
