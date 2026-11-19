"""
Builds the short feature videos for the presentation: each source video gets its own calm music
track (music.py) muxed in by stream copy, plus a still for its slide.

    python build_features.py features.json

features.json is a list of [output name, source file in demo-videos/].
"""

import json
import pathlib
import subprocess
import sys
import time

from music import duration, mux

ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC = ROOT / "demo-videos"
OUT = SRC / "Feature-Videos"


def stills(items: list[tuple[str, pathlib.Path, float]]):
    from playwright.sync_api import sync_playwright

    (OUT / "stills").mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        for name, video, secs in items:
            html = OUT / "stills" / "player.html"
            html.write_text(f'<body style="margin:0;background:#000"><video id="v" muted preload="auto" '
                            f'src="{video.as_uri()}" style="width:1440px;height:900px"></video>', encoding="utf-8")
            pg.goto(html.as_uri())
            pg.wait_for_function("document.getElementById('v').readyState >= 1", timeout=60000)
            # A moment in the middle shows the feature at work, never a title card.
            pg.evaluate("t => new Promise(r => { const v = document.getElementById('v'); v.onseeked = () => r(); v.currentTime = t; })",
                        secs * 0.42)
            pg.wait_for_timeout(300)
            pg.screenshot(path=str(OUT / "stills" / f"{name}.png"))
        b.close()


def main():
    plan = json.loads(pathlib.Path(sys.argv[1]).read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    items = [(name, SRC / src, duration(SRC / src)) for name, src in plan]
    for name, _, secs in items:
        print(f"{name}: {secs:.1f}s")
    (OUT / "durations.json").write_text(json.dumps({name: secs for name, _, secs in items}, indent=1))
    # One browser process per track, so rendering and real-time recording run side by side.
    here = pathlib.Path(__file__).parent
    procs = []
    for name, _, secs in items:
        if (OUT / "music" / f"{name}.music.webm").exists():
            continue
        procs.append(subprocess.Popen([sys.executable, str(here / "music.py"), str(OUT / "music"), f"{name}={secs}"]))
        while sum(p.poll() is None for p in procs) >= 9:
            time.sleep(2)
    for p in procs:
        p.wait()
    for name, video, _ in items:
        mux(video, OUT / "music" / f"{name}.music.webm", OUT / f"{name}.webm")
        print("built", name)
    stills(items)


if __name__ == "__main__":
    main()
