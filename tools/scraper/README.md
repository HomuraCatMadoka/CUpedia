# Course-tree scrapers (offline, isolated)

Offline harvest of the two authoritative data sources for the course skill tree.
**Not** part of pnpm / CI / the app runtime — a standalone Python tool with its
own venv (see [ADR 0005](../../docs/adr/0005-course-tree-data-provenance.md)).
Output lands in `scripts/data/` for the TS ingest scripts to consume.

```
tools/scraper/scrape_courses.py   →  scripts/data/courses.json      → pnpm ingest:courses
tools/scraper/scrape_handbook.py  →  scripts/data/handbook/*.html   → pnpm ingest:skeleton
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
python scrape_courses.py --limit-subjects 2
python scrape_courses.py                       # all ~259 subjects (~1h)

# Handbook study schemes (no captcha; sparse ids, mostly ~1500–1960)
python scrape_handbook.py --start 1500 --end 1960
```

## Notes & caveats

- **Captcha** — the AQS catalog subject listing is gated by a 4-character
  captcha solved with `ddddocr`. Misreads are expected; re-run failed subjects.
- **Form fields are discovered, not hardcoded** — the catalog is ASP.NET and
  echoes `__VIEWSTATE`/`__EVENTVALIDATION`. The scraper reparses the form on each
  request and forwards every hidden input. The subject `<select>`, captcha field
  and submit button are located heuristically.
- **`scrape_handbook.py` is verified** against the live two-step render
  (`document.aspx` → `view_document.aspx?...&seq=1`); leaf parsing is done in TS
  by `src/lib/parseHandbookLeaf.ts` (real-fixture-tested).
- **`scrape_courses.py` end-to-end is not offline-verifiable** (captcha + live
  DOM). The result/detail selectors are best-effort and should be confirmed on
  the first live run; `parse_detail` maps labels generically so it adapts to the
  real field names.
- **Be polite**: the source is a live government site. Keep the built-in delay,
  don't parallelize aggressively, run off-peak.
- **Licensing**: third-party datasets (e.g. EagleZhen) are AGPL — used only as a
  local validation oracle (`scripts/oracle-check.ts`), never copied or shipped.
