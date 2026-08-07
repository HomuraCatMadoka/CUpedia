import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
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

    def test_persist_subject_preserves_other_worker_results(self):
        with TemporaryDirectory() as directory:
            out = Path(directory) / "courses.json"
            ledger = Path(directory) / "courses.attempted.json"
            out.write_text(
                '[{"subject":"ACCT","code":"ACCT1111"}]', encoding="utf-8"
            )
            ledger.write_text('["ACCT"]', encoding="utf-8")

            total = scrape_courses.persist_subject(
                out, ledger, "CSCI", [{"subject": "CSCI", "code": "CSCI5120"}]
            )

            self.assertEqual(total, 2)
            self.assertEqual(
                scrape_courses.json.loads(out.read_text(encoding="utf-8")),
                [
                    {"subject": "ACCT", "code": "ACCT1111"},
                    {"subject": "CSCI", "code": "CSCI5120"},
                ],
            )
            self.assertEqual(
                scrape_courses.json.loads(ledger.read_text(encoding="utf-8")),
                ["ACCT", "CSCI"],
            )


if __name__ == "__main__":
    unittest.main()
