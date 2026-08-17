# Bounded CI topology

Issue #669 keeps the full regression suite while bounding fixed runner cost.
This document is the reviewable behavior-to-test map and timing record.

## Before baseline

The baseline uses the five most recent successful full `CI` runs available when
implementation started. Durations come from the GitHub Actions jobs API; runner
time is the sum of job durations and wall time is the interval from the first
job start to the last job completion.

| Run           |   Jobs | Runner seconds | E2E runner seconds | Wall seconds |
| ------------- | -----: | -------------: | -----------------: | -----------: |
| `31985101755` |     10 |            998 |                675 |          300 |
| `31984929519` |     10 |           1065 |                729 |          312 |
| `31962287509` |     10 |           1002 |                656 |          299 |
| `31960784548` |     10 |            977 |                662 |          297 |
| `31960149280` |     10 |           1068 |                742 |          341 |
| **Median**    | **10** |       **1002** |            **675** |      **300** |

Run `31984929519` is the clean `main` run at `80e4c7984`. Its job/step signal
was:

| Job                       | Job seconds | Test/build step seconds |                    Repeated setup signal |
| ------------------------- | ----------: | ----------------------: | ---------------------------------------: |
| `lint-and-test`           |         122 |       lint 27 + unit 76 |                checkout/setup/install 16 |
| `typecheck`               |          47 |            typecheck 28 |                checkout/setup/install 16 |
| `migration-compatibility` |          37 |     integration tests 6 | container 13 + checkout/setup/install 16 |
| `menu-sync-integration`   |          47 |    init/migrate/tests 5 | container 14 + checkout/setup/install 20 |
| `build`                   |          83 |                build 50 |          checkout/setup/install/cache 22 |
| `chromium-general`        |         226 |                 E2E 170 |         services/bucket/browser/setup 50 |
| `campus-bus`              |          74 |                  E2E 18 |         services/bucket/browser/setup 48 |
| `chromium-wiki`           |         129 |                  E2E 79 |         services/bucket/browser/setup 44 |
| `chromium-wiki-editor`    |         143 |                 E2E 105 |         services/bucket/browser/setup 32 |
| `webkit-mobile`           |         157 |                  E2E 60 |         services/bucket/browser/setup 91 |

The same run contained two retry-pass flakes despite its successful conclusion:
`wiki-edit.mobile-webkit` timed out while creating a private page, and
`wiki-edit.block-commands` did not open the slash menu on its first attempt.
CI now has zero retries, so either failure makes the run fail.

## Coverage map

No test behavior is deleted or moved to a fake database. The Playwright listing
is 48 files and 288 tests both before and after the topology change.

| Before                                         | After                                                       | Preserved behavior / boundary                                                                                                                                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint-and-test`, `typecheck`                   | `quality`                                                   | The same `pnpm lint`, full `pnpm test`, and `pnpm typecheck` commands form one gate.                                                                                                                          |
| `migration-compatibility`                      | `quality` on real PostgreSQL 16                             | Legacy menu-source migration and identity preflight tests retain their original environment flags and database version.                                                                                       |
| `menu-sync-integration`                        | The same `quality` job on real zhparser PostgreSQL 17       | `init-zhparser.sql`, all migrations, menu sync persistence, and source sync persistence remain intact. The two database services start concurrently while checkout and dependency installation happen once.   |
| `chromium-general` + `campus-bus`              | `chromium-general`                                          | All non-Wiki journeys, Campus Bus browser/map coverage, and mobile WebKit exclusions are unchanged.                                                                                                           |
| `chromium-wiki` + `chromium-wiki-editor`       | Split between the two Chromium groups by measured spec time | All Wiki read/edit/auth/query/persistence/concurrency journeys remain production Next + real PostgreSQL. `wiki-edit.shell` and `wiki-edit.toolbar` move to general only to balance time.                      |
| Mobile editor previously in `chromium-general` | `chromium-wiki-media`                                       | All mobile editor tests remain Chromium full-stack E2E. This file includes image upload, so its runner owns MinIO.                                                                                            |
| `wiki-upload` in `chromium-wiki`               | `chromium-wiki-media`                                       | Anonymous/editor authorization, content validation, serving, upload, save, and reload continue through production Next and MinIO.                                                                             |
| `webkit-mobile`                                | `webkit-risk` in the official Playwright container          | Only `header.mobile-webkit.spec.ts` and `wiki-edit.mobile-webkit.spec.ts`, the known safe-area/focus/touch risks, run in WebKit. The runner uses real zhparser PostgreSQL and the single uploaded Next build. |

The new CI list contains 177 `chromium-general`, 107
`chromium-wiki-media`, and 4 `webkit-mobile` tests. Test count is intentionally
not the balancing input: the groups are assigned by measured spec time.
PostgreSQL remains present on all three full-stack browser runners. MinIO is started only by
`chromium-wiki-media`, and only the upload tests call it.

Seventeen browser journeys that created and published a page only as test setup
now insert the same final page state through a shared real-PostgreSQL fixture.
This removes repeated navigation, hydration, autosave, and publish startup from
`wiki-edit.block-commands`, `wiki-edit.shell`, `wiki-edit.toolbar`,
`wiki-edit.mobile-webkit`, `wiki-edit.mobile`, `wiki-upload`, `wiki-discussion`,
and `wiki-links`. Their assertions still exercise the production Next server,
authentication, reads, writes, autosave, upload, comments, links, and reloads
against real PostgreSQL. The fixture has no fake or in-memory database.

Five journeys retain the complete UI creation path because creation is the
behavior under test:

- `wiki-discussion.responsive`: comments are available immediately on a new page.
- `wiki-edit.autosave`: a newly created page autosaves before navigation.
- `wiki-lifecycle`: create, read, update, delete, and restore lifecycle.
- `wiki-edit.toolbar`: the create route hydrates without an auth mismatch.
- `wiki-edit.mobile`: a new page autosaves before browser Back.

Successful-path screenshots were removed. Playwright retains screenshots and
traces on failure, plus the HTML report, test results, and Actions server log.

No E2E behavior was downshifted to unit/component scope in #669. Existing
lighter-layer coverage, including the Campus Bus mapping in
`docs/campus-bus/test-coverage.md`, remains unchanged and is still included by
the full unit command.

## After validation

Pending a fresh five-attempt sequence on the fixture-optimized commit. Earlier
sequences are intentionally excluded because a retry-disabled attempt exposed
test setup races and invalidated the sequence.
