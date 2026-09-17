# Campus Map AMap provider mapping release — 2026-09-17

This is the reviewed operation record for issue #767. The checked-in manifest is
[`data/amap-provider-mappings-2026-09-17.json`](data/amap-provider-mappings-2026-09-17.json).
It contains complete provider object IDs and canonical UUIDs, but no AMap key,
security code, database URL, session, or other credential.

## Decision summary

| Decision        | AMap object  | Provider label      | Canonical target                                | Result                             |
| --------------- | ------------ | ------------------- | ----------------------------------------------- | ---------------------------------- |
| Bind            | `B0FFFS94ZL` | 康本国际学术园      | Building `545893b6-b89b-5067-aba0-c86518aa8fa8` | One reviewed release mapping       |
| Verify existing | `B0J2RXUQB6` | ScienceCentre科学馆 | Building `d0f66212-4138-5ab3-b8e5-04980cf64fb3` | Existing mapping must remain exact |

Formal release count: **1 Building mapping**. Existing mappings checked by the
manifest: **1**. Unresolved exact-ID candidates: **0**. Place mappings: **0**;
the observed hotspots identify Buildings, so this release does not invent an
AMap relationship for YIA 406, another room, or an indoor facility.

Both targets are existing Buildings from the reviewed official Building
bootstrap admitted after the #721 trigger. That checked bootstrap is the
current concrete Building scope inherited from #557; this release creates no
canonical Building or Place.

Science Centre is the required candidate from #767. A current real-SDK click
returned `B0J2RXUQB6`, matching the already reviewed Science Centre mapping.
Production hotspot, canonical search, and direct deep-link acceptance all
opened Building `d0f66212-4138-5ab3-b8e5-04980cf64fb3` without a transient
duplicate. The wider Science Centre, Charles Kuen Kao Building, and their
provider objects remain separate canonical identities.

## Evidence and review

The check ran on 2026-09-17 in the required detached worktree
`/Users/wangkunyu/CU-Claw/wt/campus-map-qa`, serially, with a real AMap Web key.
The QA database, login, and AMap configuration were preserved; no seed or
bootstrap command ran. A temporary local-only card field exposed the complete
`hotspotclick` object ID and was removed after capture.

For YIA, clicking the current provider label opened a transient AMap card with
ID `B0FFFS94ZL`. Searching the same loaded map opened the existing canonical
YIA Building. The decision uses the exact ID from the click event; matching
name and the official Building anchor are review evidence only. The same check
confirmed `B0J2RXUQB6` for Science Centre. The repository owner authorized
independent Codex Standards and Spec agents as the release review for this
issue.

The manifest records three different times separately: `accessedOn` is the
source access date, each evidence `observedAt` is the real SDK click time, and
approval `reviewedOn` is the human review date paired with `reviewedBy`. The
release must not reinterpret review time as source observation time or invent
timestamp precision that the original approval record did not capture.

## Fixed-QA release rehearsal

The checked post-review manifest passed the real registry and database path in
the fixed QA database. It uses schema/version
`cuhk-campus-map-provider-mapping-release/2` / `2026-09-17.3`, explicit source
observation and review dates, and exact provenance expectations for existing
mappings. The first `apply` reported `changed: 1` and `verified: 2`; repeating
the same manifest reported `changed: 0`; `verify` reported `changed: 0` and
`verified: 2`. All three runs used manifest hash
`2920f51f9b62d359b181eecc87ee6fe727c226a9d8b40a10ff0400f2c2c35893`.
This exercises the corrected provenance and lifecycle audit checks against the
stored Science Centre source and proves the checked manifest's zero-write
retry.

In the browser acceptance, canonical search, the real YIA AMap hotspot, and the
YIA deep link all opened Building
`545893b6-b89b-5067-aba0-c86518aa8fa8` with no transient duplicate. An
unrelated Panacea Lodge hotspot remained an AMap transient card. The final v2
rehearsal then unlinked both the temporary YIA mapping and the Science Centre
QA prerequisite through the formal registry. The public resolver returned
`null` for both and the QA mapping table returned to zero active rows. No seed
or bootstrap command ran.

## Release command

