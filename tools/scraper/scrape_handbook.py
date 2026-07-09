"""Harvest CUHK handbook major/minor study-scheme leaves as raw HTML.

The handbook is *not* captcha-gated. Each leaf renders in two steps (verified):

    1. GET document.aspx?id=N&tv=T&lang=en      (wrapper; sets the session cookie)
    2. GET view_document.aspx?id=N&seq=1&lang=en (Word-exported leaf HTML)

Step 2 returns a 40-byte "File not found" stub for unused ids, so we enumerate a
range and keep only leaves that look like a programme study scheme (a
"... Programme" heading plus a "Course List" roster table). Parsing is left to
the TS side (``src/lib/parseHandbookLeaf.ts``) — this script only stores HTML.

Usage:
    python scrape_handbook.py --start 1500 --end 1960
"""

from __future__ import annotations

import argparse

import common

BASE = "https://rgsntl.rgs.cuhk.edu.hk/aqs_prd_applx/Public/Handbook"


def fetch_leaf(s, doc_id: int) -> str | None:
    wrapper = f"{BASE}/document.aspx?id={doc_id}&tv=T&lang=en"
    common.get(s, wrapper)  # prime the session cookie
    html = common.get(s, f"{BASE}/view_document.aspx?id={doc_id}&seq=1&lang=en", referer=wrapper)
    if len(html) < 200 or "File not found" in html:
        return None
    return html


def is_study_scheme(html: str) -> bool:
    return "Programme" in html and "Course List" in html


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, default=1500)
    ap.add_argument("--end", type=int, default=1960)
    args = ap.parse_args()

    out = common.ensure_data_dir("handbook")
    s = common.session()
    kept = 0
    for doc_id in range(args.start, args.end + 1):
        html = fetch_leaf(s, doc_id)
        if not html or not is_study_scheme(html):
            continue
        (out / f"{doc_id}.html").write_text(html, encoding="utf-8")
        kept += 1
        print(f"  saved {doc_id}.html ({len(html)} bytes)")
    print(f"done: {kept} study-scheme leaves in {out}")


if __name__ == "__main__":
    main()
