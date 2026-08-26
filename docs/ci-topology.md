# Tiered, bounded CI topology

Status: Current
Last verified: 2026-08-26 against `.github/workflows/ci.yml` and `scripts/ci-classifier.mjs`

Issue #669 keeps the full regression suite while bounding fixed runner cost.
Issue #670 adds fail-closed risk tiers without changing those full-regression
invariants. This document is the reviewable classification, capability, gate,
and timing record.

## Risk tiers

`scripts/ci-classifier.mjs` is the only path-to-plan mapping. Both parallel
entry jobs run it directly before dependency installation; workflow YAML does
not contain a second set of path filters. On `main`, `--force-full` ignores the
diff and selects full regression.

| Tier                   | Explicitly accepted paths                                                                                                                                                                                                                                                                                         | Quality/build/browser behavior                                                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs-only              | Documentation under `docs/**` except runtime data, operation artifacts, and contracts; the named root community Markdown files; `AGENTS.md`; `CLAUDE.md`; issue templates; and the PR template                                                                                                                    | Checkout, dependency-free classification, `git diff --check`, and `CI gate`. No pnpm, Next, PostgreSQL, MinIO, or browser setup.                                                                                                                   |
| Ordinary single-domain | Explicitly reviewed UI, pure-library, test, or E2E paths in one product domain: homepage, announcements, Campus Bus, canteen, College Picker, Course Tree, courses, professors, product updates, or Wiki                                                                                                          | Full lint, unit/component suite, and blocking typecheck; one Next build and capability-selected Chromium only for runtime/browser-boundary changes. Wiki upload coverage owns MinIO; mobile/responsive Wiki paths add the known WebKit risk specs. |
| Full regression        | DB/migrations, direct database callers, server/app code outside the narrow ordinary allowlist, runtime data under `docs/**`, auth, persistence/actions/queries/stores, shared UI/layout/admin/editor, dependencies, workflows, build/test/E2E configuration and helpers, classifier/gate code, or unknown changes | The complete #669 quality, real-PostgreSQL integration, single build, two measured Chromium lanes, balanced Chromium plus WebKit, and MinIO upload boundary.                                                                                       |

Docs mixed with code are not docs-only. Multiple ordinary domains, renames,
copies, deletes, conflicts, unknown status codes, missing diffs, unknown paths,
and malformed classifier input all select full regression. Both sides of a
rename are parsed before the unsafe status fails closed. The table-driven tests
in `tests/ci-classifier.test.ts` own these cases. A repository-derived invariant
also requires every source file that directly imports the database connection
to select full regression with real PostgreSQL.

## Capability selection

Risk classification is independent of the full suite's elapsed-time shards.
The full plan retains `chromium-general`, `chromium-wiki-media`, and the
`chromium-balanced` portion of the third runner. An ordinary runtime change
instead uses the unsharded `chromium` project with the domain's explicit spec
set, so a Wiki change can cross all three full-run groups without being forced
into one of them. Real PostgreSQL remains the browser boundary. MinIO starts
only when the selected plan includes upload coverage. WebKit runs only for the
two known mobile risk specs or the full plan.

The `quality` job no longer declares unconditional service containers. Its
three real PostgreSQL instances start in a conditional step only when the plan
asks for integration coverage. PostgreSQL 16 owns legacy migration
compatibility, zhparser PostgreSQL 17 owns menu persistence, and the pinned
Supabase PostgreSQL 17 image owns the full scheduler replay, real `pg_net` HTTP
double, and database advisors. Typecheck remains an independent blocking
quality step, so the one reusable Next build may keep
`NEXT_BUILD_SKIP_TYPECHECK=1`.

## Aggregate gate and required-check migration

`CI gate` has a stable name, uses `always()`, and evaluates the quality and
build plans plus every upstream job result. The two entry plans must be present,
version-compatible, and byte-for-byte equivalent. Required capability jobs
must be `success`; only jobs explicitly absent from the plan may be `skipped`.
Failures, cancellations, missing/unknown results, classifier errors, and plan
disagreement fail the gate. `tests/ci-gate.test.ts` and the structured YAML
tests in `tests/ci-topology.test.ts` cover these semantics.

