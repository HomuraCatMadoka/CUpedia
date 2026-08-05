"""Harvest verified CUHK department profile links for canonical staff people.

Each reviewed source config reads one official roster. A row is emitted only
when it matches one Research Portal person by email or by a unique name inside
the configured organisation. Ambiguous and unmatched rows stay in the audit
output and are never imported automatically.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

from bs4 import BeautifulSoup
import requests
from soupsieve.util import SelectorSyntaxError

import common
import resolve_staff_pilot


EMAIL = re.compile(
    r"[\w.+-]+\s*(?:@|\[\s*(?:@|at)\s*\]|\(\s*at\s*\))\s*[\w.-]+\.[A-Za-z]{2,}",
    re.I,
)
CJK = re.compile(r"[\u3400-\u9fff]+")
PLACEHOLDER_IMAGES = {
    "men.jpg",
    "sharing-logo.jpg",
    "placeholder-portrait-male-e1776937960820.png",
}


def absolute_url(base_url: str, value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlsplit(urljoin(base_url, value.strip()))
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return urlunsplit(("https", parsed.netloc.casefold(), parsed.path, parsed.query, ""))


def official_url(
    base_url: str,
    value: str | None,
    allowed_hosts: list[str] | None = None,
) -> str | None:
    url = absolute_url(base_url, value)
    if not url:
        return None
    parsed = urlsplit(url)
    try:
        safe_port = parsed.port in {None, 443}
    except ValueError:
        safe_port = False
    host = parsed.hostname or ""
    reviewed_hosts = {item.casefold() for item in (allowed_hosts or [])}
    safe_host = (
        host in reviewed_hosts
        if reviewed_hosts
        else host == "cuhk.edu.hk" or host.endswith(".cuhk.edu.hk")
    )
    return url if safe_host and safe_port and not parsed.username and not parsed.password else None


def photo_url(
    base_url: str,
    value: str | None,
    allowed_hosts: list[str] | None = None,
) -> str | None:
    url = official_url(
        base_url,
        value,
        allowed_hosts or [urlsplit(base_url).hostname or ""],
    )
    if not url:
        return None
    image_name = Path(urlsplit(url).path).name.casefold()
    if image_name in PLACEHOLDER_IMAGES:
        return None
    return url if Path(image_name).suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"} else None


def clean_name(value: str) -> str:
    value = CJK.sub("", unicodedata.normalize("NFKC", value))
    return re.sub(r"\s+", " ", value).strip(" ,|-/")


def source_identity_key(record: dict, config_key: str) -> str:
    if record.get("profileUrl"):
        parsed = urlsplit(record["profileUrl"])
        path = parsed.path.rstrip("/") or "/"
        return urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, ""))
    if record.get("email"):
        return f"email:{record['email']}"
    signature = "|".join(name_signature(record["name"]))
    digest = hashlib.sha256(signature.encode()).hexdigest()[:16]
    return f"directory-name:{config_key}:{digest}"


def name_signature(value: str) -> tuple[str, ...]:
    """Order-insensitive key used only within one reviewed organisation.

    Callers require exactly one candidate, so reversed-name homonyms remain
    unresolved rather than being merged.
    """
    cleaned = re.sub(
        r"^(professor|prof|doctor|dr|mr|ms|miss)\.?\s+",
        "",
        clean_name(value),
        flags=re.I,
    )
    return tuple(sorted(token.casefold() for token in re.findall(r"[^\W_]+", cleaned)))


def email_in_text(value: str) -> str | None:
    matches = EMAIL.findall(unicodedata.normalize("NFKC", value))
    if not matches:
        return None
    emails = [
        re.sub(
            r"\[\s*(?:@|at)\s*\]|\(\s*at\s*\)",
            "@",
            re.sub(r"\s+", "", match),
            flags=re.I,
        ).casefold()
        for match in matches
    ]
    return next(
        (
            email for email in emails
            if is_cuhk_email(email)
        ),
        None,
    )


def is_cuhk_email(value: str) -> bool:
    domain = value.rsplit("@", 1)[-1].casefold()
    return domain == "cuhk.edu.hk" or domain.endswith(".cuhk.edu.hk")


def appointment_kind(title: str | None) -> str | None:
    value = (title or "").casefold()
    if "in memoriam" in value or "in-memoriam" in value:
        return "former"
    if "emeritus" in value or "retired" in value:
        return "emeritus"
    if "visiting" in value:
        return "visiting"
    if "part-time" in value or "part time" in value:
        return "part_time"
    if "adjunct" in value:
        return "adjunct"
    if "honorary" in value:
        return "honorary"
    if "courtesy" in value:
        return "courtesy"
    return "regular" if value else None


def selected_text(
    entry,
    selector: str | None,
    text_index: int | None = None,
) -> str | None:
    node = entry.select_one(selector) if selector else None
    if node and text_index is not None:
        fragments = list(node.stripped_strings)
        value = fragments[text_index] if text_index < len(fragments) else ""
    else:
        value = node.get_text(" ", strip=True) if node else ""
    return value or None


def selected_link_value(link, attribute: str = "href") -> str | None:
    if not link:
        return None
    value = link.get(attribute)
    if attribute == "onclick" and value:
        match = re.fullmatch(
            r"\s*(?:window\.)?location(?:\.href)?\s*=\s*(['\"])(https?://[^'\"]+)\1\s*;?\s*",
            value,
            re.I,
        )
        return match.group(2) if match else None
    return value


def parse_json_directory(payload: str, config: dict) -> list[dict]:
    value = json.loads(payload)
    records = []
    if config["adapter"] == "eltu_people_api":
        rows = value["posts"]
        for row in rows:
            records.append({
                "name": clean_name(row["name"]),
                "title": row.get("listing_title"),
                "appointmentKind": appointment_kind(row.get("listing_title")),
                "email": email_in_text(row.get("mail") or ""),
                "profileUrl": official_url(
                    config["directoryUrl"], row.get("permalink")
                ),
                "sourceUrl": config.get("sourceUrl", config["directoryUrl"]),
                "imageUrl": photo_url(
                    config["directoryUrl"], row.get("thumb_url")
                ),
            })
    elif config["adapter"] == "ie_wordpress_rest":
        excluded_taxonomies = set(config.get("excludedPersonnel", []))
        rows = [
            row for row in value
            if row.get("personnel")
            and not excluded_taxonomies.intersection(row["personnel"])
        ]
        for row in rows:
            content = BeautifulSoup(row["content"]["rendered"], "html.parser")
            position = content.select_one(".wp-block-columns")
            title = position.get_text(" ", strip=True) if position else None
            images = row.get("uagb_featured_image_src", {})
            medium = images.get("medium") or images.get("full") or []
            records.append({
                "name": clean_name(row["title"]["rendered"]),
                "title": title,
                "appointmentKind": appointment_kind(title),
                "email": email_in_text(content.get_text(" ", strip=True)),
                "profileUrl": official_url(
                    config["directoryUrl"], row.get("link")
                ),
                "sourceUrl": config.get("sourceUrl", config["directoryUrl"]),
                "imageUrl": photo_url(
                    config["directoryUrl"], medium[0] if medium else None
                ),
            })
    elif config["adapter"] == "chi_teaching_ajax":
        for row in value:
            photo = row.get("photo") or {}
            image = (photo.get("sizes") or {}).get("s")
            records.append({
                "name": clean_name(row["title"]),
                "title": row.get("position"),
                "appointmentKind": appointment_kind(
                    " ".join(filter(None, [row.get("_group"), row.get("position")]))
                ),
                "email": email_in_text(" ".join(row.get("emails") or [])),
                "profileUrl": official_url(
                    config["directoryUrl"], row.get("permalink")
                ),
                "sourceUrl": config["directoryUrl"],
                "imageUrl": photo_url(config["directoryUrl"], image),
            })
    else:
        raise ValueError(f"Unknown directory adapter: {config['adapter']}")
    return records


def parse_directory(html: str, config: dict) -> list[dict]:
    if config.get("adapter"):
        return parse_json_directory(html, config)
    soup = BeautifulSoup(html, "html.parser")
    records = []
    for entry in soup.select(config["entrySelector"]):
        name = selected_text(
            entry,
            config["nameSelector"],
            config.get("nameTextIndex"),
        )
        if not name:
            continue
        link_selector = config.get("linkSelector")
        link = (
            entry
            if link_selector == ":scope"
            else entry.select_one(link_selector)
            if link_selector
            else None
        )
        image_selector = config.get("imageSelector")
        image = entry.select_one(image_selector) if image_selector else None
        title = selected_text(
            entry,
            config.get("titleSelector"),
            config.get("titleTextIndex"),
        )
        group = None
        if config.get("groupHeadingSelector"):
            heading = entry.find_previous(config["groupHeadingSelector"])
            group = heading.get_text(" ", strip=True) if heading else None
        category = entry.get(config["categoryAttribute"]) if config.get("categoryAttribute") else None
        image_value = None
        if image:
            if config.get("imageAttribute") == "style":
                match = re.search(r"background-image\s*:\s*url\(['\"]?([^)'\"]+)", image.get("style", ""), re.I)
                image_value = match.group(1) if match else None
            else:
                image_value = image.get("data-src")
                if image.get("srcset"):
                    image_value = image["srcset"].split(",")[-1].strip().split()[0]
                image_value = image_value or image.get("src")
        inferred_appointment = appointment_kind(
            " ".join(filter(None, [category, group, title]))
        )
        records.append(
            {
                "name": clean_name(name),
                "title": title,
                "appointmentKind": config.get("appointmentOverride")
                or inferred_appointment,
                "email": email_in_text(selected_text(entry, config.get("emailSelector")) or ""),
                "profileUrl": official_url(
                    config["directoryUrl"],
                    selected_link_value(
                        link,
                        config.get("linkAttribute", "href"),
                    ),
                    config.get("allowedProfileHosts")
                    or [urlsplit(config["directoryUrl"]).hostname or ""],
                ),
                "sourceUrl": config["directoryUrl"],
                "imageUrl": photo_url(
                    config["directoryUrl"],
                    image_value,
                    config.get("allowedImageHosts"),
                ),
            }
        )
    deduplicated = {}
    for record in records:
        key = record["profileUrl"] or record["email"] or (
            name_signature(record["name"]), record["title"]
        )
        deduplicated[key] = record
    return list(deduplicated.values())


def enrich_from_profile(record: dict, html: str, selector: str | None = None) -> dict:
    """Fill roster omissions from the person's official department page."""
    soup = BeautifulSoup(html, "html.parser")
    nodes = soup.select(selector) if selector else []
    email_text = " ".join(node.get_text(" ", strip=True) for node in nodes)
    email = record.get("email") or email_in_text(email_text)
    return {**record, "email": email}


