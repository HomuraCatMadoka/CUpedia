# Card prefetch ablation

Status: Local experiment; not a production usage report
Release tracking: #882. The status and verification below describe the experiment before publication.
Date: 2026-09-06 (Asia/Hong_Kong)
Base: `009376525` on `codex/perf-card-prefetch`
Runtime: Next.js 16.2.6, Node.js 22.17.1, production webpack build

## Question and intervention

Do visible links cause server work even when a visitor does not open them?
The control uses the existing links. The intervention adds `prefetch={false}`
at the measured link owners. It does not change rendering, data loaders,
authentication, database queries, cache lifetimes, or the navigation mechanism.

The main candidates were professor cards, canteen cards, and review/reply author
showcase links. The same observation also found homepage product/archive links,
canteen back/ranking links, and inline login prompts. These receive the same
small change. No prefetch coordinator or new cache layer is introduced.

## Method

- Build and run the real application, not the development server: development
  mode does not exercise production prefetch behavior.
- Use a dedicated local PostgreSQL database, `cuclaw_card_prefetch_e2e`, and port 38761. Do not reuse the developer's server on port 3000 or production data.
- First run the new professor/canteen/review regression tests on the unchanged
  production build: all six desktop/mobile cases fail on unsolicited requests.
- For measurement, use six synthetic professors, one seeded canteen, and one
  signed course review. Each scenario opens the page, observes it for two seconds,
  scrolls to the last matching link, hovers the first, observes for two seconds,
  reloads, and observes for another two seconds. Repeat three times, with a fresh
  browser context each time. HTTP/browser caches are not disabled and no browser
  request interception is used.
- A temporary Node preload hook records requests received by the local HTTP
  server, including prefetch requests that the browser subsequently cancels.
  `process.cpuUsage()` measures server-process CPU during each complete scenario;
  it excludes browser CPU and build time. Static requests are included in the
  all-request count. This is not a count of Vercel billable Function Invocations.
- Rerun the same measurement with the fixed production build. Do not overlap
  measurement with local build, lint, typecheck, or test jobs.
- Browser regressions also exercise actual clicks, browser Back, reload,
  expanded replies, and desktop/mobile viewports. Existing vote, reply, danmaku,
  professor directory and navigation tests protect normal use.

## Results

All three repetitions had identical request counts within each scenario. Counts
below are per scenario (one open + scroll/hover + reload). CPU is the median of
the three complete server-process measurements, in milliseconds.

| Scenario                        | Unclicked prefetch requests, before → after | All local server requests, before → after | CPU ms, before → after | CPU reduction |
| ------------------------------- | ------------------------------------------- | ----------------------------------------- | ---------------------- | ------------- |
| Professor directory (6 cards)   | 36 → 0                                      | 66 → 30                                   | 404.615 → 231.120      | 42.9%         |
| Canteen directory (1 card)      | 32 → 0                                      | 67 → 34                                   | 316.301 → 221.438      | 30.0%         |
| Course detail (1 signed review) | 16 → 0                                      | 47 → 29                                   | 280.481 → 148.619      | 47.0%         |
| Homepage                        | 28 → 0                                      | 58 → 26                                   | 210.052 → 113.270      | 46.1%         |

Across all 12 scenarios (4 pages × 3 repetitions), unsolicited prefetch requests
fell from 336 to 0, all server requests from 714 to 357 (-50%), and measured CPU
from 3,952.949 ms to 2,428.476 ms (-38.6%). Every document returned HTTP 200 and
the browser recorded no JavaScript page errors. Click behavior is verified
separately by the end-to-end tests, not included in these idle-traffic counts.

CPU has normal warm-up and runtime noise. To expose that variability, the three
samples in execution order are:

| Scenario            | Before CPU ms             | After CPU ms              |
| ------------------- | ------------------------- | ------------------------- |
| Professor directory | 470.081, 368.570, 404.615 | 271.044, 148.852, 231.120 |
| Canteen directory   | 435.064, 316.301, 230.707 | 308.196, 221.438, 116.644 |
| Course detail       | 551.343, 184.180, 280.481 | 507.802, 148.619, 141.789 |
| Homepage            | 319.293, 210.052, 182.262 | 113.270, 104.311, 115.391 |

