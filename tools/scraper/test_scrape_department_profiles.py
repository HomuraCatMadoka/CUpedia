import json
import unittest
from pathlib import Path

import scrape_department_profiles as subject


class ScrapeDepartmentProfilesTest(unittest.TestCase):
    def directory(self):
        organisation_url = "https://research.cuhk.edu.hk/en/organisations/example/"
        return {
            "people": [
                {
                    "externalId": "11111111-1111-1111-1111-111111111111",
                    "name": "Dr. LAM King Tin",
                    "email": "ktlam@cse.cuhk.edu.hk",
                    "profileUrl": "https://research.cuhk.edu.hk/en/persons/king-tin-lam/",
                    "affiliations": [{"organisationUrl": organisation_url}],
                },
                {
                    "externalId": "22222222-2222-2222-2222-222222222222",
                    "name": "Professor CHAN Lai Wan",
                    "email": None,
                    "profileUrl": "https://research.cuhk.edu.hk/en/persons/lai-wan-chan/",
                    "affiliations": [{"organisationUrl": organisation_url}],
                },
            ]
        }

    def config(self):
        return {
            "key": "example",
            "organisationUrls": [
                "https://research.cuhk.edu.hk/en/organisations/example/"
            ],
            "directoryUrl": "https://dept.cuhk.edu.hk/people/",
            "entrySelector": ".person",
            "linkSelector": "a.profile",
            "nameSelector": "h2",
            "titleSelector": ".title",
            "emailSelector": ".email",
            "imageSelector": "img",
        }

    def test_matches_email_and_keeps_external_photo(self):
        html = """
        <div class="person">
          <a class="profile" href="/people/lam/"><img src="/images/lam.jpg"></a>
          <h2>King Tin Lam 林景田</h2><p class="title">Lecturer</p>
          <p class="email">ktlam [@] cse.cuhk.edu.hk</p>
        </div>
        """
        report = subject.build_report(
            self.directory(), [self.config()], {self.config()["directoryUrl"]: html}
        )
        self.assertEqual(len(report["records"]), 1)
        record = report["records"][0]
        self.assertEqual(record["matchedBy"], "email")
        self.assertEqual(record["profileUrl"], "https://dept.cuhk.edu.hk/people/lam/")
        self.assertEqual(record["imageUrl"], "https://dept.cuhk.edu.hk/images/lam.jpg")

    def test_matches_reordered_name_inside_one_organisation(self):
        html = """
        <div class="person"><a class="profile" href="/people/lam/"></a>
          <h2>King Tin Lam</h2><p class="title">Lecturer</p></div>
        """
        report = subject.build_report(
            self.directory(), [self.config()], {self.config()["directoryUrl"]: html}
        )
        self.assertEqual(report["records"][0]["matchedBy"], "organisation_name")
        self.assertIn(
            report["records"][0]["sourceKey"],
            report["sources"][0]["observedSourceKeys"],
        )

    def test_preserves_non_regular_appointments(self):
        self.assertEqual(subject.appointment_kind("Emeritus Professor"), "emeritus")
        self.assertEqual(subject.appointment_kind("Visiting Scholar"), "visiting")
        self.assertEqual(subject.appointment_kind("Part-time Lecturer"), "part_time")
        self.assertEqual(subject.appointment_kind("Professor by Courtesy"), "courtesy")
        self.assertEqual(subject.appointment_kind("in-memoriam"), "former")
        self.assertIsNone(subject.appointment_kind(None))

    def test_source_key_normalizes_trailing_slash(self):
        self.assertEqual(
            subject.source_identity_key(
                {
                    "profileUrl": "https://dept.cuhk.edu.hk/people/lam/",
                    "name": "King Tin Lam",
                },
                "example",
            ),
            "https://dept.cuhk.edu.hk/people/lam",
        )

    def test_source_can_override_appointment_when_roster_has_no_row_title(self):
        config = {
            **self.config(),
            "appointmentOverride": "part_time",
        }
        html = """
        <div class="person"><a class="profile" href="/people/lam/"></a>
          <h2>King Tin Lam</h2></div>
        """
        self.assertEqual(
            subject.parse_directory(html, config)[0]["appointmentKind"],
            "part_time",
        )

    def test_ambiguous_name_is_not_verified(self):
        directory = self.directory()
        duplicate = {
            **directory["people"][1],
            "externalId": "33333333-3333-3333-3333-333333333333",
        }
        directory["people"].append(duplicate)
        html = """
        <div class="person"><a class="profile" href="/people/chan/"></a>
          <h2>Lai Wan Chan</h2><p class="title">Emeritus Professor</p></div>
        """
        report = subject.build_report(
            directory, [self.config()], {self.config()["directoryUrl"]: html}
        )
        self.assertEqual(report["records"], [])
        self.assertEqual(report["unresolved"][0]["status"], "ambiguous")

    def test_rejects_non_cuhk_profile_and_placeholder_photo(self):
        html = """
        <div class="person">
          <a class="profile" href="https://example.com/lam"><img src="/men.jpg"></a>
          <h2>King Tin Lam</h2><p class="title">Lecturer</p>
        </div>
        """
        record = subject.parse_directory(html, self.config())[0]
        self.assertIsNone(record["profileUrl"])
        self.assertIsNone(record["imageUrl"])

    def test_deduplicates_repeated_roster_views_by_profile(self):
        html = """
        <div class="person"><a class="profile" href="/people/lam/"></a>
          <h2>King Tin Lam</h2><p class="title">Lecturer</p></div>
        <div class="person"><a class="profile" href="/people/lam/"></a>
          <h2>King Tin Lam</h2><p class="title">Lecturer</p></div>
        """
        self.assertEqual(len(subject.parse_directory(html, self.config())), 1)

    def test_profile_page_can_supply_obfuscated_email(self):
        record = {"email": None}
        enriched = subject.enrich_from_profile(
            record,
            "<main><span class='contact'>ktlam[@]cse.cuhk.edu.hk</span></main>",
            ".contact",
        )
        self.assertEqual(enriched["email"], "ktlam@cse.cuhk.edu.hk")

    def test_profile_email_prefers_cuhk_over_unrelated_publication_email(self):
        self.assertEqual(
            subject.email_in_text("edition@aaai.org / person@cse.cuhk.edu.hk"),
            "person@cse.cuhk.edu.hk",
        )
        self.assertIsNone(subject.email_in_text("edition@aaai.org"))
        self.assertIsNone(subject.email_in_text("person@cuhk.edu.hk.evil.com"))

    def test_unique_short_department_name_stays_a_candidate(self):
        directory = self.directory()
        directory["people"][0]["name"] = "Professor LAM Kuo Chin King Tin"
        html = """
        <div class="person"><a class="profile" href="/people/lam/"></a>
          <h2>King Tin Lam</h2><p class="title">Lecturer</p></div>
        """
        report = subject.build_report(
            directory, [self.config()], {self.config()["directoryUrl"]: html}
        )
        self.assertEqual(report["records"], [])
        self.assertEqual(report["unresolved"][0]["status"], "candidate")

    def test_email_requires_a_compatible_name(self):
        html = """
        <div class="person"><a class="profile" href="/people/someone/"></a>
          <h2>Completely Different</h2><p class="title">Lecturer</p>
          <p class="email">ktlam@cse.cuhk.edu.hk</p></div>
        """
        report = subject.build_report(
            self.directory(), [self.config()], {self.config()["directoryUrl"]: html}
        )
        self.assertEqual(report["records"], [])

    def test_email_shared_surname_is_not_enough(self):
        html = """
        <div class="person"><a class="profile" href="/people/someone/"></a>
          <h2>Lam Completely Different</h2><p class="title">Lecturer</p>
          <p class="email">ktlam@cse.cuhk.edu.hk</p></div>
        """
        report = subject.build_report(
            self.directory(), [self.config()], {self.config()["directoryUrl"]: html}
        )
        self.assertEqual(report["records"], [])

    def test_duplicate_affiliation_rows_do_not_make_exact_name_ambiguous(self):
        directory = self.directory()
        directory["people"][0]["affiliations"].append(
            directory["people"][0]["affiliations"][0]
        )
        html = """
        <div class="person"><a class="profile" href="/people/lam/"></a>
          <h2>King Tin Lam</h2><p class="title">Lecturer</p></div>
        """
        report = subject.build_report(
            directory, [self.config()], {self.config()["directoryUrl"]: html}
        )
        self.assertEqual(len(report["records"]), 1)

    def test_reads_css_background_photo_and_group_status(self):
        config = {
            **self.config(),
            "entrySelector": "article.person",
            "groupHeadingSelector": "h2",
            "imageSelector": ".photo",
            "imageAttribute": "style",
        }
        html = """
        <h2>Visiting Professors</h2>
        <article class="person"><a class="profile" href="/people/lam/"></a>
          <h2>King Tin Lam</h2><p class="title">Professor</p>
          <div class="photo" style="background-image:url('/images/lam.jpg')"></div>
        </article>
        """
        record = subject.parse_directory(html, config)[0]
        self.assertEqual(record["appointmentKind"], "visiting")
        self.assertEqual(record["imageUrl"], "https://dept.cuhk.edu.hk/images/lam.jpg")

    def test_pagination_allows_last_page_at_exact_limit(self):
        class Fetcher:
            def get(self, url):
                if url.endswith("/people/"):
                    return '<a class="next" href="/people/page/2/"></a>'
                return "<main>last page</main>"

        config = {
            **self.config(),
            "paginationSelector": "a.next",
            "maxPages": 2,
        }
        html = subject.fetch_directory_pages(config, Fetcher())
        self.assertIn("last page", html)

    def test_image_selector_is_optional(self):
        config = self.config()
        del config["imageSelector"]
        html = """
        <div class="person"><a class="profile" href="/people/lam/"></a>
          <h2>King Tin Lam</h2><p class="title">Lecturer</p></div>
        """
        self.assertIsNone(subject.parse_directory(html, config)[0]["imageUrl"])

    def test_roster_without_personal_links_is_valid_evidence(self):
        config = self.config()
        del config["linkSelector"]
        html = """
        <div class="person"><h2>King Tin Lam</h2>
          <p class="title">Lecturer</p></div>
        """
        self.assertIsNone(subject.parse_directory(html, config)[0]["profileUrl"])

    def test_reviewed_onclick_profile_link_is_supported_without_executing_js(self):
        config = {
            **self.config(),
            "entrySelector": ".person",
            "linkSelector": ":scope",
            "linkAttribute": "onclick",
        }
        html = """
        <div class="person" onclick="location.href='https://dept.cuhk.edu.hk/profile/lam/'">
          <h2>King Tin Lam</h2><p class="title">Lecturer</p>
        </div>
        """
        self.assertEqual(
            subject.parse_directory(html, config)[0]["profileUrl"],
            "https://dept.cuhk.edu.hk/profile/lam/",
        )
        malicious = subject.BeautifulSoup(
            '<a onclick="alert(1); location.href=\'https://dept.cuhk.edu.hk/x\'"></a>',
            "html.parser",
        ).a
        self.assertIsNone(subject.selected_link_value(malicious, "onclick"))

    def test_eltu_public_api_adapter(self):
        config = {
            **self.config(),
            "adapter": "eltu_people_api",
            "sourceUrl": "https://dept.cuhk.edu.hk/people/",
        }
        payload = json.dumps({"posts": [{
            "name": "Dr LAM King Tin",
            "listing_title": "Senior Lecturer",
            "mail": "ktlam@cuhk.edu.hk",
            "permalink": "https://dept.cuhk.edu.hk/people/lam/",
            "thumb_url": "https://dept.cuhk.edu.hk/lam.jpg",
        }]})
        record = subject.parse_directory(payload, config)[0]
        self.assertEqual(record["email"], "ktlam@cuhk.edu.hk")
        self.assertEqual(record["profileUrl"], "https://dept.cuhk.edu.hk/people/lam/")

    def test_ie_rest_adapter_excludes_in_memoriam_taxonomy(self):
        config = {
            **self.config(),
            "adapter": "ie_wordpress_rest",
            "excludedPersonnel": [164],
        }
        row = {
            "title": {"rendered": "LAM King Tin"},
            "content": {"rendered": "<div class='wp-block-columns'>Lecturer</div> ktlam [at] cuhk.edu.hk"},
            "link": "https://dept.cuhk.edu.hk/people/lam/",
            "personnel": [81],
            "uagb_featured_image_src": {"medium": ["https://dept.cuhk.edu.hk/lam.jpg"]},
        }
        records = subject.parse_directory(json.dumps([row, {**row, "personnel": [164]}]), config)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["title"], "Lecturer")
        self.assertEqual(records[0]["email"], "ktlam@cuhk.edu.hk")

    def test_ie_rest_adapter_excludes_pages_not_attached_to_the_roster(self):
        config = {
            **self.config(),
            "adapter": "ie_wordpress_rest",
            "excludedPersonnel": [164],
        }
        row = {
            "title": {"rendered": "LAM King Tin"},
            "content": {
                "rendered": "<div class='wp-block-columns'>Lecturer</div>"
            },
            "link": "https://dept.cuhk.edu.hk/people/lam/",
            "personnel": [81],
            "uagb_featured_image_src": {},
        }
        records = subject.parse_directory(
            json.dumps([
                row,
                {
                    **row,
                    "link": "https://dept.cuhk.edu.hk/people/old/",
                    "personnel": [],
                },
            ]),
            config,
        )
        self.assertEqual(
            [record["profileUrl"] for record in records],
            [row["link"]],
        )

    def test_reviewed_profiles_participate_in_department_matching(self):
        reviewed = [{
            "id": "profile:https://dept.cuhk.edu.hk/people/lam/",
            "canonicalName": "LAM King Tin",
            "profileUrl": "https://dept.cuhk.edu.hk/people/lam/",
            "organisationProfileUrl": (
                "https://research.cuhk.edu.hk/en/organisations/example/"
            ),
        }]
        directory = subject.include_reviewed_profiles({"people": []}, reviewed)
        report = subject.build_report(
            directory,
            [self.config()],
            {
                self.config()["directoryUrl"]: """
                <div class="person"><a class="profile" href="/people/lam/"></a>
                  <h2>King Tin Lam</h2><p class="title">Lecturer</p></div>
                """,
            },
        )
        self.assertEqual(report["records"][0]["personId"], reviewed[0]["id"])

    def test_table_cell_can_supply_name_and_title_by_text_position(self):
        config = {
            **self.config(),
            "nameSelector": ".data",
            "nameTextIndex": 0,
            "titleSelector": ".data",
            "titleTextIndex": 1,
            "emailSelector": ".data",
        }
        html = """
        <div class="person"><div class="data">LAM, King Tin 林景田<br>
          Lecturer<br>Email: ktlam@cuhk.edu.hk
          <a class="profile" href="/people/lam/">brief CV</a></div></div>
        """
        record = subject.parse_directory(html, config)[0]
        self.assertEqual(record["name"], "LAM, King Tin")
        self.assertEqual(record["title"], "Lecturer")

    def test_chinese_ajax_adapter_preserves_group_and_personal_page(self):
        config = {**self.config(), "adapter": "chi_teaching_ajax"}
        payload = json.dumps([{
            "title": "Prof. LAM King Tin",
            "position": "Professor",
            "emails": ["ktlam@cuhk.edu.hk"],
            "permalink": "https://dept.cuhk.edu.hk/profile/lam/",
            "photo": {"sizes": {"s": "https://dept.cuhk.edu.hk/lam.jpg"}},
            "_group": "honorary-professor-and-emeritus-professor",
        }])
        record = subject.parse_directory(payload, config)[0]
        self.assertEqual(record["appointmentKind"], "emeritus")
        self.assertEqual(record["profileUrl"], "https://dept.cuhk.edu.hk/profile/lam/")

    def test_filters_reviewed_placeholder_portrait(self):
        self.assertIsNone(subject.photo_url(
            "https://dept.cuhk.edu.hk/people/",
            "/placeholder-portrait-male-e1776937960820.png",
        ))

    def test_profile_hosts_are_config_allowlisted(self):
        config = {**self.config(), "allowedProfileHosts": ["dept.cuhk.edu.hk"]}
        html = """
        <div class="person"><a class="profile" href="https://other.cuhk.edu.hk/lam"></a>
          <h2>King Tin Lam</h2><p class="title">Lecturer</p></div>
        """
        self.assertIsNone(subject.parse_directory(html, config)[0]["profileUrl"])

    def test_coverage_inventory_has_no_dangling_config_references(self):
        root = Path(__file__).parent
        configs = json.loads(
            (root / "department-profile-sources.json").read_text(encoding="utf-8")
        )
        coverage = json.loads(
            (root / "department-profile-coverage.json").read_text(encoding="utf-8")
        )
        config_keys = {config["key"] for config in configs}
        units = [
            unit
            for faculty_units in coverage["faculties"].values()
            for unit in faculty_units
        ]
        referenced_keys = {
            key for unit in units for key in unit.get("sourceKeys", [])
        }
        self.assertEqual(referenced_keys - config_keys, set())
        self.assertEqual(
            {unit["status"] for unit in units}
            - set(coverage["statusLegend"]),
            set(),
        )
        self.assertGreaterEqual(len(units), 60)

    def test_profile_link_failure_marks_source_incomplete(self):
        class FailingFetcher:
            fetched_at = {}

            def get(self, _url):
                import requests
                raise requests.ConnectionError()

        report = {
            "scope": {"fresh": True, "completeSources": ["example"]},
            "sources": [{"key": "example", "complete": True}],
            "records": [{
                "source": "cuhk_department:example",
                "profileUrl": "https://dept.cuhk.edu.hk/people/lam/",
            }],
            "fetchErrors": [],
        }
        subject.verify_profile_links(report, FailingFetcher())
        self.assertEqual(report["records"][0]["profileStatus"], "failed")
        self.assertFalse(report["sources"][0]["complete"])
        self.assertEqual(report["scope"]["completeSources"], [])

    def test_unresolved_rows_still_emit_observed_lifecycle_keys(self):
        html = """
        <div class="person"><a class="profile" href="/people/unknown/"></a>
          <h2>Unknown Person</h2><p class="title">Visiting Professor</p></div>
        """
        report = subject.build_report(
            self.directory(), [self.config()], {self.config()["directoryUrl"]: html}
        )
        self.assertEqual(report["records"], [])
        self.assertEqual(
            report["sources"][0]["observedSourceKeys"],
            ["https://dept.cuhk.edu.hk/people/unknown"],
        )

    def test_directory_only_source_key_is_stable_without_person_id(self):
        record = {"name": "King Tin Lam", "email": None, "profileUrl": None}
        self.assertEqual(
            subject.source_identity_key(record, "example"),
            subject.source_identity_key(record, "example"),
        )


if __name__ == "__main__":
    unittest.main()
