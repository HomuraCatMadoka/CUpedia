"""Harvest UG and 5000+ PG timetable instructors → professors.json."""

from __future__ import annotations

import argparse
import fcntl
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
ACADEMIC_CAREERS = ("UG", "RPG", "TPG", "PGDE")
_ocr = None
INVALID_INSTRUCTOR_NAMES = {
    "", "-", "staff", "tba", "to be announced",
    "pr", "pro", "prof", "profes", "profess", "professor", "prof.",
    "doctor", "dr", "dr.", "mr", "mr.", "ms", "ms.", "miss",
}


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


def selected_value(soup, select_id: str) -> str:
    select = soup.find("select", id=select_id)
    if not select:
        return ""
    option = select.find("option", selected=True) or select.find("option")
    return option.get("value", "") if option else ""


def select_career(session, soup, career: str):
    """Apply the career postback so ASP.NET refreshes dependent form state."""
    selected = soup.select_one("#ddl_acad_career option[selected]")
    if selected and selected.get("value") == career:
        return soup
    payload = _hidden(soup)
    payload.update(
        {
            "__EVENTTARGET": "ddl_acad_career",
            "__EVENTARGUMENT": "",
            "ddl_acad_career": career,
            "ddl_acad_term": selected_value(soup, "ddl_acad_term"),
            "ddl_subject": selected_value(soup, "ddl_subject"),
            "ddl_acad_org": selected_value(soup, "ddl_acad_org"),
        }
    )
    body = session.post(
        TIMETABLE, data=payload, headers={"Referer": TIMETABLE}, timeout=30
    ).text
    return BeautifulSoup(body, "html.parser")


def fetch_listing(
    session, subject: str, term: str, career: str, retries: int = 20
) -> str | None:
    for _ in range(retries):
        soup = BeautifulSoup(common.get(session, TIMETABLE), "html.parser")
        soup = select_career(session, soup, career)
        captcha = _solve(session, soup)
        if not captcha:
            continue
        payload = _hidden(soup)
        payload.update(
            {
                "ddl_acad_career": career,
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


def include_course(career: str, course_code: str) -> bool:
    """Keep all UG offerings and only 5000+ postgraduate offerings."""
    match = re.search(r"\d{4}$", course_code)
    return career == "UG" or bool(match and int(match.group()) >= 5000)


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
    required = [
        course_col,
        instructor_col,
        class_nbr_col,
        quota_col,
        component_col,
        section_col,
    ]
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
        vacancy = (
            cells[vacancy_col].get_text(" ", strip=True)
            if vacancy_col is not None
            else ""
        )
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
    return [
        name
        for raw in re.split(r",\s*\n|\n", value)
        if (name := re.sub(r"^-+\s*|,\s*$", "", raw).strip()).lower()
        not in INVALID_INSTRUCTOR_NAMES
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
        if not row.get("quota", "").isdigit():
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
            "vacancy": int(row["vacancy"]) if row.get("vacancy", "").isdigit() else None,
            "instructors": instructors,
        }
        key = (
            record["academicYear"], record["term"], record["classCode"],
            record["component"], record["section"],
        )
        records[key] = record
        previous_key = key
    return list(records.values())


def row_subject(row: dict) -> str:
    match = re.match(r"[A-Z]{3,4}", row["course"])
    return match.group(0) if match else ""


def persist_subject(out, ledger, subject: str, subject_rows: list[dict]) -> int:
    """Merge one completed subject while allowing disjoint workers to share output."""
    lock = out.with_suffix(".lock")
    with lock.open("a") as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        rows = json.loads(out.read_text())["rows"] if out.exists() else []
        rows = [row for row in rows if row_subject(row) != subject]
        rows.extend(subject_rows)
        done = (
            set(json.loads(ledger.read_text(encoding="utf-8")))
            if ledger.exists()
            else {row_subject(row) for row in rows}
        )
        done.add(subject)
        payload = {
            "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "rows": rows,
            "professors": aggregate(rows),
            "enrollments": enrollment_rows(rows),
        }
        out_tmp = out.with_suffix(".json.tmp")
        ledger_tmp = ledger.with_suffix(".json.tmp")
        out_tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        ledger_tmp.write_text(
            json.dumps(sorted(done), ensure_ascii=False, indent=2), encoding="utf-8"
        )
        out_tmp.replace(out)
        ledger_tmp.replace(ledger)
        return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--subjects", help="comma-separated subset, e.g. ACCT,CSCI")
    parser.add_argument("--year", default="2025-26", help="academic year label")
    parser.add_argument("--fresh", action="store_true")
    args = parser.parse_args()

    session = common.session()
    landing = BeautifulSoup(common.get(session, TIMETABLE), "html.parser")
    available_careers = set(options(landing, "ddl_acad_career").values())
    careers = [career for career in ACADEMIC_CAREERS if career in available_careers]
    if not careers:
        raise SystemExit("No supported academic careers found")
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
    ledger = data_dir / "professors.attempted.json"
    if args.fresh:
        out.unlink(missing_ok=True)
        ledger.unlink(missing_ok=True)
    rows = [] if args.fresh or not out.exists() else json.loads(out.read_text())["rows"]
    done = (
        set(json.loads(ledger.read_text(encoding="utf-8")))
        if ledger.exists()
        else {row_subject(row) for row in rows}
    )
    todo = [subject for subject in subjects if subject not in done]
    print(f"{len(todo)}/{len(subjects)} subjects to scrape ({len(done)} already attempted)")
    total = len(rows)
    for subject in todo:
        subject_rows = []
        for career in careers:
            for term_label, term in terms:
                listing = fetch_listing(session, subject, term, career)
                if listing is None:
                    raise RuntimeError(
                        f"captcha failed for {career} {subject} term {term}"
                    )
                parsed = [
                    row
                    for row in parse_listing(listing)
                    if include_course(career, row["course"])
                ]
                for row in parsed:
                    row.update({
                        "academic_year": args.year,
                        "academic_career": career,
                        "term": term_label.removeprefix(f"{args.year} "),
                    })
                subject_rows.extend(parsed)
                time.sleep(TERM_PAUSE)
        print(f"  {subject}: done")
        total = persist_subject(out, ledger, subject, subject_rows)
        time.sleep(SUBJECT_PAUSE)
    print(f"done: {total} rows -> {out}")


if __name__ == "__main__":
    main()
