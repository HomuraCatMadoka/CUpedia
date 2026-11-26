"""Read-only, bounded HTTPS probes of the three public CUpedia pages."""

from dataclasses import dataclass, field
from html.parser import HTMLParser
import json
import re
import subprocess
import unicodedata


ORIGIN = "https://cupedia.org"
SITES = {
    "home": ("/", "CUpedia", None),
    "course": (
        "/courses/PHYS1111",
        "PHYS 1111",
        "Introduction to Mechanics, Fluids, and Waves (University Physics I)",
    ),
    "wiki": ("/wiki/2c8e15de-d09a-4e6d-b739-d8f20d84cfc6", "体育", "羽毛球"),
}
MAX_BODY = 4 * 1024 * 1024
MAX_HEADERS = 64 * 1024
MAX_CAPTURE = MAX_BODY + MAX_HEADERS
STATUS_LINE = re.compile(rb"HTTP/\d(?:\.\d)? ([1-5]\d{2})(?: [^\r\n]*)?")
SEGMENT_REVEAL = re.compile(
    r"""\$(RC|RR|RS)\(\s*["']([\w:.-]{1,72})["']\s*,\s*["']([\w:.-]{1,72})["']"""
)
SEGMENT_ID = re.compile(r"[\w:.-]*S:[0-9a-f]+$", re.ASCII)
HIDDEN_STYLE = re.compile(r"(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b", re.I)
IGNORED_TAGS = {"head", "script", "style", "template", "noscript", "svg"}
VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}
TLS_FAILURES = {35, 51, 58, 59, 60, 77, 82, 83, 90, 91}


def _normalized(text):
    text = unicodedata.normalize("NFC", text)
    return " ".join(text.translate({0x200B: None, 0xFEFF: None}).split())


class _ReactSegments(HTMLParser):
    """Find actual HTML segments revealed by React's inline stream instructions."""

    def __init__(self):
        super().__init__()
        self.in_script = False
        self.revealed = set()

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.in_script = True

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_script = False

    def handle_data(self, data):
        if not self.in_script or not data.lstrip().startswith(("$", "requestAnimationFrame(")):
            return
        for op, before, after in SEGMENT_REVEAL.findall(data):
            segment = before if op == "RS" else after
            if SEGMENT_ID.fullmatch(segment):
                self.revealed.add(segment)


@dataclass
class _Frame:
    tag: str
    hidden: bool
    capture: str | None
    text: list[str] = field(default_factory=list)


class _VisibleContent(HTMLParser):
    def __init__(self, revealed):
        super().__init__()
        self.revealed = revealed
        self.stack = []
        self.values = {"heading": [], "paragraph": [], "wiki_block": []}
        self.is_error = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        element_id = attrs.get("id")
        if (
            element_id == "__next_error__"
            or "data-next-error-digest" in attrs
            or attrs.get("data-testid") == "wiki-page-tombstone"
        ):
            self.is_error = True

        inherited_hidden = self.stack[-1].hidden if self.stack else False
        hidden = (
            inherited_hidden
            or tag in IGNORED_TAGS
            or attrs.get("aria-hidden") == "true"
            or ("hidden" in attrs and element_id not in self.revealed)
            or bool(HIDDEN_STYLE.search(attrs.get("style") or ""))
        )
        if tag in VOID_TAGS:
            if tag == "br" and not hidden:
                self.handle_data(" ")
            return

        capture = {"h1": "heading", "p": "paragraph"}.get(tag)
        if attrs.get("data-slate-node") == "element" and tag != "h1":
            capture = "wiki_block"
        self.stack.append(_Frame(tag, hidden, None if hidden else capture))

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index].tag == tag:
                while len(self.stack) > index:
                    self._finish()
                return

    def handle_data(self, data):
        if self.stack and self.stack[-1].hidden:
            return
        for frame in self.stack:
            if frame.capture:
                frame.text.append(data)

    def _finish(self):
        frame = self.stack.pop()
        if frame.capture:
            self.values[frame.capture].append(_normalized("".join(frame.text)))

    def close(self):
        super().close()
        while self.stack:
            self._finish()


def _content_reason(site, body):
    # Reject malformed encoding rather than matching text in a damaged response.
    try:
        source = body.decode("utf-8")
    except UnicodeDecodeError:
        return "invalid_encoding"
    segments = _ReactSegments()
    segments.feed(source)
    segments.close()
    visible = _VisibleContent(segments.revealed)
    visible.feed(source)
    visible.close()

    _, heading, body_marker = SITES[site]
    if visible.is_error:
        return "error_page"
    if heading not in visible.values["heading"]:
        return "heading_missing"
    if site == "course" and body_marker not in visible.values["paragraph"]:
        return "course_content_missing"
    if site == "wiki" and not any(body_marker in block for block in visible.values["wiki_block"]):
        return "wiki_content_missing"
    return "ok"


def _parse_response(data):
    """Parse curl's included headers, including any HTTP interim response."""
    cursor = 0
    while True:
        header_end = data.find(b"\r\n\r\n", cursor, MAX_HEADERS)
        if header_end < 0:
            return None, None, b""
        lines = data[cursor:header_end].split(b"\r\n")
        status_line = STATUS_LINE.fullmatch(lines[0])
        if not status_line:
            return None, None, b""
        status = int(status_line[1])
        cursor = header_end + 4
        if status >= 200:
            break
    content_type = None
    for line in lines[1:]:
        key, _, value = line.partition(b":")
        if key.lower() == b"content-type":
            content_type = value.split(b";", 1)[0].strip().lower()
            break
    return status, content_type, data[cursor:]


def _fetch(path):
    command = [
        "curl", "--disable", "--silent", "--show-error", "--proto", "=https",
        "--connect-timeout", "5", "--max-time", "12", "--max-filesize", str(MAX_BODY),
        "--compressed", "--suppress-connect-headers", "--include",
        "--header", "Accept: text/html",
        "--header", "Cache-Control: no-cache",
        "--user-agent", "CUpedia availability monitor",
        "--", ORIGIN + path,
    ]
    try:
        with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as proc:
            # curl limits transfer size; also limit the decoded bytes read from
            # its pipe, including chunked responses and compressed inputs.
            data = proc.stdout.read(MAX_CAPTURE + 1)
            if len(data) > MAX_CAPTURE:
                proc.kill()
                proc.wait()
                return data, "response_too_large"
            try:
                code = proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
                return data, "timeout"
    except FileNotFoundError:
        return b"", "curl_unavailable"
    except OSError:
        return b"", "probe_error"

    if code == 0:
        return data, None
    if code == 28:
        return data, "timeout"
    if code == 63:
        return data, "response_too_large"
    if code in TLS_FAILURES:
        return data, "tls_error"
    return data, "network_error"


def _check(site):
    data, error = _fetch(SITES[site][0])
    status, content_type, body = _parse_response(data)
    if error:
        reason = error
    elif status is None:
        reason = "invalid_response"
    elif status != 200:
        reason = "unexpected_status"
    elif content_type != b"text/html":
        reason = "unexpected_content_type"
    elif len(body) > MAX_BODY:
        reason = "response_too_large"
    else:
        reason = _content_reason(site, body)
    return {"ok": reason == "ok", "statusCode": status, "reason": reason}


def check_sites():
    """Return only the status, verdict, and bounded reason for each known route."""
    return {site: _check(site) for site in SITES}


if __name__ == "__main__":
    results = check_sites()
    print(json.dumps(results, separators=(",", ":")))
    raise SystemExit(0 if all(result["ok"] for result in results.values()) else 1)
