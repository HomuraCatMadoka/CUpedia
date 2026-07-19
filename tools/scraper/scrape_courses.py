"""Harvest the official AQS public undergraduate course catalog → courses.json.

Source (see docs/adr/0005): the AQS public catalog is the authoritative course
identity. The subject listing is gated by a 4-character captcha; each course's
detail page carries the canonical title / units / description / requirements.

Mechanism (reverse-engineered from the live ASP.NET page — clean-room; only the
site's own field names and error strings are reused):

    1. GET the catalog → echo back every hidden field (chunked __VIEWSTATE,
       hf_Captcha, …) + ``ddl_subject`` + the captcha solved from ``imgCaptcha``
       + ``btn_search`` → POST. One captcha unlocks the whole subject.
    2. The result is a ``gv_detail`` GridView; each row exposes a
       ``gv_detail$ctlNN$lbtn_course_nbr`` __doPostBack target.
    3. Replaying the listing's hidden fields with that target as __EVENTTARGET
       returns the course detail page — no further captcha per course.
    4. Read the detail by its stable control ids (``uc_course_lbl_*``).

ddddocr is imperfect, so the captcha POST runs in a retry loop (the site echoes
"Invalid Verification Code" on a miss). Run small first:

    python scrape_courses.py --subjects ACCT,CSCI
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse

import requests
from bs4 import BeautifulSoup

import common

DETAIL_PAUSE = 0.4  # polite delay between course detail fetches
SUBJECT_PAUSE = 1.5  # extra breather between subjects (rate-limit courtesy)

CATALOG = "https://rgsntl.rgs.cuhk.edu.hk/aqs_prd_applx/Public/tt_dsp_crse_catalog.aspx"

# Stable ASP.NET control ids on the detail page (verified live).
DETAIL = {
    "course": "uc_course_lbl_course",  # "ACCT 1111 - Foundations in Financial Accounting"
    "career": "uc_course_lbl_acad_career",
    "units": "uc_course_lbl_units",
    "description": "uc_course_lbl_crse_descrlong",
    "requirements": "uc_course_tc_enrl_requirement",
}
TERM_DDL = "uc_course_ddl_class_term"

_ocr = None


def _solve(s, soup) -> str | None:
    """OCR the page's captcha → 4 uppercase alnum chars, or None on a short read."""
    global _ocr
    if _ocr is None:
        import ddddocr  # lazy: only this path needs the ML dep

        _ocr = ddddocr.DdddOcr(show_ad=False)
    img = soup.find("img", src=re.compile("captcha", re.I))
    raw = s.get(
        urllib.parse.urljoin(CATALOG, img["src"]),
        headers={"Referer": CATALOG},
        timeout=30,
    ).content
    text = re.sub(r"[^A-Za-z0-9]", "", _ocr.classification(raw)).upper()
    return text if len(text) == 4 else None


def _hidden(soup) -> dict[str, str]:
    form = soup.find("form")
    return {
        el["name"]: el.get("value", "")
        for el in form.select("input[type=hidden]")
        if el.get("name")
    }


def subject_catalog(s) -> list[dict[str, str]]:
    soup = BeautifulSoup(common.get(s, CATALOG), "html.parser")
    sel = soup.find("select", id="ddl_subject")
    catalog = []
    for option in sel.find_all("option"):
        code = option.get("value", "")
        if not re.fullmatch(r"[A-Z]{3,4}", code):
            continue
        label = option.get_text(" ", strip=True)
        name = re.sub(rf"^{re.escape(code)}\s*-\s*", "", label).strip()
        catalog.append({"code": code, "nameEn": name or code})
    return catalog


def reach_listing(s, subject: str, retries: int = 8) -> str | None:
    """Solve the captcha and POST the subject search until the grid appears."""
    for _ in range(retries):
        soup = BeautifulSoup(common.get(s, CATALOG), "html.parser")
        captcha = _solve(s, soup)
        if not captcha:
            continue
        payload = _hidden(soup)
        payload["ddl_subject"] = subject
        payload["txt_captcha"] = captcha
        payload["btn_search"] = "Search"
        body = s.post(
            CATALOG, data=payload, headers={"Referer": CATALOG}, timeout=30
        ).text
        if "invalid verification" not in body.lower() and "gv_detail" in body:
            return body
        time.sleep(1)
    return None


