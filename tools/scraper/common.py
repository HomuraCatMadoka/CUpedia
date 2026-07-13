"""Shared HTTP helpers for the CUHK course/handbook scrapers.

Isolated from the app: this package is not part of pnpm/CI/runtime (see
docs/adr/0005). It only writes JSON / raw HTML into ``scripts/data/`` for the
TS ingest scripts to consume.
"""

from __future__ import annotations

import time
from pathlib import Path

import requests

# repo_root/tools/scraper/common.py -> repo_root
REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "scripts" / "data"

UA = "Mozilla/5.0 (CUpedia course-tree scraper; contact: github.com/CU-Claw)"


def session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = UA
    return s


def get(s: requests.Session, url: str, *, referer: str | None = None, retries: int = 3) -> str:
    """GET with a polite delay and bounded retries; returns decoded text."""
    headers = {"Referer": referer} if referer else {}
    for attempt in range(retries):
        try:
            r = s.get(url, headers=headers, timeout=30)
            r.raise_for_status()
            return r.text
        except requests.RequestException:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))
    return ""


def ensure_data_dir(*parts: str) -> Path:
    d = DATA_DIR.joinpath(*parts)
    d.mkdir(parents=True, exist_ok=True)
    return d
