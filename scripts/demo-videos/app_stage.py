"""
A presentation stage for one app: a large phone in the centre, a chapter list on the left that
tracks progress, and a narration card on the right. Taps show a cursor and ripple inside the phone.

Records against E2E_BASE (default http://localhost:3001, the dev server) with one signed-in person,
so everything stays same-origin. Long server waits are logged so the edit can cut them.
"""

import json
import os
import pathlib
import shutil
import time

from record import OVERLAY
from e2e_stage import FULL_APP  # noqa: F401  (kept for parity; the phone is framed on purpose)

BASE = os.environ.get("E2E_BASE", "http://localhost:3001")

PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Medisense</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { height: 100%; overflow: hidden; font-family: "Segoe UI", system-ui, sans-serif; color: #f4f1ea;
    background: radial-gradient(1100px 760px at 50% 18%, #1f4038 0%, #10221d 52%, #08120f 100%); }
  .glow { position: absolute; width: 560px; height: 560px; left: 50%; top: 52%; transform: translate(-50%, -50%);
    background: radial-gradient(circle, rgba(126,214,180,.16), transparent 65%); pointer-events: none; }
  .phone { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 404px; height: 842px;
    border-radius: 58px; padding: 12px; background: #050505;
    box-shadow: 0 0 0 2px #2c2c2c, 0 0 0 9px rgba(126,214,180,.10), 0 40px 120px rgba(0,0,0,.6); }
  .phone iframe { width: 380px; height: 818px; border: 0; border-radius: 46px; background: #f4f1ea; display: block; }
  .rail { position: absolute; left: 56px; top: 50%; transform: translateY(-50%); width: 300px; }
  .brand { font-size: 12px; letter-spacing: .28em; text-transform: uppercase; opacity: .6; }
  .apptitle { font-family: Georgia, serif; font-size: 34px; margin: 8px 0 4px; }
  .who { font-size: 14px; opacity: .72; margin-bottom: 26px; }
  .chap { display: flex; align-items: center; gap: 12px; padding: 9px 0; font-size: 15px; opacity: .45; transition: opacity .4s, transform .4s; }
  .chap .dot { flex: none; width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid rgba(244,241,234,.35);
    display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; transition: all .4s; }
  .chap.done { opacity: .7; } .chap.done .dot { background: rgba(126,214,180,.25); border-color: transparent; color: #7ed6b4; }
  .chap.on { opacity: 1; transform: translateX(6px); font-weight: 600; }
  .chap.on .dot { background: #7ed6b4; border-color: #7ed6b4; color: #0c1f1a; box-shadow: 0 0 0 6px rgba(126,214,180,.18); }
  .note { position: absolute; right: 56px; top: 50%; transform: translateY(-50%); width: 330px; min-height: 120px;
    padding: 24px 26px; border-radius: 22px; background: rgba(10,22,19,.72); border: 1px solid rgba(244,241,234,.12);
    box-shadow: 0 20px 60px rgba(0,0,0,.35); transition: opacity .35s, transform .35s; opacity: 0; }
  .note.on { opacity: 1; }
  .note .k { font-size: 12px; letter-spacing: .22em; text-transform: uppercase; color: #7ed6b4; margin-bottom: 10px; }
  .note .t { font-size: 21px; line-height: 1.42; }
  .cover { position: absolute; inset: 0; z-index: 9; display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; background: radial-gradient(900px 600px at 50% 40%, #1d3b34, #0a1512); transition: opacity .8s; }
  .cover.off { opacity: 0; pointer-events: none; }
  .cover .e { font-size: 13px; letter-spacing: .3em; text-transform: uppercase; opacity: .65; }
  .cover .t { font-family: Georgia, serif; font-size: 60px; margin-top: 14px; }
  .cover .s { margin-top: 16px; opacity: .75; font-size: 19px; max-width: 860px; line-height: 1.5; }
</style></head><body>
<div class="glow"></div>
<div class="rail"><div class="brand">Medisense</div><div class="apptitle" id="at"></div><div class="who" id="aw"></div><div id="chaps"></div></div>
<div class="phone"><iframe id="L" allow="camera; microphone; autoplay" src="about:blank"></iframe></div>
<div class="note" id="note"><div class="k" id="nk"></div><div class="t" id="nt"></div></div>
<div class="cover" id="cover"><div class="e" id="ce"></div><div class="t" id="ct"></div><div class="s" id="cs"></div></div>
</body></html>"""


class AppStage:
    def __init__(self, page, slow: float, t0: float):
        self.page = page
        self.slow = slow
        self.t0 = t0
        self.waits: list[list[float]] = []
        self.L = page.frame_locator("#L")

    def wait(self, ms: float):
        self.page.wait_for_timeout(ms * self.slow)

    def settle(self, loc, timeout: float = 150000):
        t = time.time()
        loc.wait_for(timeout=timeout)
        if time.time() - t > 2.5:
            self.waits.append([t - self.t0 + 1.0, time.time() - self.t0 - 0.2])

    def setup(self, title: str, who: str, chapters: list[str], url: str):
        self.page.evaluate(
            """([t, w, cs, u]) => { document.getElementById('at').textContent = t;
                 document.getElementById('aw').textContent = w;
                 document.getElementById('chaps').innerHTML = cs.map((c, i) =>
                   `<div class="chap" data-i="${i}"><span class="dot">${i + 1}</span><span>${c}</span></div>`).join('');
                 document.getElementById('L').src = u; }""",
            [title, who, chapters, url],
        )

    def chapter(self, i: int):
        self.page.evaluate(
            """(n) => document.querySelectorAll('.chap').forEach((c) => {
                 const k = Number(c.dataset.i); c.classList.toggle('on', k === n); c.classList.toggle('done', k < n);
                 const d = c.querySelector('.dot'); d.textContent = k < n ? '✓' : String(k + 1); })""",
            i,
        )

    def say(self, kicker: str, text: str, hold: float = 0):
        self.page.evaluate(
            """([k, t]) => { const n = document.getElementById('note'); n.classList.remove('on');
                 setTimeout(() => { document.getElementById('nk').textContent = k;
                   document.getElementById('nt').textContent = t; n.classList.add('on'); }, 260); }""",
            [kicker, text],
        )
        self.wait(450 + hold)

    def card(self, eyebrow: str, title: str, sub: str = "", hold: float = 2600):
        self.page.evaluate(
            """([e, t, s]) => { for (const [k, v] of [['ce', e], ['ct', t], ['cs', s]]) document.getElementById(k).textContent = v;
                 document.getElementById('cover').classList.remove('off'); }""",
            [eyebrow, title, sub],
        )
        self.wait(800 + hold)

    def reveal(self, after: float = 900):
        self.page.evaluate("document.getElementById('cover').classList.add('off')")
        self.wait(after)

    def click(self, loc, pause: float = 900):
        loc = loc.first
        self.settle(loc)
        loc.scroll_into_view_if_needed()
        self.wait(300)
        box = loc.bounding_box()
        if box:
            self.page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=14)
            self.wait(250)
        loc.click()
        self.wait(pause)

    def type(self, loc, text: str, delay: int = 28):
        loc = loc.first
        self.settle(loc)
        loc.scroll_into_view_if_needed()
        loc.click()
        loc.press_sequentially(text, delay=delay * self.slow)
        self.wait(300)

    def scroll(self, loc, dy: int, steps: int = 10):
        box = loc.first.bounding_box()
        if box:
            self.page.mouse.move(box["x"] + box["width"] / 2, box["y"] + min(box["height"] / 2, 300))
        for _ in range(steps):
            self.page.mouse.wheel(0, dy / steps)
            self.page.wait_for_timeout(35)
        self.wait(500)


def run(name: str, out: pathlib.Path, walkthrough, token: str, dry: bool, warm=None):
    """Warms every screen first (unrecorded), then records one take from a clean start."""
    from playwright.sync_api import sync_playwright

    stage_url = f"{BASE}/__app_stage"
    tmp = out / f".tmp-{name}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required", "--lang=en-AU"])
        opts = dict(viewport={"width": 1440, "height": 900}, locale="en-AU", timezone_id="Australia/Brisbane")

        def context(record: bool):
            extra = {"record_video_dir": str(tmp), "record_video_size": {"width": 1440, "height": 900}} if record else {}
            ctx = browser.new_context(**opts, **extra)
            ctx.add_cookies([{"name": "medisense_session", "value": token, "url": BASE}])
            ctx.add_init_script(OVERLAY)
            ctx.route(stage_url, lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=PAGE))
            return ctx

        if warm:
            ctx = context(False)
            page = ctx.new_page()
            page.set_default_timeout(180000)
            try:
                warm(page)
            except Exception as error:
                print("warm-up note:", str(error).splitlines()[0][:120])
            ctx.close()

        ctx = context(not dry)
        page = ctx.new_page()
        t0 = time.time()
        page.goto(stage_url)
        page.set_default_timeout(150000)
        s = AppStage(page, 0.3 if dry else 1.0, t0)
        started = time.time()
        ok = True
        try:
            walkthrough(s)
        except Exception as error:
            ok = False
            print(f"Stopped: {error}".splitlines()[0])
            page.screenshot(path=str(out / f"{name}-failed.png"))
        video = page.video
        ctx.close()
        browser.close()
        if video and not dry:
            final = out / f"{name}{'' if ok else '-incomplete'}.webm"
            final.unlink(missing_ok=True)
            pathlib.Path(video.path()).rename(final)
            (out / f".{name}.waits.json").write_text(json.dumps(s.waits))
            shutil.rmtree(tmp, ignore_errors=True)
            print(f"{'Saved' if ok else 'Saved partial'} {final} ({time.time() - started:.0f}s)")
        else:
            print("dry run", "ok" if ok else "stopped", f"{time.time() - started:.0f}s")
        return ok
