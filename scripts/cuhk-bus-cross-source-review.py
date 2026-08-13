#!/usr/bin/env python3
"""Cross-compare official / CU Bus App / Anson CUBus / Flippy campus-bus data."""

from __future__ import annotations

import json
import math
import re
import sqlite3
from collections import defaultdict
from pathlib import Path

ROOT = Path("docs/campus-transport/data")
OUT_JSON = ROOT / "third-party" / "cross-source-conflict-review.json"
OUT_MD = ROOT / "third-party" / "cross-source-conflict-review.md"

FAMILIES = ["1A", "1B", "2", "3", "4", "5", "6A", "6B", "7", "8", "H", "N"]


def parse_mins(value) -> list[int]:
    if value is None:
        return []
    if isinstance(value, list):
        return sorted({int(x) for x in value})
    return sorted({int(n) for n in re.findall(r"\d+", str(value)) if int(n) < 60})


def hm(value) -> str | None:
    if not value:
        return None
    match = re.match(r"(\d{1,2}):(\d{2})", str(value).strip())
    if not match:
        return str(value)
    return f"{int(match.group(1)):02d}:{match.group(2)}"


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


def norm_name(raw: str) -> str:
    if not raw:
        return ""
    text = raw.lower().replace("&", " and ")
    text = re.sub(r"\([^)]*\)", " ", text)  # drop direction qualifiers
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    # strip trailing direction words after base name
    text = re.sub(
        r"\b(uphill|downhill|upward|downward|terminal|drop off|only to area 39|"
        r"mtr direction|central direction|central campus direction|"
        r"shaw college direction|circuit north direction|"
        r"residence 3 and 4 direction|for route 5)\b",
        " ",
        text,
    )
    text = re.sub(r"\s+", " ", text).strip()
    aliases = {
        "univ station": "university station",
        "uni station": "university station",
        "mtr university station": "university station",
        "univ mtr station": "university station",
        "univ mtr station uphill": "university station",
        "univ mtr station terminal": "university station",
        "university station terminal": "university station",
        "university station piazza": "station piazza",
        "univ sports centre": "university sports centre",
        "uni sports centre": "university sports centre",
        "sports centre": "university sports centre",
        "university sports centre": "university sports centre",
        "sir run run shaw hall": "sir run run shaw hall",
        "shaw hall": "sir run run shaw hall",
        "univ admin bldg": "university admin building",
        "univ admin building": "university admin building",
        "university admin building": "university admin building",
        "university administration building": "university admin building",
        "s h ho college": "s h ho college",
        "shho": "s h ho college",
        "station piazza": "station piazza",
        "piazza": "station piazza",
        "piazza terminal": "station piazza",
        "chung chi teaching bldg": "chung chi teaching blocks",
        "chung chi teaching building": "chung chi teaching blocks",
        "chung chi teaching blocks": "chung chi teaching blocks",
        "y i a p": "yiap",
        "yasumoto international academic park": "yiap",
        "yasumoto international academic park yia": "yiap",
        "yia": "yiap",
        "postgraduate hall 1": "pgh1",
        "jockey club postgraduate hall": "pgh1",
        "area 39": "area 39",
        "cw chu college": "cw chu college",
        "c w chu college": "cw chu college",
        "cwc college": "cw chu college",
        "new asia college": "new asia college",
        "new asia circle": "new asia circle",
        "new asia college residence 3 and 4": "new asia circle",
        "new asia college residence 3 and 4 direction": "new asia circle",
        "na college": "new asia college",
        "united college": "united college",
        "united college drop off": "united college",
        "united college residence 3 and 4": "united college",
        "united college residence 3 and 4 direction": "united college",
        "shaw college": "shaw college",
        "wu yee sun college": "wys",
        "wys college": "wys",
        "residences no 3 and 4": "res 3 4",
        "residences 3 4": "res 3 4",
        "residences no 3": "res 3 4",
        "u c staff residence": "uc staff residence",
        "united college staff residence": "uc staff residence",
        "chan chun ha hostel": "chan chun ha hostel",
        "residence no 15": "residence 15",
        "residence 15": "residence 15",
        "residence no 10": "residence 10",
        "residence 10": "residence 10",
        "residences no 10 11": "residence 10",
        "science centre": "science centre",
        "sci centre": "science centre",
        "fung king hey bldg": "fung king hey",
        "fung king hey building": "fung king hey",
        "fung king hey": "fung king hey",
        "campus circuit east": "circuit east",
        "campus circuit north": "circuit north",
        "circuit north": "circuit north",
        "lee woo sing college": "lee woo sing",
        "university health centre": "uhc",
        "university library art museum": "library",
        "wong foo yuan bldg": "wong foo yuan",
        "wong foo yuan building": "wong foo yuan",
        "ho tim bldg": "ho tim",
        "ho tim building": "ho tim",
        "academic bldg no 1": "academic 1",
        "c c staff quarters c": "cc staff c",
        "ho sin hang engineering bldg": "engineering",
    }
    if text in aliases:
        return aliases[text]
    # second pass after light stripping of residual direction tokens
    text2 = re.sub(
        r"\b(up|down|north|south|east|west|central|mtr|cwc)\b",
        " ",
        text,
    )
    text2 = re.sub(r"\s+", " ", text2).strip()
    return aliases.get(text2, text)


