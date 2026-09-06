# Remaining browser request ablation

Release tracking: #882. Results below describe the pre-publication local experiments.

## Decision

Retain production client webpack `splitChunks.minSize = 50000` and versioned
browser caching for the default avatar. The fixed four-page open/scroll/reload/
idle sample falls from **119 to 96 requests (19.3%)**. This is a local browser
sample, not a measured reduction in production monthly usage or CPU.

The earlier 100 KB candidate saved more requests but exceeded the existing Wiki
read-route bundle budget. It is not the delivered configuration. The budget was
not relaxed. Existing card-prefetch changes remain the common baseline.

## Method

Measured on 2026-09-06 in `wt/card-prefetch`: Next.js 16.2.6, Node.js 22.17.1,
webpack production builds, Chromium, and an isolated local test database.
The sample opens professors (six synthetic cards), canteen (one demo canteen),
CSCI1130 (one non-anonymous review), and home.

The full sequence uses a fresh browser context per page, scrolls/hovers, reloads,
then observes five idle seconds. Counts come from the local HTTP server, not
browser events for cached resources. Separate no-reload scenarios measure four
cold contexts and one shared context with new tabs in page order. Shared-cache
and cold counts are not interchangeable.

## Results

| Script threshold       | Cold requests | Shared requests | Home bundle KiB | Wiki read bundle KiB | Decision             |
| ---------------------- | ------------: | --------------: | --------------: | -------------------: | -------------------- |
| Original 20 KB         |           109 |              45 |           744.3 |                892.4 | Baseline             |
| 50 KB + avatar caching |            87 |              38 |           751.9 |                895.6 | Retain               |
| 75 KB + avatar caching |  Not measured |    Not measured |           784.9 |                990.7 | Reject: Wiki budget  |
| 100 KB                 |            73 |              33 |           784.7 |               1014.7 | Reject: Wiki budget  |
| 200 KB                 |            61 |              31 |           810.9 |               1040.8 | Reject: both budgets |

Bundle sizes are the repository's uncompressed manifest-based budgets, not
compressed network bytes. Limits remain 800 KiB for home and 950 KiB for Wiki
read. The exact existing budget script was evaluated against `.next-e2e`
instead of its hard-coded `.next` directory; no budget logic was changed.

The 50 KB first network sample transferred 1,354,867 encoded bytes cold and
468,896 shared, versus the earlier baseline's 1,352,490 and 454,707. Small HTML
and streamed response differences vary by run, so treat these as approximately
unchanged cold transfer and roughly 3% more shared transfer, not exact billing
savings. `minSize` is an uncompressed build-time splitting threshold, not the
size of every resulting downloaded file.

The full 50 KB sequence has 71 script requests, six stylesheet requests, eight
HTML requests, eight login-state reads, two anonymous initialization requests,
and one avatar download: 96 total. Against the original 119, scripts save 22
requests and avatar caching saves one. No requests were observed during the
scroll/hover or five-second idle phases.

## Other single-variable experiments

- **Avatar caching: retained.** At 100 KB, changing only the avatar reduced the
  full sequence from 83 to 82. The refresh no longer sends an image confirmation
  request. Only `/images/default-avatar.jpg?v=1` receives
  `public, max-age=31536000, immutable`; the unversioned path retains its policy.
  When replacing the image, bump both the URL in `user-avatar.ts` and the exact
  query match in `next.config.ts`. Do not apply this policy to authenticated
  responses or all public files.
- **Anonymous initialization guard: reverted.** Validating the signed HttpOnly
  cookie in the server layout before mounting the initializer saved one more
  request (82 to 81). Four focused unit cases passed: valid, tampered, correctly
  signed expired cookie, and development mock mode. But the build manifest
  changed `/canteen/manage` from static to dynamic. That route intentionally
  returns not-found outside development; introducing server execution to save
  one request is not worthwhile. The layout and experiment-only unit tests
  were reverted. Source copies remain in the temporary evidence directory.
  Cookie flags, identity ownership, write authorization, and initialization
  semantics are unchanged.
- **CSS import grouping: reverted.** Importing the shared danmaku stylesheet
  from the canteen theme did not change cold/shared counts (73/33 at 100 KB).
  There is no reason to retain the redundant import.
- **200 KB tradeoff:** relative to the 100 KB comparison on the same database,
  cold encoded bytes rose from 1,376,468 to 1,405,578; shared bytes rose from
  473,723 to 527,978. Only two shared requests were saved at 11.5% more transfer.
  Search still opened (one additional response versus two). The observation
  includes a fixed wait and is not a click-latency benchmark. Both bundle
  budgets also fail, independently disqualifying this candidate.

