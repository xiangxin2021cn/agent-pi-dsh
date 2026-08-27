from __future__ import annotations

import os
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
QA = ROOT / "qa"
SUPPORT = QA / "ppt" / "supporting-assets"
TARGET = (7016, 9933)
VIEWPORT = (1754, 2483)
NAMES = {
    1: "01-海外工程投标及商业调研全流程AI智能Agent作业系统-总览",
    2: "02-海外工程投标及商业调研全流程AI智能Agent作业系统-全流程",
    3: "03-海外工程投标及商业调研全流程AI智能Agent作业系统-真实成果",
}


def find_chromium() -> Path:
    local = Path(os.environ.get("LOCALAPPDATA", "")) / "ms-playwright"
    patterns = (
        "chromium_headless_shell-*/chrome-headless-shell-win64/chrome-headless-shell.exe",
        "chromium-*/chrome-win64/chrome.exe",
    )
    matches: list[Path] = []
    for pattern in patterns:
        matches.extend(local.glob(pattern))
    if not matches:
        raise FileNotFoundError("Bundled Playwright Chromium was not found under LOCALAPPDATA.")
    return sorted(matches, key=lambda p: p.stat().st_mtime, reverse=True)[0]


def capture(
    chromium: Path,
    html: Path,
    raw: Path,
    viewport: tuple[int, int] = VIEWPORT,
    scale: int = 4,
    budget_ms: int = 9000,
) -> None:
    command = [
        str(chromium),
        "--headless",
        "--hide-scrollbars",
        "--disable-gpu-sandbox",
        "--enable-unsafe-swiftshader",
        "--force-color-profile=srgb",
        f"--force-device-scale-factor={scale}",
        f"--window-size={viewport[0]},{viewport[1]}",
        "--run-all-compositor-stages-before-draw",
        f"--virtual-time-budget={budget_ms}",
        f"--screenshot={raw}",
        html.as_uri(),
    ]
    subprocess.run(command, check=True, cwd=ROOT)


def capture_simulation(html: Path, target: Path) -> None:
    runtime = Path.home() / ".cache" / "codex-runtimes" / "codex-primary-runtime" / "dependencies" / "node"
    node = runtime / "bin" / "node.exe"
    playwright = runtime / "node_modules" / "playwright"
    script = f"""
const {{ chromium }} = require({json.dumps(str(playwright))});
(async () => {{
  const browser = await chromium.launch({{headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']}});
  const page = await browser.newPage({{viewport: {{width: 1280, height: 820}}, deviceScaleFactor: 1}});
  await page.goto({json.dumps(html.as_uri())}, {{waitUntil: 'load'}});
  await page.waitForTimeout(2500);
  await page.evaluate(() => {{
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === 'panel-params'));
    document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === 'panel-params'));
  }});
  await page.waitForTimeout(1200);
  await page.screenshot({{path: {json.dumps(str(target))}}});
  await browser.close();
}})().catch(error => {{ console.error(error); process.exit(1); }});
"""
    subprocess.run([str(node), "-e", script], check=True, cwd=ROOT)


def build_simulation_evidence(source: Path, target: Path) -> None:
    with Image.open(source) as image:
        source_rgb = image.convert("RGB")
        header = source_rgb.crop((0, 0, 1280, 104)).resize((1400, 114), Image.Resampling.LANCZOS)
        panel_a = source_rgb.crop((850, 104, 1280, 457)).resize((690, 406), Image.Resampling.LANCZOS)
        panel_b = source_rgb.crop((850, 404, 1280, 810)).resize((690, 406), Image.Resampling.LANCZOS)
        evidence = Image.new("RGB", (1400, 520), "#081322")
        evidence.paste(header, (0, 0))
        evidence.paste(panel_a, (0, 114))
        evidence.paste(panel_b, (710, 114))
        evidence.save(target, format="PNG", dpi=(300, 300), compress_level=6)


