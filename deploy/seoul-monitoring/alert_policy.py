"""Pure #939 alert decisions. Persistence and notification belong to the caller."""

from datetime import datetime, time, timedelta
from typing import NamedTuple
from zoneinfo import ZoneInfo


HONG_KONG = ZoneInfo("Asia/Hong_Kong")
START_GRACE = timedelta(minutes=10)
COMPLETION_GRACE = timedelta(minutes=5)
MENU_OBSERVATION_GRACE = timedelta(minutes=2)
MENU_HOURS = (8, 11, 17)
FAILURE_RESULTS = {
    "failed", "exit-code", "signal", "core-dump", "timeout", "watchdog",
    "resources", "protocol", "start-limit-hit", "oom-kill", "dependency",
}


class BackupSchedule(NamedTuple):
    label: str
    due: time
    max_runtime: timedelta
    unit: str


BACKUPS = {
    "r2": BackupSchedule("R2", time(3, 20), timedelta(minutes=40), "cupedia-r2-backup"),
    "postgres": BackupSchedule(
        "PostgreSQL", time(4, 10), timedelta(minutes=45), "cupedia-postgres-backup"
    ),
}


def _hkt(now):
    if not isinstance(now, datetime) or now.utcoffset() is None:
        raise ValueError("now must be a timezone-aware datetime")
    return now.astimezone(HONG_KONG)


def _evidence_time(value, now):
    if not isinstance(value, str):
        return None
    try:
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, OverflowError):
        return None
    if value.utcoffset() is None or value > now:
        return None
    return value.astimezone(HONG_KONG)


def _latest_slot(now, due):
    slot = datetime.combine(now.date(), due, HONG_KONG)
    if slot > now:
        slot -= timedelta(days=1)
    return slot


def _time_text(value):
    return value.strftime("%m-%d %H:%M 香港时间")


def _incident(level, summary, details, first_check):
    return {"level": level, "summary": summary, "details": details, "firstCheck": first_check}


def _backup_condition(schedule, evidence, now):
    due = _latest_slot(now, schedule.due)
    completion_budget = schedule.max_runtime + COMPLETION_GRACE
    # Calculating the last *expired* slot separately keeps yesterday's missed
    # backup visible when today's slot opens but its grace hasn't expired.
    expired_slot = _latest_slot(now - completion_budget, schedule.due)
    attempt = _evidence_time(evidence.get("attemptAt"), now)
    success = _evidence_time(evidence.get("successAt"), now)
    service_state = evidence.get("serviceActive")
    service_running = service_state is True or service_state in ("active", "activating", "running")
    timer_state = evidence.get("timerActive")
    timer_inactive = timer_state is False or timer_state in ("inactive", "failed", "deactivating")
    result = evidence.get("result")
    current_attempt = attempt is not None and attempt >= due
    result_not_superseded = attempt is not None and (success is None or success < attempt)
    run_check = f"在首尔查看 {schedule.unit}.service 最近一次运行的状态和日志。"

    if (current_attempt and result_not_superseded
            and isinstance(result, str) and result in FAILURE_RESULTS and not service_running):
        return _incident(
            "critical", f"{schedule.label} 备份失败",
            f"最近一次备份于 {_time_text(attempt)} 开始，随后以失败结束。",
            run_check,
        )

    missing_expired_copy = success is None or success < expired_slot
    # A genuine active catch-up can finish after the regular deadline. It
    # receives at most its own runtime budget. A stale running flag cannot
    # extend a deadline without an attempt timestamp.
    catch_up_running = (
        service_running and attempt is not None and attempt >= expired_slot
        and now < attempt + schedule.max_runtime
    )
    if missing_expired_copy and not catch_up_running:
        deadline = expired_slot + completion_budget
        last_success = _time_text(success) if success else "暂无有效记录"
        return _incident(
            "critical", f"{schedule.label} 备份已过期",
            f"截至 {_time_text(deadline)} 仍缺少本轮有效副本。最近一次有效备份为 {last_success}。",
            "核对 latest 指向的备份清单，再查看最近一次备份运行。",
        )

    if timer_inactive:
        return _incident(
            "warning", f"{schedule.label} 备份计时器未运行",
            f"首尔的 {schedule.unit}.timer 当前未激活。",
            f"在首尔查看 {schedule.unit}.timer 的状态和下一次启动时间。",
        )

    if now >= due + START_GRACE and not current_attempt and (success is None or success < due):
        return _incident(
            "warning", f"{schedule.label} 备份尚未启动",
            f"计划在 {_time_text(due)} 运行，等待 10 分钟后仍没有本轮启动记录。",
            f"在首尔查看 {schedule.unit}.timer 的最近触发时间。",
        )
    return None


def backup_conditions(backups, now):
    """Return one current condition or None per scheduled backup."""
    current = _hkt(now)
    return {
        f"backup:{name}": _backup_condition(schedule, backups.get(name) or {}, current)
        for name, schedule in BACKUPS.items()
    }


def latest_menu_window(now):
    """Return the latest observable (meal start, business cutoff) in HKT."""
    current = _hkt(now)
    for day in (current.date(), current.date() - timedelta(days=1)):
        for hour in reversed(MENU_HOURS):
            cutoff = datetime.combine(day, time(hour, 55), HONG_KONG)
            if current >= cutoff + MENU_OBSERVATION_GRACE:
                return cutoff.replace(minute=17), cutoff
    raise RuntimeError("No meal window found")