The release entry point accepts only an approved, strict manifest. It validates
every target and every current mapping before creating provenance or issuing a
command. A conflicting mapping, missing target, non-public Place, changed
existing mapping, mapped unresolved candidate, provenance conflict, or
unavailable registry stops the run.

A same-target row is not sufficient evidence of a successful release. The
runner also requires the active row's provenance to match the latest bind or
rebind event. A release mapping must additionally match this manifest's source
reference and reason. Existing prerequisite mappings must retain a complete
lifecycle event, actor snapshot, reason, and provenance link. Their reviewed
provider-candidate identity fields must also match the exact POI source in the
manifest. Both `apply` and read-only `verify` fail closed when that audit chain
or source metadata is absent or inconsistent.

```bash
pnpm campus-map:provider-mapping-release -- validate \
  docs/campus-map/data/amap-provider-mappings-2026-09-17.json

CAMPUS_MAP_PROVIDER_MAPPING_RELEASE_ACTOR_ID=<trusted-production-admin-uuid> \
  pnpm campus-map:provider-mapping-release -- apply \
  docs/campus-map/data/amap-provider-mappings-2026-09-17.json

CAMPUS_MAP_PROVIDER_MAPPING_RELEASE_ACTOR_ID=<trusted-production-admin-uuid> \
  pnpm campus-map:provider-mapping-release -- verify \
  docs/campus-map/data/amap-provider-mappings-2026-09-17.json
```

`DATABASE_URL` stays in the operator environment. The actor UUID also stays in
the environment and is not accepted from the manifest. The registry rechecks
that actor's current verified, password-backed administrator status inside the
transaction. The manifest version and exact provider identity derive a stable
idempotency key. Re-running an applied manifest skips the matching active row,
reports zero changes, and verifies both the registry audit chain and public
resolver again.

## Production status

The reviewed manifest was applied to the healthy `cupedia-sg` production
project on 2026-09-17 at 16:04 HKT. The operator identity matched one current,
verified, non-banned, password-backed production administrator before the
registry accepted the command. The operator UUID and database credential were
kept in the process environment and were not written to this record.

The formal `apply` result was `status: ok`, `changed: 1`, `verified: 2`, with
manifest hash
`fc135fa6295727bacecb5be1c274ee9dc6e2ca3f323431569c73f7578a08d6c2`.
The immediately repeated formal `verify` result was `status: ok`, `changed: 0`,
`verified: 2`, with the same hash. A separate production query confirmed both
exact active rows:

- `B0FFFS94ZL` → Building `545893b6-b89b-5067-aba0-c86518aa8fa8`;
- `B0J2RXUQB6` → Building `d0f66212-4138-5ab3-b8e5-04980cf64fb3`.

The query also confirmed the YIA `bind` audit event, actor snapshot, release
reason, and provider-candidate provenance source
`amap:poi:B0FFFS94ZL:hotspotclick:2026-09-17`.

At 16:52 HKT, the complete Science Centre acceptance was repeated on the
production real AMap SDK. Clicking the visible `ScienceCentre科学馆` hotspot
opened the canonical “科学馆 / University Science Centre” Building card and
changed the URL to Building
`d0f66212-4138-5ab3-b8e5-04980cf64fb3`. Searching for `Science Centre` opened
the same card and URL. Reloading that URL opened the same card directly. None
of the three paths left a second transient AMap card visible.

Desktop screenshot acceptance at 1280 × 720 then passed on the production
site. Clicking the real YIA AMap hotspot opened the canonical bilingual
Building card and changed the URL to Building
`545893b6-b89b-5067-aba0-c86518aa8fa8`. The same Building deep link opened
directly. Selecting floor 4 and YIA 406 opened its canonical Place card; using
“返回建筑” restored the YIA Building with floor 4 still selected. Clicking the
unrelated Panacea Lodge AMap point kept the base map URL and showed the compact
“高德地图地点” transient card.

Mobile screenshot acceptance at 390 × 844 also passed. The same canonical YIA
card opened as the map bottom sheet, kept the map controls usable, and moved
from peek to half height without clipping its title, actions, floor selector,
or facility list.

The checked manifest is the permanent release record. The disposable local QA
rows were removed after the rehearsal; a production mapping created from this
approved manifest must not be removed by the fixed-QA cleanup flow.
