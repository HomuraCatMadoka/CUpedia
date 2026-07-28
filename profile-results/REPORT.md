# Build and E2E profiling

Baseline commit: `98ad2fb69dc6df1d11c470da1efec967cb422ee8`

Environment:

- macOS arm64
- Node.js 20.20.2
- pnpm 10.24.0
- Next.js 16.2.6 (Turbopack)
- Playwright 1.60.0
- isolated worktree, `.next`, and E2E database

## Build

| Run         |  Total | Turbopack | TypeScript | Peak RSS |
| ----------- | -----: | --------: | ---------: | -------: |
| Cold        | 54.9 s |    27.5 s |     21.9 s | 1.23 GiB |
| Warm        | 45.8 s |    20.8 s |     21.8 s | 1.28 GiB |
| CPU profile | 43.1 s |    17.4 s |     23.3 s |        — |

Page data collection and static generation together take about 1.4 seconds.
The build is dominated by two independent stages: Turbopack compilation and
TypeScript checking.

The Node CPU profiles are mostly idle because the expensive work runs in
Turbopack native code and worker processes. The Next build trace is more useful
for phase attribution:

- `run-typescript`: 23.311 s
- `run-turbopack`: 17.439 s
- `static-check`: 1.066 s
- `static-generation`: 0.308 s

The production build currently type-checks the whole repository because the
root `tsconfig.json` includes `**/*.ts` and `**/*.tsx`:

| TypeScript scope | Files |
| ---------------- | ----: |
| `src`            |   385 |
| `tests`          |   155 |
| `e2e`            |    46 |
| `scripts`        |    20 |

A cold, non-incremental A/B check measured:

| TypeScript config                               | Duration |
| ----------------------------------------------- | -------: |
| Whole repository                                |  28.83 s |
| Application-only (`src` + Next generated types) |  12.08 s |

The application-only boundary is 16.75 seconds (58%) faster, which made a
separate application build config worth testing. Disabling build errors would
trade speed for correctness and was not considered.

That direct `tsc` result did **not** translate into a faster Next build. A
production-only `tsconfig.build.json` was implemented, measured for three warm
runs, and then reverted:

| Next build config           | Warm runs                 |  Median |
| --------------------------- | ------------------------- | ------: |
| Baseline                    | 35.49 s, 42.03 s, 37.57 s | 37.57 s |
| Application-only TypeScript | 33.23 s, 41.51 s, 40.41 s | 40.41 s |

The application-only build also had a slower median TypeScript phase (18.5 s
versus 16.9 s). The isolated `tsc` benchmark cannot be used to predict Next's
integrated type-check cost, so this change was not retained.

### Retained optimization: Turbopack build filesystem cache

Next.js 16.2.6 does not enable the production-build filesystem cache by
default. Enabling `experimental.turbopackFileSystemCacheForBuild` lets repeated
builds reuse the Turbopack module graph from `.next/cache`.

| Cache state             |   Total |                   Turbopack | TypeScript | Result |
| ----------------------- | ------: | --------------------------: | ---------: | ------ |
| First cache write       | 55.03 s | 23.1 s + 16.3 s cache write |     28.5 s | passed |
| Cache hit 1             | 19.90 s |                       3.7 s |     13.6 s | passed |
| Cache hit 2             | 20.51 s |                       2.4 s |     15.3 s | passed |
| One source file changed | 19.95 s |                       2.9 s |     13.8 s | passed |
| Final cache hit         | 19.80 s |                       3.0 s |     13.7 s | passed |

The warm-build median is about 20.0 seconds, versus the 37.57-second baseline:
roughly a 47% total reduction. The Turbopack phase drops from a 17.4-second
baseline to about 2.9 seconds, an 83% reduction. A one-file edit retains the
same benefit, so this is useful for normal iteration rather than only identical
no-op builds.

