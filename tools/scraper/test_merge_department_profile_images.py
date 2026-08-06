import json
import unittest

import merge_department_profile_images as subject


class MergeDepartmentProfileImagesTest(unittest.TestCase):
    def snapshot(self, image_url=None):
        payload = {
            "person_sources": [{
                "person_id": "pure:1",
                "source": "cuhk_department:example",
                "source_key": "https://dept.cuhk.edu.hk/people/lam",
                "profile_url": "https://dept.cuhk.edu.hk/people/lam",
                "profile_verified_at": "2026-08-05T00:00:00+00:00",
                "image_url": image_url,
            }]
        }
        encoded = json.dumps(payload, separators=(",", ":"))
        return (
            "insert into x(payload)\nvalues ($department_profiles$"
            + encoded
            + "$department_profiles$::jsonb);\n"
        )

    def report(self):
        return {
            "scope": {
                "fresh": True,
                "requestedSources": ["example"],
                "completeSources": ["example"],
            },
            "records": [{
                "personId": "pure:1",
                "source": "cuhk_department:example",
                "sourceKey": "https://dept.cuhk.edu.hk/people/lam",
                "profileStatus": "verified",
                "profileUrl": "https://dept.cuhk.edu.hk/people/lam",
                "imageUrl": "https://dept.cuhk.edu.hk/images/lam.jpg",
            }],
            "sourceErrors": [],
            "fetchErrors": [],
        }

    def test_adds_verified_portrait_without_changing_snapshot_shape(self):
        snapshot = self.snapshot()
        merged, count = subject.merge_images(snapshot, self.report())
        self.assertEqual(count, 1)
        self.assertIn('"image_url":"https://dept.cuhk.edu.hk/images/lam.jpg"', merged)
        self.assertTrue(merged.startswith("insert into x(payload)"))
        before = json.loads(snapshot.split(subject.MARKER_START, 1)[1].split(subject.MARKER_END, 1)[0])
        after = json.loads(merged.split(subject.MARKER_START, 1)[1].split(subject.MARKER_END, 1)[0])
        before["person_sources"][0]["image_url"] = after["person_sources"][0]["image_url"]
        self.assertEqual(before, after)

    def test_rejects_overwriting_an_existing_portrait(self):
        with self.assertRaisesRegex(ValueError, "overwrite"):
            subject.merge_images(
                self.snapshot("https://dept.cuhk.edu.hk/images/old.jpg"),
                self.report(),
            )

    def test_rejects_unknown_or_unverified_identity(self):
        report = self.report()
        report["records"][0]["personId"] = "pure:other"
        with self.assertRaisesRegex(ValueError, "absent"):
            subject.merge_images(self.snapshot(), report)
        report = self.report()
        report["records"][0]["profileStatus"] = "failed"
        with self.assertRaisesRegex(ValueError, "unverified"):
            subject.merge_images(self.snapshot(), report)

    def test_rejects_stale_incomplete_or_errored_report(self):
        for mutation in ("stale", "incomplete", "errored"):
            report = self.report()
            if mutation == "stale":
                report["scope"]["fresh"] = False
            elif mutation == "incomplete":
                report["scope"]["completeSources"] = []
            else:
                report["fetchErrors"] = [{"sourceKey": "example"}]
            with self.assertRaises(ValueError):
                subject.merge_images(self.snapshot(), report)

    def test_rejects_out_of_scope_or_unverified_baseline(self):
        report = self.report()
        report["records"][0]["source"] = "cuhk_department:other"
        with self.assertRaisesRegex(ValueError, "outside"):
            subject.merge_images(self.snapshot(), report)

        payload = json.loads(self.snapshot().split(subject.MARKER_START, 1)[1].split(subject.MARKER_END, 1)[0])
        payload["person_sources"][0]["profile_verified_at"] = None
        snapshot = (
            "insert into x(payload)\n"
            + subject.MARKER_START
            + json.dumps(payload, separators=(",", ":"))
            + subject.MARKER_END
            + "\n"
        )
        with self.assertRaisesRegex(ValueError, "not verified"):
            subject.merge_images(snapshot, self.report())

    def test_rejects_profile_mismatch_and_sql_delimiter(self):
        report = self.report()
        report["records"][0]["profileUrl"] = "https://dept.cuhk.edu.hk/people/other"
        with self.assertRaisesRegex(ValueError, "does not match"):
            subject.merge_images(self.snapshot(), report)

        report = self.report()
        report["records"][0]["imageUrl"] = (
            "https://dept.cuhk.edu.hk/images/$department_profiles$.jpg"
        )
        with self.assertRaisesRegex(ValueError, "dollar-quote"):
            subject.merge_images(self.snapshot(), report)
