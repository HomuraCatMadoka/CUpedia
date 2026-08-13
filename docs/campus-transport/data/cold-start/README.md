# CUHK bus cold-start projection staging datasets

This directory contains reproducible, **staging-only** projection datasets for
the passenger-facing routes: 1A, 1B, 2, 3, 4, 5, 6A, 6B, 7, 8, N, and H. The
generator combines reviewed official route patterns and origin-departure rules
with one route-aligned offset template extracted from the audited CU Bus App
v1.18 research copy. Public Bus Clock adjacent-segment summaries from
`../cuhk-public-data/merged.snapshot.json` are retained only as weak sensitivity
evidence; they do not overwrite the common baseline.

The project owner confirmed on 2026-08-12 that the discontinued CU Bus App is
the spiritual predecessor of this project and approved using its embedded
v1.18 offsets as the attributed cold-start baseline. Its source reference and
content hash remain attached to generated data for provenance; it is no longer
listed as a product-release blocker for CUpedia.

These files are not official timetables, realtime data, or
production-approved models. CUHK publishes origin departure times but not
fixed arrival times at every intermediate stop. Every intermediate value must
therefore remain labelled “預計” in the passenger UI.

## Generate

```bash
pnpm exec tsx scripts/cuhk-bus-cold-start.ts
```

Pass a route id and output path to generate an individual dataset:

```bash
pnpm exec tsx scripts/cuhk-bus-cold-start.ts \
  docs/campus-transport/data/cuhk-public-data/merged.snapshot.json \
  3 \
  docs/campus-transport/data/cold-start/route-3.staging.json
```

Identifiers and output are derived from the input snapshot hash and generator
version, so running the command again with the same input produces the same
bytes.

## Current route coverage

| Route | Patterns | Stop occurrences | Projections available | Origin service rule                            |
| ----- | -------: | ---------------: | --------------------: | ---------------------------------------------- |
| 1A    |        1 |                6 |                   6/6 | Monday–Saturday, except public holidays        |
| 1B    |        1 |                8 |                   8/8 | Monday–Saturday, except public holidays        |
| 2     |        2 |               19 |                 19/19 | Monday–Saturday, except public holidays        |
| 3     |        1 |               15 |                 15/15 | Monday–Saturday, except public holidays        |
| 4     |        1 |               15 |                 15/15 | Monday–Saturday, except public holidays        |
| 5     |        1 |                9 |                   9/9 | Teaching days; separate weekday/Saturday bands |
| 6A    |        1 |               10 |                 10/10 | Teaching days; separate weekday/Saturday bands |
| 6B    |        1 |                6 |                   6/6 | Monday–Friday teaching days                    |
| 7     |        1 |                8 |                   8/8 | Teaching days; separate weekday/Saturday bands |
| 8     |        2 |               33 |                 33/33 | Monday–Saturday, except public holidays        |
| N     |        2 |               40 |                 40/40 | Monday–Saturday, except public holidays        |
| H     |        2 |               41 |                 41/41 | Sundays and public holidays                    |

Route 2 has separate `default` and `via-shaw-hall` patterns. Route 8 has
separate teaching-day and non-teaching-day termini. Repeated physical stops in
loop routes remain separate stop occurrences in the timetable model.

The passenger UI adds `cumulativeOffsetSeconds` to each official origin
departure timestamp and displays only `HH:mm` with the label “預計”. It does not
show the internal second precision as product accuracy.

## Schema decisions driven by the available data

- `sampleCount` is the smallest adjacent-pair sample count on the cumulative
  Bus Clock evidence path. It describes sensitivity evidence, not the CU Bus
  App baseline and not a count of independent trips.
- `evidence.segmentSamplesTotal` retains the sum separately for auditing.
- `serviceDayCount` is `null`: the merged pair summaries do not expose a
  per-segment service-day count, so the generator does not invent one.
- `routeScope` is `mixed_or_unknown`: Bus Clock pair summaries lost the route
  dimension.
- `p10Seconds` and `p90Seconds` are sums of segment empirical quantiles. They
  are marked with
  `sum_segment_empirical_quantiles_not_joint_trip_quantiles` because there are
  no complete, trip-linked observations from which to estimate a true journey
  distribution.
- Every available audited CU Bus App route pattern is imported once as a
  cumulative template, regardless of the number of official departures. Its
  adjacent differences are materialized in `patterns[].segments` as the future
  Bayesian model's baseline parameters. `baselineSourceRefs` and
  `offsetConfidence=weak_prior` distinguish this baseline from official origin
  times.
- Bus Clock values are stored under each segment's `sensitivityCheck`. Their
  route scope remains mixed or unknown, so agreement does not increase the
  baseline's effective sample count and disagreement does not silently replace
  it.
- If no aligned community template exists, the generator can still use a
  public adjacent prior or shortest directed path and records that weaker
  fallback explicitly.
- Public-holiday dates and CUHK academic-term boundaries are retained as
  source-backed calendar inputs rather than embedded UI assumptions.

## Publication blockers

The JSON repeats these as machine-readable `publicationBlockers`:

1. Bus Clock data permission/attribution is unresolved.
2. The offsets have not been compared with independent arrival truth.
3. Segment summaries have no route scope.
4. Cumulative uncertainty bounds are not joint trip quantiles.

The project owner approved the discontinued CU Bus App v1.18 dataset as an
attributed cold-start baseline for this spiritual-successor project on
2026-08-12. Its provenance remains attached to every derived offset, but it is
no longer a publication blocker.

Until these are resolved, these datasets can support local UI integration and
shadow evaluation only.