The generated cache is large: `.next/cache` is about 400 MB and a gzip archive
is about 317 MB. Local compression took 17.73 seconds and extraction took 1.75
seconds. CI now restores this directory using an exact source/config key with a
dependency-level fallback. Only the build job writes the cache; the two E2E
shards use the restore-only action so they cannot each upload another 400 MB.
In the first PR run, cache restore was below one second, the build step took 33
seconds, and the post-cache step took 3 seconds. More runs are still needed to
establish a representative hit rate.

### Retained optimization: remove build-time font downloads

The application had three `next/font/google` families. The canteen-only
`Noto_Sans_SC` configuration requested four weights and expanded to 405
generated `@font-face` rules; Geist and Geist Mono together generated another 13. A clean build therefore depended on Google Fonts being reachable and had
large idle-time outliers when DNS or outbound access was restricted.

The site now uses a native sans/mono stack, including `PingFang SC` and
`Microsoft YaHei` for Chinese text. This removes all build-time font network
access and the 418 generated font-face rules. The restricted sandbox produced
multi-minute idle outliers even after the imports were removed, so those runs
are not valid performance comparisons. An unrestricted clean build completed
normally. Treat this change as a deterministic-build and payload reduction;
its isolated cold-build speedup still needs a same-runner CI comparison.

### Retained optimization: parallel type gate

`next typegen && tsc --noEmit` preserves both generated route validation and
the repository-wide strict TypeScript check. A cold standalone run took 12.7
seconds; a later cold run under load took 19.3 seconds.

The build skips its duplicate check only when
`NEXT_BUILD_SKIP_TYPECHECK=1`. CI sets that variable after an independent
typecheck job has passed; local and Vercel builds remain strict by default.

| Warm cache state                     |   Total | Turbopack |                TypeScript |
| ------------------------------------ | ------: | --------: | ------------------------: |
| TypeScript inside build              | 25.84 s |     4.1 s |                    18.4 s |
| Independent type gate already passed |  7.07 s |     3.5 s | 0.008 s config validation |

Moving the gate off the build path cuts 18.77 seconds (73%) from the measured
warm build without dropping type safety. The independent job runs in parallel
with lint and unit tests.

### Retained optimization: one CI build artifact

The reusable `.next` runtime output is about 103 MB uncompressed after
excluding `.next/cache`; gzip produced a 25 MB archive in 4.25 seconds locally.
The build job now uploads it once and both E2E shards download it instead of
each running another production build. GitHub artifact transfer time still
needs a real workflow run, but the local archive cost is materially lower than
two additional 46-second clean builds.

The artifact is tarred before upload because `.next/node_modules` contains pnpm
symlinks and GitHub's normal artifact extraction does not preserve filesystem
metadata. A local package/extract simulation preserved both symlinks; the
restored artifact started in 610 ms and returned HTTP 200 for `/` and
`/canteen`. The Playwright production-artifact smoke also passed both homepage
and wiki-index tests.

Largest first-load route bundles:

| Route                  | Uncompressed JS | Chunks |
| ---------------------- | --------------: | -----: |
| `/wiki/edit/[...slug]` |        3.68 MiB |     29 |
| `/wiki/new`            |        3.68 MiB |     29 |
| `/canteen/manage/[id]` |        1.00 MiB |     22 |
| `/admin/canteens/[id]` |        0.99 MiB |     21 |
| `/canteen/[id]`        |        0.99 MiB |     22 |

The editor routes are about 3.7 times larger than the next route and are the
clearest bundle/compile optimization target.

## E2E

All runs used the existing production build. The measured duration includes
isolated database provisioning, server startup, and Playwright execution.

| Workers | Wall time | Test duration sum | Result                        |
| ------- | --------: | ----------------: | ----------------------------- |
| 1       |   286.0 s |           244.3 s | 230 passed                    |
| 2       |   143.0 s |           267.1 s | 228 passed, 2 flaky           |
| 4       |   364.3 s |          1320.8 s | 221 passed, 7 flaky, 2 failed |

Two workers provide an almost exact 2x wall-time improvement, but expose two
shared course-review fixture conflicts:

- `course-review-rating.spec.ts`
- `course-review-replies.spec.ts`

