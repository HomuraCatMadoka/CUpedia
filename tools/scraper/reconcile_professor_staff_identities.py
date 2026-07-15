"""Reconcile automatic professor identities from the linked production database."""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone

import common
import render_staff_directory_import
from resolve_staff_pilot import REPO_ROOT


def query(sql: str, workdir=REPO_ROOT) -> list[dict]:
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


def load_production(
    workdir=REPO_ROOT,
) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    professors = query("select id, name from professors order by id", workdir)
    aliases = query(
        """
        select alias.person_id, alias.alias, alias.source
        from staff_aliases alias
        join staff_people person on person.id = alias.person_id
        where person.is_current
        order by alias.person_id, alias.alias
        """,
        workdir,
    )
    people = query(
        """
        select id, profile_url
        from staff_people
        where is_current
        order by id
        """,
        workdir,
    )
    identities = query(
        """
        select professor_id, person_id, match_method, source_url, verified_at
        from professor_staff_identities
        order by professor_id
        """,
        workdir,
    )
    return professors, aliases, people, identities


def validation_summary(workdir=REPO_ROOT) -> dict:
    return query(
        """
        select
          count(distinct identity.professor_id)::int identity_count,
          count(distinct identity.professor_id) filter (
            where identity.match_method = 'automatic'
          )::int automatic_count,
          count(distinct identity.professor_id) filter (
            where identity.match_method = 'manual_override'
          )::int manual_count,
          count(distinct identity.professor_id) filter (
            where organisation.id is not null
          )::int with_current_organisation
        from professor_staff_identities identity
        left join staff_people person
          on person.id = identity.person_id and person.is_current
        left join staff_organisation_affiliations affiliation
          on affiliation.person_id = person.id and affiliation.is_current
        left join staff_organisations organisation
          on organisation.id = affiliation.organisation_id
         and organisation.is_current
        """,
        workdir,
    )[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply the generated transaction to the linked production database",
    )
    parser.add_argument(
        "--workdir",
        default=str(REPO_ROOT),
        help="Linked Supabase project directory",
    )
    args = parser.parse_args()

    professors, aliases, people, identities = load_production(args.workdir)
    links = render_staff_directory_import.build_professor_links(
        professors, aliases, people
    )
    manual_ids = {
        row["professor_id"]
        for row in identities
        if row["match_method"] == "manual_override"
    }
    predicted_count = len(manual_ids | {row["professor_id"] for row in links})

    data_dir = common.ensure_data_dir()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = data_dir / f"professor-staff-identities-{timestamp}.json"
    sql_path = data_dir / f"professor-staff-identities-{timestamp}.sql"
    backup_path.write_text(
        json.dumps(identities, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    sql_path.write_text(
        render_staff_directory_import.render_professor_identity_backfill_sql(links),
        encoding="utf-8",
    )

    result = {
        "professors": len(professors),
        "uniqueIdentityCandidates": len(links),
        "automaticCandidates": sum(
            row["match_method"] == "automatic" for row in links
        ),
        "reviewedManualCandidates": sum(
            row["match_method"] == "manual_override" for row in links
        ),
        "ambiguousOrUnmatched": len(professors) - len(links),
        "manualOverridesPreserved": len(manual_ids),
        "predictedIdentityCount": predicted_count,
        "backup": str(backup_path),
        "sql": str(sql_path),
        "applied": args.apply,
    }
    if args.apply:
        subprocess.run(
            [
                "supabase", "db", "query", "--linked", "--file", str(sql_path),
                "--workdir", args.workdir,
            ],
            check=True,
        )
        result["validation"] = validation_summary(args.workdir)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
