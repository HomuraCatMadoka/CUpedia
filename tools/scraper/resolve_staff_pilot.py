"""Resolve Engineering timetable instructors to staff identities without DB writes."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup

import common
import scrape_staff


TARGETS = {
    "BME": {
        "coursePrefix": "BMEG",
        "departmentName": "Department of Biomedical Engineering",
        "departmentUrl": "https://research.cuhk.edu.hk/en/organisations/department-of-biomedical-engineering/",
    },
    "CSE": {
        "coursePrefix": "CSCI",
        "departmentName": "Department of Computer Science and Engineering",
        "departmentUrl": "https://research.cuhk.edu.hk/en/organisations/department-of-computer-science-and-engineering/",
    },
    "EE": {
        "coursePrefix": "ELEG",
        "departmentName": "Department of Electronic Engineering",
        "departmentUrl": "https://research.cuhk.edu.hk/en/organisations/department-of-electronic-engineering/",
    },
    "IE": {
        "coursePrefix": "IERG",
        "departmentName": "Department of Information Engineering",
        "departmentUrl": "https://research.cuhk.edu.hk/en/organisations/department-of-information-engineering/",
    },
    "MAE": {
        "coursePrefix": "MAEG",
        "departmentName": "Department of Mechanical and Automation Engineering",
        "departmentUrl": "https://research.cuhk.edu.hk/en/organisations/department-of-mechanical-and-automation-engineering/",
    },
    "SEEM": {
        "coursePrefix": "SEEM",
        "departmentName": "Department of Systems Engineering and Engineering Management",
        "departmentUrl": "https://research.cuhk.edu.hk/en/organisations/department-of-systems-engineering-and-engineering-management/",
    },
}
REPO_ROOT = Path(__file__).resolve().parents[2]


def name_key(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = re.sub(
        r"^(professor|prof|doctor|dr|mr|ms|miss)\.?\s+",
        "",
        value,
        flags=re.IGNORECASE,
    )
    tokens = re.findall(r"[^\W_]+", value, flags=re.UNICODE)
    if not tokens:
        return ""

    # Pure normally renders ``SURNAME Given`` while some timetable rows use
    # ``Given SURNAME``. Rotate only an explicit trailing uppercase surname;
    # sorting every token would collapse distinct people such as XUE Yang and
    # YANG Xue into the same identity.
    if not tokens[0].isupper() and tokens[-1].isupper():
        surname_start = len(tokens) - 1
        while surname_start and tokens[surname_start - 1].isupper():
            surname_start -= 1
        tokens = tokens[surname_start:] + tokens[:surname_start]
    return " ".join(token.casefold() for token in tokens)


def profile_url(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    node = soup.select_one('meta[property="og:url"]')
    if not node or not node.get("content"):
        raise ValueError("Cached person page has no og:url")
    return scrape_staff.canonical_url(node["content"])


def load_cached_people(cache_dir: Path) -> list[dict]:
    people = []
    for path in sorted(cache_dir.glob("*.html")):
        html = path.read_text(encoding="utf-8")
        try:
            url = profile_url(html)
            people.append(scrape_staff.parse_person(html, url))
        except ValueError:
            continue
    return people


def external_key(person: dict) -> str:
    if person.get("externalId"):
        return f"pure:{person['externalId']}"
    return f"profile:{person['profileUrl']}"


def query_production() -> list[dict]:
    sql = """
select p.id, p.name,
       array_agg(distinct pc.course_code order by pc.course_code) as courses,
       count(distinct cr.id)::int as review_count,
       count(distinct rating.id)::int as rating_count
