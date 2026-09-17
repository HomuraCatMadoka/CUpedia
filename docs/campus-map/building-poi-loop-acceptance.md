# Building–POI interaction acceptance

Status: Research snapshot
Last verified: 2026-09-16

This snapshot separates application behavior from production mapping data for
issue [#916](https://github.com/Algebra-FUN/CUpedia/issues/916). A successful QA
fixture is not evidence that a real AMap point of interest (POI) has been
reviewed and mapped.

## Production baseline

- The active production deployment inspected for this issue was deployment
  `6473117113`, commit
  [`6d93cd1e84d5c80806525f87dfbc9a1df5256678`](https://github.com/Algebra-FUN/CUpedia/commit/6d93cd1e84d5c80806525f87dfbc9a1df5256678),
  created at `2026-09-16T03:25:59Z`. Its main CI run passed.
- The real AMap hotspot “科学馆北座高锟楼” opened the canonical 高锟楼 Building
  card. This proves that an exact reviewed mapping can enter the canonical
  scene, but that Building currently has no published indoor facilities.
- The canonical 康本国际学术园 (YIA) directory contains floor 4 and YIA406.
  Search can complete Building → floor → room → Back while preserving the
  Building selection, floor, focus, and URL.
- The real AMap hotspot “康本国际学术园” opened a transient “高德地图地点” card
  with an explicit suggestion to view the canonical Building. Therefore the
  production hotspot is not currently pre-mapped, and the UI correctly does
  not infer identity from its name or coordinates.
- Repeatedly clicking a four-position category cluster could stop changing the
  camera. Some single cluster members also retained AMap's unnamed default blue
  marker when AMap rounded the submitted coordinate.

The missing production YIA link is a mapping-data gap, not permission to add a
name, distance, or coordinate heuristic. The UI does not expose the hotspot's
complete provider object ID. A human must capture and review that exact ID under
[#767](https://github.com/Algebra-FUN/CUpedia/issues/767) before a production
mapping can be released.

## Local QA follow-up — 2026-09-16

- The follow-up ran in a local QA worktree with a real AMap Web key and a local
  copy of the production public Campus Map projection. It made no writes to the
  production Supabase project.
- The live SDK reports the rendered cluster Marker in `event.marker` and the
  member points in `event.clusterData`. The adapter had treated `event.marker`
  as the member array, so it returned before producing a cluster intent. The
  full runtime test used the same incorrect shape and therefore stayed green.
- After correcting the adapter and test contract, pointer activation and native
  button Enter/Space activation each advanced or reclustered the clicked group.
  Pointer and Enter activation of an ordinary marker opened the same canonical
  Building target.
- This verifies application behavior against production-shaped public rows. It
  does not verify or create a production provider mapping; the YIA release gate
  below remains unchanged.

## What this change proves

- Cluster clicks advance the zoom by one level instead of fitting the same
  bounds again. If multiple canonical targets share one unsplittable position,
  the marker opens a named, keyboard-accessible member list.
- Provider coordinate rounding is tolerated only when reconnecting an AMap
  marker to the canonical point submitted by this render. This presentation key
  never creates Place-to-Building membership. An unmatched callback receives a
  named custom fallback instead of AMap's default blue pin.
- The complete selected label chooses a side that avoids the map edge, search,
  categories, map controls, notices, and the side or bottom card. Building and
  Place identity remains unchanged by this layout calculation.
- The Playwright exact-provider loop uses isolated QA rows to complete Building
  → floor → room → Back. It proves the exact-ID interaction contract and return
  behavior without adding or claiming any production mapping.

## Production mapping release gate

Before claiming a real YIA end-to-end sample, a reviewer still needs to:

1. capture the complete current AMap provider object ID for the intended YIA
   Building hotspot;
2. verify that object on the current map rather than copying a truncated label
   or an old screenshot;
3. submit the reviewed exact mapping through the #767 mapping workflow with
   provenance; and
4. re-run hotspot → YIA → floor 4 → YIA406 → Back in production and record the
   deployed commit.

Until those steps finish, production must keep the hotspot transient and offer
the canonical Building only as an explicit user choice.
