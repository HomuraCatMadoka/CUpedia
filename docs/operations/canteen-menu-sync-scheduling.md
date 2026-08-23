# Production canteen menu sync scheduling

GitHub Actions is the only production scheduler for recurring canteen menu
sync. It wakes the fixed `https://cupedia.org/api/internal/canteen-menu-sync/next`
endpoint three times per day. The endpoint, not the workflow, selects and claims
one due source using database time.

## Schedule

GitHub cron expressions use UTC. Runs use minute 17 to avoid common top-of-hour
load and start shortly after each application window opens:

| Meal      | GitHub UTC cron | Asia/Hong_Kong                   |
| --------- | --------------- | -------------------------------- |
| Breakfast | `17 23 * * *`   | 07:17 the following calendar day |
| Lunch     | `17 3 * * *`    | 11:17                            |
| Dinner    | `17 9 * * *`    | 17:17                            |

The workflow makes at most 16 endpoint calls within a 12-minute runner budget;
the GitHub job has a 15-minute hard timeout. A static concurrency group queues,
rather than overlaps, production drains. `continue` advances immediately,
`no-work` completes the run, and `retry-later` uses bounded 2/5-minute
backoff. `stop-for-review`, HTTP/authentication/configuration errors, malformed
responses, request timeouts, and exhausted budgets fail the workflow visibly.
Sources outside a configured meal period or on a configured closed weekday are
excluded using the database-time Asia/Hong_Kong calendar before any claim is
created. Among otherwise claimable sources, an untouched source runs before one
that already failed in the current window, so one transient provider does not
starve the rest of the drain.

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
