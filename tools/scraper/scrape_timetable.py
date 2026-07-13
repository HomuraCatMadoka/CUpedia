"""Harvest official CUHK teaching timetable instructors → professors.json."""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse

import requests
from bs4 import BeautifulSoup

import common

TIMETABLE = "https://rgsntl.rgs.cuhk.edu.hk/rws_prd_applx2/Public/tt_dsp_timetable.aspx"
SUBJECT_PAUSE = 1.5
TERM_PAUSE = 0.5
_ocr = None


def _hidden(soup) -> dict[str, str]:
    return {
        el["name"]: el.get("value", "")
        for el in soup.select("form input[type=hidden][name]")
    }


def _solve(session, soup) -> str | None:
    global _ocr
    if _ocr is None:
        import ddddocr

        _ocr = ddddocr.DdddOcr(show_ad=False)
    image = soup.find("img", src=re.compile("captcha", re.I))
    raw = session.get(
        urllib.parse.urljoin(TIMETABLE, image["src"]),
        headers={"Referer": TIMETABLE},
        timeout=30,
    ).content
    text = re.sub(r"[^A-Za-z0-9]", "", _ocr.classification(raw)).upper()
    return text if len(text) == 4 else None


def options(soup, select_id: str) -> dict[str, str]:
    select = soup.find("select", id=select_id)
    return {
        option.get_text(" ", strip=True): option.get("value", "")
        for option in select.find_all("option")
        if option.get("value")
    }


def fetch_listing(session, subject: str, term: str, retries: int = 20) -> str | None:
    for _ in range(retries):
        soup = BeautifulSoup(common.get(session, TIMETABLE), "html.parser")
        captcha = _solve(session, soup)
        if not captcha:
            continue
        payload = _hidden(soup)
        payload.update(
            {
                "ddl_acad_career": "UG",
                "ddl_acad_term": term,
                "ddl_subject": subject,
                "ddl_acad_org": "",
                "txt_captcha": captcha,
                "btn_search": "Search",
            }
        )
        body = session.post(
            TIMETABLE, data=payload, headers={"Referer": TIMETABLE}, timeout=30
        ).text
        if "invalid verification" not in body.lower():
            return body
        time.sleep(1)
    return None


def parse_listing(html: str) -> list[dict[str, str]]:
    """Read course/instructor columns by header text, independent of column order."""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", id=re.compile("gv_detail", re.I))
    if not table:
        return []
    rows = table.find_all("tr")
    headers = [cell.get_text(" ", strip=True).lower() for cell in rows[0].find_all(["th", "td"])]

    def column(*needles: str) -> int | None:
        return next(
            (i for i, header in enumerate(headers) if any(n in header for n in needles)),
            None,
        )

    course_col = column("class code", "course code")
    instructor_col = column("teaching staff", "instructor")
    class_nbr_col = column("class nbr")
    quota_col = column("quota")
    vacancy_col = column("vacancy")
    component_col = column("course component")
    section_col = column("section code")
    required = [course_col, instructor_col, class_nbr_col, quota_col, vacancy_col, component_col, section_col]
    if any(value is None for value in required):
        return []
    records = []
    current_course = ""
    current_class = ""
    current_class_nbr = ""
    for row in rows[1:]:
        cells = row.find_all("td")
        if max(required) >= len(cells):
            continue
        class_code = cells[course_col].get_text(" ", strip=True).upper()
        course = re.match(r"([A-Z]{3,4})\s*(\d{4})", class_code)
        if course:
            current_course = "".join(course.groups())
            current_class = re.sub(r"[^A-Z0-9]", "", class_code)
        class_nbr = cells[class_nbr_col].get_text(" ", strip=True)
        if class_nbr:
            current_class_nbr = class_nbr
        instructors = cells[instructor_col].get_text("\n", strip=True)
        quota = cells[quota_col].get_text(" ", strip=True)
        vacancy = cells[vacancy_col].get_text(" ", strip=True)
        if re.fullmatch(r"[A-Z]{3,4}\d{4}", current_course) and (instructors or quota):
            records.append({
                "course": current_course,
                "class_code": current_class,
                "class_nbr": current_class_nbr,
                "instructors": instructors,
                "quota": quota,
                "vacancy": vacancy,
                "component": cells[component_col].get_text(" ", strip=True),
                "section": cells[section_col].get_text(" ", strip=True),
            })
    return records


