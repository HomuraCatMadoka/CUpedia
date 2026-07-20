# Course-tree scrapers (offline, isolated)

Offline harvest of the two authoritative data sources for the course skill tree.
**Not** part of pnpm / CI / the app runtime — a standalone Python tool with its
own venv (see [ADR 0005](../../docs/adr/0005-course-tree-data-provenance.md)).
Output lands in `scripts/data/` for the TS ingest scripts to consume.

```
tools/scraper/scrape_courses.py   →  scripts/data/{courses,subjects}.json → pnpm ingest:courses
tools/scraper/scrape_handbook.py  →  scripts/data/handbook/*.{html,json} → pnpm ingest:skeleton
tools/scraper/scrape_timetable.py →  scripts/data/professors.json → pnpm ingest:professors
tools/scraper/scrape_staff.py     →  scripts/data/staff-directory.json
tools/scraper/resolve_staff_pilot.py → scripts/data/staff-engineering-report.json
tools/scraper/compare_staff_production.py → scripts/data/staff-production-validation.json
tools/scraper/render_staff_directory_import.py → scripts/data/staff-directory-import.sql
tools/scraper/build_staff_source_queue.py → scripts/data/staff-source-queue.json
```

## Setup

```bash
cd tools/scraper
python -m venv .venv && source .venv/bin/activate
pip install -e .                      # requests + beautifulsoup4 + ddddocr
```

## Run

```bash
# Course catalog (captcha-gated; start tiny to validate the captcha loop)
python scrape_courses.py --subjects ACCT,CSCI    # a couple of subjects
python scrape_courses.py                         # all ~259 subjects (~2–3h)
python scrape_courses.py --fresh                 # ignore prior output, start over
python scrape_courses.py --catalog-only          # refresh subjects.json only

# Current Handbook Major Programme schemes (latest four admission years)
python scrape_handbook.py

# Official teaching timetable instructors
python scrape_timetable.py --subjects ACCT,CSCI --year 2025-26
pnpm ingest:professors
# Read-only export of the current linked production snapshot for migration rehearsal:
python export_production_professor_snapshot.py
# Resume is automatic; use --fresh only to discard the existing manifest.

# Official Research Portal organisation / staff directory. With no filter this
# includes faculty trees and standalone institutes, centres, offices and units.
python scrape_staff.py
python scrape_staff.py --faculties Engineering,Science
# Fast partial smoke test against a couple of department overview pages:
python scrape_staff.py --departments department-of-biomedical-engineering,department-of-computer-science-and-engineering --preview --pause 0.25
# A scoped full run can overlap a few profile requests while still spacing
# request starts. Keep the worker count low to avoid portal throttling:
python scrape_staff.py --departments department-of-biomedical-engineering,department-of-computer-science-and-engineering --pause 0.25 --workers 4
# Read-only Engineering identity resolution against the linked Supabase project:
python resolve_staff_pilot.py
# Read-only all-faculty validation against production professor rows:
python compare_staff_production.py
# Group reviewed missing people by official source. A refreshed Pure directory
# removes newly resolved identities before prioritizing roster adapters:
python build_staff_source_queue.py --directory ../../scripts/data/staff-directory.json
# Render a newly observed, complete organisation/person snapshot as SQL:
python render_staff_directory_import.py
# Reconcile every production automatic identity from live database aliases;
# this is the only workflow that intentionally performs a global replacement:
python reconcile_professor_staff_identities.py
# Render the reviewed report as a transactional, idempotent SQL import:
python render_staff_import.py
# The first full run takes roughly three hours because robots.txt requires a
# five-second crawl delay. Profile HTML is cached under scripts/data/, so an
# interrupted run resumes without refetching completed pages. Use --refresh to
# deliberately refresh the cache.
```

`courses.json` is rewritten after **every** subject and the run **resumes** by
skipping subjects already present — a crash mid-harvest loses at most one
subject, and re-running continues where it stopped (`--fresh` to ignore it).

## Notes & caveats

- **Captcha** — the catalog and Browse Program Information searches need a 4-char captcha (`imgCaptcha`,
  field `txt_captcha`). `ddddocr` reads it; misreads are expected, so
  `reach_listing` retries up to 8× until the grid appears (the site echoes
  "Invalid Verification Code" on a miss). **One captcha unlocks the whole
  subject** — every course detail under it is then reached captcha-free by
  replaying the listing's `__VIEWSTATE` with the row's `__doPostBack` target.
- **Detail fields by stable control id** — `parse_detail` reads the verified
  ASP.NET ids (`uc_course_lbl_course` / `_units` / `_acad_career` /
  `_crse_descrlong`, `uc_course_tc_enrl_requirement`, `uc_course_ddl_class_term`)
  rather than fragile table positions. `career` drives the UG filter downstream
  in `normalizeCourse`.
