import unittest

import compare_staff_production as subject


def staff(name, url):
    return {"id": url, "name": name, "email": None, "profileUrl": url, "title": "Professor"}


class CompareStaffProductionTest(unittest.TestCase):
    def setUp(self):
        self.directory = {
            "faculties": [
                {
                    "name": "Faculty of Example",
                    "facultyStaff": [],
                    "departments": [
                        {
                            "name": "Department of One",
                            "sourceUrl": "https://example.test/one/",
                            "staff": [
                                staff("Ada LOVELACE", "https://example.test/ada/"),
                                staff("Alex CHAN", "https://example.test/alex-one/"),
                                staff("Alex CHAN", "https://example.test/alex-two/"),
                            ],
                            "staffCoverage": {"complete": True, "expected": 3, "scraped": 3},
                        }
                    ],
                }
            ],
            "duplicateCandidates": [{"normalisedName": "alex chan"}],
            "similarNameCandidates": [],
        }

    def test_matches_unique_name_and_preserves_homonym(self):
        production = [
            {"id": "p1", "name": "Professor LOVELACE Ada", "courses": ["TEST1000"], "review_count": 0},
            {"id": "p2", "name": "CHAN Alex", "courses": ["TEST2000"], "review_count": 0},
            {"id": "p3", "name": "Unknown Person", "courses": ["TEST3000"], "review_count": 0},
        ]
        report = subject.build_report(self.directory, production)
        self.assertEqual(report["summary"]["matchedProductionRows"], 1)
        self.assertEqual(report["summary"]["ambiguousProductionRows"], 1)
        self.assertEqual(report["summary"]["unmatchedProductionRows"], 1)
        self.assertEqual(report["summary"]["sameDepartmentExactNameCandidates"], 1)

    def test_reports_duplicate_production_rows_for_one_official_identity(self):
        production = [
            {"id": "p1", "name": "Ada LOVELACE", "courses": ["TEST1000"], "review_count": 0},
            {"id": "p2", "name": "Professor LOVELACE Ada", "courses": ["TEST2000"], "review_count": 1},
        ]
        report = subject.build_report(self.directory, production)
        self.assertEqual(report["summary"]["duplicateProductionIdentities"], 1)
        self.assertTrue(report["duplicateProductionIdentities"][0]["blockedByReviews"])

    def test_rating_alone_blocks_duplicate_cleanup(self):
        production = [
            {"id": "p1", "name": "Ada LOVELACE", "courses": [], "review_count": 0, "rating_count": 0},
            {"id": "p2", "name": "Professor LOVELACE Ada", "courses": [], "review_count": 0, "rating_count": 1},
        ]
        report = subject.build_report(self.directory, production)
        self.assertTrue(report["duplicateProductionIdentities"][0]["blockedByReviews"])

    def test_organisation_first_directory_builds_faculty_summary(self):
        directory = {
            "organisations": [
                {
                    "name": "Faculty of Example",
                    "sourceUrl": "https://example.test/faculty/",
                    "organisationType": "faculty",
                    "facultyUrl": "https://example.test/faculty/",
                },
                {
                    "name": "Department of One",
                    "sourceUrl": "https://example.test/one/",
                    "organisationType": "department",
                    "facultyUrl": "https://example.test/faculty/",
                },
            ],
            "people": [{
                "id": "ada",
                "name": "Ada LOVELACE",
                "email": None,
                "profileUrl": "https://example.test/ada/",
                "affiliations": [{
                    "organisation": "Department of One",
                    "organisationUrl": "https://example.test/one/",
                }],
            }],
        }
        report = subject.build_report(directory, [])
        self.assertEqual(report["summary"]["faculties"], 1)
        self.assertEqual(report["summary"]["departments"], 1)
        self.assertEqual(report["faculties"]["Faculty of Example"]["officialPeople"], 1)

    def test_separates_other_portal_units_from_missing_profiles(self):
        production = [
            {"id": "p1", "name": "Grace HOPPER", "courses": ["TEST1000"], "review_count": 0},
        ]
        portal_people = [
            {
                "name": "HOPPER Grace",
                "profileUrl": "https://example.test/grace/",
                "affiliations": [{"organisation": "Research Centre"}],
            }
        ]
        report = subject.build_report(self.directory, production, portal_people)
        self.assertEqual(report["summary"]["portalOtherUnitRows"], 1)
        self.assertEqual(report["summary"]["unmatchedProductionRows"], 0)

    def test_reviewed_alias_matches_existing_official_person(self):
        production = [{
            "id": "p1",
            "name": "Professor Augusta Ada KING",
            "courses": ["TEST1000"],
            "review_count": 1,
        }]
        aliases = [{
            "profileUrl": "https://example.test/ada/",
            "alias": "Professor Augusta Ada KING",
        }]

        report = subject.build_report(
            self.directory,
            production,
            reviewed_aliases=aliases,
        )

        self.assertEqual(report["summary"]["matchedProductionRows"], 1)
        self.assertEqual(report["summary"]["unmatchedProductionRows"], 0)


if __name__ == "__main__":
    unittest.main()
