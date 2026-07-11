import unittest

import scrape_handbook as subject


class HandbookScraperTest(unittest.TestCase):
    def test_extracts_major_metadata_from_program_detail(self):
        html = '''<span id="uc_scheme_lbl_study_scheme"><html><head><title>Computer Science</title></head>
        <body>Applicable to students admitted in 2025-26 Major Programme Requirement Course List</body></html></span>'''
        self.assertEqual(subject.scheme_metadata(html), ("major", "2025-26"))

    def test_rejects_minor_and_non_programme_pages(self):
        minor = '''<span id="uc_scheme_lbl_study_scheme"><html><body>
        Applicable to students admitted in 2025-26 Minor Programme Requirement Course List
        </body></html></span>'''
        self.assertEqual(subject.scheme_metadata(minor), (None, "2025-26"))
        self.assertEqual(subject.scheme_metadata("<html>Faculty Package</html>"), (None, None))

    def test_listing_targets_keep_traceable_metadata(self):
        html = '''<form><table id="gv_detail"><tr><td>UG</td><td>2025</td>
        <td>Faculty of Engineering</td><td>Full-time</td><td><a href="javascript:__doPostBack('gv_detail$ctl02$lbtn_prog_descr','')">B.Sc. in Computer Science</a></td><td>計算機科學理學士</td>
        </tr></table></form>'''
        self.assertEqual(subject.listing_targets(html), [
            ("gv_detail$ctl02$lbtn_prog_descr", "Faculty of Engineering", "B.Sc. in Computer Science")
        ])

    def test_safe_name_matches_resumable_snapshot_filename(self):
        self.assertEqual(subject.safe_name("B.Sc. in Computer Science"), "b-sc-in-computer-science")


if __name__ == "__main__":
    unittest.main()
