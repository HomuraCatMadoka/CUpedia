import unittest
from unittest.mock import Mock, patch

import scrape_timetable as subject


class TimetableScraperTest(unittest.TestCase):
    def test_posts_the_requested_academic_career(self):
        session = Mock()
        career_page = Mock()
        career_page.text = """
        <form>
          <select id="ddl_acad_career"><option selected value="RPG">RPG</option></select>
        </form>"""
        listing = Mock()
        listing.text = "listing"
        session.post.side_effect = [career_page, listing]
        with (
            patch.object(
                subject.common,
                "get",
                return_value="""
                <form>
                  <select id="ddl_acad_career"><option selected value="UG">UG</option></select>
                  <select id="ddl_acad_term"><option selected value="2420">Term 1</option></select>
                </form>""",
            ),
            patch.object(subject, "_solve", return_value="ABCD"),
        ):
            self.assertEqual(
                subject.fetch_listing(session, "CSCI", "2420", "RPG", retries=1),
                "listing",
            )
        career_post, search_post = session.post.call_args_list
        self.assertEqual(career_post.kwargs["data"]["__EVENTTARGET"], "ddl_acad_career")
        self.assertEqual(career_post.kwargs["data"]["ddl_acad_term"], "2420")
        self.assertEqual(search_post.kwargs["data"]["ddl_acad_career"], "RPG")

    def test_keeps_only_5000_plus_postgraduate_courses(self):
        self.assertTrue(subject.include_course("UG", "CSCI1130"))
        self.assertFalse(subject.include_course("TPG", "CSCI4999"))
        self.assertTrue(subject.include_course("TPG", "CSCI5000"))
        self.assertTrue(subject.include_course("RPG", "CSCI8001"))

    def test_parses_course_and_teaching_staff_by_headers(self):
        html = """<table id="gv_detail">
        <tr><th>Class Code</th><th>Class Nbr</th><th>Course Title</th><th>Units</th><th>Teaching Staff</th><th>Quota(s)</th><th>Vacancy</th><th>Course Component</th><th>Section Code</th></tr>
        <tr><td>CSCI1020-A</td><td>1234</td><td>C++</td><td>3</td><td>- Dr. CHEONG Chi Hong</td><td>50</td><td>21</td><td>LEC</td><td>A</td></tr>
        <tr><td></td><td></td><td></td><td></td><td>- Prof. CHAN Wing Kai</td><td></td><td></td><td></td><td></td></tr>
        </table>"""
        rows = subject.parse_listing(html)
        self.assertEqual([row["course"] for row in rows], ["CSCI1020", "CSCI1020"])
        self.assertEqual(rows[0]["class_code"], "CSCI1020A")
        self.assertEqual(rows[1]["instructors"], "- Prof. CHAN Wing Kai")

    def test_parses_postgraduate_table_without_vacancy(self):
        html = """<table id="gv_detail">
        <tr><th>Class Code</th><th>Class Nbr</th><th>Teaching Staff</th><th>Quota(s)</th><th>Course Component</th><th>Section Code</th></tr>
        <tr><td>CSCI5120-</td><td>9889</td><td>- Professor CHENG James</td><td>60</td><td>LEC</td><td>-</td></tr>
        </table>"""
        parsed = subject.parse_listing(html)[0]
        self.assertEqual(
            parsed,
            {
                "course": "CSCI5120",
                "class_code": "CSCI5120",
                "class_nbr": "9889",
                "instructors": "- Professor CHENG James",
                "quota": "60",
                "vacancy": "",
                "component": "LEC",
                "section": "-",
            },
        )
        parsed.update({"academic_year": "2026-27", "term": "Term 1"})
        self.assertEqual(subject.enrollment_rows([parsed])[0]["vacancy"], None)

    def test_aggregates_and_deduplicates_assignments(self):
        rows = [
            {"course": "CSCI1020", "instructors": "- Dr. CHEONG Chi Hong"},
            {"course": "CSCI1020", "instructors": "- Dr. CHEONG Chi Hong"},
        ]
        self.assertEqual(subject.aggregate(rows), [
            {"name": "Dr. CHEONG Chi Hong", "courses": ["CSCI1020"]}
        ])

    def test_rejects_truncated_or_title_only_instructors(self):
        value = "\n".join([
            "Pr", "Pro", "Prof", "Profes", "Profess", "Professor", "Dr.",
            "Professor CHAN Wing Kai",
        ])

        self.assertEqual(
            subject.instructor_names(value),
            ["Professor CHAN Wing Kai"],
        )

    def test_builds_numeric_enrollment_snapshots(self):
        rows = [{
            "academic_year": "2025-26", "term": "Term 1", "course": "CSCI1020",
            "class_code": "CSCI1020A", "class_nbr": "1234", "component": "LEC",
            "section": "A", "quota": "50", "vacancy": "21",
            "instructors": "- Dr. CHEONG Chi Hong",
        }, {
            "academic_year": "2025-26", "term": "Term 1", "course": "CSCI1020",
            "class_code": "CSCI1020A", "class_nbr": "1234", "component": "",
            "section": "", "quota": "", "vacancy": "",
            "instructors": "- Prof. CHAN Wing Kai",
        }]
        self.assertEqual(subject.enrollment_rows(rows)[0], {
            "academicYear": "2025-26", "term": "Term 1", "courseCode": "CSCI1020",
            "classCode": "CSCI1020A", "classNbr": "1234", "component": "LEC",
            "section": "A", "quota": 50, "vacancy": 21,
            "instructors": ["Dr. CHEONG Chi Hong", "Prof. CHAN Wing Kai"],
        })


if __name__ == "__main__":
    unittest.main()
