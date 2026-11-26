#!/usr/bin/env python3
"""Check CUpedia independently of Seoul and queue deduplicated operator alerts."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import tempfile
import uuid
from zoneinfo import ZoneInfo

from alert_policy import backup_conditions, latest_menu_window
from public_checks import check_sites

HK = ZoneInfo("Asia/Hong_Kong")
DEFAULT_STATE = Path.home() / ".config/cupedia/ops-alerts/state"
COLLECTOR = Path(__file__).with_name("collect-seoul.py")
SITE_NAMES = {"home": "首页", "course": "课程 PHYS1111", "wiki": "Wiki 体育"}
KEEP_OBSERVATION_FOR = timedelta(minutes=55)
MENU_RECOVERY_LIMIT = timedelta(minutes=90)
SEVERITY = {"warning": 1, "critical": 2}
DELIVERY_ID = re.compile(r"[A-Za-z0-9_-]{8,200}")
ALERT_ID = re.compile(r"[a-f0-9]{32}")


def initial_state():
    return {"version": 1, "streaks": {}, "episodes": {}, "pending": [], "menu": None}


def state_path(directory):
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError("The alerts state directory must be private and owned by the operator.")
    return directory / "state.json"


@contextmanager
def locked_state(directory):
    path = state_path(directory)
    lock = os.open(directory / "state.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock, "rb") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        if path.is_symlink():
            raise ValueError("Refusing a symbolic link for alerts state.")
        state = json.loads(path.read_text()) if path.exists() else initial_state()
        if state.get("version") != 1:
            raise ValueError("Unsupported alerts state version.")
        yield state
        with tempfile.NamedTemporaryFile(mode="w", dir=directory, prefix=".state-", delete=False) as f:
            temporary = Path(f.name)
            try:
                json.dump(state, f, ensure_ascii=False)
                f.write("\n")
                f.flush()
                os.fsync(f.fileno())
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)


def consecutive(state, key, failed, now):
    counters = state["streaks"]
    if not failed:
        counters.pop(key, None)
        return 0
    prior = counters.get(key)
    count = 1
    if prior:
        gap = now - datetime.fromisoformat(prior["at"])
        if timedelta(0) < gap <= KEEP_OBSERVATION_FOR:
            count = min(prior["count"] + 1, 2)
    counters[key] = {"count": count, "at": now.isoformat()}
    return count


def condition(level, summary, details, first_check):
    return {"level": level, "summary": summary, "details": details, "firstCheck": first_check}


def queue_incident(state, key, value, now, *, simulation=False):
    episodes = state["episodes"]
    if value is None:
        episodes.pop(key, None)
        return
    previous = episodes.get(key)
    level = value["level"]
    if previous and SEVERITY[level] <= SEVERITY[previous]:
        return
    episodes[key] = level
    alert_id = uuid.uuid4().hex
    prefix = "演练" if simulation else ("严重告警" if level == "critical" else "预警")
    observed = now.astimezone(HK).strftime("%Y-%m-%d %H:%M 香港时间")
    body = "\n".join([
        value["summary"],
        f"检查时间 {observed}",
        value["details"],
        f"第一步 {value['firstCheck']}",
        "负责人 CUpedia 维护者（当前告警收件人）",
        f"告警编号 {alert_id}",
    ])
    if simulation:
        body = "这是模拟故障，生产服务、数据库和定时任务均未被改动。\n\n" + body
    state["pending"].append({
        "id": alert_id,
        "subject": f"【CUpedia {prefix}】{value['summary']} [{alert_id}]",
        "body": body,
    })


def site_conditions(state, results, now, *, simulation=False):
    failures = []
    for key, name in SITE_NAMES.items():
        result = results[key]
        if consecutive(state, f"site:{key}", not result["ok"], now) < 2:
            continue
        status = result.get("statusCode")
        label = f"HTTP {status}" if isinstance(status, int) and status != 200 else (
            "返回 200 但正文不符" if status == 200 else "未收到有效 HTTPS 响应"
        )
        failures.append(f"{name}（{label}）")
    if failures:
        queue_incident(state, "website", condition(
            "critical", "网站访问连续失败", "两轮探测都未通过。" + "、".join(failures),
            "从另一个网络访问 cupedia.org，然后查看首尔监控面板和 Nginx 日志。",
        ), now, simulation=simulation)
    elif all(result["ok"] for result in results.values()):
        queue_incident(state, "website", None, now)


def collect_seoul(window):
    command = ["sudo", "-n", "/usr/bin/python3", "-I", "-"]
    if window:
        command.extend(item.isoformat(timespec="seconds") for item in window)
    try:
        result = subprocess.run(
            ["/usr/bin/ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
             "-o", "ConnectTimeout=8", "cupedia", shlex.join(command)],
            input=COLLECTOR.read_bytes(), capture_output=True, timeout=45,
        )
        if result.returncode:
            return None
        parsed = json.loads(result.stdout)
        return parsed if isinstance(parsed.get("backups"), dict) else None
    except (OSError, ValueError, AttributeError, subprocess.TimeoutExpired):
        return None


def choose_menu_probe(state, now):
    start, cutoff = latest_menu_window(now)
    key = start.isoformat(timespec="seconds")
    recent = state["menu"]
    if not recent or recent["window"] != key:
        return key, (start, cutoff)
    if recent["status"] != "ok" and now <= cutoff + MENU_RECOVERY_LIMIT:
        return key, (start, cutoff)
    return key, None


def check_menu(state, payload, key, window, now):
    if not window:
        return
    value = payload.get("canteen")
    accepted = value.get("acceptedSources") if isinstance(value, dict) else None
    if type(accepted) is not int or accepted < 0:
        state["menu"] = {"window": key, "status": "unavailable"}
        if consecutive(state, "menu:unavailable", True, now) >= 2:
            queue_incident(state, "menu:unavailable", condition(
                "warning", "食堂同步结果暂时无法核对", "连续两轮无法读取已结束餐次的入库结果。",
                "查看食堂菜单同步的调度验收手册和正式站日志，核对结果读取路径。",
            ), now)
        return

    consecutive(state, "menu:unavailable", False, now)
    queue_incident(state, "menu:unavailable", None, now)
    if accepted > 0:
        state["menu"] = {"window": key, "status": "ok"}
        queue_incident(state, "menu:missed", None, now)
        return

    start, cutoff = window
    state["menu"] = {"window": key, "status": "missed"}
    previous = state.get("menuAlertWindow")
    if previous != key:
        queue_incident(state, "menu:missed", None, now)
        state["menuAlertWindow"] = key
    queue_incident(state, "menu:missed", condition(
        "critical", "食堂菜单同步可能漏跑",
        f"香港时间 {start:%m-%d %H:%M} 至 {cutoff:%H:%M} 的窗口内未找到已接受的菜单快照。",
        "先查看该餐次的 Supabase 与 GitHub 兜底记录，并核对菜单是否已入库。",
    ), now)


def check(state, now):
    key, window = choose_menu_probe(state, now)
    with ThreadPoolExecutor(max_workers=2) as executor:
        site_job = executor.submit(check_sites)
        host_job = executor.submit(collect_seoul, window)
        sites = site_job.result()
        host = host_job.result()
    site_conditions(state, sites, now)
    failures = consecutive(state, "host:unavailable", host is None, now)
    if failures == 2:
        queue_incident(state, "host:unavailable", condition(
            "warning", "首尔任务与备份状态无法核对",
            "连续两轮没有读取到首尔主机的只读状态。网页检查仍独立运行。",
            "在监控 Mac 上检查 ssh cupedia，再核对首尔的备份计时器和最新成功副本。",
        ), now)
    if host is not None:
        queue_incident(state, "host:unavailable", None, now)
        for alert_key, problem in backup_conditions(host["backups"], now).items():
            backup_name = alert_key.split(":", 1)[1]
            current = host["backups"].get(backup_name) or {}
            if problem is None and current.get("serviceActive") is True:
                # An in-flight catch-up is not confirmation that a stale copy recovered.
                continue
            queue_incident(state, alert_key, problem, now)
        check_menu(state, host, key, window, now)
    return {
        "sites": sites, "seoulStatusReadable": host is not None,
        "backups": host.get("backups") if host else None,
        "menu": state["menu"],
    }


def simulate(state, now):
    if state["pending"]:
        return
    state["streaks"].clear()
    state["episodes"].clear()
    fake = {key: {"ok": key != "home", "statusCode": 503 if key == "home" else 200}
            for key in SITE_NAMES}
    site_conditions(state, fake, now - timedelta(minutes=15), simulation=True)
    site_conditions(state, fake, now, simulation=True)


def acknowledge(state, event_id, receipt):
    if not ALERT_ID.fullmatch(event_id) or not DELIVERY_ID.fullmatch(receipt):
        raise ValueError("Invalid alert or delivery identifier.")
    pending = state["pending"]
    matched = [item for item in pending if item["id"] == event_id]
    if not matched:
        if state.get("lastReceipt", {}).get("alertId") == event_id:
            return
        raise ValueError("No matching pending alert.")
    state["lastReceipt"] = {"alertId": event_id, "deliveryId": receipt}
    state["pending"] = [item for item in pending if item["id"] != event_id]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-dir", type=Path, default=DEFAULT_STATE)
    modes = parser.add_subparsers(dest="mode", required=True)
    modes.add_parser("check")
    modes.add_parser("simulate")
    ack = modes.add_parser("ack")
    ack.add_argument("alert_id")
    ack.add_argument("delivery_id")
    ack.add_argument("--simulation", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    now = datetime.now(HK)
    simulation = args.mode == "simulate" or getattr(args, "simulation", False)
    directory = args.state_dir / "simulation" if simulation else args.state_dir
    with locked_state(directory) as state:
        observation = None
        if args.mode == "check":
            observation = check(state, now)
        elif args.mode == "simulate":
            simulate(state, now)
        else:
            acknowledge(state, args.alert_id, args.delivery_id)
        response = {"checkedAt": now.isoformat(), "simulation": simulation,
                    "pending": state["pending"][:10], "observation": observation}
    print(json.dumps(response, ensure_ascii=False))


if __name__ == "__main__":
    main()
