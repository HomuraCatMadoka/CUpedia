"""Harvest CUHK faculty/department staff from the official Research Portal.

The portal's sitemaps provide stable organisation and person profile URLs.
Profiles are fetched serially, cached locally, and joined through their official
organisation links.  The resulting JSON keeps people distinct by profile URL,
so two staff members with the same display name are never merged by name.

Usage:
    python scrape_staff.py
    python scrape_staff.py --faculties Engineering,Science
    python scrape_staff.py --refresh
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import json
import re
import time
import threading
import unicodedata
import urllib.parse
from dataclasses import dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from defusedxml import ElementTree as ET

import common

BASE = "https://research.cuhk.edu.hk"
ORGANISATIONS_SITEMAP = f"{BASE}/sitemap/organisations.xml"
PERSONS_SITEMAP = f"{BASE}/sitemap/persons.xml"
DEFAULT_PAUSE = 5.0  # research.cuhk.edu.hk/robots.txt Crawl-Delay
PROFILE_MARKER = 'data-page="persons"'
ORGANISATION_MARKER = 'data-page="organisations"'


@dataclass(frozen=True)
class Organisation:
    name: str
    url: str
    ancestors: tuple[tuple[str, str], ...]


def canonical_url(value: str) -> str:
    """Return a stable HTTPS URL without query/fragment and with a trailing slash."""
    parsed = urllib.parse.urlsplit(value)
    path = re.sub(r"/+", "/", parsed.path)
    if not path.endswith("/"):
        path += "/"
    return urllib.parse.urlunsplit(("https", parsed.netloc.lower(), path, "", ""))


def sitemap_urls(xml: str, path_prefix: str) -> list[str]:
    root = ET.fromstring(xml)
    urls = []
    for node in root.iter():
        if node.tag.endswith("loc") and node.text:
            url = canonical_url(node.text.strip())
            if urllib.parse.urlsplit(url).path.startswith(path_prefix):
                urls.append(url)
    return sorted(set(urls))


def parse_organisation(html: str, source_url: str) -> Organisation:
    soup = BeautifulSoup(html, "html.parser")
    card = soup.select_one('section[aria-label="organisations information"]')
    name_node = card.select_one("h1") if card else None
    if not name_node:
        raise ValueError(f"Organisation name missing: {source_url}")
    ancestors = []
    for link in card.select(".organisation-ancestors a[rel=Organisation]"):
        ancestors.append(
            (link.get_text(" ", strip=True), canonical_url(link.get("href", "")))
        )
    return Organisation(
        name=name_node.get_text(" ", strip=True),
        url=canonical_url(source_url),
        ancestors=tuple(ancestors),
    )


def organisation_preview(html: str) -> tuple[list[str], int | None]:
    """Return the staff profile URLs shown on an organisation overview.

    Pure exposes three preview cards without using its Cloudflare-protected
    paginated listing.  This is intentionally a smoke-test path, not a claim of
    complete department coverage.
    """
    soup = BeautifulSoup(html, "html.parser")
    urls = []
    for link in soup.select(".organisation-persons a[rel=Person]"):
        if link.get("href"):
            urls.append(canonical_url(link["href"]))
    count = None
    link = soup.select_one('.submenu a[href$="/persons/"] .count')
    if link:
        match = re.search(r"\d+", link.get_text(" ", strip=True))
        count = int(match.group()) if match else None
    return sorted(set(urls)), count


def discover_person_urls(
    persons_sitemap_xml: str, preview_urls: list[str], preview: bool
) -> list[str]:
    """Combine the person sitemap with profiles exposed only on organisation cards."""
    if preview:
        return sorted(set(preview_urls))
    return sorted(
        set(sitemap_urls(persons_sitemap_xml, "/en/persons/")) | set(preview_urls)
    )


def decode_email(link) -> str | None:
    encoded = link.get("data-md5", "") if link else ""
    if encoded:
        try:
            value = base64.b64decode(encoded).decode("utf-8")
            if value.lower().startswith("mailto:"):
                return value[7:].strip().lower()
        except (ValueError, UnicodeDecodeError):
            pass
    text = link.get_text("", strip=True) if link else ""
    return text.lower() if "@" in text else None


def parse_person(html: str, source_url: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    card = soup.select_one(".person-vcard-wrapper")
    name_node = card.select_one("h1") if card else None
    if not name_node:
        # Some Pure themes render the profile name as the OpenGraph title only.
        name_node = soup.select_one('meta[property="og:title"]')
        name = name_node.get("content", "").strip() if name_node else ""
    else:
        name = name_node.get_text(" ", strip=True)
    if not name:
        raise ValueError(f"Person name missing: {source_url}")

    email_link = card.select_one("a.email") if card else None
    affiliations = []
    seen = set()
    selector = ".rendering_personorganisationlistrendererportal li"
    for item in card.select(selector) if card else []:
        link = item.select_one("a[rel=Organisation]")
        if not link or not link.get("href"):
            continue
        org_url = canonical_url(link["href"])
        title_node = item.select_one(".job-title")
        title = title_node.get_text(" ", strip=True) if title_node else None
        key = (org_url, title)
        if key in seen:
            continue
        seen.add(key)
        affiliations.append(
            {
                "organisation": link.get_text(" ", strip=True),
                "organisationUrl": org_url,
                "title": title,
            }
        )

    # Pure can expose a current department in schema.org JSON-LD while leaving
    # the visible organisation list empty (observed for Professor WANG Liwei).
    # Keep that official affiliation by name; build_directory resolves it to
    # the corresponding organisation URL discovered from organisation pages.
    known_names = {item["organisation"].casefold() for item in affiliations}
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            structured = json.loads(script.string or "")
        except json.JSONDecodeError:
            continue
        if not isinstance(structured, dict) or structured.get("@type") != "Person":
            continue
        values = structured.get("affiliation", [])
        if isinstance(values, dict):
            values = [values]
        for value in values:
            organisation = value.get("name", "").strip() if isinstance(value, dict) else ""
            if organisation and organisation.casefold() not in known_names:
                affiliations.append(
                    {
                        "organisation": organisation,
                        "organisationUrl": None,
                        "title": None,
                    }
                )
                known_names.add(organisation.casefold())
        break

    url = canonical_url(source_url)
    external_id_match = re.search(
        r'\{"id":"([0-9a-fA-F-]{36})","title":"[^"]*","recordType":"person"\}',
        html,
    )
    return {
        "id": hashlib.sha256(url.encode()).hexdigest()[:24],
        "externalId": external_id_match.group(1).lower() if external_id_match else None,
        "name": name,
        "email": decode_email(email_link),
        "profileUrl": url,
        "affiliations": affiliations,
    }


def unit_type(name: str) -> str | None:
    lowered = name.casefold()
    if lowered.startswith("department ") or lowered.startswith("department of "):
        return "department"
    if re.search(r"\bschool of\b", lowered):
        return "school"
    if lowered.endswith(" unit"):
        return "unit"
    return None


def organisation_type(name: str) -> str:
    """Classify every faculty descendant without discarding uncommon units."""
    lowered = name.casefold()
    if lowered.startswith("faculty of "):
        return "faculty"
    legacy_type = unit_type(name)
    if legacy_type:
        return legacy_type
    if "centre" in lowered or "center" in lowered:
        return "centre"
    if "programme" in lowered or "program" in lowered:
        return "programme"
    if "institute" in lowered:
        return "institute"
    if "office" in lowered:
        return "office"
    if "laborator" in lowered:
        return "laboratory"
    return "other"


def organisation_id(url: str) -> str:
    return hashlib.sha256(canonical_url(url).encode()).hexdigest()[:24]


def normalise_name(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    value = re.sub(r"^(professor|prof|doctor|dr|mr|ms|miss)\.?\s+", "", value)
    return re.sub(r"[^\w]+", " ", value, flags=re.UNICODE).strip()


def name_candidates(faculties: list[dict]) -> tuple[list[dict], list[dict]]:
    duplicates = []
    similar = []
    for faculty in faculties:
        for department in faculty["departments"]:
            groups: dict[str, list[dict]] = {}
            staff = department["staff"]
            for person in staff:
                groups.setdefault(normalise_name(person["name"]), []).append(person)
            for normalised, people in groups.items():
                if normalised and len(people) > 1:
                    duplicates.append(
                        {
                            "faculty": faculty["name"],
                            "department": department["name"],
                            "departmentUrl": department["sourceUrl"],
                            "normalisedName": normalised,
                            "staff": [
                                {k: person[k] for k in ("id", "name", "email", "profileUrl")}
                                for person in people
                            ],
                        }
                    )
            for index, left in enumerate(staff):
                left_name = normalise_name(left["name"])
                for right in staff[index + 1 :]:
                    right_name = normalise_name(right["name"])
                    if not left_name or left_name == right_name:
                        continue
                    score = SequenceMatcher(None, left_name, right_name).ratio()
                    if score >= 0.90:
                        similar.append(
                            {
                                "faculty": faculty["name"],
                                "department": department["name"],
                                "departmentUrl": department["sourceUrl"],
                                "score": round(score, 3),
                                "staff": [
                                    {k: person[k] for k in ("id", "name", "email", "profileUrl")}
                                    for person in (left, right)
                                ],
                            }
                        )
    return duplicates, similar


def build_directory(
    organisations: list[Organisation],
    people: list[dict],
    faculty_filter: set[str] | None = None,
) -> dict:
    faculties_by_url = {
        org.url: {
            "name": org.name,
            "sourceUrl": org.url,
            "facultyStaff": [],
            "departments": [],
        }
        for org in organisations
        if org.name.startswith("Faculty of ")
        and (not faculty_filter or org.name.casefold() in faculty_filter)
    }
    all_organisation_urls = {org.url for org in organisations}
    in_scope_urls = (
        {
            org.url
            for org in organisations
            if org.url in faculties_by_url
            or any(url in faculties_by_url for _name, url in org.ancestors)
        }
        if faculty_filter
        else all_organisation_urls
    )
    descendants = []
    faculty_for_organisation = {}
    for org in organisations:
        faculty_url = org.url if org.url in faculties_by_url else next(
            (url for _name, url in reversed(org.ancestors) if url in faculties_by_url),
            None,
        )
        if org.url not in in_scope_urls:
            continue
        parent_url = next(
            (
                url
                for _name, url in reversed(org.ancestors)
                if url in in_scope_urls
            ),
            None,
        )
        descendants.append(
            {
                "id": organisation_id(org.url),
                "name": org.name,
                "sourceUrl": org.url,
                "organisationType": organisation_type(org.name),
                "parentUrl": parent_url,
                "facultyUrl": faculty_url,
            }
        )
        faculty_for_organisation[org.url] = faculty_url

    departments_by_url = {}
    for org in organisations:
        kind = unit_type(org.name)
        if not kind:
            continue
        faculty_url = next(
            (url for name, url in reversed(org.ancestors) if url in faculties_by_url),
            None,
        )
        if not faculty_url:
            continue
        department = {
            "name": org.name,
            "sourceUrl": org.url,
            "unitType": kind,
            "staff": [],
        }
        faculties_by_url[faculty_url]["departments"].append(department)
        departments_by_url[org.url] = department
    departments_by_name: dict[str, list[dict]] = {}
    for item in departments_by_url.values():
        departments_by_name.setdefault(item["name"].casefold(), []).append(item)
    faculties_by_name: dict[str, list[dict]] = {}
    for item in faculties_by_url.values():
        faculties_by_name.setdefault(item["name"].casefold(), []).append(item)

    descendants_by_name: dict[str, list[str]] = {}
    for item in descendants:
        descendants_by_name.setdefault(item["name"].casefold(), []).append(
            item["sourceUrl"]
        )

    people_by_id = {person["id"]: person for person in people}
    official_people = set()
    for person in people_by_id.values():
        assigned_departments: dict[str, dict] = {}
        assigned_faculties: dict[str, dict] = {}
        for affiliation in person["affiliations"]:
            org_url = affiliation["organisationUrl"]
            org_name = affiliation["organisation"].casefold()
            if not org_url:
                matching_urls = descendants_by_name.get(org_name, [])
                org_url = matching_urls[0] if len(matching_urls) == 1 else None
            if org_url in in_scope_urls:
                official_people.add(person["id"])
            named_departments = departments_by_name.get(org_name, [])
            department = departments_by_url.get(org_url) or (
                named_departments[0] if len(named_departments) == 1 else None
            )
            named_faculties = faculties_by_name.get(org_name, [])
            faculty = faculties_by_url.get(org_url) or (
                named_faculties[0] if len(named_faculties) == 1 else None
            )
            item = {
                "id": person["id"],
                "name": person["name"],
                "email": person["email"],
                "profileUrl": person["profileUrl"],
                "title": affiliation["title"],
                "titles": [affiliation["title"]] if affiliation["title"] else [],
                "externalId": person.get("externalId"),
            }
            if department:
                existing = assigned_departments.get(department["sourceUrl"])
                if not existing:
                    department["staff"].append(item)
                    assigned_departments[department["sourceUrl"]] = item
                elif affiliation["title"] and affiliation["title"] not in existing["titles"]:
                    existing["titles"].append(affiliation["title"])
            if faculty:
                existing = assigned_faculties.get(faculty["sourceUrl"])
                if not existing:
                    faculty["facultyStaff"].append(item)
                    assigned_faculties[faculty["sourceUrl"]] = item
                elif affiliation["title"] and affiliation["title"] not in existing["titles"]:
                    existing["titles"].append(affiliation["title"])

    faculties = sorted(faculties_by_url.values(), key=lambda item: item["name"])
    for faculty in faculties:
        faculty["facultyStaff"].sort(key=lambda item: (item["name"], item["profileUrl"]))
        faculty["departments"].sort(key=lambda item: item["name"])
        for department in faculty["departments"]:
            for person in department["staff"]:
                person["titles"].sort()
            department["staff"].sort(key=lambda item: (item["name"], item["profileUrl"]))
        for person in faculty["facultyStaff"]:
            person["titles"].sort()
    duplicates, similar = name_candidates(faculties)
    unique_staff = {
        person["id"]
        for faculty in faculties
        for department in faculty["departments"]
        for person in department["staff"]
    }
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": BASE,
        "organisations": sorted(descendants, key=lambda item: (item["name"], item["sourceUrl"])),
        "people": sorted(
            (people_by_id[person_id] for person_id in official_people),
            key=lambda item: (item["name"], item["profileUrl"]),
        ),
        "faculties": faculties,
        "duplicateCandidates": duplicates,
        "similarNameCandidates": similar,
        "stats": {
            "faculties": len(faculties),
            "departments": sum(len(item["departments"]) for item in faculties),
            "staff": len(official_people),
            "departmentStaff": len(unique_staff),
            "duplicateCandidates": len(duplicates),
            "similarNameCandidates": len(similar),
        },
    }


class PortalFetcher:
    def __init__(self, cache_dir: Path, pause: float, refresh: bool):
        self.cache_dir = cache_dir
        self.pause = pause
        self.refresh = refresh
        self.local = threading.local()
        self.rate_lock = threading.Lock()
        self.last_request = 0.0
        self.source_times: list[datetime] = []

    def _session(self) -> requests.Session:
        if not hasattr(self.local, "session"):
            self.local.session = common.session()
        return self.local.session

    def _cache_path(self, kind: str, url: str) -> Path:
        slug = urllib.parse.urlsplit(url).path.rstrip("/").rsplit("/", 1)[-1]
        digest = hashlib.sha256(url.encode()).hexdigest()[:10]
        path = self.cache_dir / kind / f"{slug}-{digest}.html"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def get(self, kind: str, url: str, marker: str) -> str:
        path = self._cache_path(kind, url)
        if path.exists() and not self.refresh:
            self.source_times.append(
                datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
            )
            return path.read_text(encoding="utf-8")
        for attempt in range(4):
            with self.rate_lock:
                delay = self.pause - (time.monotonic() - self.last_request)
                if delay > 0:
                    time.sleep(delay)
                self.last_request = time.monotonic()
            response = self._session().get(url, timeout=45)
            if response.ok and marker in response.text and "Just a moment" not in response.text:
                path.write_text(response.text, encoding="utf-8")
                self.source_times.append(
                    datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
                )
                return response.text
            if attempt == 3:
                response.raise_for_status()
                raise RuntimeError(f"Portal challenge or unexpected page at {url}")
            time.sleep((attempt + 1) * max(self.pause, 1.0))
        raise RuntimeError(f"Unable to fetch {url}")


def parse_faculty_filter(value: str | None) -> set[str] | None:
    if not value:
        return None
    result = set()
    for item in value.split(","):
        name = item.strip()
        if not name:
            continue
        if not name.casefold().startswith("faculty of "):
            name = f"Faculty of {name}"
        result.add(name.casefold())
    return result or None


def department_urls(value: str | None) -> list[str]:
    if not value:
        return []
    urls = []
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        if "://" not in item:
            item = f"{BASE}/en/organisations/{item.strip('/')}"
        url = canonical_url(item)
        if not urllib.parse.urlsplit(url).path.startswith("/en/organisations/"):
            raise ValueError(f"Not a Research Portal organisation URL: {item}")
        urls.append(url)
    return sorted(set(urls))


def organisation_staff_counts(result: dict) -> dict[str, int]:
    organisations_by_url = {}
    for item in result.get("organisations", []):
        if not item.get("sourceUrl") or not item.get("name"):
            raise ValueError("Cannot calculate organisation coverage from malformed data")
        if item["sourceUrl"] in organisations_by_url:
            raise ValueError("Cannot calculate organisation coverage with duplicate URLs")
        organisations_by_url[item["sourceUrl"]] = item
    organisation_urls_by_name: dict[str, list[str]] = {}
    for item in organisations_by_url.values():
        organisation_urls_by_name.setdefault(item["name"].casefold(), []).append(
            item["sourceUrl"]
        )
    staff_by_organisation: dict[str, set[str]] = {
        url: set() for url in organisations_by_url
    }
    for person in result.get("people", []):
        assigned_urls = set()
        for affiliation in person.get("affiliations", []):
            organisation_url = affiliation.get("organisationUrl")
            if organisation_url not in organisations_by_url:
                matching_urls = organisation_urls_by_name.get(
                    affiliation.get("organisation", "").casefold(), []
                )
                organisation_url = (
                    matching_urls[0] if len(matching_urls) == 1 else None
                )
            if organisation_url in organisations_by_url:
                assigned_urls.add(organisation_url)
        for organisation_url in assigned_urls:
            if not person.get("id"):
                raise ValueError(
                    "Cannot calculate organisation coverage for a person without an id"
                )
            staff_by_organisation[organisation_url].add(person["id"])
    return {
        organisation_url: len(person_ids)
        for organisation_url, person_ids in staff_by_organisation.items()
    }


def add_staff_coverage(
    result: dict, expected_counts: dict[str, int | None], mode: str
) -> None:
    organisations_by_url = {
        item["sourceUrl"]: item for item in result.get("organisations", [])
    }
    staff_counts = organisation_staff_counts(result)

    for organisation_url, organisation in organisations_by_url.items():
        expected = expected_counts.get(organisation_url)
        scraped = staff_counts[organisation_url]
        organisation["staffCoverage"] = {
            "complete": mode == "full"
            and (expected is None or scraped >= expected),
            "expected": expected,
            "scraped": scraped,
        }

    for faculty in result["faculties"]:
        for department in faculty["departments"]:
            department["staffCoverage"] = organisations_by_url[
                department["sourceUrl"]
            ]["staffCoverage"].copy()


def staff_coverage_complete(result: dict, mode: str) -> bool:
    organisations = result.get("organisations", [])
    if mode != "full" or not organisations:
        return False
    staff_counts = organisation_staff_counts(result)
    for organisation in organisations:
        coverage = organisation.get("staffCoverage", {})
        expected = coverage.get("expected")
        scraped = coverage.get("scraped")
        if coverage.get("complete") is not True:
            return False
        if (
            type(scraped) is not int
            or scraped != staff_counts[organisation["sourceUrl"]]
        ):
            return False
        if expected is not None and (
            type(expected) is not int or expected < 0 or scraped < expected
        ):
            return False
    return True


def require_complete_directory(directory: dict) -> None:
    scope = directory.get("scope", {})
    if scope.get("mode") != "full":
        raise ValueError("Refusing to use a non-full staff directory")
    if scope.get("complete") is not True:
        raise ValueError("Refusing to use an incomplete staff directory")
    if scope.get("selectedDepartments") or scope.get("selectedFaculties"):
        raise ValueError("Refusing to use a scoped staff directory")
    if not staff_coverage_complete(directory, "full"):
        raise ValueError(
            "Refusing to use directory without complete organisation coverage"
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--faculties",
        help="comma-separated faculty names, e.g. Engineering,Science",
    )
    parser.add_argument(
        "--departments",
        help="comma-separated Research Portal organisation slugs or URLs",
    )
    parser.add_argument(
        "--preview",
        action="store_true",
        help="smoke-test specified departments using their three overview staff cards",
    )
    parser.add_argument(
        "--pause",
        type=float,
        default=DEFAULT_PAUSE,
        help="seconds between portal requests; default follows robots.txt",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="refetch profiles instead of using the resumable cache",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="concurrent profile requests; keep low to avoid portal throttling",
    )
    parser.add_argument(
        "--limit", type=int, default=0, help="profile limit for a smoke run"
    )
    args = parser.parse_args()
    if args.pause < 0:
        raise SystemExit("--pause cannot be negative")
    if args.workers < 1:
        raise SystemExit("--workers must be at least 1")
    selected_departments = department_urls(args.departments)
    faculty_filter = parse_faculty_filter(args.faculties)
    if args.preview and not selected_departments:
        raise SystemExit("--preview requires --departments")

    session = common.session()
    data_dir = common.ensure_data_dir()
    fetcher = PortalFetcher(data_dir / "staff-directory-cache", args.pause, args.refresh)
    organisations = []
    preview_urls = []
    expected_counts = {}
    if selected_departments:
        organisation_urls = selected_departments
    else:
        organisation_urls = sitemap_urls(
            common.get(session, ORGANISATIONS_SITEMAP), "/en/organisations/"
        )
        if args.limit:
            organisation_urls = organisation_urls[: args.limit]
    for index, url in enumerate(organisation_urls, 1):
        html = fetcher.get("organisations", url, ORGANISATION_MARKER)
        organisation = parse_organisation(html, url)
        organisations.append(organisation)
        preview_people, expected = organisation_preview(html)
        expected_counts[organisation.url] = expected
        preview_urls.extend(preview_people)
        if selected_departments:
            for name, ancestor_url in organisation.ancestors:
                if name.startswith("Faculty of ") and all(
                    item.url != ancestor_url for item in organisations
                ):
                    organisations.append(Organisation(name, ancestor_url, ()))
        print(f"  organisations {index}/{len(organisation_urls)}", end="\r", flush=True)
    print()

    persons_sitemap_xml = "" if args.preview else common.get(session, PERSONS_SITEMAP)
    person_urls = discover_person_urls(persons_sitemap_xml, preview_urls, args.preview)
    if args.limit:
        person_urls = person_urls[: args.limit]
    def fetch_person(url: str) -> dict:
        html = fetcher.get("persons", url, PROFILE_MARKER)
        return parse_person(html, url)

    people = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        for index, person in enumerate(executor.map(fetch_person, person_urls), 1):
            people.append(person)
            print(f"  persons {index}/{len(person_urls)}", end="\r", flush=True)
    print()

    result = build_directory(organisations, people, faculty_filter)
    if fetcher.source_times:
        result["sourceFetchedAtRange"] = {
            "oldest": min(fetcher.source_times).isoformat().replace("+00:00", "Z"),
            "newest": max(fetcher.source_times).isoformat().replace("+00:00", "Z"),
        }
    mode = "preview" if args.preview else "limited" if args.limit else "full"
    result["scope"] = {
        "mode": mode,
        "selectedDepartments": selected_departments,
        "selectedFaculties": sorted(faculty_filter or []),
    }
    add_staff_coverage(result, expected_counts, mode)
    result["scope"]["complete"] = staff_coverage_complete(result, mode)
    filename = "staff-directory.preview.json" if args.preview else "staff-directory.json"
    out = data_dir / filename
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"done: {result['stats']} -> {out}")


if __name__ == "__main__":
    main()
