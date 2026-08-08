# CUHK bus ingestion spike

Status: throwaway implementation spike for issue 549. This is not production code and does not persist or republish raw CUHK pages, PDFs, or notice images.

## Question

Can current CUHK public sources produce traceable canonical rows and today's departures without overstating certainty?

Run from the repository root:

```bash
node --import tsx scripts/cuhk-bus-ingest-spike.ts \
  --date=2026-08-08 \
  --public-holiday=false \
  --teaching-day=false
```

The two calendar booleans are explicit assertions, not data sources. The spike checks them against the HKSARG 1823 holiday feed and the parsed 2025–26/2026–27 CUHK almanacs and blocks mismatches. The almanac is still evidence rather than a formally published bus calendar, so production needs a reviewed transport-calendar compilation step.

The spike requires `pdftotext` and `tesseract`. The generated `output.prototype.json` contains derived facts, minimal source excerpts needed to audit field mappings, and source metadata. Every fetch records a content-addressed snapshot ID, URL, timestamp, SHA-256, byte length, content type, HTTP `Last-Modified`, parser version, and any parsed effective date. Raw CUHK pages, PDFs, and notice images remain ephemeral.

## What the real sample decides

- The 2026-08-08 run found 14 routes, 47 official stop posts, 18 schedule bands, and generated 267 route-level planned departures for that Hong Kong service date.
- The 14 route posts and the stop index are discoverable through WordPress REST.
- Service windows and hourly departure minutes are parseable from route HTML, including routes with separate weekday/Saturday bands.
- The route page exposes a four-state operating indicator, but no effective interval or independent update timestamp. It is stored as an observation with fetch time, not replayable history.
- Route stop names can mostly be linked to official stop posts, but travel order cannot be trusted from DOM order: the official page lays the route out in separate visual columns. Pattern publication therefore requires a reviewed extraction or a better official source.
- PDF text extraction confirms that current HTML and both PDF generations expose the same six ordinary-shuttle service windows. The 2024–25 PDF yields `Effective: Sep 3, 2024`; the current PDF has no equivalent business-effective date, so its hash cannot silently replace a reviewed version.
- The two almanacs yield term and reading-week intervals. They derive `teachingDay=false` for 2026-08-08, while the HKSARG feed independently derives `publicHoliday=false`.
- Notice REST records have empty content. OCR of the latest University Station image finds 2026-08-08, 07:30, routes 1A/1B, and “until the end of works,” but its mean word confidence is only recorded as a draft. The visually checked override is linked to the image hash, is explicitly not production-publishable, and expires after its start date unless reconfirmed.
- No source supplies vehicle position or official ETA. The output leaves `arrivalProjections` empty, labels realtime unavailable, and calls the generated times unpublished official-schedule candidates.

## Schema consequence

The minimum durable boundary is now evidence-driven:

- `source_snapshot`: URL, retrieval metadata, hash, parser version, and raw-content retention policy.
- `route` and `stop`: stable internal IDs plus official WordPress IDs/slugs; coordinates and campus-map IDs remain nullable.
- `service_band`: a route pattern, time window, departure-minute set, raw service rule, and parse/review status.
- `route_pattern_stop`: ordered separately from the route because the same route can change its stop pattern on non-teaching days.
- `service_exception`: a dated override with source-image hash, reviewer, review time, effective timestamp, expiry policy, and release status.
- `departure_instance`: generated only for the Hong Kong date on which current HTML was observed, with content-addressed evidence and an explicit unpublished-candidate state.
- `arrival_projection`: separate and absent until an authorized prediction or realtime source exists.

The result does **not** approve automatic publication. It proves that route-level schedule candidates can be staged without blocking parser errors. Ordered stop patterns, source diffs, and image-only notices still require operator review, so issue 549 should record a partial/negative automation verdict rather than claim a production-ready feed.
