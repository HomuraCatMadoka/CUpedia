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

    def test_unique_normalized_name_creates_professor_identity(self):
        payload = subject.build_payload(
            self.directory(),
            professors=[{"id": "prof-1", "name": "Ada LOVELACE"}],
        )

        self.assertEqual(
            payload["professor_links"],
            [{
                "professor_id": "prof-1",
                "person_id": "pure:9cc21ee7-0fb4-43c8-a250-8e62ac6b86f2",
                "match_method": "automatic",
                "source_url": "https://example.test/ada/",
            }],
        )

    def test_ambiguous_normalized_name_is_not_linked(self):
        directory = self.directory()
        directory["people"].append({
            "externalId": "2cb2c1ef-7772-47c2-8125-6e0739f537b1",
            "name": "Professor Ada LOVELACE",
            "profileUrl": "https://example.test/other-ada/",
            "affiliations": [],
        })

        with self.assertRaisesRegex(ValueError, "no automatic identity links"):
            subject.build_payload(
                directory,
                professors=[{"id": "prof-1", "name": "Dr Ada LOVELACE"}],
            )

    def test_directory_identity_sql_updates_automatic_and_preserves_manual(self):
        payload = subject.build_payload(
            self.directory(),
            professors=[{"id": "prof-1", "name": "LOVELACE Ada"}],
        )
        sql = subject.render_sql(payload)

        self.assertNotIn("delete from professor_staff_identities", sql)
        self.assertIn("payload->'professor_links'", sql)
        self.assertIn("on conflict (professor_id) do update", sql)
        self.assertIn(
            "where professor_staff_identities.match_method = 'automatic'", sql
        )
        self.assertNotIn("where match_method = 'manual_override'", sql)

    def test_identity_sql_is_omitted_without_professor_snapshot(self):
        sql = subject.render_sql(subject.build_payload(self.directory()))
        self.assertNotIn("delete from professor_staff_identities", sql)
        self.assertNotIn("payload->'professor_links'", sql)

    def test_standalone_identity_sql_is_transactional(self):
        payload = subject.build_payload(
            self.directory(),
            professors=[{"id": "prof-1", "name": "Ada LOVELACE"}],
        )
        sql = subject.render_professor_identity_backfill_sql(
            payload["professor_links"]
        )

        self.assertIn("begin;", sql)
        self.assertIn("commit;", sql)
        self.assertIn("where match_method = 'automatic'", sql)
        self.assertIn("on conflict (professor_id) do nothing", sql)


if __name__ == "__main__":
    unittest.main()
