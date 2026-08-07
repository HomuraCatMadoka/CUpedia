"""Render deterministic department-name alias matches as attach-only SQL."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import common


def build_payload(report: dict) -> dict:
    if not report.get("scope", {}).get("full"):
        raise ValueError("Department alias import requires a full source scan")
    rows = []
    seen = set()
    for record in report.get("records", []):
        if record.get("matchedBy") != "organisation_alias":
            continue
        key = (record["source"], record["sourceKey"])
        if key in seen:
            raise ValueError("Department alias source key is duplicated")
        seen.add(key)
        rows.append(
            {
                "person_id": record["personId"],
                "source": record["source"],
                "source_key": record["sourceKey"],
                "profile_url": record.get("profileUrl"),
                "image_url": record.get("imageUrl"),
                "role_label": record.get("title"),
                "appointment_kind": record.get("appointmentKind"),
                "profile_verified_at": (
                    record.get("profileVerifiedAt")
                    if record.get("profileStatus") == "verified"
                    else None
                ),
                "source_url": record["sourceUrl"],
            }
        )
    return {"observed_at": report["observedAt"], "person_sources": rows}


def render_sql(payload: dict) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if "$department_aliases$" in encoded:
        raise ValueError("Unexpected SQL dollar-quote marker in payload")
    fields = """person_id text, source text, source_key text, profile_url text,
           image_url text, role_label text, appointment_kind text,
           profile_verified_at timestamptz, source_url text"""
    return f"""create temp table _department_alias_import (payload jsonb not null) on commit drop;

insert into _department_alias_import (payload)
values ($department_aliases${encoded}$department_aliases$::jsonb);

do $$
begin
  if exists (
    select 1 from _department_alias_import,
         jsonb_to_recordset(payload->'person_sources') as incoming({fields})
    left join staff_people person on person.id = incoming.person_id
    where person.id is null
  ) then
    raise exception 'Department alias refers to an unknown staff person';
  end if;
  if exists (
    select 1 from staff_person_sources existing, _department_alias_import,
         jsonb_to_recordset(payload->'person_sources') as incoming({fields})
    where existing.source = incoming.source
      and existing.source_key = incoming.source_key
      and existing.person_id <> incoming.person_id
  ) then
    raise exception 'Department alias identity belongs to another person';
  end if;
end
$$;

insert into staff_person_sources (
  person_id, source, source_key, profile_url, image_url, role_label,
  appointment_kind, profile_verified_at, source_url,
  first_seen_at, last_seen_at, is_current, missing_runs
)
select x.person_id, x.source, x.source_key, x.profile_url, x.image_url,
       x.role_label, x.appointment_kind, x.profile_verified_at, x.source_url,
       meta.observed_at, meta.observed_at, true, 0
from _department_alias_import,
     lateral (select (payload->>'observed_at')::timestamptz observed_at) meta,
     jsonb_to_recordset(payload->'person_sources') as x({fields})
on conflict (source, source_key) do update set
  profile_url = excluded.profile_url,
  image_url = excluded.image_url,
  role_label = excluded.role_label,
  appointment_kind = excluded.appointment_kind,
  profile_verified_at = excluded.profile_verified_at,
  source_url = excluded.source_url,
  last_seen_at = greatest(staff_person_sources.last_seen_at, excluded.last_seen_at),
  is_current = true,
  missing_runs = 0;
"""


def main() -> None:
    data_dir = common.ensure_data_dir()
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--report", type=Path, default=data_dir / "staff-department-profiles.json"
    )
    parser.add_argument(
        "--output", type=Path, default=data_dir / "department-professor-aliases.sql"
    )
    args = parser.parse_args()
    report = json.loads(args.report.read_text(encoding="utf-8"))
    args.output.write_text(render_sql(build_payload(report)), encoding="utf-8")


if __name__ == "__main__":
    main()