- **Verified end-to-end** against the live site (ACCT/CSCI/MATH → 301 raw rows →
  172 UG after `normalizeCourse`, 0 malformed). The Handbook now redirects Major
  requirements to Browse Program Information; `scrape_handbook.py` queries its
  current academic year and three preceding years, keeps only Major schemes, and
  writes a traceable manifest. Long ASP.NET sessions are renewed automatically.
- **Be polite**: the source is a live government site. Keep the built-in delays,
  don't parallelize, run off-peak.
- **Staff identity** — `scrape_staff.py` uses the official Research Portal profile
  URL as the source identity, never the display name. It emits exact normalized
  same-name and high-similarity candidates within each department for manual
  review instead of merging them.
  A full unfiltered run contains every organisation exposed by the portal,
  including complete faculty trees and standalone schools, centres, programmes,
  institutes, offices and units. Standalone organisations deliberately have a
  null `facultyUrl`; they and their staff are retained rather than forced into a
  faculty. Person discovery combines the person sitemap with profiles exposed
  only on organisation cards. Every current title is retained on its
  person-organisation affiliation, and `sourceFetchedAtRange` records when the
  cached source pages were actually fetched.
  `--preview` deliberately returns only the staff cards exposed on each
  department overview and marks `staffCoverage.complete` false; it is for
  validating new departments before a full sitemap-backed run. The scraper
  publishes `scope.complete` only when the run is full and every organisation
  coverage check passes. Import, comparison and source-queue tools reject any
  directory without that explicit completeness guarantee, as well as otherwise
  complete runs filtered with `--faculties` or `--departments`.
- **Staff resolution pilot** — `resolve_staff_pilot.py` reads the linked Supabase
  project but never writes to it. It resolves the six Engineering department
  course prefixes against
  cached official profiles, applies reviewed homonym/teaching overrides, and
  reports cross-department instructors, official staff without current courses,
  and duplicate production rows as proposed cleaning actions.
  Every department also records `staffCoverage`; a Research Portal count larger
  than the profile-affiliation join is reported as incomplete, so the captured
  “official staff without courses” list is not treated as a complete conclusion.
  Global directory workflows additionally require coverage for every managed
  organisation, including standalone institutes, centres and offices. Consumers
  recompute affiliation counts from the people payload and reject inconsistent,
  scoped or empty snapshots before generating SQL.
  `render_staff_import.py` refuses unresolved or incomplete input, preserves
  timetable aliases, renders reviewed duplicate merges, and only assigns a
  timetable name when that exact alias belongs to one staff identity.
  Known external and uncertain timetable-only identities remain explicitly
  classified as `external` and `unverified`; neither is assigned a fabricated
  department. Reviewed name variants live in `staff-alias-overrides.json` and
  retain their official evidence URL. Current CUHK teachers who have an
  official department profile but no Research Portal record live in
  `staff-person-overrides.json`; each entry must use an explicit stable ID,
  official evidence URL and an existing Research Portal organisation. This
  keeps the reviewed person, affiliation, title and timetable aliases
  reproducible without treating a normalized name as an identity key.
  `staff_person_sources` stores each upstream identity separately, keyed by
  `(source, source_key)`. Source freshness and the two-run missing rule are
  maintained there; `staff_people.is_current` remains true while any source is
  current. Directory imports only clear aliases and automatic timetable links
  owned by the sources declared in that import, so adding a department roster
  cannot reset identities maintained by another adapter. Automatic professor
  identities are reconciled only for professor IDs declared in the local
  professor snapshot; production IDs absent from that snapshot are preserved.
  Imports take a transaction-scoped advisory lock and require `observed_at` to
  be newer than all managed rows. Retrying the same generated SQL is rejected
  safely instead of counting a replay as another missing-source observation.
- **All-faculty production validation** — `compare_staff_production.py` performs
  no writes. It accepts only a normalized exact name that identifies one official
  profile or a reviewed evidence-backed alias, keeps homonyms ambiguous, and
  reports faculty coverage, unmatched production rows, and duplicate production
  identities for review.
- **Manual source queue** — `build_staff_source_queue.py --directory ...`
  removes only unique exact-name matches from the reviewed missing-person queue.
  Homonyms remain queued for evidence-backed review; the output records removed
  professor/person pairs in `directoryResolved` so the reduction is auditable.
- **Course instructor homonyms** — `scripts/course-instructor-overrides.json`
  resolves only reviewed combinations of course prefix and raw timetable name.
  Ingestion stores every section instructor first, keeps unmatched rows as
  `unverified`, then applies these overrides and derives teaching assignments
  from the resolved offering rows. This prevents same-name staff in different
  faculties from being collapsed by name alone.
- **Licensing**: third-party datasets are AGPL — used only as a
  local validation oracle (`scripts/oracle-check.ts`), never copied or shipped.
