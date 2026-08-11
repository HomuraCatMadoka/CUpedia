"""Regenerate Pin Me canteen QR codes as takeout links (no shared table).

Usage:
  python scripts/regen-canteen-qr.py
"""

from __future__ import annotations

from pathlib import Path

import qrcode
from PIL import Image
from pyzbar.pyzbar import decode

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "assets" / "canteen-qr"

# /store/{id}/table/1 + all_share_table shares one cart across scanners.
# Takeout entry lands on store home without table binding.
TARGETS = {
    "ws-can": "https://meal.pin2eat.com/store/4898/takeout",
    "uc-can": "https://meal.pin2eat.com/store/5198/takeout",
    "na-can": "https://meal.pin2eat.com/store/5500/takeout",
}


def main() -> None:
    for name, url in TARGETS.items():
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=16,
            border=2,
        )
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        img = img.resize((1024, 1024), Image.Resampling.NEAREST)
        path = OUT_DIR / f"{name}.png"
        img.save(path, format="PNG", optimize=True)
        decoded = [d.data.decode() for d in decode(Image.open(path))]
        print(f"{name}: {path.name} -> {decoded}")


if __name__ == "__main__":
    main()
