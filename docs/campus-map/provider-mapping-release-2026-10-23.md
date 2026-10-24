# Campus Map place entrances — 2026-10-23

Issue [#929](https://github.com/HomuraCatMadoka/CUpedia/issues/929) covers six
AMap entrances that previously opened a transient reference card even though
CUpedia already contained the Building or service. This change prepares their
exact-ID mappings and simplifies the remaining reference-card lookup path.
**The six production mappings were applied on 2026-10-24.** The production
record below separates registry verification from browser acceptance; final
post-deployment acceptance is tracked in #929.

## Mapping decisions

The release manifest is
[`data/amap-provider-mappings-2026-10-23.json`](data/amap-provider-mappings-2026-10-23.json).
Its target UUIDs are the production identities linked and inspected in #929.
The complete provider IDs below were captured from real AMap JSAPI 2.0
`hotspotclick` events on 2026-10-23, not inferred from names or proximity.

| Provider label                    | Exact AMap ID | Canonical target                                | Local rehearsal result                                                   |
| --------------------------------- | ------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| 大学保健医疗中心                  | `B073C0328Q`  | Place `a1906459-8a4c-4433-a445-e60f6a92c795`    | Direct Outpatient Service card with booking, hours, and phone            |
| 大学保健处-牙医                   | `B0LKXDMIQV`  | Place `0f7d7cc3-07a9-43a1-93c4-fef56f1ae299`    | Direct Dental Service card                                               |
| 游泳池                            | `B0J2R1VCLC`  | Place `e6209a52-f7d2-4edf-820d-50630fff480c`    | Direct University Swimming Pool card                                     |
| 李兆基楼                          | `B0LA5CTLBJ`  | Building `9c77d3f7-37d1-504f-a0b6-51f536a3ff7d` | Direct directory with 28 classrooms                                      |
| 蒙民伟工程学大楼                  | `B0HUNZACGR`  | Building `c2ddb931-ae2e-5804-a949-9d9a4432b139` | Direct directory with 14 classrooms                                      |
| 庞万伦学生中心                    | `B0FFFSBNZR`  | Building `c25657cd-8d47-5e20-bdd5-8da984f77775` | Direct directory with 13 common spaces                                   |
| 康本国际学术园 (existing control) | `B0FFFS94ZL`  | Building `545893b6-b89b-5067-aba0-c86518aa8fa8` | Existing direct entrance preserved                                       |
| 何草 (unresolved control)         | `B0L6ARP6GN`  | No reviewed target                              | Remains a transient reference; explicit search does not create a mapping |

The medical-centre label is the clinic entrance and opens Outpatient Service;
the separate dental label opens Dental Service. This follows the requesting
user's explicit clarification of the two destinations. UMSO publishes separate
[medical](https://www.umso.cuhk.edu.hk/medical-service/) and
[dental](https://www.umso.cuhk.edu.hk/dental-service/) service information.
The existing health-centre Building remains the shared containment record;
neither entrance requires the user to choose a service from a Building card.
No Building, Place, floor, fact, or canonical coordinate is created or changed.

The manifest records source access, SDK observation, and review dates separately.
Its `reviewedBy` names the Codex evidence review performed for this implementation;
it does not claim a human approval or production release. PR #930 was subsequently
merged and the production release was applied as recorded below. YIA's existing
September provenance is preserved rather than replaced by the October observation.

## User-visible behavior

- Reviewed service labels open their existing Place; reviewed Building labels
  open the existing directory. All entrances use the canonical URL identity.
- Medical centre → Outpatient Service; dental label → Dental Service. Both
  immediately expose the relevant booking/contact information. Explicitly
  browsing the Building still uses the normal directory.
- An unmapped label offers **查找本站已有地点** as its primary action. That action
  searches the visible label through normal CUpedia search. Existing explicit
  Building suggestions remain available and **新增设施** is secondary.
- Places with an exact reviewed AMap mapping reuse the native basemap icon
  while browsing and are excluded from custom category clusters. Unmapped
  facilities retain their own markers, including neighbours in the same Building.
- A selected mapped Place always has one temporary outline and a compact name
  label, without a second category icon. Hotspot, search, category, Locate,
  restored history, and refreshed URLs all retain this selection feedback,
  even when AMap hides the native label at the current zoom. Closing the Place
  card removes the hint.
- A clicked provider position frames the current service card and selection
  hint, including after a resize, card expansion, or repeated hint activation.
  Its label says **地图位置参考 · 非室内精确位置**. Locate, navigation, history
  restoration, and refresh use canonical geometry; Building-only locations
  say **所属建筑 · 非室内精确位置**. Provider coordinates are neither saved in
  the URL nor written to facts or Building anchors.

## Local registry rehearsal

The implementation was checked at `http://localhost:3000` in worktree
`fix/map-place-entry-929`, based on main
`75e5b30ff8d532b7f5e89b391ec907c0aac3d5f9`, with this PR's changes. This was a
local development deployment, not a production deployment SHA.

An isolated local database was cloned from the existing Campus Map QA snapshot
and migrated. Existing QA databases were not reset. The snapshot has the same
Building UUIDs but different service UUIDs, so a disposable local manifest used:

| Service                  | Local UUID (not used by the checked-in production manifest) |
| ------------------------ | ----------------------------------------------------------- |
| Dental Service           | `2fa4ba22-8795-4056-bf3e-b21edba243d2`                      |
| University Swimming Pool | `f974594b-23b4-48e1-83c2-92c5f81b4614`                      |
| Outpatient Service       | `5a550962-4d51-4765-9602-c5e64205989d`                      |

YIA was first installed as a local prerequisite through the formal registry,
using its original September source and reason. The full September rehearsal
manifest initially refused the snapshot's unrelated Science Centre row with
`mapping-audit-missing`; no audit record was fabricated or bypassed. A manifest
limited to the required YIA prerequisite then succeeded.

The corrected local manifest uses version `2026-10-23.2-local-qa` and hash
`3756a5b9064dbaa90302e13e750c7026f89a60f72753fae929f640a91d549df3`.
The initial local rehearsal had six mappings, including a medical-centre
Building target. That target was removed through a formal audited `unlink`
after the user clarified the clinic entrance. The revised manifest uses a new
medical provenance reference and binds that label to the existing outpatient
Place. No production binding from the earlier version was applied.

| Operation on corrected local manifest       | Changed | Verified |
| ------------------------------------------- | ------- | -------- |
| Apply (other five bindings already present) | 1       | 8        |
| Repeated apply                              | 0       | 8        |
| Read-only verify                            | 0       | 8        |

The eight checks cover six bindings, the existing YIA binding, and the unbound
negative control. This demonstrates local lifecycle audit, exact resolution,
and a zero-write retry. It does not establish the current production registry
state. The production-target manifest `2026-10-23.2` passed strict validation
with hash `decfc25809308c0d6f41139dfa1fdb14a86e3b79343e577cdcf9c5aa673c0a5d`.

## Browser acceptance

Real AMap canvas clicks were exercised on desktop (1280 × 720) and mobile
(390 × 844). All six rows and both controls above produced the stated result.
A temporary local camera selector made the areas reachable, and an event readout
captured the full IDs and observation times. Both helpers were removed from the
source before final validation; no synthetic hotspot IDs were used for these
browser checks. After correcting the clinic target, both medical labels were
clicked again on desktop and mobile without temporary helpers; each opened its
own service directly.

Additional checks passed:

- Medical centre → Outpatient Service directly; dental label → Dental Service
  directly. No transient or Building directory card is shown between the click
  and the service details.
- The earlier zero-marker policy reproduced a P2 regression: a mobile Dental
  Service deep link opened the card while only the native medical-centre label
  was visible. The corrected policy keeps a temporary labelled selection outline,
  while ordinary browsing still reuses native icons. The classroom category
  retains its own unmapped facility markers and clusters.
- The corrected hint was verified with the real SDK at 390 × 844 and
  1280 × 720: the Dental deep link now shows **已选 · 牙科** even without a native
  dental label. Clicking the real dental/clinic labels places one hint at that
  hotspot; keyboard activation and resizing retain it without a category icon.
  Search, medical-category selection, Locate, refresh, card expansion, and
  browser Forward retain one hint with the appropriate position description.
  Close, Back to the category, and switching category remove it. Medical-category
  browsing has zero custom markers; the classroom control still has 257 results
  and 13 markers/clusters in the local view.
- Dental hotspot, search, medical category, and refreshed canonical URL resolve
  to the same local Dental Service UUID. Phone and official-details actions remain
  available. The native operating-system share dialog was not verified; canonical
  share serialization remains covered by the existing automated tests.
- Swimming-pool hotspot and sports category resolve to the same local Place UUID.
- Browser Back restores the medical category; closing it returns to the map.
- The unresolved 何草 label retains a reference card and the base URL. Its lookup
  action opens a search for 何草 without starting Add or inventing an identity.

The regression tests load the checked release manifest and verify both real
medical provider IDs open the correct service and telephone action in one click.
They also cover explicit lookup from a transient card, selection hints across
direct URLs, reclick, resize, expansion, Locate, and history restoration. The
hint is removed on dismissal; switching Places cannot reuse an earlier Place's
provider point. Unmapped neighbours in mixed Building clusters stay visible,
and canonical geometry remains unchanged.

## Verification record

- `pnpm install --frozen-lockfile`: passed; no dependency or lockfile change.
- `pnpm exec drizzle-kit migrate`: passed against the isolated local clone;
  this PR adds no schema or migration.
- Targeted marker-content, runtime, AMap runtime, and browse-layer tests:
  **214 passed**.
  Release-runner and hotspot tests also pass in the complete suite. Before the
  clinic correction, the checked-manifest clinic test failed by opening the
  Building while the dental case passed. Both now pass.
- `pnpm lint`: passed with 0 errors and 13 warnings in unchanged files.
- `pnpm typecheck`: passed after correcting the test map's overly narrow
  overlay type; the initial run identified three test-fixture type errors.
- Final `pnpm test`: **340 files / 3,095 tests passed**, 32 files / 429 tests
  skipped by the existing environment gates. No test timeout was relaxed.
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
closing #929. No production mapping write was performed while preparing PR #930.

## Production release — 2026-10-24

The production deployment serving `https://cupedia.org` was READY at commit
`dfa8fd6770d3fb89b1f907c221cfdad18d88d6bc` (PR #930). Manifest
`2026-10-23.2`, hash
`decfc25809308c0d6f41139dfa1fdb14a86e3b79343e577cdcf9c5aa673c0a5d`,
was applied to the `cupedia-sg` registry through the existing audited release
runner using a verified administrator. No credential or operator identifier is
part of this record.

| Operation        | UTC time | Changed | Verified |
| ---------------- | -------- | ------- | -------- |
| Apply            | 06:22:43 | 6       | 8        |
| Repeat apply     | 06:23:06 | 0       | 8        |
| Read-only verify | 06:23:15 | 0       | 8        |

Independent before/after snapshots show six new mappings and six lifecycle audit
events. Building, Place, and current-fact snapshots and the 288 fact revisions
are unchanged. YIA retains its September binding and provenance; 何草 remains
unbound. The clinic and dental Place records still share the health-centre
Building and retain their existing location precision.

Real production AMap clicks passed for all six new mappings on desktop
(1280 × 720) and mobile (390 × 844) viewports. Clinic, dental, and pool labels
open their respective Place cards directly. LSK, ERB, and PSC open directories
with 28 classrooms, 14 classrooms, and 13 common spaces respectively. Search,
the medical/sports category entrances, canonical URLs, refresh, Locate, card
expansion, and browser history preserve the checked identities and selection
hint behavior. Unmapped rooms such as LSK LT1 and PSC 204 retain their markers.

Acceptance also found a remaining reference-card bug: search for YIA, open its
Building, then click the unbound 何草 hotspot. Dismissing the Building restored
the previous search list over the reference-card title. The follow-up changes
this transition to the empty map scene before displaying the transient card,
without adding a history entry or publishing a provider identity. A component
regression and desktop/mobile browser tests cover the transition, explicit
lookup, and closing search. The component regression failed twice before the
fix and passed afterward. The production rerun and final closure decision are
recorded in #929 after deployment.

Follow-up validation passed: `pnpm lint` (the same 13 existing warnings),
`pnpm test --maxWorkers=2` (340 files / 3,095 tests; 32 files / 429 skipped),
and `pnpm typecheck`. The production-mode Playwright build passed and all
24 Campus Map runtime browser tests passed. The new tests' initial selector
expected a Building code that the search button does not display; correcting
the selector to its visible name resolved those two test failures. A resource-
contended parallel baseline run was stopped and the complete baseline rerun
serially without increasing timeouts. Manual real-SDK checks at
`http://localhost:3000` also passed at 1280 × 720 and 390 × 844, including
search → YIA → 何草 → explicit lookup → close search.

The native operating-system share dialog and physical mobile touch hardware
were not tested. Canonical share URLs were opened and refreshed; mobile checks
used a browser viewport. The production registry release does not depend on the
share-dialog integration.
