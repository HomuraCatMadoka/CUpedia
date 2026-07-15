import unittest

import resolve_staff_pilot as subject


DEPARTMENT_URL = subject.TARGETS["BME"]["departmentUrl"]


def person(name, url, department_url=DEPARTMENT_URL, external_id=None):
    return {
        "id": url,
        "externalId": external_id,
        "name": name,
        "email": None,
        "profileUrl": url,
        "affiliations": [{
            "organisation": "Department",
            "organisationUrl": department_url,
            "title": "Professor",
        }],
    }


class ResolveStaffPilotTest(unittest.TestCase):
    def test_name_key_ignores_title_order_and_dirty_punctuation(self):
        self.assertEqual(
            subject.name_key("Professor SHAO Baihao<"),
            subject.name_key("Baihao SHAO"),
        )

    def test_name_key_does_not_swap_two_different_surnames(self):
        self.assertNotEqual(
            subject.name_key("Professor XUE Yang"),
            subject.name_key("Professor YANG Xue"),
        )

    def test_unique_candidate_resolves_automatically(self):
        profile = person(
            "Baihao SHAO",
            "https://research.cuhk.edu.hk/en/persons/baihao-shao/",
            external_id="9cc21ee7-0fb4-43c8-a250-8e62ac6b86f2",
        )
        result = subject.resolve_record(
            {"id": "p1", "name": "Professor SHAO Baihao", "courses": ["BMEG4450"], "review_count": 0},
            "BME",
            {subject.name_key(profile["name"]): [profile]},
            {profile["profileUrl"]: profile},
            None,
        )
        self.assertEqual(result["status"], "resolved")
        self.assertEqual(result["classification"], "official_department")
        self.assertTrue(result["identityKey"].startswith("pure:"))

    def test_homonym_is_ambiguous_without_override(self):
        profiles = [
            person("Ning ZHANG", "https://example.test/orthopaedics/", "https://example.test/ortho/"),
            person("Ning ZHANG", "https://example.test/economics/", "https://example.test/econ/"),
        ]
        result = subject.resolve_record(
            {"id": "p1", "name": "Professor ZHANG Ning", "courses": ["BMEG4998"], "review_count": 0},
            "BME",
            {subject.name_key("Ning ZHANG"): profiles},
            {item["profileUrl"]: item for item in profiles},
            None,
        )
        self.assertEqual(result["status"], "ambiguous")
        self.assertEqual(len(result["candidateProfiles"]), 2)

    def test_override_disambiguates_and_preserves_relationship(self):
        profile = person("Ning ZHANG", "https://example.test/orthopaedics/", "https://example.test/ortho/")
        result = subject.resolve_record(
            {"id": "p1", "name": "Professor ZHANG Ning", "courses": ["BMEG4998"], "review_count": 0},
            "BME",
            {subject.name_key(profile["name"]): [profile]},
            {profile["profileUrl"]: profile},
            {
                "profileUrl": profile["profileUrl"],
                "targetRelationship": "teaching",
                "evidenceUrl": "https://example.test/evidence/",
            },
        )
        self.assertEqual(result["resolution"], "manual_override")
        self.assertEqual(result["classification"], "target_related")
        self.assertEqual(result["targetRelationship"], "teaching")


if __name__ == "__main__":
    unittest.main()
