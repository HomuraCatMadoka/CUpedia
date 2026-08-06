"""Render cached Research Portal portraits as a source-scoped SQL update."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import common
import resolve_staff_pilot
import scrape_staff


def build_payload(directory: dict, cache_dir: Path) -> dict:
    if directory.get("scope", {}).get("mode") != "full":
        raise ValueError("Research Portal image import requires a full directory")

    fetcher = scrape_staff.PortalFetcher(cache_dir, 0, False)
    rows = []
    for person in directory["people"]:
        cache_path = fetcher._cache_path("persons", person["profileUrl"])
        if not cache_path.exists():
            raise ValueError(
                f"Missing cached Research Portal profile: {person['profileUrl']}"
            )
        parsed = scrape_staff.parse_person(
            cache_path.read_text(encoding="utf-8"), person["profileUrl"]
        )
        if parsed.get("externalId") != person.get("externalId"):
            raise ValueError(f"Research Portal identity changed: {person['profileUrl']}")
        if parsed.get("imageUrl"):
            rows.append(
                {
                    "person_id": resolve_staff_pilot.external_key(person),
                    "source_key": person.get("externalId") or person["profileUrl"],
                    "image_url": parsed["imageUrl"],
                }
            )
    return {"person_sources": rows}


def render_sql(payload: dict) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if "$portal_images$" in encoded:
        raise ValueError("Unexpected SQL dollar-quote marker in payload")
    return f"""create temp table _research_portal_image_import (
  payload jsonb not null
) on commit drop;

insert into _research_portal_image_import (payload)
values ($portal_images${encoded}$portal_images$::jsonb);

do $$
begin
  if exists (
    select 1
    from _research_portal_image_import,
         jsonb_to_recordset(payload->'person_sources') as incoming(
           person_id text, source_key text, image_url text
         )
    join staff_person_sources existing
      on existing.source = 'cuhk_research_portal'
     and existing.source_key = incoming.source_key
    where existing.person_id <> incoming.person_id
  ) then
    raise exception 'Research Portal image identity belongs to another person';
  end if;
end
$$;

update staff_person_sources existing
set image_url = incoming.image_url
from _research_portal_image_import,
     jsonb_to_recordset(payload->'person_sources') as incoming(
       person_id text, source_key text, image_url text
     )
where existing.source = 'cuhk_research_portal'
  and existing.source_key = incoming.source_key
  and existing.person_id = incoming.person_id;
"""


def main() -> None:
    data_dir = common.ensure_data_dir()
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--directory", type=Path, default=data_dir / "staff-directory.json"
    )
    parser.add_argument(
        "--cache-dir", type=Path, default=data_dir / "staff-directory-cache"
    )
    parser.add_argument(
        "--output", type=Path, default=data_dir / "research-portal-profile-images.sql"
    )
    args = parser.parse_args()
    directory = json.loads(args.directory.read_text(encoding="utf-8"))
    args.output.write_text(
        render_sql(build_payload(directory, args.cache_dir)), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
