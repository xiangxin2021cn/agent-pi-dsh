from playwright.sync_api import sync_playwright
from PIL import Image
import os

os.makedirs("competition/out", exist_ok=True)
TARGET = (7016, 9933)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    for i in (1, 2, 3):
        pg = b.new_page(viewport={"width": 1754, "height": 2483}, device_scale_factor=4)
        pg.goto(f"file:///C:/Users/xiang/Desktop/trace/agent-pi-dsh/competition/board{i}.html")
        pg.wait_for_load_state("networkidle")
        pg.wait_for_timeout(800)
        tmp = f"competition/out/board{i}-raw.png"
        pg.screenshot(path=tmp, full_page=False)
        pg.close()
        im = Image.open(tmp).convert("RGB").resize(TARGET, Image.LANCZOS)
        im.save(f"competition/out/board{i}.jpg", quality=92, dpi=(300, 300))
        print(f"board{i}.jpg", im.size, os.path.getsize(f"competition/out/board{i}.jpg") // 1024, "KB")
    b.close()
