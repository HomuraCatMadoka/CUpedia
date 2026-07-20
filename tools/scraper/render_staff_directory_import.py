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
REVIEWED_PERSON_SOURCE = "reviewed_department_directory"


def build_professor_links(
    professors: list[dict], aliases: list[dict], people: list[dict]
) -> list[dict]:
    if not professors:
        raise ValueError("Professor snapshot cannot be empty")

    candidates_by_name: dict[str, dict[str, list[dict]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for alias in aliases:
        key = resolve_staff_pilot.name_key(alias["alias"])
        if key:
            candidates_by_name[key][alias["person_id"]].append(alias)

    people_by_id = {person["id"]: person for person in people}
    links = []
    seen_professor_ids = set()
    for professor in professors:
        professor_id = professor["id"]
        if professor_id in seen_professor_ids:
            raise ValueError(f"Duplicate professor id: {professor_id}")
        seen_professor_ids.add(professor_id)

        candidates = candidates_by_name.get(
            resolve_staff_pilot.name_key(professor["name"]), {}
        )
        if len(candidates) != 1:
            continue
        person_id, matching_aliases = next(iter(candidates.items()))
        person = people_by_id.get(person_id)
        if not person:
            raise ValueError(f"Alias references unknown person: {person_id}")
        reviewed_aliases = [
            alias
            for alias in matching_aliases
            if alias["source"] == "reviewed_manual_override"
        ]
        automatic_aliases = [
            alias
            for alias in matching_aliases
            if alias["source"] != "reviewed_manual_override"
        ]
        match_method = "automatic" if automatic_aliases else "manual_override"
        source_url = person["profile_url"]
        if match_method == "manual_override":
            source_url = reviewed_aliases[0].get("evidence_url") or source_url
        links.append(
            {
                "professor_id": professor_id,
                "person_id": person_id,
                "match_method": match_method,
                "source_url": source_url,
            }
        )

    if not links:
        raise ValueError("Professor snapshot produced no automatic identity links")
    return sorted(links, key=lambda item: item["professor_id"])


def build_payload(
    directory: dict,
    reviewed_aliases: list[dict] | None = None,
    professors: list[dict] | None = None,
    reviewed_people: list[dict] | None = None,
) -> dict:
    scrape_staff.require_complete_directory(directory)

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
                "faculty_id": organisation_ids.get(item.get("facultyUrl")),
                "profile_url": item["sourceUrl"],
                "source": SOURCE,
            }
        )

    people = []
    person_sources = []
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
        source_key = person.get("externalId") or person["profileUrl"]
        person_sources.append(
            {
                "person_id": person_id,
                "source": SOURCE,
                "source_key": source_key,
                "profile_url": person["profileUrl"],
                "source_url": person["profileUrl"],
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

    people_by_id = {item["id"]: item for item in people}
    people_by_profile_url = {
        item["profile_url"]: item["id"]
        for item in people
        if item["profile_url"]
    }
    for reviewed in reviewed_people or []:
        person_id = reviewed["id"].strip()
        canonical_name = reviewed["canonicalName"].strip()
        source_url = reviewed["sourceUrl"].strip()
        profile_url = reviewed.get("profileUrl")
        if profile_url:
            profile_url = scrape_staff.canonical_url(profile_url)
        source_key = reviewed.get("sourceKey", person_id).strip()
        organisation_url = scrape_staff.canonical_url(
            reviewed["organisationProfileUrl"]
        )
        organisation_id = organisation_ids.get(organisation_url)
        if not person_id or not canonical_name or not source_url or not source_key:
            raise ValueError(
                "Reviewed person requires id, name, source key, and source URL"
            )
        if person_id in people_by_id:
            raise ValueError(f"Reviewed person id already exists: {person_id}")
        if profile_url and profile_url in people_by_profile_url:
            raise ValueError(
                f"Reviewed person profile already belongs to an official person: {profile_url}"
            )
        if not organisation_id:
            raise ValueError(
                f"Reviewed person organisation not found: {organisation_url}"
            )

        person = {
            "id": person_id,
            "canonical_name": canonical_name,
            "external_id": None,
            "profile_url": profile_url,
            "source": REVIEWED_PERSON_SOURCE,
            "identity_kind": "official",
        }
        people.append(person)
        person_sources.append(
            {
                "person_id": person_id,
                "source": REVIEWED_PERSON_SOURCE,
                "source_key": source_key,
                "profile_url": profile_url,
                "source_url": source_url,
            }
        )
        people_by_id[person_id] = person
        if profile_url:
            people_by_profile_url[profile_url] = person_id
        affiliations[(person_id, organisation_id)] = {
            "person_id": person_id,
            "organisation_id": organisation_id,
            "source_url": source_url,
        }
        title = reviewed.get("title", "").strip()
        if title:
            titles[(person_id, organisation_id, title)] = {
                "person_id": person_id,
                "organisation_id": organisation_id,
                "title": title,
                "source_url": source_url,
            }
        aliases.append(
            {
                "person_id": person_id,
                "alias": canonical_name,
                "normalized_alias": scrape_staff.normalise_name(canonical_name),
                "source": "reviewed_manual_override",
                "evidence_url": source_url,
            }
        )
        for reviewed_alias in reviewed.get("aliases", []):
            alias = reviewed_alias["alias"].strip()
            evidence_url = reviewed_alias["evidenceUrl"].strip()
            if not alias or not evidence_url:
                raise ValueError("Reviewed person alias requires alias and evidence URL")
            aliases.append(
                {
                    "person_id": person_id,
                    "alias": alias,
                    "normalized_alias": scrape_staff.normalise_name(alias),
                    "source": "reviewed_manual_override",
                    "evidence_url": evidence_url,
                }
            )

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

    aliases_by_key = {}
    for alias in aliases:
        aliases_by_key[(alias["person_id"], alias["alias"])] = alias
    aliases = list(aliases_by_key.values())

    payload = {
        "observed_at": observed_at,
        "people": sorted(people, key=lambda item: item["id"]),
        "person_sources": sorted(
            person_sources,
            key=lambda item: (item["source"], item["source_key"]),
        ),
        "managed_person_sources": [SOURCE, REVIEWED_PERSON_SOURCE],
        "managed_alias_sources": [SOURCE, "reviewed_manual_override"],
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
    if professors is not None:
        payload["professor_links"] = build_professor_links(
            professors, payload["aliases"], payload["people"]
        )
        payload["managed_professor_ids"] = sorted(
            professor["id"] for professor in professors
        )
    return payload


def render_professor_identity_sql(
    links: list[dict], *, replace_automatic: bool = False,
    scope_to_managed_professors: bool = False,
) -> str:
    if not links:
        raise ValueError("Refusing to reconcile identities without links")
    delete_sql = ""
    conflict_sql = """on conflict (professor_id) do update set
  person_id = excluded.person_id,
  match_method = excluded.match_method,
  source_url = excluded.source_url,
  verified_at = now()
where professor_staff_identities.match_method = 'automatic';"""
    if replace_automatic:
        if scope_to_managed_professors:
            delete_sql = """delete from professor_staff_identities identity
using _staff_directory_import
where identity.match_method = 'automatic'
  and exists (
    select 1
    from jsonb_array_elements_text(
      payload->'managed_professor_ids'
    ) managed(professor_id)
    where managed.professor_id = identity.professor_id
  );

"""
        else:
            delete_sql = """delete from professor_staff_identities
where match_method = 'automatic';

"""
        conflict_sql = "on conflict (professor_id) do nothing;"
    return f"""{delete_sql}insert into professor_staff_identities (
  professor_id, person_id, match_method, source_url
)
select x.professor_id, x.person_id, x.match_method, x.source_url
from _staff_directory_import,
     jsonb_to_recordset(payload->'professor_links') as x(
       professor_id text, person_id text, match_method text, source_url text
     )
{conflict_sql}
"""


def render_professor_identity_backfill_sql(links: list[dict]) -> str:
    payload = json.dumps(
        {"professor_links": links}, ensure_ascii=False, separators=(",", ":")
    )
    if "$directory$" in payload:
        raise ValueError("Unexpected SQL dollar-quote marker in payload")
    identity_sql = render_professor_identity_sql(links, replace_automatic=True)
    return f"""-- Generated professor identity reconciliation. Review before applying.
begin;

create temp table _staff_directory_import (payload jsonb not null) on commit drop;
insert into _staff_directory_import values ($directory${payload}$directory$::jsonb);

{identity_sql}
commit;
"""


def render_sql(payload: dict) -> str:
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if "$directory$" in data:
        raise ValueError("Unexpected SQL dollar-quote marker in payload")
    identity_sql = ""
    if "professor_links" in payload:
        identity_sql = render_professor_identity_sql(
            payload["professor_links"],
            replace_automatic=True,
            scope_to_managed_professors=True,
        )
    return f"""-- Generated by render_staff_directory_import.py. Review before applying.
begin;

create temp table _staff_directory_import (payload jsonb not null) on commit drop;
insert into _staff_directory_import values ($directory${data}$directory$::jsonb);

do $$
declare
  snapshot_observed_at timestamptz;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('cupedia.staff-directory-import', 0)
  );
  select (payload->>'observed_at')::timestamptz
  into snapshot_observed_at
  from _staff_directory_import;

  if exists (
    select 1
    from staff_person_sources person_source,
         _staff_directory_import import
    where person_source.last_seen_at >= snapshot_observed_at
      and person_source.source in (
        select jsonb_array_elements_text(
          import.payload->'managed_person_sources'
        )
      )
  ) or exists (
    select 1
    from staff_organisations organisation
    where organisation.source = '{SOURCE}'
      and organisation.last_seen_at >= snapshot_observed_at
  ) or exists (
    select 1
    from staff_organisation_affiliations affiliation
    join staff_organisations organisation
      on organisation.id = affiliation.organisation_id
    where organisation.source = '{SOURCE}'
      and affiliation.last_seen_at >= snapshot_observed_at
  ) or exists (
    select 1
    from staff_affiliation_titles title
    join staff_organisations organisation
      on organisation.id = title.organisation_id
    where organisation.source = '{SOURCE}'
      and title.last_seen_at >= snapshot_observed_at
  ) then
    raise exception 'Staff directory snapshot is not newer than managed data';
  end if;
end
$$;

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

do $$
begin
  if exists (
    select 1
    from staff_person_sources existing,
         _staff_directory_import,
         jsonb_to_recordset(payload->'person_sources') as incoming(
           person_id text, source text, source_key text, profile_url text,
           source_url text
         )
    where existing.source = incoming.source
      and existing.source_key = incoming.source_key
      and existing.person_id <> incoming.person_id
  ) then
    raise exception 'Staff source identity key belongs to another person';
  end if;
end
$$;

insert into staff_person_sources (
  person_id, source, source_key, profile_url, source_url,
  first_seen_at, last_seen_at, is_current, missing_runs
)
select x.person_id, x.source, x.source_key, x.profile_url, x.source_url,
       meta.observed_at, meta.observed_at, true, 0
from _staff_directory_import,
     lateral (select (payload->>'observed_at')::timestamptz observed_at) meta,
     jsonb_to_recordset(payload->'person_sources') as x(
       person_id text, source text, source_key text, profile_url text,
       source_url text
     )
on conflict (source, source_key) do update set
  profile_url = excluded.profile_url,
  source_url = excluded.source_url,
  last_seen_at = excluded.last_seen_at,
  is_current = true,
  missing_runs = 0;

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

create temp table _staff_managed_people (
  person_id text primary key
) on commit drop;

insert into _staff_managed_people (person_id)
select distinct alias.person_id
from staff_aliases alias,
     _staff_directory_import,
     lateral jsonb_array_elements_text(
       payload->'managed_alias_sources'
     ) managed(source)
where alias.source = managed.source
on conflict (person_id) do nothing;

insert into _staff_managed_people (person_id)
select distinct x.person_id
from _staff_directory_import,
     jsonb_to_recordset(payload->'person_sources') as x(
       person_id text, source text, source_key text, profile_url text,
       source_url text
     )
on conflict (person_id) do nothing;

delete from staff_aliases alias
using _staff_directory_import
where exists (
  select 1
  from jsonb_array_elements_text(
    payload->'managed_alias_sources'
  ) managed(source)
  where managed.source = alias.source
);

insert into staff_aliases (person_id, alias, normalized_alias, source)
select x.person_id, x.alias, x.normalized_alias, x.source
from _staff_directory_import,
     jsonb_to_recordset(payload->'aliases') as x(
       person_id text, alias text, normalized_alias text, source text
     )
on conflict (person_id, alias) do update set
  normalized_alias = excluded.normalized_alias,
  source = excluded.source;

{identity_sql}

update course_offering_instructors offering
set person_id = null,
    match_status = 'unverified',
    evidence_url = null
from _staff_managed_people managed
where offering.person_id = managed.person_id
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

update staff_person_sources person_source
set missing_runs = person_source.missing_runs + 1,
    is_current = person_source.missing_runs + 1 < 2
from _staff_directory_import
where person_source.is_current
  and exists (
    select 1
    from jsonb_array_elements_text(
      payload->'managed_person_sources'
    ) managed(source)
    where managed.source = person_source.source
  )
  and not exists (
    select 1
    from _staff_directory_import,
         jsonb_to_recordset(payload->'person_sources') as x(
           person_id text, source text, source_key text, profile_url text,
           source_url text
         )
    where x.source = person_source.source
      and x.source_key = person_source.source_key
  );

with source_state as (
  select person_id,
         max(last_seen_at) as last_seen_at,
         bool_or(is_current) as is_current,
         case when bool_or(is_current) then 0 else min(missing_runs) end
           as missing_runs
  from staff_person_sources
  group by person_id
)
update staff_people person
set last_seen_at = source_state.last_seen_at,
    is_current = source_state.is_current,
    missing_runs = source_state.missing_runs,
    updated_at = now()
from source_state
where source_state.person_id = person.id;

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
    parser.add_argument(
        "--person-overrides",
        type=Path,
        default=Path(__file__).with_name("staff-person-overrides.json"),
    )
    parser.add_argument(
        "--professors", type=Path, default=data_dir / "professors.json"
    )
    args = parser.parse_args()

    directory = json.loads(args.directory.read_text(encoding="utf-8"))
    reviewed_aliases = json.loads(args.alias_overrides.read_text(encoding="utf-8"))
    reviewed_people = json.loads(args.person_overrides.read_text(encoding="utf-8"))
    professor_snapshot = json.loads(args.professors.read_text(encoding="utf-8"))
    professors = professor_snapshot.get("professors", professor_snapshot)
    payload = build_payload(
        directory,
        reviewed_aliases,
        professors,
        reviewed_people,
    )
    args.output.write_text(render_sql(payload), encoding="utf-8")
    print(json.dumps({key: len(value) if isinstance(value, list) else value for key, value in payload.items()}, indent=2))
    print(f"done -> {args.output}")


if __name__ == "__main__":
    main()
