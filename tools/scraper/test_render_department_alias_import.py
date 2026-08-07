import unittest

import render_department_alias_import as subject


class RenderDepartmentAliasImportTest(unittest.TestCase):
    def test_keeps_only_deterministic_alias_matches(self):
        report = {
            "observedAt": "2026-08-06T00:00:00Z",
            "scope": {"full": True},
            "records": [
                {
                    "matchedBy": "organisation_alias",
                    "personId": "pure:ada",
                    "source": "cuhk_department:math",
                    "sourceKey": "https://math.example/ada",
                    "profileUrl": "https://math.example/ada",
                    "profileStatus": "verified",
                    "profileVerifiedAt": "2026-08-06T00:01:00Z",
                    "imageUrl": None,
                    "title": "Professor",
                    "appointmentKind": "regular",
                    "sourceUrl": "https://math.example/people",
                },
                {"matchedBy": "email"},
            ],
        }
        payload = subject.build_payload(report)
        self.assertEqual(len(payload["person_sources"]), 1)
        sql = subject.render_sql(payload)
        self.assertIn("insert into staff_person_sources", sql)
        self.assertIn("greatest(staff_person_sources.last_seen_at", sql)
        self.assertNotIn("update staff_person_sources existing\nset missing_runs", sql)

    def test_rejects_partial_scan(self):
        with self.assertRaisesRegex(ValueError, "full source"):
            subject.build_payload({"scope": {"full": False}})


if __name__ == "__main__":
    unittest.main()
