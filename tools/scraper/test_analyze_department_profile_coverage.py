import unittest

import analyze_department_profile_coverage as subject


class AnalyzeDepartmentProfileCoverageTest(unittest.TestCase):
    def test_counts_only_verified_personal_department_pages(self):
        report = {
            "records": [
                {
                    "personId": "one",
                    "profileUrl": "https://dept.cuhk.edu.hk/one/",
                    "profileStatus": "verified",
                },
                {
                    "personId": "two",
                    "profileUrl": None,
                    "profileStatus": "missing",
                },
            ]
        }
        instructors = [
            {"person_id": "one", "profile_url": "rp-1", "organisations": ["A"]},
            {"person_id": "two", "profile_url": "rp-2", "organisations": ["B"]},
            {"person_id": "three", "profile_url": None, "organisations": ["B"]},
        ]
        self.assertEqual(
            subject.build_analysis(report, instructors),
            {
                "officialCourseInstructors": 3,
                "withVerifiedDepartmentPage": 1,
                "researchPortalFallback": 1,
                "withoutEitherPage": 1,
                "coveragePercent": 33.3,
                "largestMissingOrganisations": [
                    {"organisation": "B", "instructors": 2}
                ],
            },
        )


if __name__ == "__main__":
    unittest.main()