The causal result is the reproducible removal of unclicked requests with only
the prefetch policy changed. The CPU samples support reduced work, but three
samples are not a precise performance benchmark or billing forecast.

Raw evidence: `/tmp/cupedia-card-ablation.RELSaq/before.json`, `after.json`,
`measure.cjs`, and `cpu-hook.cjs`. The first exploratory measurement used an
incorrect local homepage path (`/index`) and timed out; it was discarded. All
reported control/intervention results use the verified local homepage `/`.

## Interpretation and limits

Disabling speculative fetching trades some first-click latency for avoiding work
for pages the visitor never opens. Navigation remains a normal Next.js link;
pending indicators, browser history, and server authorization are preserved.

Local synthetic data and CPU timings cannot predict a production monthly bill.
Production has different data sizes, hardware, cache distribution, bot traffic,
and user journeys. Static assets, requested pages, writes, and other untested
links still consume requests. Validate the production reduction after deployment
with a matched traffic window; do not extrapolate the local percentage to all
Vercel usage.

The regression guard must inspect all prefetch destinations, not just requests
back to the current course URL: author showcases and login pages were precisely
the traffic missed by that narrower assertion.

## Verification

- `pnpm lint`: passed, with 13 warnings and no errors.
- `pnpm test --maxWorkers=2`: 329 files / 2,890 tests passed; 30 files /
  415 tests skipped under the repository's existing environment gates. The
  standalone unit-test run did not set `DATABASE_URL`; browser tests did use
  their dedicated, migrated database.
- `pnpm typecheck`: passed.
- Production webpack builds: control and intervention both succeeded.
- The six related Playwright specs below passed together: 35 tests, no retries.
  They include eight new desktop/mobile prefetch cases.
- `git diff --check`: passed.
- Desktop professor screenshots match the control layout; mobile screenshots
  for all four pages were visually reviewed. Each mobile document's width was
  exactly the 390 px viewport (no horizontal overflow). These checks used the
  isolated port 38761 in place of the occupied developer port 3000.

The first broad verification attempt overlapped heavy jobs and was interrupted
after unit-test timeouts. An initial lint also encountered the moving control
build archive; build archives now live outside the worktree. Final checks above
were rerun successfully. New test setup was corrected to provision a reply
author's showcase and use visible/uniquely named UI elements; these were test
fixture/selector failures, not changes to application behavior.

Reproduce the production-browser checks from the worktree with Node 22:

```sh
E2E_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/cuclaw_card_prefetch_e2e \
E2E_PORT=38761 pnpm test:e2e \
  e2e/card-prefetch.spec.ts e2e/professor-directory.spec.ts \
  e2e/navigation-prefetch.spec.ts e2e/canteen-menu-votes.spec.ts \
  e2e/course-review-replies.spec.ts e2e/canteen-danmaku.spec.ts
```

These are local disposable database credentials, not production credentials.
Use another unique `_e2e` database name and free port if running concurrently.

## Files

Modified application files (only direct prefetch opt-outs):

- `src/app/(main)/page.tsx`
- `src/app/(main)/professors/page.tsx`
- `src/components/canteen/canteen-card.tsx`
- `src/components/canteen/canteen-shell.tsx`
- `src/components/canteen/shame-rank-list.tsx`
- `src/components/courses/course-review-author-identity.tsx`
- `src/components/courses/course-review-editor.tsx`
- `src/components/home/danmaku-banner.tsx`
- `src/components/homepage/announcement-panel.tsx`

Modified tests:

- `e2e/navigation-prefetch.spec.ts` (reuse the extracted observation helper)
- `e2e/professor-directory.spec.ts` (keep professor fixtures and cache ownership
  inside the existing directory suite)

Added:

- `e2e/card-prefetch.spec.ts`
- `e2e/helpers/prefetch.ts`
- `docs/card-prefetch-ablation.md` (this report)

No repository files were deleted. Temporary CPU instrumentation, raw JSON,
screenshots, and build archives are kept outside the worktree at
`/tmp/cupedia-card-ablation.RELSaq`; they are not application dependencies or
production instrumentation. No commit, push, PR, merge, or deployment was made.
