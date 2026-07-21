import base64
import unittest

import scrape_staff as subject


FACULTY = """
<body data-page="organisations"><section aria-label="organisations information">
  <h1>Faculty of Engineering</h1>
  <ul class="organisation-ancestors"><li><a rel="Organisation" href="https://research.cuhk.edu.hk/en/organisations/cuhk/">CUHK</a></li></ul>
</section></body>
"""

DEPARTMENT = """
<body data-page="organisations"><section aria-label="organisations information">
  <h1>Department of Biomedical Engineering</h1>
  <ul class="organisation-ancestors">
    <li><a rel="Organisation" href="https://research.cuhk.edu.hk/en/organisations/cuhk/">CUHK</a></li>
    <li><a rel="Organisation" href="https://research.cuhk.edu.hk/en/organisations/faculty-of-engineering/">Faculty of Engineering</a></li>
  </ul>
</section>
<nav class="submenu"><a href="/en/organisations/department-of-biomedical-engineering/persons/"><span class="count">(22)</span></a></nav>
<section class="organisation-persons"><a rel="Person" href="https://research.cuhk.edu.hk/en/persons/baihao-shao/">Shao</a></section>
</body>
"""


def person_html(name, slug, email="person@cuhk.edu.hk", title="Assistant Professor"):
    encoded = base64.b64encode(f"mailto:{email}".encode()).decode()
    return f"""
    <body data-page="persons"><script>
      {{"id":"9cc21ee7-0fb4-43c8-a250-8e62ac6b86f2","title":"{name}","recordType":"person"}}
    </script><div class="person-vcard-wrapper">
      <h1>{name}</h1><a class="email" data-md5="{encoded}">hidden</a>
      <div class="rendering_personorganisationlistrendererportal"><ul><li>
        <span class="job-title">{title}</span>
        <a rel="Organisation" href="https://research.cuhk.edu.hk/en/organisations/department-of-biomedical-engineering/">Department of Biomedical Engineering</a>
      </li></ul></div>
    </div></body>
    """


