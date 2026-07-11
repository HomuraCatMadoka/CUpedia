"""Harvest the latest four CUHK undergraduate Major Programme study schemes.

The Handbook's Major/Minor requirements link now redirects to the official
``Browse Program Information`` ASP.NET search.  Search that source by academic
year, then save only detail pages whose study scheme says "Major Programme
Requirement".  A manifest keeps every record traceable to its official query.

Usage:
    python scrape_handbook.py
    python scrape_handbook.py --years 2025,2024 --limit 2
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse

from bs4 import BeautifulSoup

import common

PROGRAMS = "https://rgsntl.rgs.cuhk.edu.hk/aqs_prd_applx/Public/tt_dsp_acad_prog.aspx"
HANDBOOK = "https://rgsntl.rgs.cuhk.edu.hk/aqs_prd_applx/Public/Handbook/Default.aspx?id=2&lang=en"
DETAIL_PAUSE = 0.4
_ocr = None


def _hidden(soup: BeautifulSoup) -> dict[str, str]:
    return {
        el["name"]: el.get("value", "")
        for el in soup.find("form").select("input[type=hidden][name]")
    }


def _solve(s, soup: BeautifulSoup) -> str | None:
    global _ocr
    if _ocr is None:
        import ddddocr

        _ocr = ddddocr.DdddOcr(show_ad=False)
    img = soup.find("img", src=re.compile("captcha", re.I))
    raw = s.get(
        urllib.parse.urljoin(PROGRAMS, img["src"]),
        headers={"Referer": PROGRAMS},
        timeout=30,
    ).content
    text = re.sub(r"[^A-Za-z0-9]", "", _ocr.classification(raw)).upper()
    return text if len(text) == 4 else None


def current_years(s, count: int = 4) -> list[int]:
    """Read the current Handbook edition, e.g. 2025-26 -> 2025..2022."""
    html = common.get(s, HANDBOOK)
    match = re.search(r"Handbook\s+(20\d{2})-\d{2}", html, re.I)
    if not match:
        raise RuntimeError("Cannot identify the current Handbook year")
    latest = int(match.group(1))
    return list(range(latest, latest - count, -1))


def reach_listing(s, year: int, retries: int = 8) -> str:
    for _ in range(retries):
        soup = BeautifulSoup(common.get(s, PROGRAMS), "html.parser")
        captcha = _solve(s, soup)
        if not captcha:
            continue
        payload = _hidden(soup)
        payload.update(
            ddl_acad_career="UG",
            ddl_acad_year=str(year),
            txt_captcha=captcha,
            btn_search="Search",
        )
        body = s.post(
            PROGRAMS, data=payload, headers={"Referer": PROGRAMS}, timeout=30
        ).text
        if "invalid verification" not in body.lower() and "gv_detail" in body:
            return body
        time.sleep(1)
    raise RuntimeError(f"Captcha was not accepted for academic year {year}")


def listing_targets(html: str) -> list[tuple[str, str, str]]:
    """Return (postback target, faculty, academic-program title)."""
    soup = BeautifulSoup(html, "html.parser")
    grid = soup.find("table", id=re.compile("gv_detail", re.I))
    rows = []
    for row in grid.find_all("tr") if grid else []:
        cells = row.find_all("td")
        if len(cells) < 6:
            continue
        link = cells[4].find("a", href=re.compile("lbtn_prog_descr", re.I))
        match = re.search(r"__doPostBack\('([^']+)'", link.get("href", "")) if link else None
        if match:
            rows.append(
                (match.group(1), cells[2].get_text(" ", strip=True), cells[4].get_text(" ", strip=True))
            )
    return rows


def fetch_detail(s, listing_html: str, target: str) -> str:
    payload = _hidden(BeautifulSoup(listing_html, "html.parser"))
    payload.update(__EVENTTARGET=target, __EVENTARGUMENT="")
    payload.pop("btn_search", None)
    payload.pop("btn_refresh", None)
    return s.post(
        PROGRAMS, data=payload, headers={"Referer": PROGRAMS}, timeout=30
    ).text


def scheme_html(html: str) -> str:
    """Extract the Word-exported study scheme embedded in the detail page."""
    start = html.find('<span id="uc_scheme_lbl_study_scheme">')
    if start < 0:
        return ""
    start = html.find("<html", start)
    end = html.find("</html>", start)
    return html[start : end + len("</html>")] if start >= 0 and end >= 0 else ""


def scheme_metadata(html: str) -> tuple[str | None, str | None]:
    scheme = scheme_html(html)
    text = BeautifulSoup(scheme, "html.parser").get_text(" ", strip=True)
    kind = "major" if re.search(r"\bMajor Programme Requirement\b", text, re.I) else None
    year = re.search(r"admitted in\s*(20\d{2}-\d{2})", text, re.I)
    return kind, year.group(1) if year else None


def source_id(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    values = []
    for field in ("uc_scheme_hf_degree_code", "uc_scheme_hf_admission_code"):
        node = soup.find(id=field)
        values.append(node.get("value", "") if node else "")
    return ":".join(values)


def safe_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:80]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", help="comma-separated start years; default=current four")
    ap.add_argument("--limit", type=int, default=0, help="programs per year; 0=all")
    ap.add_argument("--fresh", action="store_true", help="ignore existing output")
    args = ap.parse_args()

    s = common.session()
    years = [int(y) for y in args.years.split(",")] if args.years else current_years(s)
    out = common.ensure_data_dir("handbook")
    manifest_path = out / "manifest.json"
    manifest = (
        json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest_path.exists() and not args.fresh
        else []
    )
    saved = {entry["file"] for entry in manifest}
    for year in years:
        listing = reach_listing(s, year)
        targets = listing_targets(listing)
        if args.limit:
            targets = targets[: args.limit]
        for index, (target, faculty, programme) in enumerate(targets):
            expected = f"{year}-{str(year + 1)[-2:]}-{safe_name(programme)}.html"
            if expected in saved:
                continue
            # Long ASP.NET postback runs eventually return an empty detail shell.
            # Renew the captcha-gated listing periodically, still serially/politely.
            if index and index % 20 == 0:
                listing = reach_listing(s, year)
            detail = fetch_detail(s, listing, target)
            kind, admission_year = scheme_metadata(detail)
            expected_year = f"{year}-{str(year + 1)[-2:]}"
            if kind != "major" or admission_year != expected_year:
                listing = reach_listing(s, year)
                detail = fetch_detail(s, listing, target)
                kind, admission_year = scheme_metadata(detail)
            if kind != "major" or admission_year != expected_year:
                continue
            filename = f"{admission_year}-{safe_name(programme)}.html"
            if filename in saved:
                continue
            saved.add(filename)
            (out / filename).write_text(scheme_html(detail), encoding="utf-8")
            manifest.append(
                {
                    "file": filename,
                    "programme": programme,
                    "programmeKind": kind,
                    "handbookYear": admission_year,
                    "faculty": faculty,
                    "sourceUrl": PROGRAMS,
                    "sourceId": source_id(detail),
                }
            )
            print(f"  saved {filename}")
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            time.sleep(DETAIL_PAUSE)
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"done: {len(manifest)} Major Programme schemes for {years}")


if __name__ == "__main__":
    main()
