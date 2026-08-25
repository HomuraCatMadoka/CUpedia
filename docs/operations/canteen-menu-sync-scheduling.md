# Production canteen menu sync scheduling

Status: Current
Last verified: 2026-08-25 against `.github/workflows/canteen-menu-sync.yml`

GitHub Actions is the only production scheduler for recurring canteen menu
sync. It wakes the fixed `https://cupedia.org/api/internal/canteen-menu-sync/next`
endpoint every 30 minutes during daytime operating hours. The endpoint, not the
workflow, selects and claims one due source using database time. A wake-up with
no due source returns `no-work` without reading a provider.

## Schedule

GitHub cron expressions use UTC. The workflow uses minutes 17 and 47 to avoid
common top-of-hour load:

| GitHub UTC cron    | Asia/Hong_Kong         |
| ------------------ | ---------------------- |
| `17,47 0-11 * * *` | 08:17–19:47, every 30m |

The coarse application windows still begin at 08:00 for authoritative
breakfast claims, 11:00 for lunch, and 17:00 for dinner. A source is eligible
only when the current period appears in its configured `syncMealPeriods` and
the HKT weekday is not closed.

Breakfast runs at 08:17 because CU CAFE's published Aigens breakfast periods
start at 07:28. Scheduling the observation at 07:17 would make correctness
depend on GitHub queue delay: an on-time run sees a valid published menu
envelope with an empty current category topology and correctly fails closed.

Within a coarse period, a successful catalog observation drains that source
until the next period. A successful meal-period observation becomes due again
at the next validated provider refresh boundary or after 45 minutes, whichever
comes first. Because GitHub wakes at half-hour intervals, a provider without a
known boundary is normally read about once per hour. PINME broad-group service
times may schedule a refresh, but broad-group products never become current-menu
authority.

Each workflow run makes at most 16 endpoint calls within a 12-minute runner
budget; the GitHub job has a 15-minute hard timeout. A static concurrency group
queues, rather than overlaps, production drains. `continue` advances immediately,
`no-work` completes the run, and `retry-later` uses bounded 2/5-minute
backoff. `stop-for-review`, HTTP/authentication/configuration errors, malformed
responses, request timeouts, and exhausted budgets fail the workflow visibly.
Sources outside a configured meal period or on a configured closed weekday are
excluded using the database-time Asia/Hong_Kong calendar before any claim is
created. Among otherwise claimable sources, an untouched source runs before one
that already failed in the current freshness cycle, so one transient provider
does not starve the rest of the drain. Retry counts reset after the next
successful observation becomes stale; an `applied` or `unchanged` scoped result
drains only that freshness cycle, not the whole meal period.

## Cutover and recovery

Configure a GitHub Actions repository secret named
`MENU_SYNC_TRIGGER_SECRET` with exactly the same value as the production Vercel
environment variable of that name. Do not paste the value into commands, issue
text, workflow input, or repository files. GitHub injects it as a masked
environment variable and the runner sends it only as the bearer header.

The workflow has no inputs. Use **Run workflow** to recover a missed schedule;
the caller cannot select a URL, timestamp, source, provider, or canteen. The
legacy Vercel all-source cron is absent from `vercel.json`, so no scheduled path
bypasses the one-source endpoint.

After deployment, observe the native GitHub and Vercel run history plus the
Admin canteen sync health view for 3–7 days. Confirm that every intentionally
enabled source completes each expected window without overlapping active
claims. Treat unresolved churn, suspicious drop, conflict, provider failure,
timeout, stale claim, or freshness state as review-required. During a daytime
window on an operating day, confirm Cafe Tolo (`pinme:4899`) produces a
non-empty ordinary result. Its published hours are Monday-Saturday
11:00-19:45, so it is skipped for breakfast and throughout Sunday;
`EMPTY_PINME_MENU` remains fail-closed on every attempted fetch.