class CachedFetcher:
    def __init__(self, cache_dir: Path, pause: float, refresh: bool):
        self.cache_dir = cache_dir
        self.pause = pause
        self.refresh = refresh
        self.session = common.session()
        self.fetched_at: dict[str, datetime] = {}

    def get(self, url: str) -> str:
        digest = hashlib.sha256(url.encode()).hexdigest()
        path = self.cache_dir / f"{digest}.html"
        if path.exists() and not self.refresh:
            self.fetched_at[url] = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
            return path.read_text(encoding="utf-8")
        html = common.get(self.session, url)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(html, encoding="utf-8")
        self.fetched_at[url] = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
        time.sleep(max(self.pause, 0))
        return html

    def post(self, url: str, data: dict, referer: str) -> dict:
        signature = json.dumps([url, data], sort_keys=True)
        path = self.cache_dir / f"{hashlib.sha256(signature.encode()).hexdigest()}.json"
        if path.exists() and not self.refresh:
            return json.loads(path.read_text(encoding="utf-8"))
        response = self.session.post(
            url,
            data=data,
            headers={"Referer": referer},
            timeout=30,
        )
        response.raise_for_status()
        value = response.json()
        if not value.get("success"):
            raise ValueError("Department AJAX returned an unsuccessful response")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value), encoding="utf-8")
        time.sleep(max(self.pause, 0))
        return value


