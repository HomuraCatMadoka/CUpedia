import unittest

import render_department_profile_import as subject


class RenderDepartmentProfileImportTest(unittest.TestCase):
    def report(self):
        return {
            "observedAt": "2026-08-05T00:00:00+00:00",
            "scope": {
                "fresh": True,
                "full": True,
                "complete": True,
                "sourceConfigDigest": "current-config",
                "requestedSources": ["example"],
                "completeSources": ["example"],
            },
            "sources": [{
                "key": "example",
                "observedSourceKeys": [
                    "https://dept.cuhk.edu.hk/people/lam/",
                    "https://dept.cuhk.edu.hk/people/unmatched/",
                ],
            }],
            "records": [{
                "personId": "pure:11111111-1111-1111-1111-111111111111",
                "source": "cuhk_department:example",
                "sourceKey": "https://dept.cuhk.edu.hk/people/lam/",
                "profileUrl": "https://dept.cuhk.edu.hk/people/lam/",
                "profileStatus": "verified",
                "profileVerifiedAt": "2026-08-05T00:00:01+00:00",
                "imageUrl": "https://dept.cuhk.edu.hk/images/lam.jpg",
                "title": "Emeritus Professor",
                "appointmentKind": "emeritus",
                "sourceUrl": "https://dept.cuhk.edu.hk/people/",
            }],
        }

    def test_renders_attach_only_upsert_and_lifecycle(self):
        sql = subject.render_sql(subject.import_payload(self.report()))
        self.assertIn("insert into staff_person_sources", sql)
        self.assertNotIn("insert into staff_people", sql)
        self.assertIn("profile_verified_at", sql)
        self.assertIn("managed_sources", sql)
        self.assertIn("observed_source_keys", sql)
        self.assertIn("unknown staff person", sql)

    def test_output_can_reuse_an_outer_transaction(self):
        sql = subject.render_sql(
            subject.import_payload(self.report()), transaction=False
        )
        self.assertFalse(sql.startswith("begin;"))
        self.assertNotIn("\ncommit;", sql)
        self.assertIn("insert into staff_person_sources", sql)

    def test_unresolved_roster_keys_protect_existing_sources_from_missing(self):
        payload = subject.import_payload(self.report())
        self.assertEqual(len(payload["person_sources"]), 1)
        self.assertEqual(len(payload["observed_source_keys"]), 2)

    def test_full_snapshot_retires_removed_department_sources(self):
        sql = subject.render_sql(subject.import_payload(self.report()))
        self.assertIn("existing.source like 'cuhk_department:%'", sql)
        self.assertIn("existing.source = managed.source", sql)
        self.assertIn("is_current = false", sql)
        self.assertIn("greatest(existing.missing_runs, 2)", sql)

    def test_failed_profile_keeps_provenance_but_clears_verification(self):
        report = self.report()
        report["records"][0]["profileStatus"] = "failed"
        row = subject.import_payload(report)["person_sources"][0]
        self.assertEqual(
            row["profile_url"],
            "https://dept.cuhk.edu.hk/people/lam/",
        )
        self.assertIsNone(row["profile_verified_at"])

    def test_cached_report_is_rejected(self):
        report = self.report()
        report["scope"]["fresh"] = False
        with self.assertRaisesRegex(ValueError, "fresh crawl"):
            subject.import_payload(report)

    def test_partial_report_is_rejected(self):
        report = self.report()
        report["scope"]["full"] = False
        with self.assertRaisesRegex(ValueError, "full source crawl"):
            subject.import_payload(report)

    def test_stale_source_configuration_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "source configuration"):
            subject.import_payload(
                self.report(), expected_config_digest="new-config"
            )

    def test_current_source_configuration_is_accepted(self):
        payload = subject.import_payload(
            self.report(), expected_config_digest="current-config"
        )
        self.assertEqual(len(payload["person_sources"]), 1)

    def test_incomplete_full_report_is_rejected(self):
        report = self.report()
        report["scope"]["complete"] = False
        with self.assertRaisesRegex(ValueError, "every source"):
            subject.import_payload(report)

    def test_tampered_complete_flag_cannot_hide_missing_source(self):
        report = self.report()
        report["scope"]["requestedSources"].append("missing")
        with self.assertRaisesRegex(ValueError, "coverage is incomplete"):
            subject.import_payload(report)

    def test_complete_source_without_observed_keys_is_rejected(self):
        report = self.report()
        report["sources"][0]["observedSourceKeys"] = []
        with self.assertRaisesRegex(ValueError, "lifecycle keys"):
            subject.import_payload(report)

    def test_multiple_rows_for_one_person_and_source_are_rejected(self):
        report = self.report()
        report["records"].append({
            **report["records"][0],
            "sourceKey": "https://dept.cuhk.edu.hk/people/lam-old/",
            "profileUrl": "https://dept.cuhk.edu.hk/people/lam-old/",
        })
        with self.assertRaisesRegex(ValueError, "multiple rows"):
            subject.import_payload(report)


if __name__ == "__main__":
    unittest.main()
