#!/usr/bin/env python3
"""Validate the committed PWA icon files."""

from pathlib import Path
import sys

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
EXPECTED = {
    "icon-192.png": (192, 192),
    "icon-512.png": (512, 512),
}


def main() -> int:
    errors: list[str] = []
    for filename, dimensions in EXPECTED.items():
        path = ROOT / filename
        if not path.is_file():
            errors.append(f"{filename} is missing")
            continue

        try:
            with Image.open(path) as image:
                image.verify()
            with Image.open(path) as image:
                if image.size != dimensions:
                    errors.append(
                        f"{filename} is {image.size}, expected {dimensions}"
                    )
        except Exception as error:
            errors.append(f"{filename} is invalid: {error}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print("All committed PWA icons are valid and correctly sized.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