def seq_score(left: list[str], right: list[str]) -> float:
    if not left or not right:
        return 0.0
    n, m = len(left), len(right)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n):
        for j in range(m):
            if left[i] == right[j]:
                dp[i + 1][j + 1] = dp[i][j] + 1
            else:
                dp[i + 1][j + 1] = max(dp[i][j + 1], dp[i + 1][j])
    return dp[n][m] / max(n, m)


def load_official() -> dict:
    payload = json.loads((ROOT / "cuhk-public-data" / "merged.snapshot.json").read_text())
    official = {}
    for route in payload["merged"]["routes"]:
        route_id = route["routeId"].lower()
        bands = []
        for band in route.get("scheduleBands") or []:
            if band.get("parseStatus") != "parsed":
                continue
            bands.append(
                {
                    "start": hm(band.get("startTime")),
                    "end": hm(band.get("endTime")),
                    "mins": sorted(band.get("departureMinutes") or []),
                    "rule": band.get("serviceRuleRaw") or "",
                }
            )
        patterns = []
        for pattern in (route.get("officialMapEvidence") or {}).get("routePatterns") or []:
            stops_raw = pattern.get("stopSequence") or []
            act = pattern.get("activation") or {}
            patterns.append(
                {
                    "id": pattern.get("patternId"),
                    "mins": sorted(act.get("departureMinutes") or []),
                    "day": act.get("serviceDayType"),
                    "stops": [
                        norm_name(stop.get("stopName") or stop.get("stopId") or "")
                        for stop in stops_raw
                    ],
                    "raw_stops": [stop.get("stopName") for stop in stops_raw],
                }
            )
        official[route_id] = {
            "name": route.get("name"),
            "bands": bands,
            "patterns": patterns,
        }
    return official


def load_app() -> tuple[dict, dict, dict]:
    conn = sqlite3.connect(ROOT / "third-party" / "cu-bus-app" / "raw" / "cubus.db")
    conn.row_factory = sqlite3.Row
    routes = {}
    for row in conn.execute("SELECT * FROM route"):
        stops_raw = json.loads(row["stops_json"])
        route_id = row["id"]
        base = re.sub(r"_(sat|non_teach|sir_run_run|area_39|postgrad)$", "", route_id)
        routes[route_id] = {
            "id": route_id,
            "base": base,
            "variant": None if "_" not in route_id else route_id.split("_", 1)[1],
            "day": row["operating_day_type"],
            "start": hm(row["open_time"]),
            "end": hm(row["close_time"]),
            "mins": sorted(json.loads(row["departure_mins_json"])),
            "stops": [norm_name(stop.get("name_en") or stop.get("id") or "") for stop in stops_raw],
            "raw_stops": [stop.get("name_en") for stop in stops_raw],
            "stop_ids": [stop["id"] for stop in stops_raw],
        }
    stops = {}
    for row in conn.execute("SELECT * FROM stop"):
        stops[row["id"]] = {
            "id": row["id"],
            "name_en": row["name_en"],
            "name_zh": row["name_zh"],
            "lat": float(row["lat"]),
            "lon": float(row["long"]),
            "norm": norm_name(row["name_en"]),
        }
    adj: dict[str, dict[tuple[str, str], int]] = defaultdict(dict)
    for row in conn.execute(
        "SELECT route_id, from_stop_id, to_stop_id, expected_duration_sec FROM route_segment"
    ):
        adj[row["route_id"]][(row["from_stop_id"], row["to_stop_id"])] = row[
            "expected_duration_sec"
        ]
    return routes, stops, adj