def list_targets(listing_html: str) -> list[str]:
    """Each course row's __doPostBack target (the course-number LinkButton)."""
    soup = BeautifulSoup(listing_html, "html.parser")
    grid = soup.find("table", id=re.compile("gv_detail", re.I))
    targets = []
    for a in grid.find_all("a", href=True):
        m = re.search(r"__doPostBack\('([^']*lbtn_course_nbr)'", a["href"])
        if m:
            targets.append(m.group(1))
    return targets


def fetch_detail(s, listing_hidden: dict[str, str], target: str) -> str:
    payload = dict(listing_hidden)
    payload["__EVENTTARGET"] = target
    payload["__EVENTARGUMENT"] = ""
    payload.pop("btn_search", None)
    payload.pop("btn_refresh", None)
    return s.post(
        CATALOG, data=payload, headers={"Referer": CATALOG}, timeout=30
    ).text


def parse_detail(html: str, subject: str) -> dict | None:
    soup = BeautifulSoup(html, "html.parser")

    def text(node_id: str) -> str:
        el = soup.find(id=node_id)
        return el.get_text(" ", strip=True) if el else ""

    heading = text(DETAIL["course"])  # "ACCT 1111 - Title"
    m = re.match(r"\s*([A-Z]{3,4}\s?\d{4})\s*-\s*(.*)", heading)
    if not m:
        return None
    ddl = soup.find(id=TERM_DDL)
    terms = (
        [o.get_text(strip=True) for o in ddl.find_all("option")] if ddl else []
    )
    return {
        "subject": subject,
        "code": m.group(1),
        "title": m.group(2).strip(),
        "units": text(DETAIL["units"]),
        "career": text(DETAIL["career"]),
        "description": text(DETAIL["description"]),
        "requirements": text(DETAIL["requirements"]),
        "terms": terms,
    }


def scrape_subject(s, subject: str) -> list[dict]:
    listing = reach_listing(s, subject)
    if listing is None:
        print(f"  {subject}: captcha never accepted, skipped")
        return []
    hidden = _hidden(BeautifulSoup(listing, "html.parser"))
    out = []
    for target in list_targets(listing):
        try:  # a transient network blip should skip one course, not abort the subject
            record = parse_detail(fetch_detail(s, hidden, target), subject)
        except requests.RequestException:
            record = None
        if record:
            out.append(record)
        time.sleep(DETAIL_PAUSE)
    print(f"  {subject}: {len(out)} courses")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--subjects", help="comma-separated subset, e.g. ACCT,CSCI")
    ap.add_argument("--limit-subjects", type=int, default=0, help="0 = all")
    ap.add_argument("--fresh", action="store_true", help="ignore existing output")
    ap.add_argument(
        "--catalog-only",
        action="store_true",
        help="refresh subjects.json without solving captchas or scraping courses",
    )
    args = ap.parse_args()

    s = common.session()
    catalog = subject_catalog(s)
    targets = (
        [x.strip().upper() for x in args.subjects.split(",")]
        if args.subjects
        else [item["code"] for item in catalog]
    )
    if args.limit_subjects:
        targets = targets[: args.limit_subjects]

    data_dir = common.ensure_data_dir()
    (data_dir / "subjects.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if args.catalog_only:
        print(f'done: {len(catalog)} subjects -> {data_dir / "subjects.json"}')
        return
    out = data_dir / "courses.json"
    ledger = data_dir / "courses.attempted.json"  # every attempted subject, incl. empty
    fresh = args.fresh
    courses: list[dict] = (
        json.loads(out.read_text(encoding="utf-8"))
        if out.exists() and not fresh
        else []
    )
    # Resume by *attempted* subject, not just harvested — else a subject that
    # yields 0 courses (defunct/no offering) is re-tried on every restart.
    done = set(json.loads(ledger.read_text(encoding="utf-8"))) if ledger.exists() and not fresh else set()
    done |= {c["subject"] for c in courses}  # seed from a pre-ledger courses.json
    todo = [t for t in targets if t not in done]
    print(f"{len(todo)}/{len(targets)} subjects to scrape ({len(done)} already attempted)")

    for subject in todo:
        courses.extend(scrape_subject(s, subject))
        done.add(subject)
        # persist both after each subject so a crash/kill is resumable
        out.write_text(
            json.dumps(courses, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        ledger.write_text(
            json.dumps(sorted(done), ensure_ascii=False, indent=2), encoding="utf-8"
        )
        time.sleep(SUBJECT_PAUSE)
    print(f"done: {len(courses)} courses -> {out}")


if __name__ == "__main__":
    main()