def fetch_directory_pages(config: dict, fetcher: CachedFetcher) -> str:
    """Follow only an explicit reviewed next-page selector on the same host."""
    if config.get("adapter") == "chi_teaching_ajax":
        landing = fetcher.get(config["directoryUrl"])
        nonce_match = re.search(r"nonce:\s*['\"]([A-Za-z0-9]+)", landing)
        terms_match = re.search(r"var childTermsData\s*=\s*(\[.*?\]);", landing)
        if not nonce_match or not terms_match:
            raise ValueError("Chinese department AJAX metadata was not found")
        terms = json.loads(terms_match.group(1))
        endpoint = urljoin(config["directoryUrl"], "/wp-admin/admin-ajax.php")
        staff = []
        for term in terms:
            page = 1
            while True:
                response = fetcher.post(
                    endpoint,
                    {
                        "action": "load_teaching_staff",
                        "nonce": nonce_match.group(1),
                        "page": page,
                        "position": term["slug"],
                        "sort_order": "asc",
                        "lang": "en",
                    },
                    config["directoryUrl"],
                )
                rows = response["data"]["staff"]
                staff.extend({**row, "_group": term["slug"]} for row in rows)
                if not response["data"].get("has_more"):
                    break
                page += 1
        return json.dumps(staff)
    url = config["directoryUrl"]
    pages = []
    seen = set()
    while url and url not in seen:
        seen.add(url)
        html = fetcher.get(url)
        pages.append(html)
        selector = config.get("paginationSelector")
        next_link = BeautifulSoup(html, "html.parser").select_one(selector) if selector else None
        url = official_url(url, next_link.get("href") if next_link else None)
        if url and len(pages) >= config.get("maxPages", 30):
            raise ValueError(f"Pagination exceeded maxPages for {config['key']}")
    return "\n".join(pages)


