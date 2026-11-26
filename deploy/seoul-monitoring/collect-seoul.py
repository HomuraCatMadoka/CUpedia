#!/usr/bin/env python3
"""Emit a bounded operations snapshot on the existing Seoul SSH connection."""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys


VAULT = Path("/srv/cupedia-backups")
ROOT_UID = 0
SYSTEMCTL = "/usr/bin/systemctl"
DOCKER = "/usr/bin/docker"
APP_CONTAINER = "cupedia-prod-app-1"
GENERATION = r"\d{8}T\d{6}Z"
HKT_TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+08:00")
MEALS = {8: "breakfast", 11: "lunch", 17: "dinner"}
UNIT_ACTIVE = {"active", "activating", "reloading", "refreshing"}
UNIT_INACTIVE = {"inactive", "failed", "deactivating", "maintenance"}
UNIT_FAILURES = {
    "exit-code", "signal", "core-dump", "timeout", "watchdog",
    "start-limit-hit", "resources", "oom-kill", "protocol", "exec-condition",
}
MENU_SQL = """\
SELECT count(DISTINCT snapshot.menu_source_id)::int AS accepted
FROM public.canteen_menu_sync_runs AS run
JOIN public.canteen_menu_sync_snapshots AS snapshot ON snapshot.run_id = run.id
WHERE run.status IN ('applied', 'unchanged')
  AND run.started_at >= $1::timestamptz
  AND run.started_at < $2::timestamptz
  AND snapshot.sync_window_key = $3
  AND snapshot.observed_at >= $1::timestamptz
  AND snapshot.observed_at < $2::timestamptz
"""
MENU_QUERY = """\
const { Client } = require('pg');
async function readMeal() {
  if (!process.env.DATABASE_URL) {
    process.exitCode = 1;
    return;
  }
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 6000,
    query_timeout: 7500,
    statement_timeout: 5000,
    lock_timeout: 2000,
  });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const { rows } = await client.query(
      """ + json.dumps(MENU_SQL) + """,
      process.argv.slice(2),
    );
    await client.query('ROLLBACK');
    if (rows.length !== 1 || !Number.isInteger(rows[0].accepted)) {
      process.exitCode = 1;
      return;
    }
    console.log(rows[0].accepted);
  } finally {
    await client.end();
  }
}
readMeal().catch(() => { process.exitCode = 1; });
"""


def read_command(command, *, sql=None, timeout=4):
    try:
        done = subprocess.run(
            command, input=sql, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            encoding="utf-8", errors="strict", check=False, timeout=timeout,
        )
    except (OSError, UnicodeError, subprocess.TimeoutExpired):
        return None
    return done.stdout if done.returncode == 0 and len(done.stdout) <= 4096 else None


def is_private_directory(path):
    try:
        metadata = path.lstat()
    except OSError:
        return False
    return (
        stat.S_ISDIR(metadata.st_mode) and metadata.st_uid == ROOT_UID
        and not metadata.st_mode & 0o077
    )


def private_json(path):
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as stream:
            meta = os.fstat(stream.fileno())
            if (
                not stat.S_ISREG(meta.st_mode) or meta.st_uid != ROOT_UID
                or meta.st_mode & 0o077 or meta.st_size > 16384
            ):
                return {}
            data = stream.read(16385)
        if len(data) > 16384:
            return {}
        value = json.loads(data)
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def normalized_time(value):
    if not isinstance(value, str) or len(value) > 40:
        return None
    try:
        timestamp = datetime.fromisoformat(value)
        if timestamp.utcoffset() is not None:
            return timestamp.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    except (ValueError, OverflowError):
        pass
    return None


def systemd_unit(unit):
    text = read_command([
        SYSTEMCTL, "show", "--no-pager", "--property=LoadState,ActiveState,Result",
        unit,
    ])
    fields = dict(line.split("=", 1) for line in (text or "").splitlines() if "=" in line)
    return fields if fields.get("LoadState") == "loaded" else {}


