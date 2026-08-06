"""Render reviewed department profile crawl data as an attach-only SQL import."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import common


def import_payload(report: dict, expected_config_digest: str | None = None) -> dict:
    if not report.get("scope", {}).get("fresh"):
        raise ValueError("Department profile import requires a fresh crawl")
    if not report["scope"].get("full"):
        raise ValueError("Department profile import requires a full source crawl")
    if not report["scope"].get("complete"):
        raise ValueError("Department profile import requires every source to complete")
    if (
        expected_config_digest
        and report["scope"].get("sourceConfigDigest") != expected_config_digest
    ):
        raise ValueError("Department profile source configuration has changed")
    requested_keys = set(report["scope"].get("requestedSources", []))
    complete_keys = set(report["scope"].get("completeSources", []))
    if not requested_keys or requested_keys != complete_keys:
        raise ValueError("Department profile source coverage is incomplete")
    known_keys = {source["key"] for source in report.get("sources", [])}
    if complete_keys != known_keys:
        raise ValueError("completeSources contains an unknown source")
    sources_by_key = {
        source["key"]: source for source in report.get("sources", [])
    }
    if any(
        not sources_by_key[key].get("observedSourceKeys")
        for key in complete_keys
    ):
        raise ValueError("Complete source has no observed lifecycle keys")

    rows = []
    person_sources = set()
    source_keys = set()
    for record in report.get("records", []):
        person_source = (record["personId"], record["source"])
        source_key = (record["source"], record["sourceKey"])
        if person_source in person_sources:
            raise ValueError("Department source has multiple rows for one person")
        if source_key in source_keys:
            raise ValueError("Department source key is duplicated")
        person_sources.add(person_source)
        source_keys.add(source_key)
        profile_verified = record.get("profileStatus") == "verified"
        rows.append({
            "person_id": record["personId"],
            "source": record["source"],
            "source_key": record["sourceKey"],
            "profile_url": record.get("profileUrl"),
            "image_url": record.get("imageUrl"),
            "role_label": record.get("title"),
            "appointment_kind": record.get("appointmentKind"),
            "profile_verified_at": (
                record.get("profileVerifiedAt") if profile_verified else None
            ),
            "source_url": record["sourceUrl"],
        })
    return {
        "observed_at": report["observedAt"],
        "managed_sources": sorted(
            f"cuhk_department:{key}" for key in complete_keys
        ),
        "observed_source_keys": [
            {
                "source": f"cuhk_department:{source['key']}",
                "source_key": source_key,
            }
            for source in report.get("sources", [])
            for source_key in source.get("observedSourceKeys", [])
        ],
        "person_sources": rows,
    }


def render_sql(payload: dict, *, transaction: bool = True) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if "$department_profiles$" in encoded:
        raise ValueError("Unexpected SQL dollar-quote marker in payload")
    body = f"""create temp table _department_profile_import (
  payload jsonb not null
) on commit drop;

insert into _department_profile_import (payload)
values ($department_profiles${encoded}$department_profiles$::jsonb);

do $$
begin
  if exists (
    select 1
    from _department_profile_import,
         jsonb_to_recordset(payload->'person_sources') as incoming(
           person_id text, source text, source_key text, profile_url text,
           image_url text, role_label text, appointment_kind text,
           profile_verified_at timestamptz, source_url text
         )
    left join staff_people person on person.id = incoming.person_id
    where person.id is null
  ) then
    raise exception 'Department profile refers to an unknown staff person';
  end if;

  if exists (
    select 1
    from staff_person_sources existing,
         _department_profile_import,
         jsonb_to_recordset(payload->'person_sources') as incoming(
           person_id text, source text, source_key text, profile_url text,
           image_url text, role_label text, appointment_kind text,
           profile_verified_at timestamptz, source_url text
         )
    where existing.source = incoming.source
      and existing.source_key = incoming.source_key
      and existing.person_id <> incoming.person_id
  ) then
    raise exception 'Department source identity key belongs to another person';
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
from _department_profile_import,
     lateral (select (payload->>'observed_at')::timestamptz observed_at) meta,
     jsonb_to_recordset(payload->'person_sources') as x(
       person_id text, source text, source_key text, profile_url text,
       image_url text, role_label text, appointment_kind text,
       profile_verified_at timestamptz, source_url text
     )
on conflict (source, source_key) do update set
  profile_url = excluded.profile_url,
  image_url = excluded.image_url,
  role_label = excluded.role_label,
  appointment_kind = excluded.appointment_kind,
  profile_verified_at = excluded.profile_verified_at,
  source_url = excluded.source_url,
  last_seen_at = excluded.last_seen_at,
  is_current = true,
  missing_runs = 0;

-- A full crawl owns the whole cuhk_department namespace. Sources removed from
-- the reviewed inventory have no future run that could age them out, so retire
-- them immediately while preserving their provenance rows.
update staff_person_sources existing
set missing_runs = greatest(existing.missing_runs, 2),
    is_current = false
from _department_profile_import
where existing.is_current
  and existing.source like 'cuhk_department:%'
  and not exists (
    select 1
    from jsonb_array_elements_text(payload->'managed_sources') managed(source)
    where existing.source = managed.source
  );

update staff_person_sources existing
set missing_runs = existing.missing_runs + 1,
    is_current = existing.missing_runs + 1 < 2
from _department_profile_import
where existing.is_current
  and existing.source in (
    select jsonb_array_elements_text(payload->'managed_sources')
  )
  and not exists (
    select 1
    from _department_profile_import,
         jsonb_to_recordset(payload->'observed_source_keys') as observed(
           source text, source_key text
         )
    where observed.source = existing.source
      and observed.source_key = existing.source_key
  );
"""
    return f"begin;\n\n{body}commit;\n" if transaction else body


def main() -> None:
    data_dir = common.ensure_data_dir()
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--report",
        type=Path,
        default=data_dir / "staff-department-profiles.json",
    )
    parser.add_argument(
        "--sources",
        type=Path,
        default=Path(__file__).with_name("department-profile-sources.json"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=data_dir / "staff-department-profiles-import.sql",
    )
    parser.add_argument(
        "--no-transaction",
        action="store_true",
        help="omit BEGIN/COMMIT for an outer transaction wrapper",
    )
    args = parser.parse_args()
    report = json.loads(args.report.read_text(encoding="utf-8"))
    config_digest = hashlib.sha256(args.sources.read_bytes()).hexdigest()
    sql = render_sql(
        import_payload(report, config_digest), transaction=not args.no_transaction
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(sql, encoding="utf-8")
    print(f"done -> {args.output}")


if __name__ == "__main__":
    main()
