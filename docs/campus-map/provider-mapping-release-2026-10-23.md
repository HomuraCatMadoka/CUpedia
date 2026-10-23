# Campus Map place entrances — 2026-10-23

Issue [#929](https://github.com/HomuraCatMadoka/CUpedia/issues/929) covers six
AMap entrances that previously opened a transient reference card even though
CUpedia already contained the Building or service. This change prepares their
exact-ID mappings and simplifies the remaining reference-card lookup path.
**Production application and post-deployment acceptance are pending.** Merging
the UI change alone does not install provider mappings in the production registry.

## Mapping decisions

The release manifest is
[`data/amap-provider-mappings-2026-10-23.json`](data/amap-provider-mappings-2026-10-23.json).
Its target UUIDs are the production identities linked and inspected in #929.
The complete provider IDs below were captured from real AMap JSAPI 2.0
`hotspotclick` events on 2026-10-23, not inferred from names or proximity.

| Provider label                    | Exact AMap ID | Canonical target                                | Local rehearsal result                                                   |
| --------------------------------- | ------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| 大学保健医疗中心                  | `B073C0328Q`  | Building `a8bfebbd-87bf-5ac9-a089-446c4198e38d` | Direct Building card; outpatient and dental buttons in the first screen  |
| 大学保健处-牙医                   | `B0LKXDMIQV`  | Place `0f7d7cc3-07a9-43a1-93c4-fef56f1ae299`    | Direct Dental Service card                                               |
| 游泳池                            | `B0J2R1VCLC`  | Place `e6209a52-f7d2-4edf-820d-50630fff480c`    | Direct University Swimming Pool card                                     |
| 李兆基楼                          | `B0LA5CTLBJ`  | Building `9c77d3f7-37d1-504f-a0b6-51f536a3ff7d` | Direct directory with 28 classrooms                                      |
| 蒙民伟工程学大楼                  | `B0HUNZACGR`  | Building `c2ddb931-ae2e-5804-a949-9d9a4432b139` | Direct directory with 14 classrooms                                      |
| 庞万伦学生中心                    | `B0FFFSBNZR`  | Building `c25657cd-8d47-5e20-bdd5-8da984f77775` | Direct directory with 13 common spaces                                   |
| 康本国际学术园 (existing control) | `B0FFFS94ZL`  | Building `545893b6-b89b-5067-aba0-c86518aa8fa8` | Existing direct entrance preserved                                       |
| 何草 (unresolved control)         | `B0L6ARP6GN`  | No reviewed target                              | Remains a transient reference; explicit search does not create a mapping |

The health-centre label identifies the Building. It is not permanently equated
with outpatient care. Dental Service retains its existing health-centre
containment and unknown indoor position. No Building, Place, floor, fact, or
canonical coordinate is created or changed by this release.

The manifest records source access, SDK observation, and review dates separately.
Its `reviewedBy` names the Codex evidence review performed for this implementation;
it does not claim a human approval or production release. Maintainer review and
the trusted operator's production application remain outstanding. YIA's existing
September provenance is preserved rather than replaced by the October observation.

## User-visible behavior

- Reviewed service labels open their existing Place; reviewed Building labels
  open the existing directory. All entrances use the canonical URL identity.
- A small Building directory containing only health services shows service
  buttons together, without a redundant unknown-floor section. Returning from
  a service restores the Building and the chosen button's focus.
- An unmapped label offers **查找本站已有地点** as its primary action. That action
  searches the visible label through normal CUpedia search. Existing explicit
  Building suggestions remain available and **新增设施** is secondary.
- The selected service marker initially stays at the clicked provider label and
  says **高德标签位置 · 非实测服务位置**. Reclicking that marker or expanding the
  card preserves the feedback. Locate, navigation, history restoration, and
  refresh use canonical geometry. Provider click coordinates are neither saved
  in the URL nor written to facts or Building anchors.

## Local registry rehearsal

The implementation was checked at `http://localhost:3000` in worktree
`fix/map-place-entry-929`, based on main
`75e5b30ff8d532b7f5e89b391ec907c0aac3d5f9`, with this PR's changes. This was a
local development deployment, not a production deployment SHA.

An isolated local database was cloned from the existing Campus Map QA snapshot
and migrated. Existing QA databases were not reset. The snapshot has the same
Building UUIDs but different service UUIDs, so a disposable local manifest used:

| Service                                                | Local UUID (not used by the checked-in production manifest) |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| Dental Service                                         | `2fa4ba22-8795-4056-bf3e-b21edba243d2`                      |
| University Swimming Pool                               | `f974594b-23b4-48e1-83c2-92c5f81b4614`                      |
| Outpatient Service (directory control; no new mapping) | `5a550962-4d51-4765-9602-c5e64205989d`                      |

YIA was first installed as a local prerequisite through the formal registry,
using its original September source and reason. The full September rehearsal
manifest initially refused the snapshot's unrelated Science Centre row with
`mapping-audit-missing`; no audit record was fabricated or bypassed. A manifest
limited to the required YIA prerequisite then succeeded.

The October local manifest used version `2026-10-23.1-local-qa` and hash
`f17a723ec24e4f02b3ffc86fd51e5f7a051a811766205a89446460e5850e3153`.
The formal CLI and real registry/database path reported:

| Operation        | Changed | Verified |
| ---------------- | ------- | -------- |
| First apply      | 6       | 8        |
| Repeated apply   | 0       | 8        |
| Read-only verify | 0       | 8        |

The eight checks cover six bindings, the existing YIA binding, and the unbound
negative control. This demonstrates local lifecycle audit, exact resolution,
and a zero-write retry. It does not establish the current production registry
state. The production-target manifest passed strict validation with hash
`4be62e9744ffe447a4093c4dc3254f6144cdd6f8cee3f5ebadcf69290770ecaf`.

## Browser acceptance

Real AMap canvas clicks were exercised on desktop (1280 × 720) and mobile
(390 × 844). All six rows and both controls above produced the stated result.
A temporary local camera selector made the areas reachable, and an event readout
captured the full IDs and observation times. Both helpers were removed from the
source before final validation; no synthetic hotspot IDs were used for these
browser checks.

Additional checks passed:

- Medical centre → outpatient → return to Building, with both services visible
  in the mobile first screen and focus restored on return.
- Dental hotspot, search, medical category, and refreshed canonical URL resolve
  to the same local Dental Service UUID. Phone and official-details actions remain
  available. The native operating-system share dialog was not verified; canonical
  share serialization remains covered by the existing automated tests.
- Swimming-pool hotspot and sports category resolve to the same local Place UUID.
- Browser Back restores the medical category; closing it returns to the map.
- The unresolved 何草 label retains a reference card and the base URL. Its lookup
  action opens a search for 何草 without starting Add or inventing an identity.

The regression tests cover compact medical entrances and return, explicit lookup
from a transient card, and provider marker feedback across reclick, sheet
expansion, Locate, and history restoration without changing canonical geometry.

## Verification record

- `pnpm install --frozen-lockfile`: passed; no dependency or lockfile change.
- `pnpm exec drizzle-kit migrate`: passed against the isolated local clone;
  this PR adds no schema or migration.
- Targeted runtime, AMap runtime, and hotspot tests: 187 passed before the final
  marker-reclick/history cases. The two added feedback cases were observed
  failing before the fix and passing afterward; the full suite includes them.
- `pnpm lint`: passed with 0 errors and 13 warnings in unchanged files.
- `pnpm typecheck`: passed.
- Initial `pnpm test`: two unrelated 5-second timeouts in `eslint-config` and
  `canteen-menu-view`; their focused rerun passed all 27 tests. Final
  `pnpm test --maxWorkers=2`: **340 files / 3,088 tests passed**, 32 files / 429
  tests skipped by the existing environment gates. No test timeout was relaxed.
- Strict production-manifest validation and the local registry apply/reapply/
  verify sequence passed as recorded above. Desktop/mobile checks passed.
- `git diff --check`: passed. Build and full Playwright suite were not run;
  there are no dependency or build-configuration changes, and the affected
  interaction was checked with the live SDK manually.

## Production handoff

Review the checked manifest, then use the existing release command with the
production database and a trusted administrator in the operator environment:

```bash
pnpm campus-map:provider-mapping-release -- validate \
  docs/campus-map/data/amap-provider-mappings-2026-10-23.json

CAMPUS_MAP_PROVIDER_MAPPING_RELEASE_ACTOR_ID=<trusted-production-admin-uuid> \
  pnpm campus-map:provider-mapping-release -- apply \
  docs/campus-map/data/amap-provider-mappings-2026-10-23.json

CAMPUS_MAP_PROVIDER_MAPPING_RELEASE_ACTOR_ID=<trusted-production-admin-uuid> \
  pnpm campus-map:provider-mapping-release -- verify \
  docs/campus-map/data/amap-provider-mappings-2026-10-23.json
```

`apply` performs full target, provenance, existing-mapping, and unresolved-control
preflight before issuing registry commands. Conflicts or missing audit history
must be investigated; do not overwrite or guess a replacement target. Keep
credentials and the operator UUID out of the manifest and logs.

After application, record the production deployment SHA, manifest hash, command
results, and repeat the desktop/mobile click and canonical-entrance checks before
closing #929. No production mapping write was performed during this PR.
