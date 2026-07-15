"""Render the full official directory as a convergent, reviewable SQL import."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import common
import resolve_staff_pilot
import scrape_staff


SOURCE = "cuhk_research_portal"


def build_payload(directory: dict, reviewed_aliases: list[dict] | None = None) -> dict:
    if directory.get("scope", {}).get("mode") != "full":
        raise ValueError("Refusing to import a non-full staff directory")

    observed_at = directory.get("sourceFetchedAtRange", {}).get("newest")
    if not observed_at:
        raise ValueError("Directory has no source fetch timestamp")

    organisation_ids = {
        item["sourceUrl"]: item["id"] for item in directory["organisations"]
    }
    organisation_urls_by_name: dict[str, list[str]] = defaultdict(list)
    for item in directory["organisations"]:
        organisation_urls_by_name[item["name"].casefold()].append(item["sourceUrl"])

    organisations = []
    for item in directory["organisations"]:
        organisations.append(
            {
                "id": item["id"],
                "name": item["name"],
                "organisation_type": item["organisationType"],
                "parent_id": organisation_ids.get(item.get("parentUrl")),
                "faculty_id": organisation_ids[item["facultyUrl"]],
                "profile_url": item["sourceUrl"],
                "source": SOURCE,
            }
        )

    people = []
    aliases = []
    affiliations: dict[tuple[str, str], dict] = {}
    titles: dict[tuple[str, str, str], dict] = {}
    for person in directory["people"]:
        person_id = resolve_staff_pilot.external_key(person)
        people.append(
            {
                "id": person_id,
                "canonical_name": person["name"],
                "external_id": person.get("externalId"),
                "profile_url": person["profileUrl"],
                "source": SOURCE,
                "identity_kind": "official",
            }
        )
        aliases.append(
            {
                "person_id": person_id,
                "alias": person["name"],
                "normalized_alias": scrape_staff.normalise_name(person["name"]),
                "source": SOURCE,
            }
        )
        for affiliation in person["affiliations"]:
            organisation_url = affiliation.get("organisationUrl")
            if not organisation_url:
                candidates = organisation_urls_by_name.get(
                    affiliation["organisation"].casefold(), []
                )
                organisation_url = candidates[0] if len(candidates) == 1 else None
            organisation_id = organisation_ids.get(organisation_url)
            if not organisation_id:
                continue
            affiliations[(person_id, organisation_id)] = {
                "person_id": person_id,
                "organisation_id": organisation_id,
                "source_url": person["profileUrl"],
            }
            title = affiliation.get("title")
            if title:
                titles[(person_id, organisation_id, title)] = {
                    "person_id": person_id,
                    "organisation_id": organisation_id,
                    "title": title,
                    "source_url": person["profileUrl"],
                }

    people_by_profile_url = {item["profile_url"]: item["id"] for item in people}
    for override in reviewed_aliases or []:
        profile_url = scrape_staff.canonical_url(override["profileUrl"])
        person_id = people_by_profile_url.get(profile_url)
        if not person_id:
            raise ValueError(f"Reviewed alias profile not found: {profile_url}")
        alias = override["alias"].strip()
        if not alias:
            raise ValueError("Reviewed alias cannot be empty")
        aliases.append(
            {
                "person_id": person_id,
                "alias": alias,
                "normalized_alias": scrape_staff.normalise_name(alias),
                "source": "reviewed_manual_override",
                "evidence_url": override["evidenceUrl"],
            }
        )

    return {
        "observed_at": observed_at,
        "people": sorted(people, key=lambda item: item["id"]),
        "organisations": sorted(organisations, key=lambda item: item["id"]),
        "aliases": sorted(aliases, key=lambda item: (item["person_id"], item["alias"])),
        "affiliations": sorted(
            affiliations.values(),
            key=lambda item: (item["person_id"], item["organisation_id"]),
        ),
        "titles": sorted(
            titles.values(),
            key=lambda item: (
                item["person_id"],
                item["organisation_id"],
                item["title"],
            ),
        ),
    }


def render_sql(payload: dict) -> str:
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if "$directory$" in data:
        raise ValueError("Unexpected SQL dollar-quote marker in payload")
    return f"""-- Generated by render_staff_directory_import.py. Review before applying.
