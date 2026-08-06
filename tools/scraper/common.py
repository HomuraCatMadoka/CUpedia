"""Shared HTTP helpers for the CUHK course/handbook scrapers.

Isolated from the app: this package is not part of pnpm/CI/runtime (see
docs/adr/0005). It only writes JSON / raw HTML into ``scripts/data/`` for the
TS ingest scripts to consume.
"""

from __future__ import annotations

import subprocess
import time
from pathlib import Path

import requests
from charset_normalizer import from_bytes

# repo_root/tools/scraper/common.py -> repo_root
REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "scripts" / "data"

UA = "Mozilla/5.0 (CUpedia course-tree scraper; contact: github.com/CU-Claw)"


def session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = UA
    return s


def curl_get(
    url: str,
    *,
    referer: str | None = None,
    retries: int = 1,
    max_seconds: int = 30,
) -> str:
    """Fetch public HTML with a hard wall-clock limit and verified HTTPS."""
    command = [
        "curl",
        "--fail",
        "--silent",
        "--show-error",
        "--location",
        "--max-time",
        str(max_seconds),
        "--retry",
        str(retries),
        "--retry-all-errors",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        "--user-agent",
        UA,
    ]
    if referer:
        command.extend(["--referer", referer])
    command.extend(["--", url])
    try:
        content = subprocess.run(
            command,
            check=True,
            capture_output=True,
            timeout=max_seconds * (retries + 1) + 5,
        ).stdout
    except (OSError, subprocess.SubprocessError) as error:
        raise requests.ConnectionError("Verified native curl failed") from error
    detected = from_bytes(content).best()
    return str(detected) if detected is not None else content.decode("utf-8", errors="replace")


def get(s: requests.Session, url: str, *, referer: str | None = None, retries: int = 3) -> str:
    """GET with a polite delay and bounded retries; returns decoded text."""
    headers = {"Referer": referer} if referer else {}
    for attempt in range(retries):
        try:
            r = s.get(url, headers=headers, timeout=30)
            r.raise_for_status()
            if (
                r.encoding == "ISO-8859-1"
                and "charset=" not in r.headers.get("content-type", "").casefold()
            ):
                r.encoding = r.apparent_encoding
            return r.text
        except requests.exceptions.SSLError as error:
            try:
                return curl_get(url, referer=referer, retries=2)
            except requests.RequestException as curl_error:
                raise error from curl_error
        except requests.RequestException:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))
    return ""


def ensure_data_dir(*parts: str) -> Path:
    d = DATA_DIR.joinpath(*parts)
    d.mkdir(parents=True, exist_ok=True)
    return d
