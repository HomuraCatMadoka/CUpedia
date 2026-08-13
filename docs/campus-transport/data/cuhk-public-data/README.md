# CUHK public bus data merge snapshot

Generated: 2026-08-11T11:14:25.650Z

This is a research snapshot, not a production feed. Every merged row points to a content-addressed source snapshot in `merged.snapshot.json`.

The rendering and visual-order boundary for the four current maps is documented in the [official route-map audit](../../research/cuhk-official-route-map-audit.md).

## What was collected

| Item                                                      |    Count |
| --------------------------------------------------------- | -------: |
| Source snapshots                                          |       50 |
| Official routes after dedupe                              |       14 |
| Official schedule bands                                   |       18 |
| Official stops after dedupe                               |       47 |
| Operational official stops                                |       46 |
| Physical-place candidates                                 |       34 |
| Route-page stop occurrences                               |      164 |
| Traditional Chinese route-page stop occurrences           |      164 |
| Official Campus Map stop records                          |       51 |
| Official Campus Map old type-1 / type-2 stops             |  28 / 23 |
| Official Campus Map old route / segment records           |  19 / 46 |
| Official Campus Map routes with a source connectivity gap |        1 |
| Bus Clock station constants                               |       34 |
| OSM named bus-stop records in bbox                        |      145 |
| Stops with a provisional coordinate                       |       29 |
| Stops with an official Traditional Chinese name           |       47 |
| Operational stops with official Traditional Chinese names |       46 |
| Traditional Chinese route-page label review items         |        0 |
| Traditional Chinese route pages                           |       14 |
| Traditional Chinese template-alignment mismatches         |        0 |
| Bus Clock GPS rows                                        |      154 |
| Bus Clock UTC dates                                       |       25 |
| Bus Clock segment pairs / samples                         | 54 / 113 |
| Official notices since 2024-08-10                         |       64 |
| Current/historical PDFs                                   |        7 |
| Current official route-map PDFs                           |        4 |
| Reviewed official-map routes                              |       14 |
| Reviewed directed route patterns                          |       18 |
| Route-pattern source conflicts                            |        0 |
| Academic calendars                                        |        2 |
| Public-holiday events since 2024-08-10                    |       51 |

## Conservative merge result

Only a unique exact normalized-name match is automatic. Directional differences, abbreviations that remain ambiguous, nearby OSM nodes, and placeholder official records stay in the review queue.

| Source stop records                       | Total | Auto-linked to an official stop |
| ----------------------------------------- | ----: | ------------------------------: |
| Official route HTML                       |   164 |                             144 |
| Official route HTML (Traditional Chinese) |   164 |                             144 |
| Official Campus Map                       |    51 |                              12 |
| Bus Clock                                 |    34 |                              28 |
| OpenStreetMap                             |   145 |                              14 |

## Resulting usable layers

1. `merged.routes`: 14 official route identities, English and Traditional Chinese official-page evidence, schedule bands, official-map evidence, visual stop candidates, Bus Clock variants, and GPS coverage. All current routes have reviewed directed stop patterns: Up/Down use the official 1-15 numbering, while the other routes were visually traced and cross-checked against the fixed Bus Clock commit. Conditional path variants remain separate patterns, including N treating Area 39 as a regular stop while H serves it only on minute-00 departures.
2. `merged.stops`: 47 official stop identities enriched with the same-ID Traditional Chinese stop-index name, attributed route-page aliases, and provisional coordinates where exact matching succeeded. Bilingual route-page occurrence alignment is retained only as a cross-check.
3. `merged.stopPlaceCandidates`: 46 non-placeholder operational stops folded into 34 reversible physical-place candidates; direction and PSLB variants remain linked, not deleted.
4. `merged.segmentTravelTimePriors`: Bus Clock pair-level p10/p50/p90 summaries, with route scope explicitly left null.
5. `merged.busClockEvidence`: fixed-commit coverage, route counts, GPS accuracy summaries, and processed-label counts without republishing raw GPS rows.
6. `merged.notices`: official notices from the last two years, retained as title-level review candidates rather than automatic service changes.
7. `merged.pdfEvidence`: current and 2024–25 document hashes, route coverage, pages, visual encoding, text-extraction status, schedule windows, and effective-date evidence.
8. `merged.serviceCalendars`: CUHK term/reading-week evidence plus HKSARG public holidays, kept separate from transport rules.
9. `merged.officialCampusMapEvidence`: the official Campus Map's public stop coordinates, route/segment graph, and encoded paths. The page still serves the asset, but the asset version hint is 20161006 and the page warns that information is not real-time, so it is only a stale structural prior.

## Review boundary

- 0 route patterns still require visual station-order review.
- 0 reviewed route patterns retain a conflict between current official PDF evidence and another public source.
- 0 Traditional Chinese route pages could not be occurrence-aligned with the corresponding English template.
- 0 route-page Traditional Chinese labels differ from the same-ID official stop-index name.
- 216 external stop records were not auto-linked.
- 11 segment pairs have at least one endpoint that did not auto-link.
- 2 stops have public coordinate observations more than 50 m apart.
- 11 physical-place candidates contain multiple operational stops and remain reversible links.
- 4 official stop records look like placeholders or slug/title mismatches.

Do not convert review candidates into canonical facts merely to increase coverage.
