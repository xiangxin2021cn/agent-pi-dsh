"""Build in-app wordmark + a real Windows ICO from AgentPI-logo-2.png."""
from __future__ import annotations

import struct
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "AgentPI-logo-2.png"
if not SRC.exists():
    SRC = ROOT / "apps" / "desktop" / "brand" / "app-logo.png"

DESKTOP = ROOT / "apps" / "desktop"
BRAND_WEB = ROOT / "bundles" / "tender-web" / "lib" / "brand"
BUILD = DESKTOP / "build"
DESKTOP_BRAND = DESKTOP / "brand"

ICO_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)


def knock_neutral_black(im: Image.Image) -> Image.Image:
    """Clear near-black / near-gray backdrop without eating navy logo ink."""
    out = im.convert("RGBA")
    pixels = out.load()
    width, height = out.size
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha < 8:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            hi, lo = max(red, green, blue), min(red, green, blue)
            if hi < 22 or (hi < 40 and (hi - lo) < 10):
                pixels[x, y] = (0, 0, 0, 0)
    return out


def crop_alpha(im: Image.Image, pad: int = 8) -> Image.Image:
    bbox = im.getbbox(alpha_only=True)
    if not bbox:
        return im
    left, top, right, bottom = bbox
    return im.crop((
        max(0, left - pad),
        max(0, top - pad),
        min(im.width, right + pad),
        min(im.height, bottom + pad),
    ))


def square_pad(im: Image.Image) -> Image.Image:
    side = max(im.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    return canvas


def top_mark(im: Image.Image, fraction: float = 0.55) -> Image.Image:
    height = max(1, int(im.height * fraction))
    return crop_alpha(im.crop((0, 0, im.width, height)))


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)


def icon_layer(mark: Image.Image, size: int) -> Image.Image:
    """Logo mark on a transparent square. No colored tile."""
    return square_pad(mark).resize((size, size), Image.Resampling.LANCZOS)


def bmp_icon_payload(im: Image.Image) -> bytes:
    """Classic 32-bit DIB ICO frame. Win32 relaunch/taskbar APIs reject PNG-in-ICO."""
    im = im.convert("RGBA")
    width, height = im.size
    pixels = im.load()
    xor = bytearray()
    for y in range(height - 1, -1, -1):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            xor += bytes((blue, green, red, alpha))
    and_row = ((width + 31) // 32) * 4
    and_mask = bytearray()
    for y in range(height - 1, -1, -1):
        bits = 0
        count = 0
        row = bytearray()
        for x in range(width):
            bits = (bits << 1) | (1 if pixels[x, y][3] < 128 else 0)
            count += 1
            if count == 8:
                row.append(bits)
                bits = 0
                count = 0
        if count:
            row.append(bits << (8 - count))
        row.extend(b"\x00" * (and_row - len(row)))
        and_mask.extend(row)
    header = struct.pack(
        "<IIIHHIIIIII",
        40,
        width,
        height * 2,
        1,
        32,
        0,
        len(xor) + len(and_mask),
        0,
        0,
        0,
        0,
    )
    return header + xor + and_mask


def png_payload(im: Image.Image) -> bytes:
    buf = BytesIO()
    im.convert("RGBA").save(buf, format="PNG")
    return buf.getvalue()


def write_ico(path: Path, images: list[Image.Image]) -> None:
    payloads: list[tuple[int, int, bytes]] = []
    for image in images:
        image = image.convert("RGBA")
        data = png_payload(image) if image.width >= 256 else bmp_icon_payload(image)
        payloads.append((image.width, image.height, data))

    offset = 6 + 16 * len(payloads)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as handle:
        handle.write(struct.pack("<HHH", 0, 1, len(payloads)))
        for width, height, data in payloads:
            handle.write(struct.pack(
                "<BBBBHHII",
                0 if width >= 256 else width,
                0 if height >= 256 else height,
                0,
                0,
                1,
                32,
                len(data),
                offset,
            ))
            offset += len(data)
        for _, _, data in payloads:
            handle.write(data)


def main() -> None:
    raw = knock_neutral_black(Image.open(SRC))
    wordmark = crop_alpha(raw, pad=16)
    mark = crop_alpha(top_mark(wordmark, 0.55), pad=4)
    icon_master = icon_layer(mark, 256)

    save_png(wordmark, DESKTOP_BRAND / "app-logo.png")
    save_png(icon_master, DESKTOP_BRAND / "app-icon.png")
    save_png(icon_layer(mark, 512), BUILD / "icon.png")
    save_png(wordmark, BRAND_WEB / "logo.png")
    save_png(wordmark, BRAND_WEB / "hero.png")
    save_png(icon_layer(mark, 256), BRAND_WEB / "symbol.png")
    save_png(icon_layer(mark, 48), BRAND_WEB / "favicon.png")
    write_ico(BRAND_WEB / "favicon.ico", [icon_layer(mark, size) for size in (16, 32, 48)])

    layers = [icon_layer(mark, size) for size in ICO_SIZES]
    ico = BUILD / "icon.ico"
    write_ico(ico, layers)
    write_ico(DESKTOP_BRAND / "app-icon.ico", layers)
    print("source", SRC)
    print("wrote", ico, "bytes", ico.stat().st_size)
    print("wrote", DESKTOP_BRAND / "app-icon.ico", "bytes", (DESKTOP_BRAND / "app-icon.ico").stat().st_size)


if __name__ == "__main__":
    main()
