import unittest

import render_staff_directory_import as subject


class RenderStaffDirectoryImportTest(unittest.TestCase):
    def directory(self):
        faculty_url = "https://example.test/faculty/"
        centre_url = "https://example.test/centre/"
        return {
            "scope": {"mode": "full", "complete": True},
            "sourceFetchedAtRange": {
                "oldest": "2026-07-15T00:00:00Z",
                "newest": "2026-07-15T01:00:00Z",
            },
            "organisations": [
                {
                    "id": "faculty",
                    "name": "Faculty of Example",
                    "sourceUrl": faculty_url,
                    "organisationType": "faculty",
                    "parentUrl": None,
                    "facultyUrl": faculty_url,
                    "staffCoverage": {"complete": True, "expected": None, "scraped": 0},
                },
                {
                    "id": "office",
                    "name": "Office of Example",
                    "sourceUrl": "https://example.test/office/",
                    "organisationType": "office",
                    "parentUrl": None,
                    "facultyUrl": None,
                    "staffCoverage": {"complete": True, "expected": None, "scraped": 0},
                },
                {
                    "id": "centre",
                    "name": "Centre for Example",
                    "sourceUrl": centre_url,
                    "organisationType": "centre",
                    "parentUrl": faculty_url,
                    "facultyUrl": faculty_url,
                    "staffCoverage": {"complete": True, "expected": 1, "scraped": 1},
                },
            ],
            "people": [
                {
                    "id": "ada",
                    "externalId": "9cc21ee7-0fb4-43c8-a250-8e62ac6b86f2",
                    "name": "Professor Ada LOVELACE",
                    "profileUrl": "https://example.test/ada/",
                    "affiliations": [
                        {
                            "organisation": "Centre for Example",
                            "organisationUrl": centre_url,
                            "title": "Professor",
                        },
                        {
                            "organisation": "Centre for Example",
                            "organisationUrl": centre_url,
                            "title": "Director",
                        },
                    ],
                }
            ],
        }

    def test_payload_keeps_centres_and_multiple_titles(self):
        payload = subject.build_payload(self.directory())
        self.assertEqual(len(payload["organisations"]), 3)
        office = next(item for item in payload["organisations"] if item["id"] == "office")
        self.assertIsNone(office["faculty_id"])
        self.assertEqual(len(payload["people"]), 1)
        self.assertEqual(len(payload["affiliations"]), 1)
        self.assertEqual(
            [item["title"] for item in payload["titles"]],
            ["Director", "Professor"],
        )
        self.assertEqual(
            payload["person_sources"],
            [{
                "person_id": "pure:9cc21ee7-0fb4-43c8-a250-8e62ac6b86f2",
                "source": "cuhk_research_portal",
                "source_key": "9cc21ee7-0fb4-43c8-a250-8e62ac6b86f2",
                "profile_url": "https://example.test/ada/",
                "source_url": "https://example.test/ada/",
            }],
        )
        self.assertEqual(
            payload["managed_person_sources"],
            ["cuhk_research_portal", "reviewed_department_directory"],
        )

    def test_academic_staff_missing_from_timetable_joins_professor_catalog(self):
        payload = subject.build_payload(self.directory())

        self.assertEqual(
            payload["professor_catalog"],
            [{
                "id": "5380aaa494930fb4b64fa61c",
                "name": "Professor Ada LOVELACE",
                "search_text": "professor ada lovelace",
            }],
        )
        self.assertEqual(
            payload["professor_links"],
            [{
                "professor_id": "5380aaa494930fb4b64fa61c",
                "person_id": "pure:9cc21ee7-0fb4-43c8-a250-8e62ac6b86f2",
                "match_method": "automatic",
                "source_url": "https://example.test/ada/",
            }],
        )
        self.assertEqual(
            payload["managed_professor_ids"],
            ["5380aaa494930fb4b64fa61c"],
        )

    def test_professor_catalog_id_matches_timetable_normalization(self):
        self.assertEqual(
            subject.professor_catalog_id(" Prof.  CHAN Wing Kai, "),
            "5b9e8e2f887ab73d689406f6",
        )
        self.assertEqual(
            subject.professor_catalog_id(
                "Professor CHAN Wing Kai",
                "https://example.test/chan/",
            ),
            "889a8527faa46c7271515488",
        )

    def test_same_name_academic_staff_receive_distinct_profile_ids(self):
        people = [
            {
                "id": "ada-1",
                "canonical_name": "Professor Ada LOVELACE",
                "profile_url": "https://example.test/ada-1/",
            },
            {
                "id": "ada-2",
                "canonical_name": "Professor Ada LOVELACE",
                "profile_url": "https://example.test/ada-2/",
            },
        ]
        titles = [
            {"person_id": person["id"], "title": "Professor"}
            for person in people
        ]

        catalog, links = subject.build_staff_professor_catalog(
            people,
            titles,
            set(),
            {person["id"]: person["profile_url"] for person in people},
        )

        self.assertEqual(len(catalog), 2)
        self.assertEqual(len({item["id"] for item in catalog}), 2)
        self.assertEqual(len({item["professor_id"] for item in links}), 2)

    def test_non_academic_staff_does_not_join_professor_catalog(self):
        catalog, links = subject.build_staff_professor_catalog(
            [{
                "id": "director",
                "canonical_name": "Director Grace HOPPER",
                "profile_url": "https://example.test/grace/",
            }],
            [{
                "person_id": "director",
                "organisation_id": "centre",
                "title": "Director",
                "source_url": "https://example.test/grace/",
            }],
            set(),
            {"director": "https://example.test/grace/"},
        )

        self.assertEqual(catalog, [])
        self.assertEqual(links, [])

    def test_sql_uses_two_run_inactivation(self):
        sql = subject.render_sql(subject.build_payload(self.directory()))
        self.assertIn("missing_runs + 1 < 2", sql)
        self.assertIn("insert into staff_person_sources", sql)
        self.assertIn("update staff_person_sources", sql)
        self.assertIn("payload->'managed_person_sources'", sql)
        self.assertNotIn(
            "where person_source.source = 'cuhk_research_portal'", sql
        )
        self.assertIn("source identity key belongs to another person", sql)
        self.assertNotIn("person_id = excluded.person_id", sql)
        self.assertIn("update staff_organisations", sql)
        self.assertIn("update staff_people", sql)
        self.assertIn("update course_offering_instructors", sql)
        self.assertIn("offering.match_status <> 'manual'", sql)

    def test_sql_rejects_replayed_or_stale_snapshot_before_mutation(self):
        sql = subject.render_sql(subject.build_payload(self.directory()))

        lock_position = sql.index("pg_advisory_xact_lock")
        guard_position = sql.index("Staff directory snapshot is not newer")
        people_insert_position = sql.index("insert into staff_people")
        self.assertLess(lock_position, guard_position)
        self.assertLess(guard_position, people_insert_position)
        self.assertIn(
            "person_source.last_seen_at >= snapshot_observed_at", sql
        )
        self.assertIn(
            "organisation.last_seen_at >= snapshot_observed_at", sql
        )

    def test_sql_scopes_alias_cleanup_and_offering_reset_to_import(self):
        sql = subject.render_sql(subject.build_payload(self.directory()))
        self.assertIn("payload->'managed_alias_sources'", sql)
        self.assertNotIn(
            "where source in ('cuhk_research_portal', 'reviewed_manual_override')",
            sql,
        )
        self.assertIn("create temp table _staff_managed_people", sql)
        self.assertIn("offering.person_id = managed.person_id", sql)
        self.assertNotIn("where match_status <> 'manual';", sql)

    def test_rejects_partial_directory(self):
        directory = self.directory()
        directory["scope"]["mode"] = "preview"
        with self.assertRaisesRegex(ValueError, "non-full"):
            subject.build_payload(directory)

    def test_rejects_incomplete_full_directory(self):
        directory = self.directory()
        directory["scope"]["complete"] = False
        with self.assertRaisesRegex(ValueError, "incomplete"):
            subject.build_payload(directory)

    def test_reviewed_alias_reuses_official_person(self):
        payload = subject.build_payload(
            self.directory(),
            [{
                "profileUrl": "https://example.test/ada/",
                "alias": "Professor Augusta Ada KING",
                "evidenceUrl": "https://example.test/course-outline",
            }],
        )

        alias = next(
            item for item in payload["aliases"]
            if item["alias"] == "Professor Augusta Ada KING"
        )
        self.assertEqual(
            alias["person_id"],
            "pure:9cc21ee7-0fb4-43c8-a250-8e62ac6b86f2",
        )
        self.assertEqual(alias["source"], "reviewed_manual_override")
        self.assertEqual(
            alias["evidence_url"],
            "https://example.test/course-outline",
        )

    def test_sql_replaces_managed_aliases_and_reapplies_manual_evidence(self):
        sql = subject.render_sql(subject.build_payload(self.directory()))
        self.assertIn("delete from staff_aliases", sql)
        self.assertIn("payload->'managed_alias_sources'", sql)
        self.assertIn("alias.source = 'reviewed_manual_override'", sql)
        self.assertIn("evidence_url = alias.evidence_url", sql)

    def test_unique_normalized_name_creates_professor_identity(self):
        payload = subject.build_payload(
            self.directory(),
            professors=[{"id": "prof-1", "name": "Ada LOVELACE"}],
        )

        self.assertEqual(
            payload["professor_links"],
            [{
                "professor_id": "prof-1",
                "person_id": "pure:9cc21ee7-0fb4-43c8-a250-8e62ac6b86f2",
                "match_method": "automatic",
                "source_url": "https://example.test/ada/",
            }],
        )

    def test_ambiguous_normalized_name_is_not_linked(self):
        directory = self.directory()
        directory["people"].append({
            "id": "other-ada",
            "externalId": "2cb2c1ef-7772-47c2-8125-6e0739f537b1",
            "name": "Professor Ada LOVELACE",
            "profileUrl": "https://example.test/other-ada/",
            "affiliations": [],
        })

        with self.assertRaisesRegex(ValueError, "no automatic identity links"):
            subject.build_payload(
                directory,
                professors=[{"id": "prof-1", "name": "Dr Ada LOVELACE"}],
            )

    def test_reviewed_alias_creates_manual_identity_with_evidence(self):
        payload = subject.build_payload(
            self.directory(),
            reviewed_aliases=[{
                "profileUrl": "https://example.test/ada/",
                "alias": "Professor Augusta Ada KING",
                "evidenceUrl": "https://example.test/course-outline",
            }],
            professors=[{
                "id": "prof-1",
                "name": "Professor Augusta Ada KING",
            }],
        )

        self.assertEqual(
            payload["professor_links"][0]["match_method"],
            "manual_override",
        )
        self.assertEqual(
            payload["professor_links"][0]["source_url"],
            "https://example.test/course-outline",
        )

    def test_reviewed_person_creates_official_identity_and_affiliation(self):
        payload = subject.build_payload(
            self.directory(),
            professors=[{"id": "prof-1", "name": "Dr Grace HOPPER"}],
            reviewed_people=[{
                "id": "profile:https://department.example/grace/",
                "canonicalName": "HOPPER Grace",
                "profileUrl": "https://department.example/grace/",
                "sourceUrl": "https://department.example/grace/",
                "organisationProfileUrl": "https://example.test/centre/",
                "title": "Lecturer",
                "aliases": [
                    {
                        "alias": "HOPPER Grace",
                        "evidenceUrl": "https://department.example/grace/",
                    },
                    {
                        "alias": "Dr Grace HOPPER",
                        "evidenceUrl": "https://department.example/grace/",
                    },
                ],
            }],
        )

        person = next(
            item for item in payload["people"]
            if item["id"] == "profile:https://department.example/grace/"
        )
        self.assertEqual(person["source"], "reviewed_department_directory")
        self.assertEqual(person["identity_kind"], "official")
        self.assertEqual(
            sum(
                item["person_id"] == person["id"]
                and item["alias"] == "HOPPER Grace"
                for item in payload["aliases"]
            ),
            1,
        )
        self.assertIn(
            {
                "person_id": person["id"],
                "organisation_id": "centre",
                "source_url": "https://department.example/grace/",
            },
            payload["affiliations"],
        )
        self.assertIn(
            {
                "professor_id": "prof-1",
                "person_id": person["id"],
                "match_method": "manual_override",
                "source_url": "https://department.example/grace/",
            },
            payload["professor_links"],
        )

    def test_reviewed_person_rejects_existing_profile(self):
        with self.assertRaisesRegex(ValueError, "profile already belongs"):
            subject.build_payload(
                self.directory(),
                reviewed_people=[{
                    "id": "duplicate",
                    "canonicalName": "Duplicate Ada",
                    "profileUrl": "https://example.test/ada/",
                    "sourceUrl": "https://example.test/ada/",
                    "organisationProfileUrl": "https://example.test/centre/",
                    "title": "Lecturer",
                    "aliases": [],
                }],
            )

    def test_reviewed_person_rejects_empty_source_key(self):
        reviewed = {
            "id": "reviewed:grace",
            "canonicalName": "HOPPER Grace",
            "sourceKey": "",
            "profileUrl": None,
            "sourceUrl": "https://department.example/roster.pdf",
            "organisationProfileUrl": "https://example.test/centre/",
            "title": "Instructor",
            "aliases": [],
        }
        with self.assertRaisesRegex(ValueError, "source key"):
            subject.build_payload(self.directory(), reviewed_people=[reviewed])

    def test_reviewed_person_allows_null_profile_with_explicit_id(self):
        payload = subject.build_payload(
            self.directory(),
            reviewed_people=[{
                "id": "reviewed:cuhk-email:grace@example.test",
                "canonicalName": "HOPPER Grace",
                "profileUrl": None,
                "sourceUrl": "https://department.example/roster.pdf",
                "organisationProfileUrl": "https://example.test/centre/",
                "title": "Instructor",
                "aliases": [],
            }],
        )

        person = next(
            item for item in payload["people"]
            if item["id"] == "reviewed:cuhk-email:grace@example.test"
        )
        self.assertIsNone(person["profile_url"])
        source = next(
            item for item in payload["person_sources"]
            if item["person_id"] == person["id"]
        )
        self.assertEqual(source["source"], "reviewed_department_directory")
        self.assertEqual(source["source_key"], person["id"])
        self.assertEqual(source["source_url"], "https://department.example/roster.pdf")
        link = next(
            item for item in payload["professor_links"]
            if item["person_id"] == person["id"]
        )
        self.assertEqual(link["source_url"], "https://department.example/roster.pdf")

    def test_directory_identity_sql_replaces_automatic_and_preserves_manual(self):
        payload = subject.build_payload(
            self.directory(),
            professors=[
                {"id": "prof-1", "name": "LOVELACE Ada"},
                {"id": "prof-unmatched", "name": "Unknown Person"},
            ],
        )
        sql = subject.render_sql(payload)

        self.assertEqual(
            payload["managed_professor_ids"],
            ["prof-1", "prof-unmatched"],
        )
        self.assertIn("delete from professor_staff_identities", sql)
        self.assertIn("where identity.match_method = 'automatic'", sql)
        self.assertIn("payload->'managed_professor_ids'", sql)
        self.assertIn("payload->'professor_links'", sql)
        self.assertIn("on conflict (professor_id) do nothing", sql)
        self.assertNotIn("where match_method = 'manual_override'", sql)

    def test_staff_catalog_is_inserted_before_its_identity(self):
        sql = subject.render_sql(subject.build_payload(self.directory()))

        professor_position = sql.index("insert into professors")
        identity_position = sql.index("insert into professor_staff_identities")
        instructor_position = sql.index("insert into course_instructors")
        self.assertLess(professor_position, identity_position)
        self.assertLess(identity_position, instructor_position)
        self.assertIn("payload->'professor_catalog'", sql)
        self.assertIn("payload->'professor_links'", sql)

    def test_professor_identity_syncs_canonical_instructor_references(self):
        sql = subject.render_sql(subject.build_payload(self.directory()))

        self.assertIn("insert into course_instructors (person_id)", sql)
        self.assertIn("update professor_courses course", sql)
        self.assertIn("update course_ratings rating", sql)
        self.assertIn("update course_rating_professors selected", sql)
        self.assertIn("update course_reviews review", sql)
        self.assertEqual(sql.count("is distinct from identity.person_id"), 4)

    def test_standalone_identity_sql_is_transactional(self):
        payload = subject.build_payload(
            self.directory(),
            professors=[{"id": "prof-1", "name": "Ada LOVELACE"}],
        )
        sql = subject.render_professor_identity_backfill_sql(
            payload["professor_links"]
        )

        self.assertIn("begin;", sql)
        self.assertIn("commit;", sql)
        self.assertIn("where match_method = 'automatic'", sql)
        self.assertIn("on conflict (professor_id) do nothing", sql)


if __name__ == "__main__":
    unittest.main()
