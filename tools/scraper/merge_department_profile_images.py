"""Merge fresh verified portraits into a previously complete SQL snapshot."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


MARKER_START = "values ($department_profiles$"
MARKER_END = "$department_profiles$::jsonb);"
SOURCE_PREFIX = "cuhk_department:"


def merge_images(snapshot_sql: str, report: dict) -> tuple[str, int]:
    scope = report.get("scope", {})
    requested = set(scope.get("requestedSources", []))
    complete = set(scope.get("completeSources", []))
    if not scope.get("fresh") or not requested or requested != complete:
        raise ValueError("Image enrichment requires fresh complete requested sources")
    if report.get("sourceErrors") or report.get("fetchErrors"):
        raise ValueError("Image enrichment report contains crawl errors")

    try:
        prefix, remainder = snapshot_sql.split(MARKER_START, 1)
        encoded, suffix = remainder.split(MARKER_END, 1)
    except ValueError as error:
        raise ValueError("Department profile snapshot payload was not found") from error
    payload = json.loads(encoded)
    existing = {
        (row["person_id"], row["source"], row["source_key"]): row
        for row in payload["person_sources"]
    }

    updated = 0
    for record in report.get("records", []):
        image_url = record.get("imageUrl")
        if not image_url:
            continue
        source = record.get("source", "")
        if not source.startswith(SOURCE_PREFIX) or source.removeprefix(SOURCE_PREFIX) not in requested:
            raise ValueError("Portrait comes from outside the requested source scope")
        if record.get("profileStatus") != "verified":
            raise ValueError("Portrait comes from an unverified profile")
        key = (record["personId"], record["source"], record["sourceKey"])
        row = existing.get(key)
        if not row:
            raise ValueError("Portrait identity is absent from the complete snapshot")
        if not row.get("profile_verified_at"):
            raise ValueError("Portrait identity is not verified in the complete snapshot")
        if record.get("profileUrl") != row.get("profile_url"):
            raise ValueError("Portrait profile does not match the complete snapshot")
        if row.get("image_url") and row["image_url"] != image_url:
            raise ValueError("Image enrichment would overwrite an existing portrait")
        if not row.get("image_url"):
            row["image_url"] = image_url
            updated += 1

    if not updated:
        raise ValueError("Image enrichment did not add any portraits")
    merged = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if "$department_profiles$" in merged:
        raise ValueError("Unexpected SQL dollar-quote marker in payload")
    return f"{prefix}{MARKER_START}{merged}{MARKER_END}{suffix}", updated


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    snapshot_sql = args.snapshot.read_text(encoding="utf-8")
    report = json.loads(args.report.read_text(encoding="utf-8"))
    merged, updated = merge_images(snapshot_sql, report)
    args.output.write_text(merged, encoding="utf-8")
    print(json.dumps({"portraitsAdded": updated}))


if __name__ == "__main__":
    main()
