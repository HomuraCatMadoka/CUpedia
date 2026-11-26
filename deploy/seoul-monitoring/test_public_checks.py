import unittest
from unittest.mock import patch

import public_checks as checks


def response(body, status=200, content_type="text/html; charset=utf-8", interim=False):
    headers = f"HTTP/2 {status}\r\nContent-Type: {content_type}\r\n\r\n".encode()
    if interim:
        headers = b"HTTP/2 103\r\nLink: </app.css>; rel=preload\r\n\r\n" + headers
    return headers + body.encode("utf-8")


COURSE_TITLE = checks.SITES["course"][2]
WIKI_BODY = '<div data-slate-node="element"><span>羽</span><span>毛球</span></div>'


class PublicContentTests(unittest.TestCase):
    def test_uses_headers_and_visible_content_for_all_three(self):
        replies = {
            "/": response("<main><h1>CUpedia</h1></main>", interim=True),
            checks.SITES["course"][0]: response(
                f"<h1>PHYS&nbsp;1111</h1><p>{COURSE_TITLE}</p>"
            ),
            checks.SITES["wiki"][0]: response(f"<h1>体育</h1>{WIKI_BODY}"),
        }
        with patch.object(checks, "_fetch", side_effect=lambda path: (replies[path], None)):
            self.assertEqual(
                checks.check_sites(),
                {key: {"ok": True, "statusCode": 200, "reason": "ok"} for key in checks.SITES},
            )

    def test_ignores_titles_and_markers_in_head_comments_scripts_and_templates(self):
        fake_heading = "<h1>CUpedia</h1>"
        source = (
            f"<head>{fake_heading}</head><!-- {fake_heading} -->"
            f"<script>self.__next_f.push([1,'{fake_heading}']);</script>"
            f"<template>{fake_heading}</template>"
        )
        self.assertEqual(checks._content_reason("home", source.encode()), "heading_missing")

    def test_requires_exact_rendered_course_paragraph(self):
        source = f"<h1>PHYS 1111</h1><script>{COURSE_TITLE}</script><p>{COURSE_TITLE} (placeholder)</p>"
        self.assertEqual(checks._content_reason("course", source.encode()), "course_content_missing")

    def test_requires_rendered_slate_block_and_rejects_tombstone(self):
        for source in (
            f"<h1>体育</h1><script>{WIKI_BODY}</script>",
            f"<h1>体育</h1><section hidden>{WIKI_BODY}</section>",
            f'<h1>体育</h1><section style="display:none">{WIKI_BODY}</section>',
            "<h1>体育</h1><nav>羽毛球</nav>",
        ):
            self.assertEqual(checks._content_reason("wiki", source.encode()), "wiki_content_missing")
        source = f'<main data-testid="wiki-page-tombstone"><h1>体育</h1>{WIKI_BODY}</main>'
        self.assertEqual(checks._content_reason("wiki", source.encode()), "error_page")

    def test_recognizes_react_streamed_markup_with_long_style_data(self):
        styles = "a" * 400
        source = (
            f'<div hidden id="app-S:2"><h1>体育</h1>{WIKI_BODY}</div>'
            f'<script>$RR("app-B:2","app-S:2",["{styles}"])</script>'
        )
        self.assertEqual(checks._content_reason("wiki", source.encode()), "ok")
        for op, before, after in (("RC", "B:2", "S:2"), ("RS", "S:2", "P:2")):
            markup = f'<div hidden id="S:2"><h1>体育</h1>{WIKI_BODY}</div>'
            script = '<script>$' + f'{op}("{before}","{after}")</script>'
            self.assertEqual(checks._content_reason("wiki", (markup + script).encode()), "ok")

    def test_returns_only_sanitized_failures(self):
        cases = [
            (response("<h1>CUpedia</h1>", status=302), None, 302, "unexpected_status"),
            (response("<h1>CUpedia</h1>", content_type="application/json"), None, 200, "unexpected_content_type"),
            (response("<h1>CUpedia</h1>"), "timeout", 200, "timeout"),
            (b"", "tls_error", None, "tls_error"),
            (b"invalid header", None, None, "invalid_response"),
            (response("") + b"\xff", None, 200, "invalid_encoding"),
        ]
        for data, transport_reason, status, reason in cases:
            with self.subTest(reason=reason), patch.object(checks, "_fetch", return_value=(data, transport_reason)):
                self.assertEqual(
                    checks._check("home"),
                    {"ok": False, "statusCode": status, "reason": reason},
                )

    def test_caps_body_even_with_shorter_headers(self):
        with (
            patch.object(checks, "MAX_BODY", 20),
            patch.object(checks, "_fetch", return_value=(response("x" * 21), None)),
        ):
            self.assertEqual(checks._check("home"), {"ok": False, "statusCode": 200, "reason": "response_too_large"})


if __name__ == "__main__":
    unittest.main()