def load_anson() -> tuple[dict, dict, dict]:
    route_json = json.loads((ROOT / "third-party" / "cubus-anson" / "Route.json").read_text())
    gps_json = json.loads((ROOT / "third-party" / "cubus-anson" / "gps.json").read_text())
    code_name = {
        "MTR": "Univ. Station",
        "SPORTC": "Univ. Sports Centre",
        "SHAWHALL": "Sir Run Run Shaw Hall",
        "UADM": "Univ. Admin. Bldg.",
        "SHHC": "S.H. Ho College",
        "JCPH": "Postgraduate Hall 1",
        "MTRP": "Station Piazza",
        "CCTEA": "Chung Chi Teaching Bldg.",
        "FKHB": "Fung King Hey Bldg.",
        "UC": "United College",
        "NA": "New Asia College",
        "NAC": "New Asia Circle",
        "SC": "Science Centre",
        "SCIC": "Science Centre",
        "YIA": "Y.I.A.P.",
        "YIAP": "Y.I.A.P.",
        "AREA39": "Area 39",
        "CWCC": "CW Chu College",
        "WYS": "Wu Yee Sun College",
        "SHAW": "Shaw College",
        "SHAWC": "Shaw College",
        "CCHH": "Chan Chun Ha Hostel",
        "UCSR": "U.C. Staff Residence",
        "RES15": "Residence No. 15",
        "RESI15": "Residence No. 15",
        "RES10": "Residence No. 10",
        "RESI10": "Residence No. 10",
        "RESI34": "Residences No. 3 and 4",
        "CCEN": "Campus Circuit North",
        "CCEE": "Campus Circuit East",
        "NACIR": "New Asia Circle",
        "UCDROP": "United College (Upward)",
        "NA5": "New Asia College",
        "MTRT": "Univ. Station",
    }
    trans_path = ROOT / "third-party" / "cubus-anson" / "translation.json"
    if trans_path.exists():
        translation = json.loads(trans_path.read_text())
        if isinstance(translation, dict) and isinstance(translation.get("en"), dict):
            code_name.update(translation["en"])
        elif isinstance(translation, dict):
            for key, value in translation.items():
                if isinstance(value, dict):
                    label = value.get("en") or value.get("name_en")
                    if label:
                        code_name[key] = label
    routes = {}
    for route_id, body in route_json.items():
        schedule = body.get("schedule") or []
        stations = body.get("stations") or {}
        names = stations.get("name") or []
        times = stations.get("time") or []
        routes[route_id] = {
            "id": route_id,
            "base": route_id.rstrip("#"),
            "variant": "alt" if route_id.endswith("#") else None,
            "start": hm(schedule[0]) if len(schedule) > 0 else None,
            "end": hm(schedule[1]) if len(schedule) > 1 else None,
            "mins": parse_mins(schedule[2]) if len(schedule) > 2 else [],
            "day_tag": schedule[3] if len(schedule) > 3 else "",
            "week": schedule[4] if len(schedule) > 4 else "",
            "stops_codes": names,
            "leg_sec": [float(value) for value in times],
            "stops": [norm_name(code_name.get(code, code)) for code in names],
            "raw_stops": [code_name.get(code, code) for code in names],
        }
    stops = {
        code: {"code": code, "lat": float(body["Lat"]), "lon": float(body["Lng"])}
        for code, body in gps_json.items()
    }
    return routes, stops, code_name


def load_flippy() -> tuple[dict, dict]:
    conn = sqlite3.connect(ROOT / "third-party" / "flippy" / "announcement_CU_171.db")
    conn.row_factory = sqlite3.Row
    stops = {}
    for row in conn.execute("SELECT * FROM StopList"):
        stop_id = row["OpenDataStopId"]
        stops[stop_id] = {
            "id": stop_id,
            "name_en": row["AnnouncementShortEng"],
            "name_zh": row["AnnouncementShortChi"],
            "lat": float(row["Latitude"]) if row["Latitude"] else None,
            "lon": float(row["Longitude"]) if row["Longitude"] else None,
            "norm": norm_name(row["AnnouncementShortEng"] or ""),
        }
    routes = {}
    for row in conn.execute("SELECT * FROM RouteList"):
        code = row["RouteCode"]
        open_id = row["OpenDataRouteId"]
        sequence = list(
            conn.execute(
                "SELECT * FROM RouteStopList WHERE RouteCode=? ORDER BY StopSeq",
                (code,),
            )
        )
        raw_stops = []
        norm_stops = []
        for item in sequence:
            stop = stops.get(item["MapStopId"])
            raw_stops.append(stop["name_en"] if stop else item["MapStopId"])
            norm_stops.append(stop["norm"] if stop else norm_name(item["MapStopId"]))
        routes[open_id] = {
            "code": code,
            "num": row["RouteNum"],
            "type": row["RouteTypeEng"],
            "via": row["RouteViaEng"],
            "open_id": open_id,
            "dest": row["RouteDestEng"],
            "stops": norm_stops,
            "raw_stops": raw_stops,
            "is_info_day": "Info" in (row["RouteTypeEng"] or "")
            or "Info" in (open_id or ""),
        }
    return routes, stops