def portal_indexes(directory: dict) -> tuple[dict, dict, dict]:
    by_email: dict[str, list[dict]] = defaultdict(list)
    by_org_and_name: dict[tuple[str, tuple[str, ...]], dict[str, dict]] = defaultdict(dict)
    by_org: dict[str, dict[str, dict]] = defaultdict(dict)
    for person in directory["people"]:
        candidate = {**person, "personId": resolve_staff_pilot.external_key(person)}
        if person.get("email"):
            by_email[person["email"].casefold()].append(candidate)
        signature = name_signature(person["name"])
        for affiliation in person.get("affiliations", []):
            if affiliation.get("organisationUrl"):
                by_org_and_name[(affiliation["organisationUrl"], signature)][
                    candidate["personId"]
                ] = candidate
                by_org[affiliation["organisationUrl"]][candidate["personId"]] = candidate
    return by_email, by_org_and_name, by_org


def include_reviewed_profiles(directory: dict, reviewed_people: list[dict]) -> dict:
    people = list(directory["people"])
    known_ids = {resolve_staff_pilot.external_key(person) for person in people}
    for reviewed in reviewed_people:
        if not reviewed.get("profileUrl"):
            continue
        person = {
            "externalId": None,
            "name": reviewed["canonicalName"],
            "email": None,
            "profileUrl": reviewed["profileUrl"],
            "affiliations": [{
                "organisationUrl": reviewed["organisationProfileUrl"],
            }],
        }
        person_id = resolve_staff_pilot.external_key(person)
        if person_id != reviewed["id"]:
            raise ValueError("Reviewed profile ID does not match its profile URL")
        if person_id not in known_ids:
            people.append(person)
            known_ids.add(person_id)
    return {**directory, "people": people}


def match_record(
    record: dict,
    config: dict,
    by_email: dict,
    by_org_and_name: dict,
    by_org: dict,
) -> dict:
    if record["appointmentKind"] == "former":
        return {**record, "status": "excluded_former", "candidatePersonIds": []}
    candidates = by_email.get(record["email"], []) if record.get("email") else []
    if len(candidates) == 1 and not names_compatible(record["name"], candidates[0]["name"]):
        candidates = []
    matched_by = "email" if len(candidates) == 1 else None
    if not candidates:
        candidates_by_id = {}
        signature = name_signature(record["name"])
        for organisation_url in config["organisationUrls"]:
            for person in by_org_and_name.get((organisation_url, signature), {}).values():
                candidates_by_id[person["personId"]] = person
        candidates = list(candidates_by_id.values())
        matched_by = "organisation_name" if len(candidates) == 1 else None
    suggested_candidates = []
    if not candidates:
        candidates_by_id = {}
        signature = set(name_signature(record["name"]))
        if len(signature) >= 2:
            for organisation_url in config["organisationUrls"]:
                for person in by_org.get(organisation_url, {}).values():
                    candidate_signature = set(name_signature(person["name"]))
                    if signature < candidate_signature:
                        candidates_by_id[person["personId"]] = person
        suggested_candidates = list(candidates_by_id.values())
    if len(candidates) != 1:
        return {
            **record,
            "status": "ambiguous" if candidates else "candidate" if suggested_candidates else "unmatched",
            "candidatePersonIds": sorted(
                person["personId"] for person in candidates or suggested_candidates
            ),
        }
    person = candidates[0]
    source = f"cuhk_department:{config['key']}"
    return {
        **record,
        "status": "verified",
        "matchedBy": matched_by,
        "personId": person["personId"],
        "canonicalName": person["name"],
        "source": source,
        "sourceKey": source_identity_key(record, config["key"]),
    }