from professors p
join professor_courses pc on pc.professor_id = p.id
left join course_reviews cr on cr.professor_id = p.id
left join course_ratings rating on rating.professor_id = p.id
where substring(pc.course_code from '^[A-Z]+') in ('BMEG', 'CSCI', 'ELEG', 'IERG', 'MAEG', 'SEEM')
group by p.id, p.name
order by p.name, p.id
"""
    result = subprocess.run(
        [
            "supabase", "db", "query", "--linked", "--output", "json",
            "--workdir", str(REPO_ROOT), sql,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    start = result.stdout.find("{")
    if start < 0:
        raise RuntimeError("Supabase CLI returned no JSON object")
    value, _ = json.JSONDecoder().raw_decode(result.stdout[start:])
    return value["rows"]


def load_production(path: Path | None) -> list[dict]:
    if path is None:
        return query_production()
    value = json.loads(path.read_text(encoding="utf-8"))
    return value.get("rows", value)


def resolve_record(
    row: dict,
    target: str,
    candidates_by_name: dict[str, list[dict]],
    people_by_url: dict[str, dict],
    override: dict | None,
) -> dict:
    resolution = "automatic"
    relationship = None
    evidence_url = None
    note = None
    candidates = candidates_by_name.get(name_key(row["name"]), [])
    person = None

    if override:
        resolution = "manual_override"
        relationship = override.get("targetRelationship")
        evidence_url = override.get("evidenceUrl")
        note = override.get("note")
        if override.get("profileUrl"):
            url = scrape_staff.canonical_url(override["profileUrl"])
            person = people_by_url.get(url)
            if not person:
                raise ValueError(f"Override profile not found in cache: {url}")
        else:
            identity_key = f"manual:{override['syntheticIdentity']}"
            return {
                **row,
                "status": "resolved",
                "resolution": resolution,
                "identityKey": identity_key,
                "canonicalName": override["canonicalName"],
                "profileUrl": None,
                "affiliations": [],
                "targetRelationship": relationship,
                "classification": "target_related",
                "identityKind": override.get("identityKind", "unverified"),
                "evidenceUrl": evidence_url,
                "note": note,
            }
    elif len(candidates) == 1:
        person = candidates[0]
    elif not candidates:
        return {**row, "status": "unresolved", "candidateProfiles": []}
    else:
        return {
            **row,
            "status": "ambiguous",
            "candidateProfiles": [
                {"name": item["name"], "profileUrl": item["profileUrl"]}
                for item in candidates
            ],
        }

    department_url = TARGETS[target]["departmentUrl"]
    department_name = TARGETS[target]["departmentName"].casefold()
    official_affiliation = any(
        item.get("organisationUrl") == department_url
        or item.get("organisation", "").casefold() == department_name
        for item in person["affiliations"]
    )
    classification = (
        "official_department"
        if official_affiliation
        else "target_related"
        if relationship
        else "cross_department"
    )
    return {
        **row,
        "status": "resolved",
        "resolution": resolution,
        "identityKey": external_key(person),
        "canonicalName": person["name"],
        "profileUrl": person["profileUrl"],
        "affiliations": person["affiliations"],
        "targetRelationship": relationship,
        "classification": classification,
        "identityKind": override.get("identityKind", "official") if override else "official",
        "evidenceUrl": evidence_url,
        "note": note,
    }


def build_report(directory: dict, production: list[dict], people: list[dict], overrides: dict) -> dict:
    candidates_by_name = defaultdict(list)
    people_by_url = {}
    for person in people:
        candidates_by_name[name_key(person["name"])].append(person)
        people_by_url[person["profileUrl"]] = person

    departments = {}
    all_actions = []
    for target, config in TARGETS.items():
        rows = [
            row for row in production
            if any(course.startswith(config["coursePrefix"]) for course in row["courses"])
        ]
        records = [
            resolve_record(
                row,
                target,
                candidates_by_name,
                people_by_url,
                overrides.get(target, {}).get(row["name"]),
            )
            for row in rows
        ]
        official_department = next(
            department
            for faculty in directory["faculties"]
            for department in faculty["departments"]
            if department["sourceUrl"] == config["departmentUrl"]
        )
        teaching_keys = {
            record["identityKey"]
            for record in records
            if record["status"] == "resolved"
        }
        official_not_teaching = []
        for staff in official_department["staff"]:
            cached = people_by_url.get(staff["profileUrl"])
            key = external_key(cached) if cached else f"profile:{staff['profileUrl']}"
            if key not in teaching_keys:
                official_not_teaching.append({**staff, "identityKey": key})

        identities = defaultdict(list)
        for record in records:
            if record["status"] == "resolved":
                identities[record["identityKey"]].append(record)
        actions = []
        for identity_key, duplicated in identities.items():
            if len(duplicated) < 2:
                continue
            preferred = min(duplicated, key=lambda item: ("<" in item["name"], item["name"]))
            actions.append(
                {
                    "action": "merge_professor_records",
                    "identityKey": identity_key,
                    "keepProfessorId": preferred["id"],
                    "mergeProfessorIds": [item["id"] for item in duplicated if item["id"] != preferred["id"]],
                    "names": [item["name"] for item in duplicated],
                    "blockedByReviews": any(
                        item.get("review_count", 0) or item.get("rating_count", 0)
                        for item in duplicated
                    ),
                }
            )
        all_actions.extend({"department": target, **item} for item in actions)
        row_counts = defaultdict(int)
        for record in records:
            row_counts[record["status"]] += 1
            if record["status"] == "resolved":
                row_counts[record["classification"]] += 1
                row_counts[record["resolution"]] += 1
        identity_counts = defaultdict(int)
        for duplicated in identities.values():
            identity_counts[duplicated[0]["classification"]] += 1
        departments[target] = {
            "coursePrefix": config["coursePrefix"],
            "officialStaffCaptured": len(official_department["staff"]),
            "expectedOfficialStaff": official_department.get("staffCoverage", {}).get("expected"),
            "officialDirectoryComplete": official_department.get("staffCoverage", {}).get("complete", False),
            "productionProfessorRows": len(records),
            "resolvedIdentities": len(identities),
            "rowCounts": dict(sorted(row_counts.items())),
            "identityCounts": dict(sorted(identity_counts.items())),
            "records": records,
            "capturedOfficialStaffNotTeaching": official_not_teaching,
            "notTeachingConclusionComplete": official_department.get("staffCoverage", {}).get("complete", False),
            "cleaningActions": actions,
        }
    all_records = [
        record
        for department in departments.values()
        for record in department["records"]
    ]
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "mode": "engineering_read_only_dry_run",
        "summary": {
            "departmentCourseRows": len(all_records),
            "uniqueProductionProfessorIds": len({record["id"] for record in all_records}),
            "uniqueResolvedIdentities": len({
                record["identityKey"]
                for record in all_records
                if record["status"] == "resolved"
            }),
            "automaticRows": sum(record.get("resolution") == "automatic" for record in all_records),
            "manualOverrideRows": sum(record.get("resolution") == "manual_override" for record in all_records),
            "unresolvedRows": sum(record["status"] == "unresolved" for record in all_records),
            "ambiguousRows": sum(record["status"] == "ambiguous" for record in all_records),
            "expectedOfficialStaff": sum(
                value["expectedOfficialStaff"] or value["officialStaffCaptured"]
                for value in departments.values()
            ),
            "officialStaffCaptured": sum(value["officialStaffCaptured"] for value in departments.values()),
            "completeDepartmentDirectories": sum(
                value["officialDirectoryComplete"] for value in departments.values()
            ),
        },
        "departments": departments,
        "cleaningActions": all_actions,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    data_dir = common.ensure_data_dir()
    parser.add_argument("--directory", type=Path, default=data_dir / "staff-directory.json")
    parser.add_argument("--production-file", type=Path)
    parser.add_argument("--cache-dir", type=Path, default=data_dir / "staff-directory-cache/persons")
    parser.add_argument("--overrides", type=Path, default=Path(__file__).with_name("staff-identity-overrides.json"))
    parser.add_argument("--output", type=Path, default=data_dir / "staff-engineering-report.json")
    args = parser.parse_args()

    directory = json.loads(args.directory.read_text(encoding="utf-8"))
    overrides = json.loads(args.overrides.read_text(encoding="utf-8"))
    report = build_report(directory, load_production(args.production_file), load_cached_people(args.cache_dir), overrides)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "summary": report["summary"],
        "departments": {
            name: value | {
                "records": None,
                "capturedOfficialStaffNotTeaching": None,
            }
            for name, value in report["departments"].items()
        },
    }, ensure_ascii=False, indent=2))
    print(f"done -> {args.output}")


if __name__ == "__main__":
    main()
