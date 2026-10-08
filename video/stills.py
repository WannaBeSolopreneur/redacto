"""A contact sheet of chosen moments: .venv/bin/python stills.py 0.8,4.4,13 [out.png]"""
import io, pathlib, sys
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ts = [float(x) for x in sys.argv[1].split(",")]
out = sys.argv[2] if len(sys.argv) > 2 else "stills.png"
TW, TH, cols = 640, 360, 3
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1920, "height": 1080}); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto((pathlib.Path(__file__).parent / "film.html").resolve().as_uri()); pg.evaluate("film.ready")
    tiles = []
    for t in ts:
        pg.evaluate(f"film.seek({t})")
        im = Image.open(io.BytesIO(pg.screenshot())).resize((TW, TH), Image.LANCZOS)
        ImageDraw.Draw(im).text((8, 8), f"t={t}", fill=(200, 0, 0)); tiles.append(im)
    b.close()
sheet = Image.new("RGB", (TW * cols, TH * ((len(tiles) + cols - 1) // cols)), "white")
for i, im in enumerate(tiles): sheet.paste(im, ((i % cols) * TW, (i // cols) * TH))
sheet.save(out); print("wrote", out, "errors:", errs or "none")
