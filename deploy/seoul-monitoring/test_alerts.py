from datetime import datetime, timedelta
import unittest

from alerts import HK, acknowledge, initial_state, queue_incident, site_conditions, simulate


class AlertDeliveryStateTest(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 26, 12, 15, tzinfo=HK)
        self.state = initial_state()
        self.healthy = {name: {"ok": True, "statusCode": 200} for name in ("home", "course", "wiki")}
        self.failed = {**self.healthy, "home": {"ok": False, "statusCode": 503}}

    def test_two_failed_rounds_then_one_alert_until_recovery(self):
        site_conditions(self.state, self.failed, self.now)
        self.assertEqual(self.state["pending"], [])
        site_conditions(self.state, self.failed, self.now + timedelta(minutes=15))
        event = self.state["pending"][0]
        self.assertIn("503", event["body"])
        acknowledge(self.state, event["id"], "123456789abcdef0")
        site_conditions(self.state, self.failed, self.now + timedelta(minutes=30))
        self.assertEqual(self.state["pending"], [])
        site_conditions(self.state, self.healthy, self.now + timedelta(minutes=45))
        site_conditions(self.state, self.failed, self.now + timedelta(minutes=60))
        site_conditions(self.state, self.failed, self.now + timedelta(minutes=75))
        self.assertEqual(len(self.state["pending"]), 1)
        self.assertNotEqual(self.state["pending"][0]["id"], event["id"])

    def test_sleep_gap_does_not_make_one_current_failure_look_sustained(self):
        site_conditions(self.state, self.failed, self.now)
        site_conditions(self.state, self.failed, self.now + timedelta(hours=8))
        self.assertEqual(self.state["pending"], [])

    def test_single_simulation_and_delivery_receipt(self):
        simulate(self.state, self.now)
        simulate(self.state, self.now + timedelta(minutes=15))
        self.assertEqual(len(self.state["pending"]), 1)
        event = self.state["pending"][0]
        self.assertIn("CUpedia 演练", event["subject"])
        self.assertIn("这是模拟故障", event["body"])
        with self.assertRaises(ValueError):
            acknowledge(self.state, event["id"], "")
        acknowledge(self.state, event["id"], "123456789abcdef0")
        self.assertEqual(self.state["pending"], [])
        self.assertEqual(self.state["lastReceipt"]["alertId"], event["id"])

    def test_active_incident_only_sends_again_on_escalation(self):
        value = {
            "level": "warning", "summary": "a", "details": "b", "firstCheck": "c",
        }
        queue_incident(self.state, "backup:r2", value, self.now)
        queue_incident(self.state, "backup:r2", value, self.now)
        queue_incident(self.state, "backup:r2", {**value, "level": "critical"}, self.now)
        self.assertEqual(len(self.state["pending"]), 2)


if __name__ == "__main__":
    unittest.main()