## Regression checks

`e2e/resource-requests.spec.ts` first failed against the original build on the
script budget, avatar caching, and duplicate initialization symptoms. Since
the identity optimization was rejected, its retained test checks identity
preservation across reloads, not elimination of initialization. Invalid-cookie
recovery is also covered. Network budget tests observe forbidden requests
after UI readiness instead of using fixed sleeps for synchronization.

The final production-mode E2E run uses the dedicated replacement database:

```bash
CI=1 NEXT_DIST_DIR=.next-e2e E2E_PORT=38761 \
E2E_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5434/cuclaw_card_prefetch_e2e \
pnpm test:e2e --reporter=list e2e/resource-requests.spec.ts e2e/canteen-menu-votes.spec.ts
```

Never substitute a development or production database in this command. The
temporary database process is stopped after verification.

## Limits and maintenance

This does not prove CPU or Function invocation savings. Grouping static assets
changes file delivery, not business operations. Login reads remain once per
complete page load. Browser caching can eliminate a request; CDN caching alone
does not. Real first-visit/return-visit mix and bot traffic must be measured
before estimating production Edge Requests.

Recheck request counts, transfer, route transitions, and editing flows on
Next.js upgrades. Custom webpack behavior is not covered by Next.js semantic
version compatibility guarantees:
[Next.js webpack configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/webpack).

## Environment and artifacts

Local raw records, archived experiment source, screenshots, and check logs:
`/tmp/cupedia-request-followup.IJBFVO`. Earlier baseline:
`/tmp/cupedia-bundle-ablation.LDOeTy/report.md`.

Archived build caches exhausted disk space. Only regenerable webpack caches
from known experiment builds were removed (initially roughly 6 GB), retaining
runnable outputs and evidence. A CSS build and checks affected by the failure
were rerun. A generated Playwright HTML report was moved outside the worktree.

The Docker database on port 5433 stopped responding. A CSS run with page errors
was discarded. No Docker restart or developer database mutation was performed.
A temporary native PostgreSQL 18 cluster on port 5434 was provisioned with the
normal migration chain and fixtures; both comparison sides were remeasured.
For initial legacy migration replay only, the obsolete `chinese` search
configuration was bootstrapped from `simple`; migration 0003 removes that old
search-vector implementation and installs current `pg_trgm`. No migration
source was changed. Parallel-check timeouts and the new E2E fixed-sleep
convention violation were resolved before the final checks.

## Files in this follow-up

- Modified `next.config.ts`: client grouping and exact versioned-avatar policy.
- Modified `src/lib/user-avatar.ts`: versioned default avatar URL.
- Modified `tests/lib/achievement-profile.test.ts`: expected avatar URL.
- Added `e2e/resource-requests.spec.ts`: resource budgets and identity checks.
- Added `docs/request-reduction-ablation.md`: this evidence and decision record.

Earlier card-prefetch changes remain untouched. No commit, push, or deployment.

## Completion checks

- Final 50 KB cold/shared replay: 87/38 requests on both runs. Encoded bytes
  were 1,354,867 / 468,896 and 1,354,868 / 468,896 respectively.
- Full open/scroll/reload/idle replay: 96 requests, including no scroll/idle requests.
- Production build passed; existing home and Wiki bundle budgets both passed.
- `pnpm install --lockfile-only --frozen-lockfile` passed without dependency changes.
- `pnpm lint` passed with 13 existing warnings; final modified-source lint passed.
- `pnpm test` passed: 329 files, 2,890 tests; 30 files / 415 gated tests skipped.
- `pnpm typecheck` passed independently of the build's skipped typecheck.
- Ten E2E specs passed: 45 tests in production mode, including the five new
  resource/identity checks, card and navigation behavior, voting, replies,
  danmaku, login, Wiki reading, and editor hydration.
- Browser screenshots inspected for the final build: desktop home and mobile
  canteen. Earlier 100 KB desktop/mobile canteen and mobile course views were
  also inspected. Used the owned port 38761, leaving port 3000 alone.
- `git diff --check` passed; rejected layout and CSS changes have no diff.
- Temporary native PostgreSQL was stopped after tests. Additional unused
  experiment webpack caches were removed (about 3 GB); all removed caches can
  be regenerated. Runnable builds, measurement records, and source remain.

Not verified: production deployment/usage, full application E2E coverage,
gated database integration suites, weak-network latency, long-term cache
behavior, or a CPU saving. Docker's original database remained unavailable;
the substitute local test database does not establish Docker recovery.