def active(unit):
    state = unit.get("ActiveState")
    if state in UNIT_ACTIVE:
        return True
    if state in UNIT_INACTIVE:
        return False
    return None


def latest_success(root, name):
    """Trust only the expected root-owned link and its specific success manifest."""
    link = root / "latest"
    try:
        meta = link.lstat()
        if not stat.S_ISLNK(meta.st_mode) or meta.st_uid != ROOT_UID:
            return None
        link_target = os.readlink(link)
    except OSError:
        return None
    layout = GENERATION if name == "r2" else f"runs/{GENERATION}"
    if not re.fullmatch(layout, link_target):
        return None
    directory = root / link_target
    if name == "postgres" and not is_private_directory(directory.parent):
        return None
    if not is_private_directory(directory):
        return None

    manifest = private_json(directory / "manifest.json")
    if manifest.get("version") != 1:
        return None
    if name == "postgres":
        if manifest.get("status") != "complete" or manifest.get("generation") != directory.name:
            return None
        end = normalized_time(manifest.get("completedAt"))
    else:
        end = normalized_time(manifest.get("finishedAt"))
    start = normalized_time(manifest.get("startedAt"))
    return end if start and end and end >= start else None


def collect_backup(name):
    root = VAULT / f"{name}-daily"
    marker = {}
    success = None
    if is_private_directory(VAULT) and is_private_directory(root):
        marker = private_json(root / "status.json")
        success = latest_success(root, name)

    if name == "r2":
        attempt = normalized_time(marker.get("at"))
        state = marker.get("state")
    else:
        attempt = normalized_time(marker.get("lastAttemptAt"))
        state = marker.get("status")

    service = systemd_unit(f"cupedia-{name}-backup.service")
    timer = systemd_unit(f"cupedia-{name}-backup.timer")
    service_result = service.get("Result")
    if active(service) is True or state == "running":
        result = "running"
    elif service_result in UNIT_FAILURES or state in ("failed", "failure"):
        result = "failed"
    elif attempt and state == "success":
        result = "success"
    else:
        result = None

    return {
        "attemptAt": attempt, "successAt": success, "result": result,
        "serviceActive": active(service), "timerActive": active(timer),
    }


def meal_window(bounds):
    if len(bounds) != 2 or not all(HKT_TIMESTAMP.fullmatch(value) for value in bounds):
        return None
    try:
        start, end = map(datetime.fromisoformat, bounds)
    except ValueError:
        return None
    meal = MEALS.get(start.hour)
    if (
        meal is None or start.minute != 17 or start.date() != end.date()
        or start.hour != end.hour or not 18 <= end.minute <= 55
    ):
        return None
    return f"{start.date():%Y-%m-%d}/{meal}"


def collect_canteen(bounds):
    key = meal_window(bounds)
    if key is None:
        return None

    output = read_command([
        DOCKER, "exec", "--interactive", "--user", "node", "--workdir", "/app",
        APP_CONTAINER, "node", "-", *bounds, key,
    ], sql=MENU_QUERY, timeout=18)
    count = output.strip() if output is not None else ""
    if not re.fullmatch(r"[0-9]{1,6}", count):
        return {"windowKey": key, "acceptedSources": None, "status": None}
    accepted = int(count)
    return {
        "windowKey": key, "acceptedSources": accepted,
        "status": "accepted" if accepted else "none",
    }


def main():
    if os.geteuid() != 0:
        print(json.dumps({"backups": {name: dict.fromkeys((
            "attemptAt", "successAt", "result", "serviceActive", "timerActive",
        )) for name in ("r2", "postgres")}, "canteen": None}, separators=(",", ":")))
        return 1
    print(json.dumps({
        "backups": {name: collect_backup(name) for name in ("r2", "postgres")},
        "canteen": collect_canteen(sys.argv[1:]),
    }, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
