#!/usr/bin/env python3
"""Render film.html to an mp4, frame by frame, with real motion blur.

Each frame is the average of several captures spread across a 180-degree shutter (half a frame's time). How many
captures depends on how far things move on screen in that window (film.travel), so still frames cost one capture
and fast moves get enough copies to smear smoothly. Averaging is done in linear light.

  .venv/bin/python render.py --out redacto-demo.mp4 --audio sound.wav
"""
import argparse, io, math, multiprocessing as mp, os, pathlib, shutil, subprocess, time
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
URL = (HERE / "film.html").as_uri()
GAP_PX = 6           # aim for one capture per this many px of on-screen travel
MAX_SAMPLES = 40
W, H = 1920, 1080   # matches film.width/height


def to_linear(a):
    return np.power(a / 255.0, 2.2)


def to_srgb(a):
    return np.clip(np.power(a, 1 / 2.2) * 255.0 + 0.5, 0, 255).astype(np.uint8)


def worker(job):
    frames, fps, outdir = job
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": W, "height": H})
        page.goto(URL)
        page.evaluate("film.ready")
        cuts = page.evaluate("film.cuts")
        grab = lambda t: (page.evaluate(f"film.seek({t!r})"), np.asarray(Image.open(io.BytesIO(page.screenshot())).convert("RGB"), dtype=np.float32))[1]
        captures = 0
        for i in frames:
            t, half = i / fps, 0.25 / fps
            move = page.evaluate(f"film.travel({t - half!r}, {t + half!r})")
            n = max(1, min(MAX_SAMPLES, math.ceil(move / GAP_PX)))
            times = [t] if n == 1 else [t - half + (j + 0.5) * 2 * half / n for j in range(n)]
            for c in cuts:                                  # never smear across a hard change
                if t - half < c <= t + half:
                    times = [s for s in times if (s >= c) == (t >= c)] or [t]
            if len(times) == 1:
                img = grab(times[0]).astype(np.uint8)
            else:
                img = to_srgb(sum(to_linear(grab(s)) for s in times) / len(times))
            captures += len(times)
            Image.fromarray(img).save(outdir / f"{i:05d}.png", compress_level=1)
        browser.close()
    return captures


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="redacto-demo.mp4")
    ap.add_argument("--audio", default=None)
    ap.add_argument("--workers", type=int, default=max(1, min(8, (os.cpu_count() or 4) - 2)))
    a = ap.parse_args()

    with sync_playwright() as p:                         # read length and fps from the page
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1920, "height": 1080}); pg.goto(URL); pg.evaluate("film.ready")
        length, fps = pg.evaluate("[film.length, film.fps]"); b.close()
    total = round(length * fps)
    outdir = HERE / "_frames"; shutil.rmtree(outdir, ignore_errors=True); outdir.mkdir()
    jobs = [(list(range(k, total, a.workers)), fps, outdir) for k in range(a.workers)]
    t0 = time.time()
    with mp.Pool(a.workers) as pool:
        captures = sum(pool.map(worker, jobs))
    print(f"{total} frames, {captures} captures, {time.time() - t0:.0f}s on {a.workers} workers")

    cmd = ["ffmpeg", "-v", "error", "-y", "-framerate", str(fps), "-i", str(outdir / "%05d.png")]
    if a.audio: cmd += ["-i", a.audio, "-c:a", "aac", "-b:a", "192k", "-shortest"]
    cmd += ["-c:v", "libx264", "-crf", "17", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", a.out]
    subprocess.run(cmd, check=True)
    shutil.rmtree(outdir)
    print("wrote", a.out)


if __name__ == "__main__":
    main()