def names_compatible(left: str, right: str) -> bool:
    left_tokens = {token for token in name_signature(left) if len(token) >= 3}
    right_tokens = {token for token in name_signature(right) if len(token) >= 3}
    overlap = left_tokens & right_tokens
    return left_tokens == right_tokens or len(overlap) >= 2


def verify_profile_links(report: dict, fetcher: CachedFetcher) -> dict:
    """GET each emitted personal page; failed links are never card targets."""
    failed_sources = set()
    errors = list(report.get("fetchErrors", []))
    for record in report["records"]:
        profile_url = record.get("profileUrl")
        if not profile_url:
            record["profileStatus"] = "missing"
            continue
        try:
            if profile_url not in fetcher.fetched_at:
                fetcher.get(profile_url)
            record["profileStatus"] = "verified"
            record["profileVerifiedAt"] = fetcher.fetched_at[profile_url].isoformat()
        except requests.RequestException as error:
            record["profileStatus"] = "failed"
            failed_sources.add(record["source"].removeprefix("cuhk_department:"))
            errors.append({
                "sourceKey": record["source"].removeprefix("cuhk_department:"),
                "url": profile_url,
                "error": type(error).__name__,
            })
    if failed_sources:
        for source in report["sources"]:
            if source["key"] in failed_sources:
                source["complete"] = False
        report["scope"]["completeSources"] = [
            key for key in report["scope"]["completeSources"]
            if key not in failed_sources
        ]
    report["fetchErrors"] = errors
    report["generatedAt"] = datetime.now(timezone.utc).isoformat()
    return report


def build_report(
    directory: dict,
    configs: list[dict],
    pages: dict[str, str],
    profile_pages: dict[str, str] | None = None,
    fetch_errors: list[dict] | None = None,
    source_errors: list[dict] | None = None,
    source_observed_at: dict[str, str] | None = None,
    fresh_run: bool = False,
) -> dict:
    by_email, by_org_and_name, by_org = portal_indexes(directory)
    verified = {}
    unresolved = []
    sources = []
    errored_sources = {
        item["sourceKey"] for item in [*(fetch_errors or []), *(source_errors or [])]
    }
    for config in configs:
        try:
            records = parse_directory(pages[config["directoryUrl"]], config)
        except (KeyError, SelectorSyntaxError, ValueError) as error:
            source_errors = [*(source_errors or []), {
                "sourceKey": config["key"], "error": type(error).__name__
            }]
            continue
        if len(records) < config.get("minimumEntries", 1):
            source_errors = [*(source_errors or []), {
                "sourceKey": config["key"],
                "error": "directory_below_minimum",
                "scraped": len(records),
                "minimumEntries": config.get("minimumEntries", 1),
            }]
            continue
        if profile_pages:
            records = [
                enrich_from_profile(
                    record,
                    profile_pages[record["profileUrl"]],
                    config.get("profileEmailSelector"),
                )
                if record.get("profileUrl") in profile_pages else record
                for record in records
            ]
        matched = [
            match_record(record, config, by_email, by_org_and_name, by_org)
            for record in records
        ]
        for record in matched:
            if record["status"] == "verified":
                verified[(record["source"], record["sourceKey"])] = record
            else:
                unresolved.append({"sourceKey": config["key"], **record})
        observed_source_keys = sorted(
            {source_identity_key(record, config["key"]) for record in records}
        )
        identities_complete = len(observed_source_keys) == len(records)
        if not identities_complete:
            source_errors = [*(source_errors or []), {
                "sourceKey": config["key"],
                "error": "duplicate_source_identity_key",
            }]
        complete = config["key"] not in errored_sources and identities_complete
        sources.append(
            {
                "key": config["key"],
                "sourceUrl": config["directoryUrl"],
                "scraped": len(records),
                "verified": sum(record["status"] == "verified" for record in matched),
                "unresolved": sum(record["status"] != "verified" for record in matched),
                "complete": complete,
                "observedAt": (source_observed_at or {}).get(config["key"]),
                "observedSourceKeys": observed_source_keys,
            }
        )
    generated_at = datetime.now(timezone.utc).isoformat()
    observed_values = list((source_observed_at or {}).values())
    return {
        "generatedAt": generated_at,
        "observedAt": min(observed_values) if observed_values else generated_at,
        "scope": {
            "fresh": fresh_run,
            "completeSources": [
                source["key"] for source in sources
                if fresh_run and source["complete"]
            ],
        },
        "sources": sources,
        "records": sorted(verified.values(), key=lambda item: (item["personId"], item["sourceKey"])),
        "unresolved": sorted(unresolved, key=lambda item: (item["sourceKey"], item["name"])),
        "fetchErrors": fetch_errors or [],
        "sourceErrors": source_errors or [],
    }


