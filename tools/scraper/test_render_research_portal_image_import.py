import tempfile
import unittest
from pathlib import Path

import render_research_portal_image_import as subject
import scrape_staff


class RenderResearchPortalImageImportTest(unittest.TestCase):
    def test_builds_attach_only_portrait_update(self):
        profile_url = "https://research.cuhk.edu.hk/en/persons/ada/"
        directory = {
            "scope": {"mode": "full", "complete": True},
            "people": [{
                "externalId": "9cc21ee7-0fb4-43c8-a250-8e62ac6b86f2",
                "name": "Professor Ada LOVELACE",
                "profileUrl": profile_url,
                "affiliations": [],
            }],
        }
        html = """
        <head><meta property="og:image" content="https://research.cuhk.edu.hk/files-asset/123/photo.jpg/"></head>
        <body><script>{"id":"9cc21ee7-0fb4-43c8-a250-8e62ac6b86f2","title":"Ada","recordType":"person"}</script>
        <div class="person-vcard-wrapper"><h1>Professor Ada LOVELACE</h1></div></body>
        """
        with tempfile.TemporaryDirectory() as temporary:
            cache_dir = Path(temporary)
            cache_path = scrape_staff.PortalFetcher(cache_dir, 0, False)._cache_path(
                "persons", profile_url
            )
            cache_path.write_text(html, encoding="utf-8")
            payload = subject.build_payload(directory, cache_dir)

        self.assertEqual(payload["person_sources"][0]["image_url"],
            "https://research.cuhk.edu.hk/files-asset/123/photo.jpg/")
        sql = subject.render_sql(payload)
        self.assertIn("update staff_person_sources", sql)
        self.assertNotIn("insert into staff_person_sources", sql)
        self.assertIn("identity belongs to another person", sql)

    def test_rejects_partial_directory(self):
        with self.assertRaisesRegex(ValueError, "full directory"):
            subject.build_payload({"scope": {"mode": "preview"}}, Path("unused"))


if __name__ == "__main__":
    unittest.main()
