"""Render a reviewed Engineering staff report as a transactional SQL import."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import common
import resolve_staff_pilot
import scrape_staff


FACULTY = "Faculty of Engineering"
SOURCE = "cuhk_research_portal"


def external_id(identity_key: str) -> str | None:
    return identity_key.removeprefix("pure:") if identity_key.startswith("pure:") else None


def person_row(
    identity_key: str,
    name: str,
    profile_url: str | None,
    identity_kind: str = "official",
) -> dict:
    return {
        "id": identity_key,
        "canonical_name": name,
        "external_id": external_id(identity_key),
        "profile_url": profile_url,
        "source": SOURCE if profile_url else "reviewed_manual_override",
        "identity_kind": identity_kind,
    }


def build_payload(report: dict) -> dict:
    unresolved = sum(
        record["status"] != "resolved"
        for department in report["departments"].values()
        for record in department["records"]
    )
    if unresolved:
        raise ValueError(f"Refusing to render {unresolved} unresolved staff rows")
    if any(not value["officialDirectoryComplete"] for value in report["departments"].values()):
        raise ValueError("Refusing to render an incomplete department directory")

    people: dict[str, dict] = {}
    aliases: dict[tuple[str, str], dict] = {}
    affiliations: dict[tuple[str, str, str], dict] = {}
    links: dict[str, dict] = {}
    departments = []
    merged_ids = {
        professor_id
        for action in report["cleaningActions"]
        for professor_id in action["mergeProfessorIds"]
    }

    for code, config in resolve_staff_pilot.TARGETS.items():
        departments.append({
            "id": code,
            "faculty": FACULTY,
            "name": config["departmentName"],
            "profile_url": config["departmentUrl"],
        })
        department = report["departments"][code]
        for record in department["records"]:
            key = record["identityKey"]
            people[key] = person_row(
                key,
                record["canonicalName"],
                record["profileUrl"],
                record.get("identityKind", "official"),
            )
            for alias, source in (
                (record["canonicalName"], SOURCE),
                (record["name"], "timetable"),
            ):
                aliases[(key, alias)] = {
                    "person_id": key,
                    "alias": alias,
                    "normalized_alias": scrape_staff.normalise_name(alias),
                    "source": source,
                }
            if record["classification"] == "official_department":
                matching = next(
                    (
                        item for item in record["affiliations"]
                        if item.get("organisationUrl") == config["departmentUrl"]
                    ),
                    None,
                )
                relationship = (matching or {}).get("title") or "member"
                source_url = record["profileUrl"] or config["departmentUrl"]
                affiliations[(key, code, relationship)] = {
                    "person_id": key,
                    "department_id": code,
                    "relationship": relationship,
                    "source_url": source_url,
                }
            elif record["classification"] == "target_related":
                relationship = record["targetRelationship"] or "teaching"
                affiliations[(key, code, relationship)] = {
                    "person_id": key,
                    "department_id": code,
                    "relationship": relationship,
                    "source_url": record["evidenceUrl"] or config["departmentUrl"],
                }
            if record["id"] not in merged_ids:
                links[record["id"]] = {
                    "professor_id": record["id"],
                    "person_id": key,
                    "match_method": record["resolution"],
                    "source_url": record["evidenceUrl"] or record["profileUrl"],
                }

        for staff in department["capturedOfficialStaffNotTeaching"]:
            key = staff["identityKey"]
            people[key] = person_row(key, staff["name"], staff["profileUrl"])
            aliases[(key, staff["name"])] = {
                "person_id": key,
                "alias": staff["name"],
                "normalized_alias": scrape_staff.normalise_name(staff["name"]),
                "source": SOURCE,
            }
            relationship = staff.get("title") or "member"
            affiliations[(key, code, relationship)] = {
                "person_id": key,
                "department_id": code,
                "relationship": relationship,
                "source_url": staff["profileUrl"],
            }

    merges = []
    for action in report["cleaningActions"]:
        if action["blockedByReviews"]:
            raise ValueError(f"Merge is blocked by reviews: {action['names']}")
        for merge_id in action["mergeProfessorIds"]:
            merges.append({"keep_id": action["keepProfessorId"], "merge_id": merge_id})

    return {
        "people": sorted(people.values(), key=lambda row: row["id"]),
        "departments": departments,
        "aliases": sorted(aliases.values(), key=lambda row: (row["person_id"], row["alias"])),
        "affiliations": sorted(
            affiliations.values(),
            key=lambda row: (row["person_id"], row["department_id"], row["relationship"]),
        ),
        "links": sorted(links.values(), key=lambda row: row["professor_id"]),
        "merges": merges,
    }


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def render_sql(payload: dict) -> str:
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if "$staff$" in data:
        raise ValueError("Unexpected SQL dollar-quote marker in payload")
    merge_sql = []
    for merge in payload["merges"]:
        keep = sql_literal(merge["keep_id"])
        old = sql_literal(merge["merge_id"])
        merge_sql.append(f"""
