import unittest

import scrape_timetable as subject


class TimetableScraperTest(unittest.TestCase):
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
