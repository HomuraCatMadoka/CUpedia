# Course-tree scrapers (offline, isolated)

Offline harvest of the two authoritative data sources for the course skill tree.
**Not** part of pnpm / CI / the app runtime — a standalone Python tool with its
own venv (see [ADR 0005](../../docs/adr/0005-course-tree-data-provenance.md)).
Output lands in `scripts/data/` for the TS ingest scripts to consume.

```
tools/scraper/scrape_courses.py   →  scripts/data/courses.json      → pnpm ingest:courses
tools/scraper/scrape_handbook.py  →  scripts/data/handbook/*.{html,json} → pnpm ingest:skeleton
tools/scraper/scrape_timetable.py →  scripts/data/professors.json → pnpm ingest:professors
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

# Current Handbook Major Programme schemes (latest four admission years)
python scrape_handbook.py

# Official teaching timetable instructors
python scrape_timetable.py --subjects ACCT,CSCI --year 2025-26
pnpm ingest:professors
# Resume is automatic; use --fresh only to discard the existing manifest.
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
- **Licensing**: third-party datasets are AGPL — used only as a
  local validation oracle (`scripts/oracle-check.ts`), never copied or shipped.
