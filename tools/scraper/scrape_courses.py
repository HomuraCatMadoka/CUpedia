"""Harvest the official AQS public undergraduate course catalog → courses.json.

Source (see docs/adr/0005): the AQS public catalog is the authoritative course
identity. The subject listing is gated by a 4-character captcha; the per-course
detail page carries the canonical title / units / description / requirements.

Flow (form fields are *discovered*, not hardcoded — the page is ASP.NET and
carries __VIEWSTATE et al. that must be echoed back):

    1. GET the catalog page → parse the <form>: hidden inputs, the subject
       <select>, the captcha <img> + its text field, the submit button.
    2. Per subject: download the captcha image → ddddocr → POST the form with
       every hidden input echoed back + subject + solved captcha.
    3. Parse the result list → follow each course's detail page → collect fields.
    4. Write scripts/data/courses.json (RawCourse[] for ingest-courses.ts).

Captcha solving needs ``ddddocr`` (heavy; see pyproject). The catalog DOM
selectors below are best-effort and meant to be confirmed on the first live run
(the catalog could not be exercised end-to-end offline). Run small first:

    python scrape_courses.py --limit-subjects 2
"""

from __future__ import annotations

import argparse
import json
import re
import urllib.parse

from bs4 import BeautifulSoup

import common

CATALOG = "https://rgsntl.rgs.cuhk.edu.hk/aqs_prd_applx/Public/tt_dsp_crse_catalog.aspx"
CODE_RE = re.compile(r"\b[A-Z]{3,4}\s?\d{4}\b")

# label (lowercased, alnum-only) -> RawCourse key consumed by normalizeCourse
FIELD_MAP = {
    "coursecode": "code",
    "coursetitle": "title",
    "title": "title",
    "unit": "units",
    "units": "units",
    "credit": "units",
    "credits": "units",
    "coursedescription": "description",
    "description": "description",
    "prerequisite": "requirements",
    "prerequisites": "requirements",
    "career": "career",
    "semester": "terms",
    "termsoffered": "terms",
}


def _solve_captcha(img_bytes: bytes) -> str:
    import ddddocr  # lazy: only this path needs the ML dep

    ocr = ddddocr.DdddOcr(show_ad=False)
    return re.sub(r"[^A-Za-z0-9]", "", ocr.classification(img_bytes))[:4]


def _hidden_inputs(form) -> dict[str, str]:
    out = {}
    for el in form.select("input[type=hidden]"):
        if el.get("name"):
            out[el["name"]] = el.get("value", "")
    return out


def _subject_select(form):
    for sel in form.find_all("select"):
        opts = [o.get("value", "") for o in sel.find_all("option")]
        if sum(bool(re.fullmatch(r"[A-Z]{3,4}", v)) for v in opts) >= 5:
            return sel
    return None


def fetch_subjects(s) -> tuple[str, dict[str, str], str, str, str, list[str]]:
    """Return (form_action, hidden, select_name, captcha_field, submit_field, subjects)."""
    soup = BeautifulSoup(common.get(s, CATALOG), "html.parser")
    form = soup.find("form")
    sel = _subject_select(form)
    text_inputs = [i for i in form.select("input[type=text]") if i.get("name")]
    submit = form.select_one("input[type=submit], button[type=submit]")
    action = urllib.parse.urljoin(CATALOG, form.get("action") or CATALOG)
    subjects = [o["value"] for o in sel.find_all("option") if re.fullmatch(r"[A-Z]{3,4}", o.get("value", ""))]
    return (
        action,
        _hidden_inputs(form),
        sel["name"],
        text_inputs[0]["name"] if text_inputs else "captcha",
        submit.get("name", "") if submit else "",
        subjects,
    )


def captcha_bytes(s, soup) -> bytes:
    img = soup.find("img", src=re.compile("BuildCaptcha", re.I))
    src = urllib.parse.urljoin(CATALOG, img["src"])
    return s.get(src, timeout=30).content


def post_subject(s, action, hidden, select_name, captcha_field, submit_field, subject) -> str:
    soup = BeautifulSoup(common.get(s, CATALOG), "html.parser")
    form = soup.find("form")
    payload = _hidden_inputs(form)
    payload[select_name] = subject
    payload[captcha_field] = _solve_captcha(captcha_bytes(s, soup))
    if submit_field:
        payload[submit_field] = "Search"
    r = s.post(action, data=payload, timeout=30)
    r.raise_for_status()
    return r.text


def parse_detail(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    record: dict[str, str] = {}
    for row in soup.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in row.find_all(["td", "th"])]
        if len(cells) < 2 or not cells[0]:
            continue
        key = re.sub(r"[^a-z]", "", cells[0].lower())
        if key in FIELD_MAP:
            record.setdefault(FIELD_MAP[key], cells[1])
    return record


def parse_detail_links(html: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    links = {urllib.parse.urljoin(CATALOG, a["href"]) for a in soup.find_all("a", href=True) if "dsp_crse" in a["href"].lower()}
    return sorted(links)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit-subjects", type=int, default=0, help="0 = all")
    args = ap.parse_args()

    s = common.session()
    action, hidden, select_name, captcha_field, submit_field, subjects = fetch_subjects(s)
    if args.limit_subjects:
        subjects = subjects[: args.limit_subjects]
    print(f"{len(subjects)} subjects; captcha field={captcha_field!r} select={select_name!r}")

    courses: list[dict] = []
    for subject in subjects:
        listing = post_subject(s, action, hidden, select_name, captcha_field, submit_field, subject)
        for url in parse_detail_links(listing):
            record = parse_detail(common.get(s, url, referer=CATALOG))
            if record.get("code"):
                record.setdefault("subject", subject)
                courses.append(record)
        print(f"  {subject}: {len(courses)} total")

    out = common.ensure_data_dir() / "courses.json"
    out.write_text(json.dumps(courses, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"done: {len(courses)} courses -> {out}")


if __name__ == "__main__":
    main()
