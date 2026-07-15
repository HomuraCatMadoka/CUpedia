"""Export the linked production professor/enrollment snapshot without writes."""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import common
from resolve_staff_pilot import REPO_ROOT


def query(sql: str) -> list[dict]:
    result = subprocess.run(
        [
            "supabase",
            "db",
            "query",
            "--linked",
            "--output",
            "json",
            "--workdir",
            str(REPO_ROOT),
            sql,
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


def build_snapshot() -> dict:
    professors = query(
        """
        select p.id, p.name,
               array_agg(distinct pc.course_code order by pc.course_code) courses,
               (select count(*)::int from course_reviews r
                where r.professor_id = p.id) review_count,
               (select count(*)::int from course_ratings r
                where r.professor_id = p.id) rating_count
        from professors p
        join professor_courses pc on pc.professor_id = p.id
        group by p.id, p.name
        order by p.name, p.id
        """
    )
    enrollments = query(
        """
        select academic_year, term, course_code, class_code, class_nbr,
               component, section, quota, vacancy, instructors
        from course_enrollments
        order by academic_year, term, class_code, component, section
        """
    )
    captured = query("select max(captured_at) captured_at from course_enrollments")[0]
    captured_at = captured["captured_at"]
    if not captured_at:
        captured_at = datetime.now(timezone.utc).isoformat()
    elif "T" not in captured_at:
        captured_at = captured_at.replace(" ", "T") + "Z"
    return {
        "capturedAt": captured_at,
        "professors": professors,
        "enrollments": [
            {
                "academicYear": row["academic_year"],
                "term": row["term"],
                "courseCode": row["course_code"],
                "classCode": row["class_code"],
                "classNbr": row["class_nbr"],
                "component": row["component"],
                "section": row["section"],
                "quota": row["quota"],
                "vacancy": row["vacancy"],
                "instructors": row["instructors"],
            }
            for row in enrollments
        ],
    }


def main() -> None:
    output = common.ensure_data_dir() / "professors.json"
    snapshot = build_snapshot()
    output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "professors": len(snapshot["professors"]),
                "enrollments": len(snapshot["enrollments"]),
                "capturedAt": snapshot["capturedAt"],
            },
            indent=2,
        )
    )
    print(f"done -> {output}")


if __name__ == "__main__":
    main()