Four workers are slower than one worker because shared users, reviews, votes,
notifications, wiki pages, and timing-sensitive editor tests interfere and
trigger retries/timeouts. It is not a usable configuration without broader
fixture isolation.

The one-worker rationale in `playwright.config.ts` is stale: it says Better Auth
rate limiting requires serialization, but `src/lib/auth.ts` disables the rate
limit in the E2E runtime. The remaining blocker is test data ownership. Several
course-review specs clean up every rating or review for a shared course code
instead of only records created by the current test.

Slowest specs with one worker:

| Spec                         | Duration |
| ---------------------------- | -------: |
| `wiki-edit.autosave.spec.ts` |   42.1 s |
| `wiki-edit.mobile.spec.ts`   |   38.8 s |
| `account-completion.spec.ts` |   30.9 s |
| `wiki-edit.shell.spec.ts`    |   15.4 s |
| `wiki-edit.toolbar.spec.ts`  |   14.4 s |
| `sidebar.spec.ts`            |    9.5 s |
| `wiki-edit.spec.ts`          |    8.5 s |

### Repeatable two-worker baseline

Three production-mode runs fixed at two workers and `retries=0` established the
parallel baseline:

| Run | Wall time | Result                                                         |
| --- | --------: | -------------------------------------------------------------- |
| 1   |   161.8 s | 229 passed, 1 failed (`course-review-rating`)                  |
| 2   |   148.2 s | 229 passed, 1 failed (`course-review-replies`)                 |
| 3   |   155.5 s | 228 passed, 2 failed (`course-review-rating`, mobile autosave) |

No run passed. Same-database workers are therefore not a usable optimization.

### Retained optimization: isolated CI shards

CI now runs two matrix shards. Each shard keeps one worker and gets its own
runner, server, and provisioned database. `E2E_SHARDING=1` lets Playwright
balance individual tests across the isolated shards without enabling
same-database concurrency.

Two complete `retries=0` validation rounds passed:

| Round | Shard 1 | Shard 2 | Tests | Result     |
| ----- | ------: | ------: | ----: | ---------- |
| 1     | 153.5 s | 120.3 s |   230 | all passed |
| 2     |  96.0 s | 112.7 s |   230 | all passed |

CI wall time for the test phase is the slower shard: 153.5 seconds in the first
round and 112.7 seconds in the second. Compared with the 286-second serial run,
the retained design reduces E2E execution wall time by 46% in the slower
validation round, without sharing mutable test state.

The matrix still duplicates dependency installation, browser installation, and
service provisioning on a second runner. The production build is now shared
through one artifact.

The first real PR run completed in 7 minutes 30 seconds, versus 8 minutes 51
seconds for the latest successful `main` run on the previous workflow: a
one-sample wall-time improvement of 1 minute 21 seconds (15%). Its critical path
still serialized the build after lint/test, delaying both E2E shards by about
70 seconds. The workflow now starts build, lint/test, and typecheck together;
E2E waits for all three gates before starting.

## Dependency graph optimization

Next 16's production analyzer showed that the editor graph was dominated by two
over-broad imports rather than Plate core:

- `react-player` recursively exposed DASH, HLS, Mux, and other provider players
  even though the active application flow only needs uploaded or direct video
  files. The editor now uses the same native `<video>` element as uploads and
  the static renderer. Provider page URLs are outside the current product
  boundary; existing `mediaEmbed` nodes continue to use their dedicated
  renderer.
- Both code-block kits registered `lowlight(all)`. They now use lowlight's
  curated `common` grammar set instead of compiling every Highlight.js grammar.
  The language picker is derived from the same registry, so it no longer offers
  grammars that the application did not bundle.

The official analyzer A/B was run on the same checkout:

| Analyzer metric           |  Before |   After | Change |
| ------------------------- | ------: | ------: | -----: |
| Analyze duration          |  17.5 s |   8.8 s |   -50% |
| Global modules            |   8,771 |   8,044 |   -727 |
| Editor route sources      |   4,743 |   4,359 |   -384 |
| Editor route chunk parts  |   5,864 |   5,275 |   -589 |
| Editor route output files |     510 |     482 |    -28 |
| Highlight.js contribution | 893 KiB | 162 KiB |   -82% |

