"""Turn reviewed instructor evidence into a source-level verification queue."""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import common
import resolve_staff_pilot
import scrape_staff


TARGET_CLASSIFICATION = "current_cuhk_missing_person"


def canonical_source_url(value: str) -> str:
    """Normalize transport/path noise without dropping semantic query params."""
    parsed = urlsplit(value.strip())
    if not parsed.netloc:
        raise ValueError(f"Source URL must be absolute: {value}")
    path = re.sub(r"/+", "/", parsed.path or "/")
    if not Path(path).suffix and not path.endswith("/"):
        path += "/"
    return urlunsplit(("https", parsed.netloc.casefold(), path, parsed.query, ""))


def directory_matches(audit: dict, directory: dict) -> dict[str, dict]:
    """Return uniquely named official directory people keyed by professor id."""
    scrape_staff.require_complete_directory(directory)
    people_by_name: dict[str, list[dict]] = defaultdict(list)
    for person in directory.get("people", []):
        people_by_name[resolve_staff_pilot.name_key(person["name"])].append(person)

    matches = {}
    for record in audit.get("records", []):
        if record.get("classification") != TARGET_CLASSIFICATION:
            continue
        production_name = record.get("productionName") or record.get("name")
        if not production_name:
            continue
        candidates = people_by_name.get(
            resolve_staff_pilot.name_key(production_name), []
        )
        if len(candidates) == 1:
            matches[record["professorId"]] = candidates[0]
    return matches


def build_queue(audit: dict, resolved_people: dict[str, dict] | None = None) -> dict:
    records = audit.get("records")
    if not isinstance(records, list):
        raise ValueError("Audit records must be a list")

    seen_professor_ids = set()
    grouped: dict[str, list[dict]] = defaultdict(list)
    missing_source = []
    directory_resolved = []
    target_count = 0
    resolved_people = resolved_people or {}

    for record in records:
        professor_id = record.get("professorId")
        if not professor_id or professor_id in seen_professor_ids:
            raise ValueError(f"Missing or duplicate professor id: {professor_id}")
        seen_professor_ids.add(professor_id)

        if record.get("classification") != TARGET_CLASSIFICATION:
            continue
        target_count += 1
        resolved = resolved_people.get(professor_id)
        if resolved:
            directory_resolved.append(
                {
                    "professorId": professor_id,
                    "productionName": record.get("productionName")
                    or record.get("name"),
                    "personId": resolved["id"],
                    "canonicalName": resolved["name"],
                    "profileUrl": resolved["profileUrl"],
                }
            )
            continue
        production_name = record.get("productionName") or record.get("name")
        if not production_name:
            raise ValueError(f"Target record has no instructor name: {professor_id}")
        item = {
            "professorId": professor_id,
            "productionName": production_name,
            "canonicalName": record.get("canonicalName"),
            "courses": sorted(record.get("courses", [])),
            "confidence": record.get("confidence"),
            "organisation": record.get("organisation"),
            "profileUrl": record.get("profileUrl"),
            "evidence": record.get("evidence"),
        }
        source_url = record.get("sourceUrl")
        if source_url:
            grouped[canonical_source_url(source_url)].append(item)
        else:
            missing_source.append(item)

    sources = []
    for source_url, people in grouped.items():
        people.sort(key=lambda item: (item["productionName"], item["professorId"]))
        path = urlsplit(source_url).path.rstrip("/").casefold()
        sources.append(
            {
                "sourceUrl": source_url,
                "sourceType": "pdf" if path.endswith(".pdf") else "html",
                "peopleCount": len(people),
                "highConfidenceCount": sum(
                    item["confidence"] == "high" for item in people
                ),
                "organisations": sorted(
                    {item["organisation"] for item in people if item["organisation"]}
                ),
                "people": people,
            }
        )
    sources.sort(key=lambda item: (-item["peopleCount"], item["sourceUrl"]))
    missing_source.sort(
        key=lambda item: (item["productionName"], item["professorId"])
    )
    directory_resolved.sort(
        key=lambda item: (item["productionName"], item["professorId"])
    )

    queued_count = sum(item["peopleCount"] for item in sources)
    remaining_count = queued_count + len(missing_source)
    if remaining_count + len(directory_resolved) != target_count:
        raise ValueError("Source queue does not cover every target record")

    return {
        "generatedAt": audit.get("generatedAt"),
        "sourceAudit": "audit-remaining-merged.json",
        "classification": TARGET_CLASSIFICATION,
        "summary": {
            "auditPeople": target_count,
            "people": remaining_count,
            "directoryResolvedPeople": len(directory_resolved),
            "peopleWithSource": queued_count,
            "peopleMissingSource": len(missing_source),
            "uniqueSources": len(sources),
            "topTenCoverage": sum(
                item["peopleCount"] for item in sources[:10]
            ),
        },
        "sources": sources,
        "missingSource": missing_source,
        "directoryResolved": directory_resolved,
    }


def main() -> None:
    data_dir = common.ensure_data_dir()
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--audit", type=Path, default=data_dir / "audit-remaining-merged.json"
    )
    parser.add_argument(
        "--output", type=Path, default=data_dir / "staff-source-queue.json"
    )
    parser.add_argument(
        "--directory",
        type=Path,
        help="optional refreshed staff-directory.json used to remove Pure matches",
    )
    args = parser.parse_args()

    audit = json.loads(args.audit.read_text(encoding="utf-8"))
    resolved_people = None
    if args.directory:
        directory = json.loads(args.directory.read_text(encoding="utf-8"))
        resolved_people = directory_matches(audit, directory)
    queue = build_queue(audit, resolved_people)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(queue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(queue["summary"], ensure_ascii=False, indent=2))
    print(f"done -> {args.output}")


if __name__ == "__main__":
    main()
