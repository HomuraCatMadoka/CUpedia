"""Compare a department crawl with linked production course instructors."""

from __future__ import annotations

import argparse
import json
import subprocess
from collections import Counter
from pathlib import Path

from resolve_staff_pilot import REPO_ROOT


def query_production(workdir: Path) -> list[dict]:
    sql = """
select ci.person_id, sp.canonical_name, sp.profile_url,
       coalesce(array_agg(distinct so.name order by so.name)
         filter (where so.name is not null), '{}') organisations
from course_instructors ci
join staff_people sp on sp.id = ci.person_id
left join staff_organisation_affiliations a
  on a.person_id = ci.person_id and a.is_current
left join staff_organisations so
  on so.id = a.organisation_id and so.is_current
where sp.identity_kind = 'official'
group by ci.person_id, sp.canonical_name, sp.profile_url
order by sp.canonical_name, ci.person_id
"""
    result = subprocess.run(
        [
            "supabase", "db", "query", "--linked", "--output", "json",
            "--workdir", str(workdir), sql,
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


def build_analysis(report: dict, instructors: list[dict]) -> dict:
    verified_people = {
        record["personId"]
        for record in report["records"]
        if record.get("profileUrl") and record.get("profileStatus") == "verified"
    }
    covered = [row for row in instructors if row["person_id"] in verified_people]
    missing = [row for row in instructors if row["person_id"] not in verified_people]
    organisation_counts = Counter(
        organisation
        for row in missing
        for organisation in row.get("organisations", [])
    )
    return {
        "officialCourseInstructors": len(instructors),
        "withVerifiedDepartmentPage": len(covered),
        "researchPortalFallback": sum(bool(row.get("profile_url")) for row in missing),
        "withoutEitherPage": sum(not row.get("profile_url") for row in missing),
        "coveragePercent": round(len(covered) / max(len(instructors), 1) * 100, 1),
        "largestMissingOrganisations": [
            {"organisation": name, "instructors": count}
            for name, count in organisation_counts.most_common(30)
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path)
    parser.add_argument("--workdir", type=Path, default=REPO_ROOT)
    args = parser.parse_args()
    report = json.loads(args.report.read_text(encoding="utf-8"))
    print(json.dumps(build_analysis(report, query_production(args.workdir)), indent=2))


if __name__ == "__main__":
    main()