insert into professor_courses (professor_id, course_code)
select {keep}, course_code from professor_courses where professor_id = {old}
on conflict do nothing;
update course_reviews set professor_id = {keep} where professor_id = {old};
update course_ratings set professor_id = {keep} where professor_id = {old};
delete from professors where id = {old};
""".strip())

    prefixes = ", ".join(
        sql_literal(config["coursePrefix"])
        for config in resolve_staff_pilot.TARGETS.values()
    )
    return f"""-- Generated by tools/scraper/render_staff_import.py. Review before applying.
begin;

create temp table _staff_import (payload jsonb not null) on commit drop;
insert into _staff_import values ($staff${data}$staff$::jsonb);

insert into staff_people (
  id, canonical_name, external_id, profile_url, source, identity_kind
)
select x.id, x.canonical_name, x.external_id, x.profile_url, x.source, x.identity_kind
from _staff_import, jsonb_to_recordset(payload->'people') as x(
  id text, canonical_name text, external_id uuid, profile_url text, source text,
  identity_kind text
)
on conflict (id) do update set
  canonical_name = excluded.canonical_name,
  external_id = excluded.external_id,
  profile_url = excluded.profile_url,
  source = excluded.source,
  identity_kind = excluded.identity_kind,
  updated_at = now();

insert into staff_departments (id, faculty, name, profile_url)
select x.id, x.faculty, x.name, x.profile_url
from _staff_import, jsonb_to_recordset(payload->'departments') as x(
  id text, faculty text, name text, profile_url text
)
on conflict (id) do update set
  faculty = excluded.faculty,
  name = excluded.name,
  profile_url = excluded.profile_url,
  updated_at = now();

insert into staff_aliases (person_id, alias, normalized_alias, source)
select x.person_id, x.alias, x.normalized_alias, x.source
from _staff_import, jsonb_to_recordset(payload->'aliases') as x(
  person_id text, alias text, normalized_alias text, source text
)
on conflict (person_id, alias) do update set
  normalized_alias = excluded.normalized_alias,
  source = excluded.source;

update course_offering_instructors offering
set person_id = null,
    match_status = 'unverified',
    evidence_url = null
where substring(offering.course_code from '^[A-Z]+') in ({prefixes})
  and offering.match_status <> 'manual';

with unique_aliases as (
  select alias, min(person_id) as person_id
  from staff_aliases
  group by alias
  having count(distinct person_id) = 1
)
update course_offering_instructors offering
set person_id = aliases.person_id,
    match_status = case
      when people.identity_kind = 'external' then 'external'
      else 'automatic'
    end,
    evidence_url = people.profile_url
from unique_aliases aliases
join staff_people people on people.id = aliases.person_id
where offering.instructor_name = aliases.alias
  and substring(offering.course_code from '^[A-Z]+') in ({prefixes})
  and offering.match_status <> 'manual';

insert into staff_affiliations (person_id, department_id, relationship, source_url)
select x.person_id, x.department_id, x.relationship, x.source_url
from _staff_import, jsonb_to_recordset(payload->'affiliations') as x(
  person_id text, department_id text, relationship text, source_url text
)
on conflict (person_id, department_id, relationship) do update set
  source_url = excluded.source_url,
  verified_at = now();

{chr(10).join(merge_sql)}

insert into professor_staff_identities (
  professor_id, person_id, match_method, source_url
)
select x.professor_id, x.person_id, x.match_method, x.source_url
from _staff_import, jsonb_to_recordset(payload->'links') as x(
  professor_id text, person_id text, match_method text, source_url text
)
on conflict (professor_id) do update set
  person_id = excluded.person_id,
  match_method = excluded.match_method,
  source_url = excluded.source_url,
  verified_at = now();

delete from staff_teaching_assignments
where substring(course_code from '^[A-Z]+') in ({prefixes});

with unique_aliases as (
  select alias, min(person_id) as person_id
  from staff_aliases
  group by alias
  having count(distinct person_id) = 1
)
insert into staff_teaching_assignments (
  person_id, academic_year, term, course_code, captured_at
)
select distinct
  aliases.person_id,
  enrollments.academic_year,
  case
    when enrollments.term = 'Summer Session' then 'Summer'
    else enrollments.term
  end,
  enrollments.course_code,
  enrollments.captured_at
from course_enrollments enrollments
cross join lateral unnest(enrollments.instructors) as instructor(name)
join unique_aliases aliases on aliases.alias = instructor.name
where substring(enrollments.course_code from '^[A-Z]+') in ({prefixes})
on conflict do nothing;

commit;
"""


def main() -> None:
    data_dir = common.ensure_data_dir()
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path, default=data_dir / "staff-engineering-report.json")
    parser.add_argument("--output", type=Path, default=data_dir / "staff-engineering-import.sql")
    args = parser.parse_args()
    report = json.loads(args.report.read_text(encoding="utf-8"))
    payload = build_payload(report)
    args.output.write_text(render_sql(payload), encoding="utf-8")
    print(json.dumps({key: len(value) for key, value in payload.items()}, indent=2))
    print(f"done -> {args.output}")


if __name__ == "__main__":
    main()
