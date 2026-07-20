import unittest
from unittest.mock import patch

import scrape_courses


class SubjectCatalogTests(unittest.TestCase):
    def test_reads_codes_and_official_names_from_the_catalog_select(self):
        html = """
        <select id="ddl_subject">
          <option value="">-- Select --</option>
          <option value="ELED">ELED - English Language Education</option>
          <option value="EPIN">EPIN - Entrepreneurship &amp; Innovation</option>
        </select>
        """

        with patch.object(scrape_courses.common, "get", return_value=html):
            self.assertEqual(
                scrape_courses.subject_catalog(object()),
                [
                    {"code": "ELED", "nameEn": "English Language Education"},
                    {"code": "EPIN", "nameEn": "Entrepreneurship & Innovation"},
                ],
            )


if __name__ == "__main__":
    unittest.main()
