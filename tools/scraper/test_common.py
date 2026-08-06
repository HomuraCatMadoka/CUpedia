import subprocess
import unittest
from unittest.mock import Mock, patch

import requests

import common


class CommonHttpTest(unittest.TestCase):
    def test_html_without_declared_charset_uses_detected_encoding(self):
        response = Mock(
            encoding="ISO-8859-1",
            apparent_encoding="utf-8",
            headers={"content-type": "text/html"},
            text="official html",
        )
        session = Mock()
        session.get.return_value = response

        self.assertEqual(
            common.get(session, "https://dept.cuhk.edu.hk/people/"),
            "official html",
        )
        self.assertEqual(response.encoding, "utf-8")

    def test_ssl_failure_uses_verified_native_curl(self):
        session = Mock()
        session.get.side_effect = requests.exceptions.SSLError("bad chain")
        completed = subprocess.CompletedProcess([], 0, stdout=b"official html")

        with patch("common.subprocess.run", return_value=completed) as run:
            self.assertEqual(
                common.get(session, "https://dept.cuhk.edu.hk/people/"),
                "official html",
            )

        command = run.call_args.args[0]
        self.assertIn("--fail", command)
        self.assertIn("=https", command)
        self.assertNotIn("--insecure", command)
        run.assert_called_once_with(command, check=True, capture_output=True)

    def test_failed_native_curl_remains_a_requests_error(self):
        session = Mock()
        session.get.side_effect = requests.exceptions.SSLError("bad chain")
        failure = subprocess.CalledProcessError(35, ["curl"])

        with patch("common.subprocess.run", side_effect=failure):
            with self.assertRaises(requests.exceptions.SSLError):
                common.get(session, "https://dept.cuhk.edu.hk/people/")

    def test_curl_get_has_hard_limit_and_verified_protocol(self):
        completed = subprocess.CompletedProcess([], 0, stdout="建築".encode())
        with patch("common.subprocess.run", return_value=completed) as run:
            self.assertEqual(
                common.curl_get(
                    "https://dept.cuhk.edu.hk/people/",
                    retries=0,
                    max_seconds=17,
                ),
                "建築",
            )
        command = run.call_args.args[0]
        self.assertEqual(command[command.index("--max-time") + 1], "17")
        self.assertEqual(command[command.index("--retry") + 1], "0")
        self.assertIn("=https", command)
        self.assertNotIn("--insecure", command)


if __name__ == "__main__":
    unittest.main()