def instructor_names(value: str) -> list[str]:
    invalid = {"", "-", "staff", "tba", "to be announced"}
    return [
        name
        for raw in re.split(r",\s*\n|\n", value)
        if (name := re.sub(r"^-+\s*|,\s*$", "", raw).strip()).lower()
        not in invalid
    ]


def aggregate(rows: list[dict[str, str]]) -> list[dict]:
    index: dict[str, set[str]] = {}
    for row in rows:
        for name in instructor_names(row["instructors"]):
            index.setdefault(name, set()).add(row["course"])
    return [
        {"name": name, "courses": sorted(courses)}
        for name, courses in sorted(index.items())
    ]


def enrollment_rows(rows: list[dict[str, str]]) -> list[dict]:
    records = {}
    previous_key = None
    for row in rows:
        instructors = instructor_names(row.get("instructors", ""))
        if not row.get("quota", "").isdigit() or not row.get("vacancy", "").isdigit():
            if previous_key and instructors:
                records[previous_key]["instructors"] = sorted(
                    set(records[previous_key]["instructors"] + instructors)
                )
            continue
        record = {
            "academicYear": row["academic_year"],
            "term": row["term"],
            "courseCode": row["course"],
            "classCode": row["class_code"],
            "classNbr": row["class_nbr"],
            "component": row["component"],
            "section": row["section"],
            "quota": int(row["quota"]),
            "vacancy": int(row["vacancy"]),
            "instructors": instructors,
        }
        key = (
            record["academicYear"], record["term"], record["classCode"],
            record["component"], record["section"],
        )
        records[key] = record
        previous_key = key
    return list(records.values())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--subjects", help="comma-separated subset, e.g. ACCT,CSCI")
    parser.add_argument("--year", default="2025-26", help="academic year label")
    parser.add_argument("--fresh", action="store_true")
    args = parser.parse_args()

    session = common.session()
    landing = BeautifulSoup(common.get(session, TIMETABLE), "html.parser")
    subjects = (
        [value.strip().upper() for value in args.subjects.split(",")]
        if args.subjects
        else list(options(landing, "ddl_subject").values())
    )
    terms = [
        (label, value)
        for label, value in options(landing, "ddl_acad_term").items()
        if label.startswith(args.year) and "Medicine" not in label
    ]
    if not terms:
        raise SystemExit(f"No timetable terms found for {args.year}")

    data_dir = common.ensure_data_dir()
    out = data_dir / "professors.json"
    rows = [] if args.fresh or not out.exists() else json.loads(out.read_text())["rows"]
    for subject in subjects:
        for term_label, term in terms:
            listing = fetch_listing(session, subject, term)
            if listing is None:
                raise RuntimeError(f"captcha failed for {subject} term {term}")
            parsed = parse_listing(listing)
            for row in parsed:
                row.update({"academic_year": args.year, "term": term_label.removeprefix(f"{args.year} ")})
            rows.extend(parsed)
            time.sleep(TERM_PAUSE)
        print(f"  {subject}: done")
        out.write_text(
            json.dumps({
                "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "rows": rows,
                "professors": aggregate(rows),
                "enrollments": enrollment_rows(rows),
            }, indent=2),
            encoding="utf-8",
        )
        time.sleep(SUBJECT_PAUSE)
    print(f"done: {len(aggregate(rows))} professors -> {out}")


if __name__ == "__main__":
    main()