begin;

create temp table _staff_directory_import (payload jsonb not null) on commit drop;
insert into _staff_directory_import values ($directory${data}$directory$::jsonb);

insert into staff_people (
  id, canonical_name, external_id, profile_url, source, identity_kind,
  first_seen_at, last_seen_at, is_current, missing_runs
)
select x.id, x.canonical_name, x.external_id, x.profile_url, x.source,
       x.identity_kind, meta.observed_at, meta.observed_at, true, 0
from _staff_directory_import,
     lateral (select (payload->>'observed_at')::timestamptz observed_at) meta,
     jsonb_to_recordset(payload->'people') as x(
       id text, canonical_name text, external_id uuid, profile_url text,
       source text, identity_kind text
     )
on conflict (id) do update set
  canonical_name = excluded.canonical_name,
  external_id = excluded.external_id,
  profile_url = excluded.profile_url,
  source = excluded.source,
  identity_kind = excluded.identity_kind,
  last_seen_at = excluded.last_seen_at,
  is_current = true,
  missing_runs = 0,
  updated_at = now();

insert into staff_organisations (
  id, name, organisation_type, parent_id, faculty_id, profile_url, source,
  first_seen_at, last_seen_at, is_current, missing_runs
)
select x.id, x.name, x.organisation_type, x.parent_id, x.faculty_id,
       x.profile_url, x.source, meta.observed_at, meta.observed_at, true, 0
from _staff_directory_import,
     lateral (select (payload->>'observed_at')::timestamptz observed_at) meta,
     jsonb_to_recordset(payload->'organisations') as x(
       id text, name text, organisation_type text, parent_id text,
       faculty_id text, profile_url text, source text
     )
on conflict (id) do update set
  name = excluded.name,
  organisation_type = excluded.organisation_type,
  parent_id = excluded.parent_id,
  faculty_id = excluded.faculty_id,
  profile_url = excluded.profile_url,
  source = excluded.source,
  last_seen_at = excluded.last_seen_at,
  is_current = true,
  missing_runs = 0;

delete from staff_aliases
where source in ('{SOURCE}', 'reviewed_manual_override');

insert into staff_aliases (person_id, alias, normalized_alias, source)
select x.person_id, x.alias, x.normalized_alias, x.source
from _staff_directory_import,
     jsonb_to_recordset(payload->'aliases') as x(
       person_id text, alias text, normalized_alias text, source text
     )
on conflict (person_id, alias) do update set
  normalized_alias = excluded.normalized_alias,
  source = excluded.source;

update course_offering_instructors
set person_id = null,
    match_status = 'unverified',
    evidence_url = null
where match_status <> 'manual';

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
  and offering.match_status <> 'manual';

update course_offering_instructors offering
set person_id = alias.person_id,
    match_status = 'manual',
    evidence_url = alias.evidence_url
from _staff_directory_import,
     jsonb_to_recordset(payload->'aliases') as alias(
       person_id text, alias text, normalized_alias text, source text,
       evidence_url text
     )
where alias.source = 'reviewed_manual_override'
  and offering.instructor_name = alias.alias;

insert into staff_organisation_affiliations (
  person_id, organisation_id, source_url, first_seen_at, last_seen_at,
  is_current, missing_runs
)
select x.person_id, x.organisation_id, x.source_url,
       meta.observed_at, meta.observed_at, true, 0
from _staff_directory_import,
     lateral (select (payload->>'observed_at')::timestamptz observed_at) meta,
     jsonb_to_recordset(payload->'affiliations') as x(
       person_id text, organisation_id text, source_url text
     )
on conflict (person_id, organisation_id) do update set
  source_url = excluded.source_url,
  last_seen_at = excluded.last_seen_at,
  is_current = true,
  missing_runs = 0;