The DASH (932 KiB), HLS (496 KiB), Mux, and related player groups disappeared
from the editor analysis. A fresh production build with TypeScript kept in its
independent CI gate then measured:

| Cold build metric       |    Before |     After | Change |
| ----------------------- | --------: | --------: | -----: |
| Turbopack compile       |   22.28 s |    12.5 s |   -44% |
| First cache persistence |   22.11 s |    12.0 s |   -46% |
| Total wall time         |   46.03 s |   26.34 s |   -43% |
| Cache size              |   389 MiB |   330 MiB |   -15% |
| Cache database keys     | 2,775,206 | 2,611,970 |  -5.9% |
| Cache files             |        37 |        29 |     -8 |

The first-load manifest also improved. The global search dialog now loads only
when opened, and the notification center is an authenticated dynamic boundary:

| Route                  |      Before |       After | Change |
| ---------------------- | ----------: | ----------: | -----: |
| `/`                    |   470.4 KiB |   399.2 KiB |   -15% |
| `/wiki/edit/[...slug]` | 3,313.5 KiB | 2,545.5 KiB |   -23% |

Those measurements predate the UUID route consolidation merged in
`0b463b13`. After merging that `main`, the separate edit route no longer
exists and the editor loads asynchronously from `/wiki/[...id]`. The
first-load budgets were revalidated against the new route manifests:

| Route           |   Current |  Budget |
| --------------- | --------: | ------: |
| `/`             | 399.4 KiB | 425 KiB |
| `/wiki/[...id]` | 493.3 KiB | 550 KiB |

CI runs `pnpm bundle:check` after the build to enforce those first-load
budgets. They use emitted route `entryJSFiles`, so async editor, Emoji, and
search chunks are intentionally excluded.

## Conclusions

1. The uncached build is split almost evenly between Turbopack and TypeScript.
   Repeated builds were needlessly paying the Turbopack cost because the
   production filesystem cache was disabled.
2. Before the route-consolidation merge, the editor exposed a 3.68 MiB
   first-load graph. The current wiki read route is 493.3 KiB and the editor is
   async, so first-load and async editor budgets should remain separate.
3. E2E is serial because of shared test state, not because the application or
   database cannot handle two workers.
4. Two isolated CI shards are the shortest stable path to parallelism and
   reduce measured E2E execution from 286 seconds to at most 153.5 seconds.
5. Four workers require a much larger fixture-isolation project and currently
   have negative performance value.
6. Splitting application TypeScript from test/tool TypeScript did not improve
   the integrated Next build and was reverted.
7. CI now has one build owner. Strict type checking runs as a parallel gate,
   and the two E2E shards reuse the same 25 MB compressed build artifact.
8. The five slow editor/account specs account for 141.6 seconds of summed
   one-worker duration. Keep full browser tracer bullets for the user-visible
   contracts, but move timer/state/command matrices below the browser seam.
9. Build-time Google font fetching was unnecessary nondeterminism. The
   canteen-only font alone generated 405 font-face rules.
10. The largest removable build graph came from `react-player`'s provider
    registry and `lowlight(all)`, not TypeScript. Narrowing those imports cut the
    measured cold build from 46.03 seconds to 26.34 seconds.

## Recommended sequence

1. Keep the production Turbopack filesystem cache and collect more CI runs for
   a representative hit rate.
2. Keep one worker per database and parallelize through isolated CI shards.
3. Re-measure the parallel gate topology on GitHub Actions.
4. Review the slow editor E2E files for duplicate state-matrix coverage before
   changing the editor bundle.
5. Analyze package-level editor bundle contribution, then lazy-load optional UI
   only where Plate does not require eager plugin registration.

## Local raw artifacts

Raw Playwright JSON and temporary TypeScript profiling configurations remain
local because they are 3.3 MB of runner-specific diagnostic output. The
reproducible commands and aggregate measurements needed to evaluate the changes
are recorded above.