class StaffScraperTest(unittest.TestCase):
    def test_reads_sitemap_urls_and_canonicalises_them(self):
        xml = """<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>http://research.cuhk.edu.hk/en/persons/li-zhang?x=1</loc></url>
          <url><loc>https://research.cuhk.edu.hk/en/publications/nope/</loc></url>
        </urlset>"""
        self.assertEqual(
            subject.sitemap_urls(xml, "/en/persons/"),
            ["https://research.cuhk.edu.hk/en/persons/li-zhang/"],
        )

    def test_parses_stable_person_identity_email_and_affiliation(self):
        url = "https://research.cuhk.edu.hk/en/persons/baihao-shao/"
        person = subject.parse_person(person_html("Professor SHAO Baihao", "baihao-shao"), url)
        self.assertEqual(person["email"], "person@cuhk.edu.hk")
        self.assertEqual(person["profileUrl"], url)
        self.assertEqual(person["externalId"], "9cc21ee7-0fb4-43c8-a250-8e62ac6b86f2")
        self.assertEqual(person["affiliations"][0]["title"], "Assistant Professor")

    def test_reads_department_preview_and_expected_count(self):
        self.assertEqual(
            subject.organisation_preview(DEPARTMENT),
            (["https://research.cuhk.edu.hk/en/persons/baihao-shao/"], 22),
        )

    def test_full_discovery_unions_sitemap_and_organisation_previews(self):
        xml = """<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://research.cuhk.edu.hk/en/persons/from-sitemap/</loc></url>
        </urlset>"""
        preview_url = "https://research.cuhk.edu.hk/en/persons/preview-only/"
        self.assertEqual(
            subject.discover_person_urls(xml, [preview_url], False),
            [
                "https://research.cuhk.edu.hk/en/persons/from-sitemap/",
                preview_url,
            ],
        )
        self.assertEqual(
            subject.discover_person_urls(xml, [preview_url], True),
            [preview_url],
        )

    def test_full_directory_exposes_incomplete_coverage(self):
        department_url = "https://research.cuhk.edu.hk/en/organisations/department-of-biomedical-engineering/"
        result = subject.build_directory(
            [
                subject.parse_organisation(
                    FACULTY,
                    "https://research.cuhk.edu.hk/en/organisations/faculty-of-engineering/",
                ),
                subject.parse_organisation(
                    DEPARTMENT,
                    department_url,
                ),
            ],
            [],
        )
        subject.add_staff_coverage(result, {department_url: 22}, "full")
        self.assertEqual(
            result["faculties"][0]["departments"][0]["staffCoverage"],
            {"complete": False, "expected": 22, "scraped": 0},
        )
        department = next(
            item for item in result["organisations"]
            if item["sourceUrl"] == department_url
        )
        self.assertEqual(
            department["staffCoverage"],
            {"complete": False, "expected": 22, "scraped": 0},
        )
        self.assertFalse(subject.staff_coverage_complete(result, "full"))

    def test_full_directory_checks_standalone_organisation_coverage(self):
        office_url = "https://research.cuhk.edu.hk/en/organisations/example-office/"
        person_url = "https://research.cuhk.edu.hk/en/persons/example-officer/"
        person = subject.parse_person(
            person_html("Dr Example Officer", "example-officer"), person_url
        )
        person["affiliations"] = [{
            "organisation": "Example Office",
            "organisationUrl": office_url,
            "title": "Director",
        }]
        result = subject.build_directory(
            [subject.Organisation("Example Office", office_url, ())],
            [person],
        )

        subject.add_staff_coverage(result, {office_url: 2}, "full")

        self.assertEqual(
            result["organisations"][0]["staffCoverage"],
            {"complete": False, "expected": 2, "scraped": 1},
        )
        self.assertFalse(subject.staff_coverage_complete(result, "full"))

    def test_empty_full_directory_is_not_complete(self):
        self.assertFalse(
            subject.staff_coverage_complete({"organisations": []}, "full")
        )

    def test_rejects_scoped_directory_for_global_identity_workflows(self):
        for scope in [
            {
                "mode": "full",
                "complete": True,
                "selectedDepartments": ["https://example.test/department/"],
            },
            {
                "mode": "full",
                "complete": True,
                "selectedFaculties": ["faculty of engineering"],
            },
        ]:
            with self.subTest(scope=scope):
                with self.assertRaisesRegex(ValueError, "scoped"):
                    subject.require_complete_directory({"scope": scope})

    def test_rejects_directory_without_complete_organisation_coverage(self):
        directory = {
            "scope": {"mode": "full", "complete": True},
            "organisations": [{
                "name": "Example Office",
                "sourceUrl": "https://example.test/office/",
                "staffCoverage": {"complete": False},
            }],
        }
        with self.assertRaisesRegex(ValueError, "organisation coverage"):
            subject.require_complete_directory(directory)

    def test_rejects_coverage_that_disagrees_with_people(self):
        directory = {
            "scope": {"mode": "full", "complete": True},
            "organisations": [{
                "name": "Example Office",
                "sourceUrl": "https://example.test/office/",
                "staffCoverage": {"complete": True, "expected": 1, "scraped": 1},
            }],
            "people": [],
        }
        with self.assertRaisesRegex(ValueError, "organisation coverage"):
            subject.require_complete_directory(directory)

    def test_rejects_duplicate_organisation_urls(self):
        organisation = {
            "name": "Example Office",
            "sourceUrl": "https://example.test/office/",
            "staffCoverage": {"complete": True, "expected": None, "scraped": 0},
        }
        directory = {
            "scope": {"mode": "full", "complete": True},
            "organisations": [organisation, organisation.copy()],
            "people": [],
        }
        with self.assertRaisesRegex(ValueError, "duplicate URLs"):
            subject.require_complete_directory(directory)

    def test_uses_json_ld_affiliation_when_visible_list_is_empty(self):
        html = """
        <body data-page="persons"><script type="application/ld+json">
        {"@type":"Person","name":"Professor WANG Liwei","affiliation":[
          {"@type":"Organization","name":"Department of Computer Science and Engineering"}
        ]}</script><div class="person-vcard-wrapper">
          <h1>Professor WANG Liwei</h1>
          <div class="rendering_personorganisationlistrendererportal"><ul></ul></div>
        </div></body>
        """
        person = subject.parse_person(
            html, "https://research.cuhk.edu.hk/en/persons/liwei-wang/"
        )
        self.assertEqual(
            person["affiliations"],
            [{
                "organisation": "Department of Computer Science and Engineering",
                "organisationUrl": None,
                "title": None,
            }],
        )
        self.assertEqual(
            subject.department_urls("department-of-biomedical-engineering"),
            ["https://research.cuhk.edu.hk/en/organisations/department-of-biomedical-engineering/"],
        )

    def test_keeps_same_department_homonyms_separate_and_reports_them(self):
        faculty_url = "https://research.cuhk.edu.hk/en/organisations/faculty-of-engineering/"
        department_url = "https://research.cuhk.edu.hk/en/organisations/department-of-biomedical-engineering/"
        organisations = [
            subject.parse_organisation(FACULTY, faculty_url),
            subject.parse_organisation(DEPARTMENT, department_url),
        ]
        people = [
            subject.parse_person(
                person_html("Dr. ZHANG Li", "li-zhang", "first@cuhk.edu.hk"),
                "https://research.cuhk.edu.hk/en/persons/li-zhang/",
            ),
            subject.parse_person(
                person_html("Professor ZHANG Li", "li-zhang-2", "second@cuhk.edu.hk"),
                "https://research.cuhk.edu.hk/en/persons/li-zhang-2/",
            ),
        ]
        result = subject.build_directory(organisations, people)
        staff = result["faculties"][0]["departments"][0]["staff"]
        self.assertEqual(len(staff), 2)
        self.assertNotEqual(staff[0]["id"], staff[1]["id"])
        self.assertEqual(len(result["duplicateCandidates"]), 1)
        self.assertEqual(result["duplicateCandidates"][0]["normalisedName"], "zhang li")

    def test_reports_near_names_separately(self):
        faculty_url = "https://research.cuhk.edu.hk/en/organisations/faculty-of-engineering/"
        department_url = "https://research.cuhk.edu.hk/en/organisations/department-of-biomedical-engineering/"
        organisations = [
            subject.parse_organisation(FACULTY, faculty_url),
            subject.parse_organisation(DEPARTMENT, department_url),
        ]
        people = [
            subject.parse_person(
                person_html("Dr. WONG Kin Hong", "wong-kin-hong"),
                "https://research.cuhk.edu.hk/en/persons/wong-kin-hong/",
            ),
            subject.parse_person(
                person_html("Dr. WONG Kin Ho", "wong-kin-ho"),
                "https://research.cuhk.edu.hk/en/persons/wong-kin-ho/",
            ),
        ]
        result = subject.build_directory(organisations, people)
        self.assertEqual(len(result["similarNameCandidates"]), 1)

    def test_keeps_one_person_in_each_affiliated_department(self):
        faculty_url = "https://research.cuhk.edu.hk/en/organisations/faculty-of-engineering/"
        bme_url = "https://research.cuhk.edu.hk/en/organisations/department-of-biomedical-engineering/"
        cse_url = "https://research.cuhk.edu.hk/en/organisations/department-of-computer-science-and-engineering/"
        organisations = [
            subject.Organisation("Faculty of Engineering", faculty_url, ()),
            subject.Organisation(
                "Department of Biomedical Engineering",
                bme_url,
                (("Faculty of Engineering", faculty_url),),
            ),
            subject.Organisation(
                "Department of Computer Science and Engineering",
                cse_url,
                (("Faculty of Engineering", faculty_url),),
            ),
        ]
        staff = subject.parse_person(
            person_html("Professor Cross Appointed", "cross-appointed"),
            "https://research.cuhk.edu.hk/en/persons/cross-appointed/",
        )
        staff["affiliations"].append(
            {
                "organisation": "Department of Computer Science and Engineering",
                "organisationUrl": cse_url,
                "title": "Professor (by courtesy)",
            }
        )
        result = subject.build_directory(organisations, [staff])
        departments = result["faculties"][0]["departments"]
        self.assertEqual([len(item["staff"]) for item in departments], [1, 1])

    def test_keeps_faculty_centres_in_organisation_hierarchy(self):
        faculty_url = "https://research.cuhk.edu.hk/en/organisations/faculty-of-engineering/"
        centre_url = "https://research.cuhk.edu.hk/en/organisations/engineering-centre/"
        result = subject.build_directory(
            [
                subject.Organisation("Faculty of Engineering", faculty_url, ()),
                subject.Organisation(
                    "Centre for Engineering Research",
                    centre_url,
                    (("Faculty of Engineering", faculty_url),),
                ),
            ],
            [],
        )
        centre = next(
            item for item in result["organisations"] if item["sourceUrl"] == centre_url
        )
        self.assertEqual(centre["organisationType"], "centre")
        self.assertEqual(centre["parentUrl"], faculty_url)
        self.assertEqual(centre["facultyUrl"], faculty_url)

    def test_keeps_non_faculty_organisations_and_people(self):
        office_url = "https://research.cuhk.edu.hk/en/organisations/office-of-university-general-education/"
        person_url = "https://research.cuhk.edu.hk/en/persons/general-education-lecturer/"
        staff = subject.parse_person(
            person_html("Dr. General Education Lecturer", "general-education-lecturer"),
            person_url,
        )
        staff["affiliations"] = [{
            "organisation": "Office of University General Education",
            "organisationUrl": office_url,
            "title": "Lecturer",
        }]
        result = subject.build_directory(
            [subject.Organisation("Office of University General Education", office_url, ())],
            [staff],
        )
        self.assertEqual(result["stats"]["staff"], 1)
        self.assertEqual(result["people"][0]["profileUrl"], person_url)
        self.assertEqual(result["organisations"], [{
            "id": subject.organisation_id(office_url),
            "name": "Office of University General Education",
            "sourceUrl": office_url,
            "organisationType": "office",
            "parentUrl": None,
            "facultyUrl": None,
        }])

    def test_preserves_multiple_titles_for_one_department_membership(self):
        faculty_url = "https://research.cuhk.edu.hk/en/organisations/faculty-of-engineering/"
        department_url = "https://research.cuhk.edu.hk/en/organisations/department-of-biomedical-engineering/"
        staff = subject.parse_person(
            person_html("Professor Multiple Titles", "multiple-titles", title="Professor"),
            "https://research.cuhk.edu.hk/en/persons/multiple-titles/",
        )
        staff["affiliations"].append(
            {
                "organisation": "Department of Biomedical Engineering",
                "organisationUrl": department_url,
                "title": "Chairperson",
            }
        )
        result = subject.build_directory(
            [
                subject.Organisation("Faculty of Engineering", faculty_url, ()),
                subject.Organisation(
                    "Department of Biomedical Engineering",
                    department_url,
                    (("Faculty of Engineering", faculty_url),),
                ),
            ],
            [staff],
        )
        row = result["faculties"][0]["departments"][0]["staff"][0]
        self.assertEqual(row["titles"], ["Chairperson", "Professor"])
        self.assertEqual(result["stats"]["staff"], 1)


if __name__ == "__main__":
    unittest.main()