def app_variants(app_routes: dict, base: str) -> list[dict]:
    return [
        route
        for route_id, route in app_routes.items()
        if route["base"].upper() == base.upper()
        or route_id.upper() == base.upper()
        or route_id.upper().startswith(base.upper() + "_")
    ]


def anson_variants(anson_routes: dict, base: str) -> list[dict]:
    return [route for route in anson_routes.values() if route["base"].upper() == base.upper()]


def flip_variants(flip_routes: dict, base: str) -> list[dict]:
    return [
        route
        for route in flip_routes.values()
        if route["num"].upper() == base.upper() and not route["is_info_day"]
    ]


def compare_schedule(official: dict, app_routes: dict, anson_routes: dict):
    conflicts = []
    ok = []
    for family in FAMILIES:
        off = official.get(family.lower())
        if not off:
            continue
        bands = off["bands"]
        for route in app_variants(app_routes, family):
            match = next(
                (
                    band
                    for band in bands
                    if band["start"] == route["start"] and band["end"] == route["end"]
                ),
                None,
            )
            if match is None:
                match = next(
                    (
                        band
                        for band in bands
                        if set(route["mins"]).issubset(set(band["mins"]))
                        and route["start"] == band["start"]
                    ),
                    None,
                )
            if match is None and len(bands) == 1:
                match = bands[0]
            if match is None:
                conflicts.append(
                    {
                        "family": family,
                        "kind": "schedule_no_matching_band",
                        "source": "cu-bus-app",
                        "id": route["id"],
                        "value": {
                            "start": route["start"],
                            "end": route["end"],
                            "mins": route["mins"],
                            "day": route["day"],
                        },
                        "official_bands": bands,
                        "issues": ["no matching official band"],
                    }
                )
                continue
            issues = []
            if route["start"] != match["start"] or route["end"] != match["end"]:
                issues.append(
                    f"window app {route['start']}-{route['end']} vs off {match['start']}-{match['end']}"
                )
            if route["mins"] != match["mins"]:
                if set(route["mins"]).issubset(set(match["mins"])):
                    issues.append(
                        f"mins subset app {route['mins']} of off {match['mins']} (variant split)"
                    )
                else:
                    issues.append(f"mins app {route['mins']} vs off {match['mins']}")
            record = {
                "family": family,
                "source": "cu-bus-app",
                "id": route["id"],
                "value": {
                    "start": route["start"],
                    "end": route["end"],
                    "mins": route["mins"],
                    "day": route["day"],
                },
                "official": match,
                "issues": issues,
            }
            if issues and not all("subset" in issue for issue in issues):
                conflicts.append({**record, "kind": "schedule_mismatch"})
            else:
                ok.append(
                    {
                        **record,
                        "kind": "schedule_variant_subset"
                        if issues
                        else "schedule_match",
                    }
                )
        for route in anson_variants(anson_routes, family):
            match = next(
                (
                    band
                    for band in bands
                    if band["start"] == route["start"] and band["end"] == route["end"]
                ),
                None,
            )
            if match is None and bands:
                match = bands[0]
            if match is None:
                continue
            issues = []
            if route["start"] != match["start"] or route["end"] != match["end"]:
                issues.append(
                    f"window anson {route['start']}-{route['end']} vs off {match['start']}-{match['end']}"
                )
            if sorted(route["mins"]) != match["mins"]:
                if route["mins"] and set(route["mins"]).issubset(set(match["mins"])):
                    issues.append(
                        f"mins subset anson {route['mins']} of off {match['mins']}"
                    )
                else:
                    issues.append(f"mins anson {route['mins']} vs off {match['mins']}")
            record = {
                "family": family,
                "source": "anson",
                "id": route["id"],
                "value": {
                    "start": route["start"],
                    "end": route["end"],
                    "mins": route["mins"],
                    "day_tag": route["day_tag"],
                },
                "official": match,
                "issues": issues,
            }
            if issues and not all("subset" in issue for issue in issues):
                conflicts.append({**record, "kind": "schedule_mismatch_anson"})
            else:
                ok.append(
                    {
                        **record,
                        "kind": "schedule_variant_subset_anson"
                        if issues
                        else "schedule_match_anson",
                    }
                )
    return conflicts, ok


