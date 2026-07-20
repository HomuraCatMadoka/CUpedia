"""Compare the full official staff directory with production professor rows.

The comparison is deliberately read-only.  It only accepts a normalized exact
name when that name identifies one official profile; homonyms stay ambiguous.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import common
import scrape_staff
from resolve_staff_pilot import REPO_ROOT, load_cached_people, name_key


def query_production() -> list[dict]:
    sql = """
select p.id, p.name,
       coalesce(array_agg(distinct pc.course_code order by pc.course_code)
         filter (where pc.course_code is not null), '{}') as courses,
       count(distinct cr.id)::int as review_count,
       count(distinct rating.id)::int as rating_count
from professors p
left join professor_courses pc on pc.professor_id = p.id
left join course_reviews cr on cr.professor_id = p.id
left join course_ratings rating on rating.professor_id = p.id
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
    if isinstance(value, list):
        return value
    return value.get("rows") or value.get("professors") or []


def directory_people(directory: dict) -> dict[str, dict]:
    if directory.get("people") and directory.get("organisations"):
        organisations = {
            item["sourceUrl"]: item for item in directory["organisations"]
        }
        organisation_urls_by_name: dict[str, list[str]] = defaultdict(list)
        for item in organisations.values():
            organisation_urls_by_name[item["name"].casefold()].append(
                item["sourceUrl"]
            )
        people = {}
        for source in directory["people"]:
            memberships = []
            seen = set()
            for affiliation in source["affiliations"]:
                organisation_url = affiliation.get("organisationUrl")
                if not organisation_url:
                    candidates = organisation_urls_by_name.get(
                        affiliation["organisation"].casefold(), []
                    )
                    organisation_url = candidates[0] if len(candidates) == 1 else None
                organisation = organisations.get(organisation_url)
                if not organisation or organisation_url in seen:
                    continue
                seen.add(organisation_url)
                faculty = organisations.get(organisation.get("facultyUrl"))
                memberships.append(
                    {
                        "faculty": faculty["name"] if faculty else None,
                        "department": (
                            None
                            if organisation["organisationType"] == "faculty"
                            else organisation["name"]
                        ),
                        "departmentUrl": organisation["sourceUrl"],
                        "organisationType": organisation["organisationType"],
                    }
                )
            if memberships:
                people[source["profileUrl"]] = {
                    "id": source["id"],
                    "name": source["name"],
                    "email": source.get("email"),
                    "profileUrl": source["profileUrl"],
                    "memberships": memberships,
                }
        return people

    people: dict[str, dict] = {}
    seen_memberships: dict[str, set[tuple[str, str | None]]] = defaultdict(set)
    for faculty in directory["faculties"]:
        units = [(None, faculty.get("facultyStaff", []))]
        units.extend((department, department["staff"]) for department in faculty["departments"])
        for department, staff in units:
            for row in staff:
                profile_url = row["profileUrl"]
                person = people.setdefault(
                    profile_url,
                    {
                        "id": row["id"],
                        "name": row["name"],
                        "email": row.get("email"),
                        "profileUrl": profile_url,
                        "memberships": [],
                    },
                )
                membership_key = (faculty["name"], department["name"] if department else None)
                if membership_key in seen_memberships[profile_url]:
                    continue
                seen_memberships[profile_url].add(membership_key)
                person["memberships"].append(
                    {
                        "faculty": faculty["name"],
                        "department": department["name"] if department else None,
                        "departmentUrl": department["sourceUrl"] if department else None,
                    }
                )
    return people


def compact_person(person: dict) -> dict:
    return {
        "name": person["name"],
        "profileUrl": person["profileUrl"],
        "memberships": person["memberships"],
    }


def compact_portal_person(person: dict) -> dict:
    return {
        "name": person["name"],
        "profileUrl": person["profileUrl"],
        "affiliations": person.get("affiliations", []),
    }


def faculty_structure(directory: dict) -> list[dict]:
    """Return the reporting hierarchy for legacy and organisation-first inputs."""
    if directory.get("faculties"):
        return directory["faculties"]
    organisations = directory.get("organisations", [])
    faculties = {
        item["sourceUrl"]: {
            "name": item["name"],
            "departments": [],
        }
        for item in organisations
        if item.get("organisationType") == "faculty"
    }
    for item in organisations:
        faculty = faculties.get(item.get("facultyUrl"))
        if not faculty or item.get("organisationType") == "faculty":
            continue
        faculty["departments"].append(
            {
                "name": item["name"],
                "sourceUrl": item["sourceUrl"],
                "staffCoverage": item.get("staffCoverage"),
            }
        )
    return sorted(faculties.values(), key=lambda item: item["name"])


