import unittest

import render_staff_import as subject


class RenderStaffImportTest(unittest.TestCase):
    def test_payload_keeps_dirty_name_as_alias_but_not_identity_link(self):
        report = {
            "cleaningActions": [{
                "keepProfessorId": "clean",
                "mergeProfessorIds": ["dirty"],
                "blockedByReviews": False,
            }],
            "departments": {},
        }
        for code, config in subject.resolve_staff_pilot.TARGETS.items():
            report["departments"][code] = {
                "officialDirectoryComplete": True,
                "records": [],
                "capturedOfficialStaffNotTeaching": [],
            }
        report["departments"]["BME"]["records"] = [{
            "id": "dirty",
            "name": "Professor SHAO Baihao<",
            "status": "resolved",
            "identityKey": "pure:00000000-0000-0000-0000-000000000001",
            "canonicalName": "Baihao SHAO",
            "profileUrl": "https://example.test/shao/",
            "affiliations": [{
                "organisationUrl": subject.resolve_staff_pilot.TARGETS["BME"]["departmentUrl"],
                "title": "Assistant Professor",
            }],
            "classification": "official_department",
            "targetRelationship": None,
            "evidenceUrl": None,
            "resolution": "automatic",
        }, {
            "id": "clean",
            "name": "Professor SHAO Baihao",
            "status": "resolved",
            "identityKey": "pure:00000000-0000-0000-0000-000000000001",
            "canonicalName": "Baihao SHAO",
            "profileUrl": "https://example.test/shao/",
            "affiliations": [],
            "classification": "cross_department",
            "targetRelationship": None,
            "evidenceUrl": None,
            "resolution": "automatic",
        }]

        payload = subject.build_payload(report)

        self.assertEqual([row["professor_id"] for row in payload["links"]], ["clean"])
        self.assertIn(
            "Professor SHAO Baihao<",
            [row["alias"] for row in payload["aliases"]],
        )
        self.assertEqual(payload["merges"], [{"keep_id": "clean", "merge_id": "dirty"}])

    def test_sql_is_transactional_and_refreshes_teaching_assignments(self):
        sql = subject.render_sql({
            "people": [], "departments": [], "aliases": [],
            "affiliations": [], "links": [], "merges": [],
        })
        self.assertTrue(sql.startswith("-- Generated"))
        self.assertIn("begin;", sql)
        self.assertIn("insert into staff_teaching_assignments", sql)
        self.assertIn("update course_offering_instructors", sql)
        self.assertIn("identity_kind", sql)
        self.assertIn("having count(distinct person_id) = 1", sql)
        self.assertIn("when enrollments.term = 'Summer Session' then 'Summer'", sql)
        self.assertTrue(sql.rstrip().endswith("commit;"))

    def test_payload_keeps_reviewed_external_identity_kind(self):
        report = {
            "cleaningActions": [],
            "departments": {},
        }
        for code in subject.resolve_staff_pilot.TARGETS:
            report["departments"][code] = {
                "officialDirectoryComplete": True,
                "records": [],
                "capturedOfficialStaffNotTeaching": [],
            }
        report["departments"]["SEEM"]["records"] = [{
            "id": "external-professor",
            "name": "Professor External",
            "status": "resolved",
            "identityKey": "manual:external:professor",
            "canonicalName": "External Professor",
            "profileUrl": None,
            "affiliations": [],
            "classification": "target_related",
            "targetRelationship": "external_teaching",
            "identityKind": "external",
            "evidenceUrl": "https://example.test/evidence",
            "resolution": "manual_override",
        }]

        payload = subject.build_payload(report)

        self.assertEqual(payload["people"][0]["identity_kind"], "external")


if __name__ == "__main__":
    unittest.main()