def compare_stop_sequences(official: dict, app_routes: dict, anson_routes: dict, flip_routes: dict):
    conflicts = []
    ok = []

    def evaluate(family: str, source: str, route_id: str, stops: list[str], raw_stops: list[str], extra: dict):
        off = official.get(family.lower())
        if not off:
            return
        best = None
        for pattern in off["patterns"]:
            score = seq_score(stops, pattern["stops"])
            if best is None or score > best[0]:
                best = (score, pattern)
        if best is None:
            return
        score, pattern = best
        only_src = [stop for stop in stops if stop not in pattern["stops"]]
        only_off = [stop for stop in pattern["stops"] if stop not in stops]
        shared_src = [stop for stop in stops if stop in pattern["stops"]]
        shared_off = [stop for stop in pattern["stops"] if stop in stops]
        issues = []
        if score < 0.75:
            issues.append(f"low LCS ratio {score:.2f}")
        if only_src:
            issues.append(f"only_src={only_src}")
        if only_off:
            issues.append(f"only_off={only_off}")
        if shared_src != shared_off and len(shared_src) >= 3:
            issues.append("order differs")
        record = {
            "family": family,
            "source": source,
            "id": route_id,
            "matched_pattern": pattern["id"],
            "score": round(score, 3),
            "src_stops": raw_stops,
            "off_stops": pattern["raw_stops"],
            "only_src": only_src,
            "only_off": only_off,
            "issues": issues,
            **extra,
        }
        hard = (
            "order differs" in issues
            or score < 0.75
            or (len(only_src) + len(only_off) >= 2 and score < 0.9)
        )
        if hard:
            conflicts.append({**record, "kind": f"stop_seq_conflict_{source}"})
        else:
            ok.append({**record, "kind": f"stop_seq_ok_{source}"})

    for family in FAMILIES:
        for route in app_variants(app_routes, family):
            evaluate(family, "cu-bus-app", route["id"], route["stops"], route["raw_stops"], {})
        for route in anson_variants(anson_routes, family):
            evaluate(
                family,
                "anson",
                route["id"],
                route["stops"],
                route["raw_stops"],
                {"codes": route["stops_codes"]},
            )
        for route in flip_variants(flip_routes, family):
            evaluate(
                family,
                "flippy",
                route["open_id"],
                route["stops"],
                route["raw_stops"],
                {"type": route["type"], "via": route["via"]},
            )
    return conflicts, ok


def compare_coords(app_stops: dict, anson_stops: dict, code_name: dict, flip_stops: dict):
    buckets: dict[str, dict[str, list]] = defaultdict(lambda: {"app": [], "anson": [], "flippy": []})
    for stop in app_stops.values():
        buckets[stop["norm"]]["app"].append(stop)
    for code, stop in anson_stops.items():
        name = norm_name(code_name.get(code, code))
        buckets[name]["anson"].append({"code": code, "norm": name, **stop})
    for stop in flip_stops.values():
        if stop["lat"] is None:
            continue
        buckets[stop["norm"]]["flippy"].append(stop)

    conflicts = []
    ok = []
    for name, sources in sorted(buckets.items()):
        points = []
        for source, rows in sources.items():
            for row in rows:
                points.append(
                    (
                        source,
                        row.get("id") or row.get("code"),
                        row["lat"],
                        row["lon"],
                        row.get("name_en") or row.get("code"),
                    )
                )
        present = sum(1 for key in sources if sources[key])
        if present < 2:
            continue
        max_distance = 0.0
        pair = None
        for i, left in enumerate(points):
            for right in points[i + 1 :]:
                distance = haversine_m(left[2], left[3], right[2], right[3])
                if distance > max_distance:
                    max_distance = distance
                    pair = (left, right)
        payload = {
            "name": name,
            "max_distance_m": round(max_distance, 1),
            "all": [
                {"src": src, "id": sid, "lat": lat, "lon": lon, "label": label}
                for src, sid, lat, lon, label in points
            ],
        }
        if max_distance >= 40 and pair is not None:
            payload["pair"] = [
                {"src": item[0], "id": item[1], "lat": item[2], "lon": item[3], "label": item[4]}
                for item in pair
            ]
            conflicts.append(payload)
        else:
            ok.append(payload)
    return conflicts, ok