Required-check migration was performed in two phases. After the hosted probes
below established that `CI gate` always concluded, it was added to branch
protection while `lint-and-test` and `build` remained required. The final full
run then passed with all three contexts required before the two legacy contexts
were removed. The branch-protection API confirmed that strict mode now requires
only the stable `CI gate` context.

## Tier timing evidence

Hosted rollout probes ran on temporary pull requests targeting the feature
branch on 2026-08-20. They were closed without merging after the evidence was
captured, and the temporary feature-branch workflow trigger was removed. Runner
totals include the two classifier entry jobs, the gate, and every matrix
execution; wall time spans the first job start through the final gate.

| Docs-only run                                                                        | Quality | Build entry | Gate | Runner seconds | Wall seconds |
| ------------------------------------------------------------------------------------ | ------: | ----------: | ---: | -------------: | -----------: |
| [`32344039934`](https://github.com/HomuraCatMadoka/CUpedia/actions/runs/32344039934) |       8 |           9 |    6 |             23 |           17 |
| [`32344104568`](https://github.com/HomuraCatMadoka/CUpedia/actions/runs/32344104568) |       6 |           8 |    9 |             23 |           19 |
| [`32344165859`](https://github.com/HomuraCatMadoka/CUpedia/actions/runs/32344165859) |       6 |           6 |    6 |             18 |           16 |

All three docs-only runs skipped dependency and browser installation, lint,
unit tests, typecheck, Next build, PostgreSQL, MinIO, and browser jobs. Each
gate succeeded, and every runner total stayed below the 60-second limit.

| Ordinary canteen run                                                                 | Quality | Build | Selected Chromium | Gate | Runner seconds | Wall seconds |
| ------------------------------------------------------------------------------------ | ------: | ----: | ----------------: | ---: | -------------: | -----------: |
| [`32344252020`](https://github.com/HomuraCatMadoka/CUpedia/actions/runs/32344252020) |     137 |    86 |                68 |    4 |            295 |          163 |
| [`32344533705`](https://github.com/HomuraCatMadoka/CUpedia/actions/runs/32344533705) |     156 |    63 |                60 |    6 |            285 |          165 |
| [`32344780386`](https://github.com/HomuraCatMadoka/CUpedia/actions/runs/32344780386) |     152 |    76 |                54 |    5 |            287 |          159 |

The ordinary median was 287 runner seconds, below the 480-second limit. Each
run executed lint, the complete unit/component suite, blocking typecheck, one
Next build, and only `e2e/canteen-*.spec.ts` in Chromium. Real PostgreSQL backed
the browser boundary; PostgreSQL integration, MinIO, and WebKit were skipped.

Run [`32345024179`](https://github.com/HomuraCatMadoka/CUpedia/actions/runs/32345024179)
temporarily hid the canteen menu tab through the same ordinary CSS path. Quality
and build succeeded, the selected Chromium job failed four menu-vote journeys,
and the gate rejected it with `required e2e job was failure`. Removing the
injection produced restored run
[`32345454138`](https://github.com/HomuraCatMadoka/CUpedia/actions/runs/32345454138):
quality 143 seconds, build 70, selected Chromium 58, gate 4, 275 runner seconds
and 149 wall seconds, with a successful gate.

The final implementation topology's full run
[`32334796808`](https://github.com/HomuraCatMadoka/CUpedia/actions/runs/32334796808)
used six jobs and three browser runners. Quality took 132 seconds, build 83,
the two Chromium lanes 170 and 173, the balanced Chromium/WebKit runner 174,
and the gate 8: 740 runner seconds and 270 wall seconds. It built Next once,
reused the artifact in all browser jobs, kept MinIO in the upload lane, used
zero retries, and stayed below the 900-runner-second and 360-wall-second limits.

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

| Before                                         | After                                                 | Preserved behavior / boundary                                                                                                                                                                                                                             |
| ---------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint-and-test`, `typecheck`                   | `quality` (`lint-and-test` check context)             | The same `pnpm lint`, full `pnpm test`, and `pnpm typecheck` commands form one gate while preserving the required main-branch check name.                                                                                                                 |
| `migration-compatibility`                      | `quality` on real PostgreSQL 16                       | Legacy menu-source migration and identity preflight tests retain their original environment flags and database version.                                                                                                                                   |
| `menu-sync-integration`                        | The same `quality` job on real zhparser PostgreSQL 17 | `init-zhparser.sql`, all migrations, menu sync persistence, source sync persistence, snapshots, and business-health tests remain intact. All three database services start concurrently while checkout and dependency installation happen once.           |
| Supabase menu scheduler                        | The same `quality` job on Supabase PostgreSQL 17      | A clean full migration replay installs an inactive exact cron job, then focused tests exercise replay, privileges, Vault, real asynchronous HTTP results, and four-layer health without production network access; database advisors reject new warnings. |
| `chromium-general` + `campus-bus`              | `chromium-general`                                    | Non-Wiki journeys remain Chromium. Campus Bus joins general after measured CI showed that moving its 14.2-second test body off the third runner improves the critical-path balance without another service.                                               |
| `chromium-wiki` + `chromium-wiki-editor`       | Three measured Chromium groups                        | All Wiki read/edit/auth/query/persistence/concurrency journeys remain production Next + real PostgreSQL. `sidebar`, `wiki-create`, `wiki-edit.shell`, and `wiki-edit.toolbar` use the third runner.                                                       |
| Mobile editor previously in `chromium-general` | `chromium-wiki-media`                                 | Mobile browser/history, upload, focus, autosave, and command boundaries remain Chromium full-stack E2E. Pure toolbar rendering and catalog state moved to component coverage. This file includes image upload, so its runner owns MinIO.                  |
| `wiki-upload` in `chromium-wiki`               | `chromium-wiki-media`                                 | Anonymous/editor authorization, content validation, serving, upload, save, and reload continue through production Next and MinIO.                                                                                                                         |
| `webkit-mobile`                                | `browser-third` in the official Playwright container  | Only `header.mobile-webkit.spec.ts` and `wiki-edit.mobile-webkit.spec.ts`, the known safe-area/focus/touch risks, run in WebKit. The same runner executes the balanced Chromium shard against one server.                                                 |

The current CI list contains 118 `chromium-general`, 73
`chromium-wiki-media`, 61 `chromium-balanced`, and 4 `webkit-mobile` tests.
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

Mobile Wiki editing retains browser coverage for Insert and Turn-into viewport
geometry and touch-row sizing, visual viewport/keyboard behavior, file
selection and MinIO upload, mention and discussion integration, history
traversal, autosave/navigation ordering, IME, selection validity, and actual
Plate commands. Five repeated presentation journeys now cross the production
component interface instead:

| Original browser behavior                                     | New coverage                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| One toolbar with the complete default action strip            | `tests/components/mobile-wiki-editor-toolbar.test.tsx`                             |
| Expanded selection replaces block actions with inline format  | `tests/components/mobile-wiki-editor-toolbar.test.tsx`                             |
| Insert opens the complete full-screen command catalog         | `tests/components/mobile-wiki-editor-toolbar.test.tsx`; command-catalog unit tests |
| Turn into marks the current type and exposes the full catalog | `tests/components/mobile-wiki-editor-toolbar.test.tsx`; command-catalog unit tests |
| Discussion permission disables only the comment action        | `tests/components/mobile-wiki-editor-toolbar.test.tsx`                             |

The full-screen surface Back/Forward cases remain three independently reported
browser E2E regressions. The first also verifies real viewport bounds and touch
row geometry; the separate Format-accessory history journey remains
independent.

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
| Paragraph converts to Heading 2                    | `tests/components/wiki-block-menu.test.tsx` |

Sidebar still has browser coverage for hydration, cookie-controlled first
paint, accessible Drawer focus/inert behavior, slow/fast navigation feedback,
tree keyboard behavior, geometry, and PostgreSQL-backed hierarchy operations.
Repeated rail visibility/new-page ownership checks moved to
`tests/components/sidebar-toggle.test.tsx`; an authenticated mobile browser
sentinel still verifies that the Drawer owns exactly one visible new-page entry.
An independent early/late browser sample plus the desktop cookie journey
continue to guard the actual CSS/hydration first-paint boundary.
All Drawer journeys now wait for the toggle's explicit client-ready signal
before clicking. A pre-fix targeted run reproduced the old race as a 30-second
timeout with the Drawer absent; the synchronized journey passed in 4.8 seconds
after this change without retries or a timeout increase.

Existing lighter-layer coverage, including the Campus Bus mapping in
`docs/campus-bus/test-coverage.md`, remains included by the full unit command.

## Isolated in-runner parallelism

The measured media bottleneck starts two Playwright shards concurrently. Every
shard has its own PostgreSQL database, Next server port, runtime cache, HTML
report, and test-results directory. Both servers reuse the one uploaded Next
build through clone/hard-linked build trees; runtime caches are removed from
those trees before startup so `unstable_cache` cannot cross database
boundaries. Each shard still uses one Playwright worker, so tests sharing a
database never execute concurrently. General Chromium and the third browser
runner remain single-process: applying two shards to the general group caused
resource contention and 30-second timeouts in the same-tree local comparison.

`fullyParallel` makes sharding operate at test level rather than file level.
The mobile editing suite no longer has suite-wide `beforeAll`/`afterAll` hooks:
its immutable baseline and navigation fixture are initialized lazily per
shard, and pages created by an individual test are removed in that test's
cleanup. This changed the media split from 54/19 tests to 37/36 without sharing
mutable state.

The first Actions run with selective sharding measured general/media browser
steps at 135/130 seconds but the third runner at 83 seconds. Desktop toolbar
therefore stays with sidebar, wiki creation, editor shell, and the four targeted
WebKit risks on the third runner; moving toolbar to media overcorrected the
split. A synchronized follow-up measured general/media/third at 109/119/136
seconds. Campus Bus contributed 14.2 seconds inside third, so it moves to
general to reduce the measured critical-path gap without changing coverage or
starting MinIO outside the upload runner.

The same local production build and 73-test media group measured 189.12 seconds
with one Playwright process, 92.14 seconds with isolated shards before removing
the suite-wide hooks, and 81.75 seconds after the balanced fixture change. This
is a 56.8% reduction in the measured E2E wall time while retaining real
PostgreSQL, MinIO upload coverage, and zero retries.

## Current-tree validation

On 2026-08-18, the final working tree passed `pnpm lint` (zero errors), all
1,980 Vitest tests (1,859 passed and 121 intentionally skipped),
`pnpm typecheck`, and `pnpm build`. The CI-equivalent production-build browser
groups then passed all 256 tests on their first execution with `retries: 0`:

| Browser runner command | Tests | Local wall seconds |
| ---------------------- | ----: | -----------------: |
| Chromium general       |   118 |             100.43 |
| Chromium Wiki/media    |    73 |              68.07 |
| Balanced + WebKit      |    65 |              83.16 |

The 251.66-second sum includes database provisioning, isolated build-tree
preparation, server startup, and tests. Local commands differ by 32.36 seconds,
but their service startup differs from Actions; the synchronized CI job/step
durations remain the authoritative runner-balance signal. In CI the three
commands run on separate runners after the single build job. Per the
maintainer's updated acceptance direction, this follow-up does not repeat the
five-run exercise; the prior five-run CI budget evidence remains recorded for
the bounded five-job topology.

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