insert into staff_affiliation_titles (
  person_id, organisation_id, title, source_url, last_seen_at,
  is_current, missing_runs
)
select x.person_id, x.organisation_id, x.title, x.source_url,
       meta.observed_at, true, 0
from _staff_directory_import,
     lateral (select (payload->>'observed_at')::timestamptz observed_at) meta,
     jsonb_to_recordset(payload->'titles') as x(
       person_id text, organisation_id text, title text, source_url text
     )
on conflict (person_id, organisation_id, title) do update set
  source_url = excluded.source_url,
  last_seen_at = excluded.last_seen_at,
  is_current = true,
  missing_runs = 0;

update staff_affiliation_titles title
set missing_runs = title.missing_runs + 1,
    is_current = title.missing_runs + 1 < 2
where title.is_current
  and exists (
    select 1 from staff_organisations organisation
    where organisation.id = title.organisation_id
      and organisation.source = '{SOURCE}'
  )
  and not exists (
    select 1
    from _staff_directory_import,
         jsonb_to_recordset(payload->'titles') as x(
           person_id text, organisation_id text, title text, source_url text
         )
    where x.person_id = title.person_id
      and x.organisation_id = title.organisation_id
      and x.title = title.title
  );

update staff_organisation_affiliations affiliation
set missing_runs = affiliation.missing_runs + 1,
    is_current = affiliation.missing_runs + 1 < 2
where affiliation.is_current
  and exists (
    select 1 from staff_organisations organisation
    where organisation.id = affiliation.organisation_id
      and organisation.source = '{SOURCE}'
  )
  and not exists (
    select 1
    from _staff_directory_import,
         jsonb_to_recordset(payload->'affiliations') as x(
           person_id text, organisation_id text, source_url text
         )
    where x.person_id = affiliation.person_id
      and x.organisation_id = affiliation.organisation_id
  );

update staff_organisations organisation
set missing_runs = organisation.missing_runs + 1,
    is_current = organisation.missing_runs + 1 < 2
where organisation.source = '{SOURCE}'
  and organisation.is_current
  and not exists (
    select 1
    from _staff_directory_import,
         jsonb_to_recordset(payload->'organisations') as x(
           id text, name text, organisation_type text, parent_id text,
           faculty_id text, profile_url text, source text
         )
    where x.id = organisation.id
  );

update staff_people person
set missing_runs = person.missing_runs + 1,
    is_current = person.missing_runs + 1 < 2
where person.source = '{SOURCE}'
  and person.is_current
  and exists (
    select 1
    from staff_organisation_affiliations affiliation
    join staff_organisations organisation
      on organisation.id = affiliation.organisation_id
    where affiliation.person_id = person.id
      and organisation.source = '{SOURCE}'
  )
  and not exists (
    select 1
    from _staff_directory_import,
         jsonb_to_recordset(payload->'people') as x(
           id text, canonical_name text, external_id uuid, profile_url text,
           source text, identity_kind text
         )
    where x.id = person.id
  );

commit;
"""


def main() -> None:
    data_dir = common.ensure_data_dir()
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", type=Path, default=data_dir / "staff-directory.json")
    parser.add_argument(
        "--output", type=Path, default=data_dir / "staff-directory-import.sql"
    )
    parser.add_argument(
        "--alias-overrides",
        type=Path,
        default=Path(__file__).with_name("staff-alias-overrides.json"),
    )
    args = parser.parse_args()

    directory = json.loads(args.directory.read_text(encoding="utf-8"))
    reviewed_aliases = json.loads(args.alias_overrides.read_text(encoding="utf-8"))
    payload = build_payload(directory, reviewed_aliases)
    args.output.write_text(render_sql(payload), encoding="utf-8")
    print(json.dumps({key: len(value) if isinstance(value, list) else value for key, value in payload.items()}, indent=2))
    print(f"done -> {args.output}")


if __name__ == "__main__":
    main()