def compare_travel_times(app_routes: dict, app_adj: dict, app_stops: dict, anson_routes: dict, code_name: dict):
    name_to_app: dict[str, list[str]] = defaultdict(list)
    for stop in app_stops.values():
        name_to_app[stop["norm"]].append(stop["id"])

    conflicts = []
    ok = []
    for route in anson_routes.values():
        candidates = [
            item for item in app_routes.values() if item["base"].upper() == route["base"].upper()
        ]
        if route["variant"] == "alt":
            preferred = [item for item in candidates if item["variant"]]
            if preferred:
                candidates = preferred
        else:
            preferred = [
                item
                for item in candidates
                if not item["variant"] or item["id"].upper() == route["base"].upper()
            ]
            if preferred:
                candidates = preferred
        if not candidates:
            continue
        app_route = candidates[0]
        mapped = []
        for code, stop_name in zip(route["stops_codes"], route["stops"]):
            app_id = None
            for stop_id, app_name in zip(app_route["stop_ids"], app_route["stops"]):
                if app_name == stop_name or norm_name(code_name.get(code, code)) == app_name:
                    app_id = stop_id
                    break
            if app_id is None:
                candidates_ids = name_to_app.get(stop_name) or []
                if len(candidates_ids) == 1:
                    app_id = candidates_ids[0]
            mapped.append((code, app_id))
        legs = []
        for index in range(len(route["stops_codes"]) - 1):
            from_code, from_app = mapped[index]
            to_code, to_app = mapped[index + 1]
            anson_sec = route["leg_sec"][index] if index < len(route["leg_sec"]) else None
            app_sec = app_adj[app_route["id"]].get((from_app, to_app)) if from_app and to_app else None
            if anson_sec is None or app_sec is None:
                continue
            legs.append(
                {
                    "from": from_code,
                    "to": to_code,
                    "from_app": from_app,
                    "to_app": to_app,
                    "anson_sec": round(anson_sec, 1),
                    "app_sec": app_sec,
                    "diff_sec": round(app_sec - anson_sec, 1),
                }
            )
        if not legs:
            continue
        big = [leg for leg in legs if abs(leg["diff_sec"]) >= 30]
        record = {
            "family": route["base"],
            "anson_id": route["id"],
            "app_id": app_route["id"],
            "legs": legs,
            "big_diffs": big,
        }
        if big:
            conflicts.append(record)
        else:
            ok.append(record)
    return conflicts, ok


def build_coverage(official: dict, app_routes: dict, anson_routes: dict, flip_routes: dict) -> list[dict]:
    rows = []
    for family in FAMILIES + ["UP", "DOWN"]:
        off = official.get(family.lower())
        rows.append(
            {
                "family": family,
                "official": bool(off),
                "official_bands": len(off["bands"]) if off else 0,
                "official_patterns": len(off["patterns"]) if off else 0,
                "app_variants": [route["id"] for route in app_variants(app_routes, family)],
                "anson_variants": [route["id"] for route in anson_variants(anson_routes, family)],
                "flippy_variants": [route["open_id"] for route in flip_variants(flip_routes, family)],
                "flippy_info_day_extra": [
                    route["open_id"]
                    for route in flip_routes.values()
                    if route["num"].upper() == family.upper() and route["is_info_day"]
                ],
            }
        )
    return rows


