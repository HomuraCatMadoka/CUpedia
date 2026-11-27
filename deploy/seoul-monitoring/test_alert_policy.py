from datetime import datetime, timezone
import unittest

from alert_policy import HONG_KONG, backup_conditions, latest_menu_window


def hk(day, hour, minute, second=0):
    return datetime(2026, 11, day, hour, minute, second, tzinfo=HONG_KONG)


def at(day, hour, minute, second=0):
    return hk(day, hour, minute, second).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def evidence(success=None, attempt=None, **changes):
    values = {"attemptAt": attempt, "successAt": success, "result": "success",
              "timerActive": True, "serviceActive": "inactive"}
    values.update(changes)
    return values


def condition(name, data, now):
    return backup_conditions({name: data}, now)["backup:" + name]


class BackupConditions(unittest.TestCase):
    def test_each_backup_tracks_the_actual_slot_and_deadline(self):
        schedules = [
            ("r2", at(25, 3, 21), hk(26, 3, 29, 59), hk(26, 3, 30), hk(26, 4, 5)),
            ("postgres", at(25, 4, 11), hk(26, 4, 19, 59), hk(26, 4, 20), hk(26, 5, 0)),
        ]
        for name, success, before_warning, warning, critical in schedules:
            with self.subTest(name=name):
                self.assertIsNone(condition(name, evidence(success), before_warning))
                start_late = condition(name, evidence(success), warning)
                self.assertEqual(start_late["level"], "warning")
                self.assertIn("尚未启动", start_late["summary"])
                overdue = condition(name, evidence(success), critical)
                self.assertEqual(overdue["level"], "critical")
                self.assertIn("已过期", overdue["summary"])
                self.assertEqual(set(overdue), {"level", "summary", "details", "firstCheck"})

    def test_current_terminal_failure_triggers_before_deadline(self):
        evidence_failed = evidence(at(25, 3, 21), at(26, 3, 21), result="exit-code")
        verdict = condition("r2", evidence_failed, hk(26, 3, 22))
        self.assertEqual(verdict["level"], "critical")
        self.assertIn("备份失败", verdict["summary"])
        # That same failure is superseded by a newer verified success.
        evidence_failed["successAt"] = at(26, 3, 22)
        self.assertIsNone(condition("r2", evidence_failed, hk(26, 3, 23)))

    def test_failure_before_current_slot_does_not_count_as_current_failure(self):
        early_manual = evidence(at(25, 3, 21), at(26, 3, 15), result="failed")
        self.assertIsNone(condition("r2", early_manual, hk(26, 3, 21)))
        self.assertIn("尚未启动", condition("r2", early_manual, hk(26, 3, 30))["summary"])

    def test_stale_incident_is_not_erased_when_the_next_day_slot_opens(self):
        historical = evidence(at(24, 4, 11))
        for when in (hk(26, 4, 9), hk(26, 4, 10), hk(26, 4, 30)):
            with self.subTest(when=when):
                verdict = condition("postgres", historical, when)
                self.assertEqual(verdict["level"], "critical")
                self.assertIn("11-25 05:00", verdict["details"])

    def test_catchup_only_suppresses_for_current_active_bounded_attempt(self):
        catchup = evidence(at(25, 3, 21), at(26, 4, 2), serviceActive="activating")
        self.assertIsNone(condition("r2", catchup, hk(26, 4, 41, 59)))
        self.assertEqual(condition("r2", catchup, hk(26, 4, 42))["level"], "critical")
        self.assertEqual(condition("r2", dict(catchup, serviceActive=False), hk(26, 4, 5))["level"], "critical")
        self.assertEqual(condition("r2", dict(catchup, attemptAt=None), hk(26, 4, 5))["level"], "critical")

    def test_postgres_catchup_has_its_own_45_minute_runtime(self):
        catchup = evidence(at(25, 4, 11), at(26, 4, 30), serviceActive=True)
        self.assertIsNone(condition("postgres", catchup, hk(26, 5, 14, 59)))
        self.assertEqual(condition("postgres", catchup, hk(26, 5, 15))["level"], "critical")

    def test_timer_explicitly_inactive_warns_with_fresh_success(self):
        fresh = evidence(at(26, 3, 21), at(26, 3, 20), timerActive="inactive")
        verdict = condition("r2", fresh, hk(26, 3, 25))
        self.assertEqual(verdict["level"], "warning")
        self.assertIn("计时器", verdict["summary"])

    def test_unusable_or_future_times_cannot_clear_freshness(self):
        invalid = evidence(at(26, 4, 30), "not-a-time", serviceActive=True)
        self.assertEqual(condition("r2", invalid, hk(26, 4, 5))["level"], "critical")
        unzoned = evidence("2026-11-26T03:21:00")
        self.assertEqual(condition("r2", unzoned, hk(26, 4, 5))["level"], "critical")

    def test_uses_hkt_from_utc_and_emits_both_stable_keys(self):
        checks = backup_conditions(
            {"r2": evidence(at(26, 3, 21)), "postgres": evidence(at(26, 4, 11))},
            hk(26, 5, 5).astimezone(timezone.utc),
        )
        self.assertEqual(checks, {"backup:r2": None, "backup:postgres": None})


class MenuWindows(unittest.TestCase):
    def test_each_cutoff_waits_two_minutes_after_the_business_window(self):
        for hour, prior_day, prior_hour in ((8, 25, 17), (11, 26, 8), (17, 26, 11)):
            with self.subTest(hour=hour):
                self.assertEqual(
                    latest_menu_window(hk(26, hour, 56, 59)),
                    (hk(prior_day, prior_hour, 17), hk(prior_day, prior_hour, 55)),
                )
                self.assertEqual(
                    latest_menu_window(hk(26, hour, 57)),
                    (hk(26, hour, 17), hk(26, hour, 55)),
                )

    def test_utc_input_rolls_back_to_prior_hkt_evening(self):
        early = hk(26, 0, 5).astimezone(timezone.utc)
        start, cutoff = latest_menu_window(early)
        self.assertEqual((start, cutoff), (hk(25, 17, 17), hk(25, 17, 55)))
        self.assertEqual(start.tzinfo, HONG_KONG)

    def test_rejects_naive_clock(self):
        with self.assertRaises(ValueError):
            latest_menu_window(datetime(2026, 11, 26, 8, 57))
        with self.assertRaises(ValueError):
            backup_conditions({}, datetime(2026, 11, 26, 8, 57))


if __name__ == "__main__":
    unittest.main()
