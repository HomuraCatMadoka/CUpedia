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

No test behavior is deleted or moved to a fake database. The first topology
pass preserved all 288 Playwright tests. The test-layer pass then moved pure
rules and client state to unit/component coverage, leaving 252 browser tests.

| Before                                         | After                                                 | Preserved behavior / boundary                                                                                                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint-and-test`, `typecheck`                   | `quality`                                             | The same `pnpm lint`, full `pnpm test`, and `pnpm typecheck` commands form one gate.                                                                                                                                                     |
| `migration-compatibility`                      | `quality` on real PostgreSQL 16                       | Legacy menu-source migration and identity preflight tests retain their original environment flags and database version.                                                                                                                  |
| `menu-sync-integration`                        | The same `quality` job on real zhparser PostgreSQL 17 | `init-zhparser.sql`, all migrations, menu sync persistence, and source sync persistence remain intact. The two database services start concurrently while checkout and dependency installation happen once.                              |
| `chromium-general` + `campus-bus`              | `chromium-general` + `chromium-balanced`              | Non-Wiki journeys remain Chromium. Campus Bus joins the third runner because its real-map coverage needs no MinIO.                                                                                                                       |
| `chromium-wiki` + `chromium-wiki-editor`       | Three measured Chromium groups                        | All Wiki read/edit/auth/query/persistence/concurrency journeys remain production Next + real PostgreSQL. `sidebar`, `wiki-create`, `wiki-edit.shell`, and `wiki-edit.toolbar` use the third runner.                                      |
| Mobile editor previously in `chromium-general` | `chromium-wiki-media`                                 | Mobile browser/history, upload, focus, autosave, and command boundaries remain Chromium full-stack E2E. Pure toolbar rendering and catalog state moved to component coverage. This file includes image upload, so its runner owns MinIO. |
| `wiki-upload` in `chromium-wiki`               | `chromium-wiki-media`                                 | Anonymous/editor authorization, content validation, serving, upload, save, and reload continue through production Next and MinIO.                                                                                                        |
| `webkit-mobile`                                | `browser-third` in the official Playwright container  | Only `header.mobile-webkit.spec.ts` and `wiki-edit.mobile-webkit.spec.ts`, the known safe-area/focus/touch risks, run in WebKit. The same runner executes the balanced Chromium shard against one server.                                |

The current CI list contains 103 `chromium-general`, 71
`chromium-wiki-media`, 74 `chromium-balanced`, and 4 `webkit-mobile` tests.
Test count is not the balancing input: the groups are assigned by measured
spec time. `chromium-balanced` and WebKit execute sequentially on the same
third runner and reuse one production server.
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

Four retry-disabled regression runs exposed client-readiness races rather than
missing behavior coverage. The canteen vote journey now waits for the hydrated
menu-period state before selecting lunch, and Campus Bus route links disable
duplicate automatic RSC prefetches while retaining click navigation. The mobile
new-page Back journey binds its edits to the published page's hydrated editor
shell instead of a page-wide selector that could also see the outgoing shell.
Professor review links also disable query-insensitive RSC prefetch so the
clicked course consistently receives its required professor binding. All
behaviors remain covered by full-stack Chromium tests and the applicable
component tests; no fix adds a retry or extends a timeout.

The first post-split full regression exposed one more outgoing-shell race in
the mobile single-block deletion journey: a page-wide Slate locator briefly
matched both the departing and canonical editors after fixture navigation. It
now scopes that test, and the adjacent Done/save journey, to the canonical
page-id hydrated shell returned by the shared helper. Both paths passed 10
consecutive retry-disabled stress repetitions after the change.

### Test-layer coverage map

College Picker keeps one anonymous production-route walking skeleton. The
other eight original journeys map as follows:

| Original browser behavior                                              | New coverage                                                                                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| FYP avoid hits remain present, labeled, and sorted inside their region | `tests/components/college-picker-form.test.tsx` avoid rendering; `tests/lib/college-picker.test.ts` avoid ordering and completeness |
| MTR bonus changes the first rendered score to 94.0                     | `tests/components/college-picker-form.test.tsx` bonus rendering; `tests/lib/college-picker.test.ts` exact per-college bonus         |
| Duplicate priorities show an error and keep the slot empty             | `tests/components/college-picker-form.test.tsx` duplicate interaction; `tests/lib/college-picker.test.ts` priority validation       |
| Clearing priority two also clears priority three                       | `tests/components/college-picker-form.test.tsx` controlled-form state                                                               |
| Preference A alone exposes the small-college questionnaire             | `tests/components/college-picker-form.test.tsx` A/B conditional rendering                                                           |
| Incomplete preference-A answers block recommendation                   | `tests/components/college-picker-form.test.tsx` toast and absent-result assertion                                                   |
| Four complete preference-A answers render ranked results               | `tests/components/college-picker-form.test.tsx` form flow; `tests/lib/college-picker.test.ts` exact specialization scores           |
| Non-official and medical-program disclaimer remains visible            | Folded into the retained anonymous production-route walking skeleton                                                                |

Course Tree keeps three full-stack boundaries: the anonymous seeded route,
real SVG geometry/tooltip behavior, and authenticated PostgreSQL persistence.
All 14 original behaviors remain mapped:

| Original browser behavior                                             | Current coverage                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Default major, 11 nodes, three categories, missing placeholder        | Retained anonymous E2E; `tests/components/course-tree-view.test.tsx`      |
| Toggle courses and update total/category progress                     | Component; `tests/lib/course-tree/evaluate-build.test.ts`                 |
| One-of category becomes complete after one selection                  | Component; `tests/lib/course-tree/evaluate-build.test.ts`                 |
| Switching major clears the local build                                | Component controlled-state test                                           |
| Non-official handbook disclaimer                                      | Folded into retained anonymous E2E                                        |
| Three real SVG edges and external-prerequisite tooltip                | Retained real-browser E2E; component edge/tooltip assertion               |
| Free mode allows an unmet dependent and highlights a satisfied edge   | Component interaction; evaluate-build unit coverage                       |
| Prerequisites occupy deeper topology columns                          | Retained real-browser E2E; `tests/lib/course-tree/layout-canvas.test.ts`  |
| Equivalence member locks and unlocks its sibling                      | Component interaction; `tests/lib/course-tree/equivalence-groups.test.ts` |
| Selecting either equivalent member satisfies downstream edges         | Component interaction; equivalence unit coverage                          |
| Strict mode exposes eight terms, blocks seasons, and reports bypasses | Component interaction; evaluate-build unit coverage                       |
| Configurable term cap blocks overload                                 | Component interaction; evaluate-build unit coverage                       |
| Anonymous save points to login                                        | Retained anonymous E2E and component assertion                            |
| Multiple named builds restore strict term state                       | Retained E2E against real PostgreSQL                                      |

Mobile Wiki editing retains browser coverage for viewport geometry, visual
viewport/keyboard behavior, file selection and MinIO upload, mention and
discussion integration, history traversal, autosave/navigation ordering, IME,
selection validity, and actual Plate commands. Five repeated presentation
journeys now cross the production component interface instead:

| Original browser behavior                                     | New coverage                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| One toolbar with the complete default action strip            | `tests/components/mobile-wiki-editor-toolbar.test.tsx`                             |
| Expanded selection replaces block actions with inline format  | `tests/components/mobile-wiki-editor-toolbar.test.tsx`                             |
| Insert opens the complete full-screen command catalog         | `tests/components/mobile-wiki-editor-toolbar.test.tsx`; command-catalog unit tests |
| Turn into marks the current type and exposes the full catalog | `tests/components/mobile-wiki-editor-toolbar.test.tsx`; command-catalog unit tests |
| Discussion permission disables only the comment action        | `tests/components/mobile-wiki-editor-toolbar.test.tsx`                             |

The full-screen surface Back/Forward cases remain browser E2E, but their three
separate page setups are one sequential history-state journey. The separate
Format-accessory history journey remains independent.

Desktop block-menu selection, keyboard opening/focus restoration, and a
conversion targeting a different block from the caret remain real-browser
E2E. Local menu operations no longer pay for login, PostgreSQL reset, and a
full page boot:

| Original browser behavior                          | New coverage                                |
| -------------------------------------------------- | ------------------------------------------- |
| Search filters the action catalog                  | `tests/components/wiki-block-menu.test.tsx` |
| Duplicate selects the copied block                 | `tests/components/wiki-block-menu.test.tsx` |
| Move uses the correct sibling destination          | `tests/components/wiki-block-menu.test.tsx` |
| First/last blocks disable invalid moves            | `tests/components/wiki-block-menu.test.tsx` |
| Whole-block comment respects discussion permission | `tests/components/wiki-block-menu.test.tsx` |
| Delete exposes an undo action                      | `tests/components/wiki-block-menu.test.tsx` |

Sidebar still has browser coverage for hydration, cookie-controlled first
paint, accessible Drawer focus/inert behavior, slow/fast navigation feedback,
tree keyboard behavior, geometry, and PostgreSQL-backed hierarchy operations.
Repeated rail visibility/new-page ownership checks moved to
`tests/components/sidebar-toggle.test.tsx`; the retained mobile first-paint and
desktop cookie journeys continue to guard the actual CSS/hydration boundary.
All Drawer journeys now wait for the toggle's explicit client-ready signal
before clicking. A pre-fix targeted run reproduced the old race as a 30-second
timeout with the Drawer absent; the synchronized journey passed in 4.8 seconds
after this change without retries or a timeout increase.

Existing lighter-layer coverage, including the Campus Bus mapping in
`docs/campus-bus/test-coverage.md`, remains included by the full unit command.

## Current-tree validation

On 2026-08-18, the final working tree passed `pnpm lint`, all 1,972 Vitest
tests (1,852 passed and 120 intentionally skipped), `pnpm typecheck`, and
`pnpm build`. One production-build Playwright regression then passed all 252
tests on their first execution with `retries: 0`: 103 Chromium general, 71
Chromium Wiki/media, 74 balanced Chromium, and 4 WebKit risk tests. The local
single-worker run completed in 5.1 minutes. Per the maintainer's updated
acceptance direction, this test-layer follow-up does not repeat the earlier
five-run exercise below; the prior five-run CI budget evidence remains recorded
for the same bounded topology.

## Previous five-run validation

GitHub Actions run `32107130513` was rerun five consecutive times at commit
`2d063c42e3d1f1257c1ab4f858a0d7dfda441c7d`. Every attempt completed successfully
with Playwright retries fixed at zero. Durations below are GitHub job durations,
so the runner total includes setup, real PostgreSQL, and test execution.

| Attempt    | Runner seconds | E2E runner seconds | Wall seconds |  Build | Quality | Chromium general | Chromium media | Balanced + WebKit |
| ---------- | -------------: | -----------------: | -----------: | -----: | ------: | ---------------: | -------------: | ----------------: |
| 1          |            842 |                588 |          274 |     67 |     187 |              185 |            199 |               204 |
| 2          |            850 |                596 |          286 |     70 |     184 |              182 |            202 |               212 |
| 3          |            794 |                568 |          284 |     73 |     153 |              156 |            207 |               205 |
| 4          |            811 |                565 |          276 |     67 |     179 |              175 |            184 |               206 |
| 5          |            829 |                581 |          275 |     56 |     192 |              162 |            205 |               214 |
| **Median** |        **829** |            **581** |      **276** | **67** | **184** |          **175** |        **202** |           **206** |

The median runner total is 829 seconds (budget: at most 900) and median wall
time is 276 seconds (budget: at most 360). CI has five job executions and three
E2E runners. The median browser-test steps were 128 seconds for Chromium
general, 152 seconds for Chromium media, and 151 seconds for balanced Chromium
plus WebKit risk. The Chromium-only test steps differ by 24 seconds; the third
runner stays within 23 seconds of the general shard while also carrying WebKit.

All five complete logs were scanned for Playwright retry-number, flaky,
failed-summary, and passed-on-retry markers; none were present. GitHub metadata
records every job and browser-test step as successful on its first execution.
Across all five attempts, the Chromium browser install took 5-7 seconds; the
third runner used the official Playwright image and had no install step.
`Start MinIO` occurs only under `chromium-wiki-media`; the other browser runners
use real PostgreSQL without starting object storage.