def write_markdown(report: dict) -> None:
    hard = report["schedule"]["conflicts"]
    stop_conflicts = report["stop_sequence"]["conflicts"]
    coord_conflicts = report["coordinates"]["conflicts_ge_40m"]
    tt_conflicts = report["travel_time_app_vs_anson"]["routes_with_leg_diff_ge_30s"]
    coverage = report["coverage"]
    lines = [
        "# 校巴多源行程数据冲突审查",
        "",
        "生成日：2026-08-11。基线：**官方** `cuhk-public-data/merged.snapshot.json`。",
        "",
        "对比源：",
        "- 官方 traffic office HTML/PDF merge（14 线，含 PSLB Up/Down）",
        "- CU Bus App v1.18 `cubus.db`（19 变体 / 35 站）",
        "- AnsonCheng03/CUBus `Route.json`（16，约 2024-10）",
        "- Flippy CU_v1.1（22 线含 Info Day，无班次字段）",
        "",
        "## 总览",
        "",
        "| 维度 | 冲突数 | 说明 |",
        "| --- | ---: | --- |",
        f"| 起点班次 window/mins | {len(hard)} | 第三方 vs 官方 band |",
        f"| 站序（LCS/顺序/集合） | {len(stop_conflicts)} | 启发式站名归一后 |",
        f"| 坐标 ≥40m | {len(coord_conflicts)} | App / Anson / Flippy 互比 |",
        f"| 邻站耗时 ≥30s（App vs Anson） | {len(tt_conflicts)} 条路线 | 两边都有可匹配邻边时 |",
        "",
        "## 覆盖矩阵",
        "",
        "| 线 | 官方 band/pattern | App 变体 | Anson | Flippy |",
        "| --- | --- | --- | --- | --- |",
    ]
    for row in coverage:
        if row["family"] in ("UP", "DOWN"):
            lines.append(
                f"| {row['family']} | {row['official_bands']}/{row['official_patterns']} | — | — | — |"
            )
        else:
            lines.append(
                "| {family} | {bands}/{patterns} | {app} | {anson} | {flippy} |".format(
                    family=row["family"],
                    bands=row["official_bands"],
                    patterns=row["official_patterns"],
                    app=", ".join(row["app_variants"]) or "—",
                    anson=", ".join(row["anson_variants"]) or "—",
                    flippy=", ".join(row["flippy_variants"]) or "—",
                )
            )
    lines.extend(
        [
            "",
            "**只在官方**：`Up` / `Down`（Meet-class / PSLB）。**只在 Flippy**：Info Day `A/B/C/D1/D2`。",
            "",
            "## 1. 起点班次冲突（硬）",
            "",
        ]
    )
    if not hard:
        lines.append("无。")
    else:
        lines.extend(
            [
                "| 线 | 源 | 问题 | 官方对照 |",
                "| --- | --- | --- | --- |",
            ]
        )
        for item in hard:
            official = item.get("official") or item.get("official_bands")
            lines.append(
                f"| {item['family']} | {item['source']}:{item['id']} | "
                f"{'; '.join(item.get('issues') or [item['kind']])} | "
                f"`{json.dumps(official, ensure_ascii=False)[:140]}` |"
            )
    lines.extend(
        [
            "",
            "### 解读（班次）",
            "",
            "- **Anson 多条过时**（至少 1A 等）：window/mins 与 2026-08-11 官方不一致。",
            "- **App 主干线大体对齐官方**；H/N/2 的 mins 子集是变体拆分，不是 band 冲突。",
            "- **5/6A/7 教学日**：官方 2 个 band（Mon–Fri / Sat），App 拆成 `*_sat`。",
            "",
            "## 2. 站序冲突",
            "",
        ]
    )
    if not stop_conflicts:
        lines.append("无显著站序冲突。")
    else:
        lines.extend(
            [
                "| 线 | 源 | pattern | LCS | 问题摘要 |",
                "| --- | --- | --- | ---: | --- |",
            ]
        )
        for item in sorted(
            stop_conflicts, key=lambda row: (row["family"], row["source"], str(row.get("id")))
        ):
            issues = "; ".join(item.get("issues") or [])[:160]
            lines.append(
                f"| {item['family']} | {item['source']}:{item.get('id')} | "
                f"{item.get('matched_pattern')} | {item.get('score')} | {issues} |"
            )
    lines.extend(
        [
            "",
            "细节 JSON：`cross-source-conflict-review.json` → `stop_sequence.conflicts`。",
            "",
            "## 3. 坐标冲突（≥40 m）",
            "",
        ]
    )
    if not coord_conflicts:
        lines.append("无。")
    else:
        lines.extend(
            [
                "| 归一站名 | 最大偏差 m | 点位 |",
                "| --- | ---: | --- |",
            ]
        )
        for item in sorted(coord_conflicts, key=lambda row: -row["max_distance_m"]):
            points = "; ".join(
                f"{point['src']}:{point['lat']:.5f},{point['lon']:.5f}" for point in item["all"]
            )
            lines.append(f"| {item['name']} | {item['max_distance_m']} | {points} |")
    lines.extend(
        [
            "",
            "## 4. 邻站耗时 App vs Anson（≥30 s）",
            "",
        ]
    )
    if not tt_conflicts:
        lines.append("无（或无可比对邻边）。")
    else:
        lines.extend(
            [
                "| 线 | App | Anson | 偏差≥30s 边 |",
                "| --- | --- | --- | --- |",
            ]
        )
        for item in tt_conflicts:
            big = "; ".join(
                f"{leg['from']}→{leg['to']} app{leg['app_sec']}/anson{leg['anson_sec']} (Δ{leg['diff_sec']}s)"
                for leg in item["big_diffs"][:6]
            )
            lines.append(
                f"| {item['family']} | {item['app_id']} | {item['anson_id']} | {big} |"
            )
    lines.extend(
        [
            "",
            "## 5. 结论与采用规则",
            "",
            "1. **计划起点发车**：只信官方 band；App 与官方主干一致；**Anson 多条已过时**。",
            "2. **站序**：App 最接近官方 pattern；Flippy 2023 含 Info Day 与旧命名。",
            "3. **中间站到站时刻**：App/Anson 预计算，**不是**官方 Stop time。",
            "4. **坐标**：多源候选；≥40m 需人工选点，不可静默平均。",
            "5. **PSLB Up/Down**：仅官方覆盖。",
            "",
            "## 边界",
            "",
            "- 站名归一是启发式，可能 residual alias 噪声。",
            "- 未纳入 Bus Clock GPS 轨迹。",
            "- 第三方研究副本无开放再分发许可。",
            "",
        ]
    )
    OUT_MD.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    official = load_official()
    app_routes, app_stops, app_adj = load_app()
    anson_routes, anson_stops, code_name = load_anson()
    flip_routes, flip_stops = load_flippy()

    schedule_conflicts, schedule_ok = compare_schedule(official, app_routes, anson_routes)
    stop_conflicts, stop_ok = compare_stop_sequences(
        official, app_routes, anson_routes, flip_routes
    )
    coord_conflicts, coord_ok = compare_coords(app_stops, anson_stops, code_name, flip_stops)
    tt_conflicts, tt_ok = compare_travel_times(
        app_routes, app_adj, app_stops, anson_routes, code_name
    )
    coverage = build_coverage(official, app_routes, anson_routes, flip_routes)

    report = {
        "generatedAt": "2026-08-11",
        "baseline": "official cuhk-public-data merged.snapshot",
        "sources": {
            "official": {"routes": len(official), "ids": sorted(official.keys())},
            "cu_bus_app_v1_18": {"routes": len(app_routes), "stops": len(app_stops)},
            "anson_cubus_2024_10": {"routes": len(anson_routes), "gps": len(anson_stops)},
            "flippy_2023_02": {
                "routes": len(flip_routes),
                "stops": len(flip_stops),
                "info_day": sum(1 for route in flip_routes.values() if route["is_info_day"]),
            },
        },
        "coverage": coverage,
        "schedule": {
            "matches_or_expected_subsets": len(schedule_ok),
            "conflicts": schedule_conflicts,
            "conflict_count": len(schedule_conflicts),
        },
        "stop_sequence": {
            "ok_or_minor": len(stop_ok),
            "conflicts": stop_conflicts,
            "conflict_count": len(stop_conflicts),
        },
        "coordinates": {
            "aligned_pairs": len(coord_ok),
            "conflicts_ge_40m": coord_conflicts,
            "conflict_count": len(coord_conflicts),
        },
        "travel_time_app_vs_anson": {
            "aligned_routes": len(tt_ok),
            "routes_with_leg_diff_ge_30s": tt_conflicts,
            "conflict_route_count": len(tt_conflicts),
        },
        "notes": [
            "Official is authority for origin departure bands.",
            "App/Anson intermediate arrival times are derived, not official stop times.",
            "Flippy has no timetable fields; stop sequence + coords only; includes Info Day A/B/C/D1/D2.",
            "Official Up/Down are PSLB meet-class routes; absent from CU Bus App and Anson CUBus.",
            "Name normalization is heuristic; residual only_* may be alias mismatches.",
        ],
    }
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_markdown(report)

    print("schedule_conflicts", len(schedule_conflicts))
    for item in schedule_conflicts:
        print(" SCHED", item["family"], item["source"], item["id"], item.get("issues"))
    print("stop_conflicts", len(stop_conflicts))
    for item in stop_conflicts[:40]:
        print(
            " STOP",
            item["family"],
            item["source"],
            item.get("id"),
            item.get("score"),
            item.get("issues"),
        )
    print("coord_conflicts", len(coord_conflicts))
    for item in sorted(coord_conflicts, key=lambda row: -row["max_distance_m"])[:25]:
        print(" COORD", item["name"], item["max_distance_m"])
    print("tt_conflicts", len(tt_conflicts))
    for item in tt_conflicts:
        print(" TT", item["family"], len(item["big_diffs"]), item["big_diffs"][:2])
    print("wrote", OUT_JSON, OUT_MD)


if __name__ == "__main__":
    main()
