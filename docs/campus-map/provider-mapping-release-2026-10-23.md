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
it does not claim a human approval or production release. Maintainer review and
the trusted operator's production application remain outstanding. YIA's existing
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
- Places with an exact reviewed AMap mapping reuse the native basemap icon in
  every entrance: hotspot, search, category, Locate, restored history, and
  refreshed URL. They are excluded from custom selected markers and category
  clusters, including when they share a Building with unmapped facilities.
  Unmapped facilities retain their own markers. The service card identifies
  the current selection; native label visibility remains controlled by AMap's
  zoom and label layout.
- A clicked provider position only frames the current service card, including
  after a resize or card expansion. Locate, navigation, history restoration,
  and refresh use canonical geometry. Provider coordinates are neither saved
  in the URL nor written to facts or Building anchors.

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
- After removing duplicate markers, both medical labels were clicked again on
  desktop and mobile. Search, medical category, Locate, resize, card expansion,
  refresh, and browser Back all retained zero CUpedia map markers for these
  mapped services. The classroom category still rendered its own unmapped
  facilities (257 results and 13 visible markers/clusters in the local view).
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
They also cover explicit lookup from a transient card, native icon reuse across
direct URLs, reclick, resize, expansion, Locate, and history restoration, and
preserving unmapped neighbours in mixed Building clusters without changing
canonical geometry.

## Verification record

- `pnpm install --frozen-lockfile`: passed; no dependency or lockfile change.
- `pnpm exec drizzle-kit migrate`: passed against the isolated local clone;
  this PR adds no schema or migration.
- Targeted runtime, AMap runtime, and browse-layer tests: **209 passed**.
  Release-runner and hotspot tests also pass in the complete suite. Before the
  clinic correction, the checked-manifest clinic test failed by opening the
  Building while the dental case passed. Both now pass.
- `pnpm lint`: passed with 0 errors and 13 warnings in unchanged files.
- `pnpm typecheck`: passed.
- Final `pnpm test`: **340 files / 3,093 tests passed**, 32 files / 429 tests
  skipped by the existing environment gates. A run concurrent with lint and
  typecheck hit four existing 5-second test timeouts; focused reruns and the
  sequential full Ready run passed without relaxing a timeout.
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
