import unittest

import render_staff_directory_import as subject


class RenderStaffDirectoryImportTest(unittest.TestCase):
    def directory(self):
        faculty_url = "https://example.test/faculty/"
        centre_url = "https://example.test/centre/"
        return {
            "scope": {"mode": "full"},
            "sourceFetchedAtRange": {
                "oldest": "2026-07-15T00:00:00Z",
                "newest": "2026-07-15T01:00:00Z",
            },
            "organisations": [
                {
                    "id": "faculty",
                    "name": "Faculty of Example",
                    "sourceUrl": faculty_url,
                    "organisationType": "faculty",
                    "parentUrl": None,
                    "facultyUrl": faculty_url,
                },
                {
                    "id": "centre",
                    "name": "Centre for Example",
                    "sourceUrl": centre_url,
                    "organisationType": "centre",
                    "parentUrl": faculty_url,
                    "facultyUrl": faculty_url,
                },
            ],
            "people": [
                {
                    "externalId": "9cc21ee7-0fb4-43c8-a250-8e62ac6b86f2",
                    "name": "Professor Ada LOVELACE",
                    "profileUrl": "https://example.test/ada/",
                    "affiliations": [
                        {
                            "organisation": "Centre for Example",
                            "organisationUrl": centre_url,
                            "title": "Professor",
                        },
                        {
                            "organisation": "Centre for Example",
                            "organisationUrl": centre_url,
                            "title": "Director",
                        },
                    ],
                }
            ],
        }

    def test_payload_keeps_centres_and_multiple_titles(self):
        payload = subject.build_payload(self.directory())
        self.assertEqual(len(payload["organisations"]), 2)
        self.assertEqual(len(payload["people"]), 1)
        self.assertEqual(len(payload["affiliations"]), 1)
        self.assertEqual(
            [item["title"] for item in payload["titles"]],
            ["Director", "Professor"],
        )

    def test_sql_uses_two_run_inactivation(self):
        sql = subject.render_sql(subject.build_payload(self.directory()))
        self.assertIn("missing_runs + 1 < 2", sql)
        self.assertIn("update staff_organisations", sql)
        self.assertIn("update staff_people", sql)
        self.assertIn("update course_offering_instructors", sql)
        self.assertIn("offering.match_status <> 'manual'", sql)

    def test_rejects_partial_directory(self):
        directory = self.directory()
        directory["scope"]["mode"] = "preview"
        with self.assertRaisesRegex(ValueError, "non-full"):
            subject.build_payload(directory)

    def test_reviewed_alias_reuses_official_person(self):
        payload = subject.build_payload(
            self.directory(),
            [{
                "profileUrl": "https://example.test/ada/",
                "alias": "Professor Augusta Ada KING",
                "evidenceUrl": "https://example.test/course-outline",
            }],
        )

        alias = next(
            item for item in payload["aliases"]
            if item["alias"] == "Professor Augusta Ada KING"
        )
        self.assertEqual(
            alias["person_id"],
            "pure:9cc21ee7-0fb4-43c8-a250-8e62ac6b86f2",
        )
        self.assertEqual(alias["source"], "reviewed_manual_override")
        self.assertEqual(
            alias["evidence_url"],
            "https://example.test/course-outline",
        )

    def test_sql_replaces_managed_aliases_and_reapplies_manual_evidence(self):
        sql = subject.render_sql(subject.build_payload(self.directory()))
        self.assertIn("delete from staff_aliases", sql)
        self.assertIn("source in ('cuhk_research_portal', 'reviewed_manual_override')", sql)
        self.assertIn("alias.source = 'reviewed_manual_override'", sql)
        self.assertIn("evidence_url = alias.evidence_url", sql)


if __name__ == "__main__":
    unittest.main()