def save_master(raw: Path, stem: str) -> tuple[Path, Path]:
    png = OUT / f"{stem}.png"
    jpg = OUT / f"{stem}.jpg"
    with Image.open(raw) as source:
        image = source.convert("RGB")
        if image.size != TARGET:
            image = image.resize(TARGET, Image.Resampling.LANCZOS)
        image.save(png, format="PNG", dpi=(300, 300), compress_level=6)
        image.save(jpg, format="JPEG", quality=94, subsampling=0, dpi=(300, 300))
    raw.unlink(missing_ok=True)
    return png, jpg


def verify(path: Path) -> str:
    with Image.open(path) as image:
        dpi = tuple(round(v) for v in image.info.get("dpi", (0, 0)))
        if image.size != TARGET:
            raise AssertionError(f"{path.name}: expected {TARGET}, got {image.size}")
        if image.mode != "RGB":
            raise AssertionError(f"{path.name}: expected RGB, got {image.mode}")
        if dpi != (300, 300):
            raise AssertionError(f"{path.name}: expected 300 dpi, got {dpi}")
        return f"{path.name}: {image.size[0]}x{image.size[1]} RGB {dpi[0]}dpi"


def contact_sheet(pngs: list[Path]) -> Path:
    thumb_size = (533, 755)
    margin = 28
    caption = 42
    sheet = Image.new("RGB", (margin * 4 + thumb_size[0] * 3, margin * 2 + caption + thumb_size[1]), "#dfe6eb")
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(pngs):
        with Image.open(path) as image:
            thumb = image.convert("RGB").resize(thumb_size, Image.Resampling.LANCZOS)
        x = margin + index * (thumb_size[0] + margin)
        sheet.paste(thumb, (x, margin + caption))
        draw.text((x, margin), f"BOARD {index + 1}", fill="#0b2242")
    target = QA / "boards-contact-sheet.png"
    sheet.save(target, format="PNG", dpi=(150, 150), optimize=True)
    return target


def template_overlay_contact_sheet(pngs: list[Path], template_path: Path) -> Path:
    thumb_size = (533, 755)
    margin = 28
    caption = 42
    sheet = Image.new("RGB", (margin * 4 + thumb_size[0] * 3, margin * 2 + caption + thumb_size[1]), "#dfe6eb")
    draw = ImageDraw.Draw(sheet)
    with Image.open(template_path) as template_image:
        template = template_image.convert("RGB").resize(thumb_size, Image.Resampling.LANCZOS)
    for index, path in enumerate(pngs):
        with Image.open(path) as image:
            board = image.convert("RGB").resize(thumb_size, Image.Resampling.LANCZOS)
        overlay = Image.blend(board, template, 0.32)
        x = margin + index * (thumb_size[0] + margin)
        sheet.paste(overlay, (x, margin + caption))
        draw.text((x, margin), f"TEMPLATE OVERLAY / BOARD {index + 1}", fill="#0b2242")
    target = QA / "template-overlay-contact-sheet.png"
    sheet.save(target, format="PNG", dpi=(150, 150), optimize=True)
    return target


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    QA.mkdir(parents=True, exist_ok=True)
    SUPPORT.mkdir(parents=True, exist_ok=True)
    chromium = find_chromium()
    simulation = SUPPORT / "simulation-eb-cloete.png"
    simulation_evidence = SUPPORT / "simulation-evidence.png"
    capture_simulation(ROOT.parent.parent / "website" / "showcase" / "arch-lift-sim.html", simulation)
    build_simulation_evidence(simulation, simulation_evidence)
    pngs: list[Path] = []
    outputs: list[Path] = []
    for index, stem in NAMES.items():
        raw = OUT / f"board-{index}-raw.png"
        capture(chromium, ROOT / f"board{index}.html", raw)
        png, jpg = save_master(raw, stem)
        pngs.append(png)
        outputs.extend((png, jpg))
    sheet = contact_sheet(pngs)
    overlay_sheet = template_overlay_contact_sheet(pngs, ROOT / "reference" / "AI图版示例.png")
    for output in outputs:
        print(verify(output))
    print(f"Contact sheet: {sheet}")
    print(f"Template overlay contact sheet: {overlay_sheet}")


if __name__ == "__main__":
    main()
