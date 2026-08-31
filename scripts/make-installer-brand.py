"""Build NSIS icon and header assets from the desktop app logo."""
from __future__ import annotations

import runpy
import sys
from pathlib import Path

from PIL import Image


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: make-installer-brand.py SOURCE_PNG ICON_ICO HEADER_BMP")

    source, icon_path, header_path = (Path(value).resolve() for value in sys.argv[1:])
    helpers = runpy.run_path(str(Path(__file__).with_name("make-brand-icons.py")))
    raw = helpers["knock_neutral_black"](Image.open(source))
    wordmark = helpers["crop_alpha"](raw, pad=16)
    mark = helpers["crop_alpha"](helpers["top_mark"](wordmark, 0.55), pad=4)
    icon_layer = helpers["icon_layer"]

    icon_path.parent.mkdir(parents=True, exist_ok=True)
    helpers["write_ico"](icon_path, [icon_layer(mark, size) for size in helpers["ICO_SIZES"]])

    header_path.parent.mkdir(parents=True, exist_ok=True)
    header = Image.new("RGB", (150, 57), "white")
    symbol = icon_layer(mark, 48)
    header.paste(symbol, (98, 4), symbol)
    header.save(header_path, "BMP")

    print("installer brand source", source)
    print("wrote", icon_path)
    print("wrote", header_path)


if __name__ == "__main__":
    main()