def build_report(
    directory: dict,
    production: list[dict],
    portal_people: list[dict] | None = None,
    reviewed_aliases: list[dict] | None = None,
) -> dict:
    scrape_staff.require_complete_directory(directory)
    people = directory_people(directory)
    candidates_by_name: dict[str, list[dict]] = defaultdict(list)
    for person in people.values():
        candidates_by_name[name_key(person["name"])].append(person)
    for override in reviewed_aliases or []:
        person = people.get(override["profileUrl"])
        if not person:
            raise ValueError(
                f"Reviewed alias profile not found: {override['profileUrl']}"
            )
        candidates = candidates_by_name[name_key(override["alias"])]
        if person not in candidates:
            candidates.append(person)
    portal_candidates_by_name: dict[str, list[dict]] = defaultdict(list)
    for person in portal_people or []:
        portal_candidates_by_name[name_key(person["name"])].append(person)

    records = []
    production_by_profile: dict[str, list[dict]] = defaultdict(list)
    production_by_name: dict[str, list[dict]] = defaultdict(list)
    for row in production:
        production_by_name[name_key(row["name"])].append(row)
        candidates = candidates_by_name.get(name_key(row["name"]), [])
        if len(candidates) == 1:
            person = candidates[0]
            production_by_profile[person["profileUrl"]].append(row)
            records.append({**row, "status": "matched", "officialPerson": compact_person(person)})
        elif candidates:
            records.append(
                {
                    **row,
                    "status": "ambiguous",
                    "candidateProfiles": [compact_person(person) for person in candidates],
                }
            )
        else:
            portal_candidates = portal_candidates_by_name.get(name_key(row["name"]), [])
            if len(portal_candidates) == 1:
                records.append(
                    {
                        **row,
                        "status": "portal_other_unit",
                        "officialPerson": compact_portal_person(portal_candidates[0]),
                    }
                )
            elif portal_candidates:
                records.append(
                    {
                        **row,
                        "status": "portal_ambiguous",
                        "candidateProfiles": [
                            compact_portal_person(person) for person in portal_candidates
                        ],
                    }
                )
            else:
                records.append({**row, "status": "unmatched"})

    faculties = faculty_structure(directory)
    faculty_summaries = {}
    for faculty in faculties:
        faculty_name = faculty["name"]
        faculty_people = {
            url: person
            for url, person in people.items()
            if any(item["faculty"] == faculty_name for item in person["memberships"])
        }
        matched_urls = set(faculty_people) & set(production_by_profile)
        incomplete = [
            {
                "department": department["name"],
                **department["staffCoverage"],
            }
            for department in faculty["departments"]
            if department.get("staffCoverage")
            and not department["staffCoverage"]["complete"]
        ]
        faculty_summaries[faculty_name] = {
            "departments": len(faculty["departments"]),
            "officialPeople": len(faculty_people),
            "matchedOfficialPeople": len(matched_urls),
            "matchedProductionRows": sum(len(production_by_profile[url]) for url in matched_urls),
            "officialPeopleWithoutProductionMatch": len(faculty_people) - len(matched_urls),
            "incompleteDepartments": incomplete,
        }

    matched = [record for record in records if record["status"] == "matched"]
    ambiguous = [record for record in records if record["status"] == "ambiguous"]
    portal_other_unit = [record for record in records if record["status"] == "portal_other_unit"]
    portal_ambiguous = [record for record in records if record["status"] == "portal_ambiguous"]
    unmatched = [record for record in records if record["status"] == "unmatched"]
    duplicate_identities = [
        {
            "officialPerson": compact_person(people[url]),
            "productionRows": rows,
            "blockedByReviews": any(
                row.get("review_count", 0) or row.get("rating_count", 0)
                for row in rows
            ),
        }
        for url, rows in production_by_profile.items()
        if len(rows) > 1
    ]
    same_name_production = [
        {"normalisedName": key, "productionRows": rows}
        for key, rows in production_by_name.items()
        if key and len(rows) > 1
    ]
    matched_profiles = set(production_by_profile)
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "mode": "all_organisations_read_only_exact_name_validation",
        "summary": {
            "faculties": len(faculties),
            "departments": sum(len(faculty["departments"]) for faculty in faculties),
            "officialPeople": len(people),
            "productionProfessorRows": len(production),
            "matchedProductionRows": len(matched),
            "matchedOfficialPeople": len(matched_profiles),
            "ambiguousProductionRows": len(ambiguous),
            "portalOtherUnitRows": len(portal_other_unit),
            "portalAmbiguousRows": len(portal_ambiguous),
            "unmatchedProductionRows": len(unmatched),
            "duplicateProductionIdentities": len(duplicate_identities),
            "sameNameProductionGroups": len(same_name_production),
            "officialPeopleWithoutProductionMatch": len(people) - len(matched_profiles),
            "incompleteDepartments": sum(
                len(value["incompleteDepartments"]) for value in faculty_summaries.values()
            ),
            "sameDepartmentExactNameCandidates": len(directory.get("duplicateCandidates", [])),
            "sameDepartmentSimilarNameCandidates": len(directory.get("similarNameCandidates", [])),
        },
        "faculties": faculty_summaries,
        "ambiguousProductionRows": ambiguous,
        "portalOtherUnitRows": portal_other_unit,
        "portalAmbiguousRows": portal_ambiguous,
        "unmatchedProductionRows": unmatched,
        "duplicateProductionIdentities": duplicate_identities,
        "sameNameProductionGroups": same_name_production,
        "sameDepartmentExactNameCandidates": directory.get("duplicateCandidates", []),
        "sameDepartmentSimilarNameCandidates": directory.get("similarNameCandidates", []),
    }


def main() -> None:
    data_dir = common.ensure_data_dir()
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", type=Path, default=data_dir / "staff-directory.json")
    parser.add_argument("--production-file", type=Path)
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=data_dir / "staff-directory-cache/persons",
    )
    parser.add_argument("--output", type=Path, default=data_dir / "staff-production-validation.json")
    parser.add_argument(
        "--alias-overrides",
        type=Path,
        default=Path(__file__).with_name("staff-alias-overrides.json"),
    )
    args = parser.parse_args()

    directory = json.loads(args.directory.read_text(encoding="utf-8"))
    report = build_report(
        directory,
        load_production(args.production_file),
        load_cached_people(args.cache_dir),
        json.loads(args.alias_overrides.read_text(encoding="utf-8")),
    )
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"summary": report["summary"], "faculties": report["faculties"]}, ensure_ascii=False, indent=2))
    print(f"done -> {args.output}")


if __name__ == "__main__":
    main()