def main() -> None:
    data_dir = common.ensure_data_dir()
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", type=Path, default=data_dir / "staff-directory.json")
    parser.add_argument(
        "--sources", type=Path,
        default=Path(__file__).with_name("department-profile-sources.json"),
    )
    parser.add_argument("--output", type=Path, default=data_dir / "staff-department-profiles.json")
    parser.add_argument(
        "--person-overrides",
        type=Path,
        default=Path(__file__).with_name("staff-person-overrides.json"),
    )
    parser.add_argument("--source", action="append", dest="source_keys")
    parser.add_argument("--pause", type=float, default=0.25)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=data_dir / "staff-department-profile-cache",
    )
    args = parser.parse_args()

    directory = include_reviewed_profiles(
        json.loads(args.directory.read_text(encoding="utf-8")),
        json.loads(args.person_overrides.read_text(encoding="utf-8")),
    )
    configs = json.loads(args.sources.read_text(encoding="utf-8"))
    if args.source_keys:
        wanted = set(args.source_keys)
        configs = [config for config in configs if config["key"] in wanted]
    fetcher = CachedFetcher(args.cache_dir, args.pause, args.refresh)
    pages = {}
    active_configs = []
    source_errors = []
    source_observed_at = {}
    for config in configs:
        try:
            pages[config["directoryUrl"]] = fetch_directory_pages(config, fetcher)
            source_observed_at[config["key"]] = fetcher.fetched_at[
                config["directoryUrl"]
            ].isoformat()
            active_configs.append(config)
        except (requests.RequestException, SelectorSyntaxError, ValueError) as error:
            source_errors.append({
                "sourceKey": config["key"], "error": type(error).__name__
            })
    profile_pages = {}
    fetch_errors = []
    for config in active_configs:
        if not config.get("enrichProfiles"):
            continue
        try:
            records = parse_directory(pages[config["directoryUrl"]], config)
        except (KeyError, SelectorSyntaxError, ValueError) as error:
            source_errors.append({
                "sourceKey": config["key"], "error": type(error).__name__
            })
            continue
        directory_host = urlsplit(config["directoryUrl"]).hostname
        profile_urls = {
            record["profileUrl"] for record in records
            if not record.get("email")
            and record.get("profileUrl")
            and urlsplit(record["profileUrl"]).hostname == directory_host
        }
        for profile_url in sorted(profile_urls):
            try:
                profile_pages[profile_url] = fetcher.get(profile_url)
            except requests.RequestException as error:
                fetch_errors.append({
                    "sourceKey": config["key"],
                    "url": profile_url,
                    "error": type(error).__name__,
                })
    report = build_report(
        directory,
        active_configs,
        pages,
        profile_pages,
        fetch_errors,
        source_errors,
        source_observed_at,
        args.refresh,
    )
    report = verify_profile_links(report, fetcher)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary_output = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary_output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary_output.replace(args.output)
    print(json.dumps({
        "sources": len(report["sources"]),
        "verified": len(report["records"]),
        "unresolved": len(report["unresolved"]),
    }, indent=2))
    print(f"done -> {args.output}")


if __name__ == "__main__":
    main()
