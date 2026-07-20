import unittest

import build_staff_source_queue as subject


class BuildStaffSourceQueueTest(unittest.TestCase):
    def test_groups_people_by_canonical_source_and_orders_by_coverage(self):
        audit = {
            "generatedAt": "2026-07-16T00:00:00Z",
            "records": [
                self.record("one", "Ada", "https://example.test/roster/#staff"),
                self.record("two", "Grace", "https://example.test/other.pdf"),
                self.record("three", "Barbara", "http://example.test/roster"),
                {
                    **self.record("four", "External", None),
                    "classification": "external_or_visiting",
                },
            ],
        }

        queue = subject.build_queue(audit)

        self.assertEqual(
            queue["summary"],
            {
                "auditPeople": 3,
                "people": 3,
                "directoryResolvedPeople": 0,
                "peopleWithSource": 3,
                "peopleMissingSource": 0,
                "uniqueSources": 2,
                "topTenCoverage": 3,
            },
        )
        self.assertEqual(queue["sources"][0]["peopleCount"], 2)
        self.assertEqual(queue["sources"][0]["sourceUrl"], "https://example.test/roster/")
        self.assertEqual(queue["sources"][1]["sourceType"], "pdf")

    def test_keeps_target_people_without_a_source_in_a_separate_queue(self):
        queue = subject.build_queue(
            {"records": [self.record("one", "Ada", None)]}
        )

        self.assertEqual(queue["summary"]["peopleMissingSource"], 1)
        self.assertEqual(queue["missingSource"][0]["productionName"], "Ada")

    def test_rejects_duplicate_professor_ids_before_grouping(self):
        record = self.record("duplicate", "Ada", "https://example.test/roster")
        with self.assertRaisesRegex(ValueError, "duplicate professor id"):
            subject.build_queue({"records": [record, record]})

    def test_removes_unique_refreshed_directory_matches(self):
        audit = {
            "records": [
                self.record("matched", "Dr. Ada LOVELACE", "https://example.test/roster"),
                self.record("queued", "Dr. Grace HOPPER", "https://example.test/roster"),
            ]
        }
        directory = {
            "scope": {"mode": "full", "complete": True},
            "organisations": [{
                "name": "Example Department",
                "sourceUrl": "https://example.test/department/",
                "staffCoverage": {"complete": True, "expected": None, "scraped": 0},
            }],
            "people": [{
                "id": "pure:ada",
                "name": "Professor Ada LOVELACE",
                "profileUrl": "https://example.test/ada/",
            }]
        }
        matches = subject.directory_matches(audit, directory)
        queue = subject.build_queue(audit, matches)

        self.assertEqual(queue["summary"]["auditPeople"], 2)
        self.assertEqual(queue["summary"]["people"], 1)
        self.assertEqual(queue["summary"]["directoryResolvedPeople"], 1)
        self.assertEqual(queue["sources"][0]["peopleCount"], 1)
        self.assertEqual(
            queue["directoryResolved"][0]["personId"],
            "pure:ada",
        )

    def test_does_not_remove_ambiguous_directory_names(self):
        audit = {"records": [self.record("same", "Ada LOVELACE", None)]}
        directory = {
            "scope": {"mode": "full", "complete": True},
            "organisations": [{
                "name": "Example Department",
                "sourceUrl": "https://example.test/department/",
                "staffCoverage": {"complete": True, "expected": None, "scraped": 0},
            }],
            "people": [
                {"id": "one", "name": "Dr. Ada LOVELACE", "profileUrl": "one"},
                {"id": "two", "name": "Professor Ada LOVELACE", "profileUrl": "two"},
            ]
        }

        self.assertEqual(subject.directory_matches(audit, directory), {})

    def test_rejects_incomplete_directory_matches(self):
        audit = {"records": [self.record("same", "Ada LOVELACE", None)]}
        directory = {
            "scope": {"mode": "full", "complete": False},
            "people": [
                {"id": "one", "name": "Dr. Ada LOVELACE", "profileUrl": "one"}
            ],
        }

        with self.assertRaisesRegex(ValueError, "incomplete"):
            subject.directory_matches(audit, directory)

    @staticmethod
    def record(professor_id, name, source_url):
        return {
            "professorId": professor_id,
            "productionName": name,
            "canonicalName": name,
            "courses": ["TEST1000"],
            "classification": "current_cuhk_missing_person",
            "confidence": "high",
            "organisation": "Example Department",
            "profileUrl": None,
            "sourceUrl": source_url,
            "evidence": "Official roster",
        }


if __name__ == "__main__":
    unittest.main()
