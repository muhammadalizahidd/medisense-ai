"""
One stage for the five connected demonstrations: a full-screen web view (staff on the web) and a
two-phone view (therapist app and patient app), with captions and title cards between them.

Every person gets their own host (jo.demo.localhost, sarah.demo.localhost, …) so each frame keeps
its own session cookie inside one browser.
"""

import json
import pathlib
import shutil
import time
import urllib.request

from record import OVERLAY
from record_call import Stage as PhoneStage

W = "d:/tmp/medisense"
BASE = __import__("os").environ.get("E2E_BASE", "http://localhost:3000")
PEOPLE = ["jo", "sarah", "harper", "olivia", "morgan", "linh", "helen", "nadia"]
HOSTS = ["stage.demo.localhost"] + [f"{p}.demo.localhost" for p in PEOPLE]
FLAGS = [
    "--host-resolver-rules=" + ",".join(f"MAP {h} 127.0.0.1:3000" for h in HOSTS),
    "--unsafely-treat-insecure-origin-as-secure=" + ",".join(f"http://{h}" for h in HOSTS),
    "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
    "--lang=en-AU",
]
STAGE_URL = "http://stage.demo.localhost/__stage"


def host(who: str) -> str:
    return f"http://{who}.demo.localhost"


def file_token(name: str) -> str:
    return [l.split("\t")[6].strip() for l in open(f"{W}/{name}") if "medisense_session" in l][0]


def staff_token(email: str) -> str:
    """One-click demo sign-in for a staff account; returns the new session cookie."""
    req = urllib.request.Request(
        f"{BASE}/api/auth/demo",
        data=json.dumps({"email": email}).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                for h in r.headers.get_all("Set-Cookie") or []:
                    if h.startswith("medisense_session="):
                        return h.split(";")[0].split("=", 1)[1]
        except OSError:
            time.sleep(5)
    raise RuntimeError(f"no session for {email}")


PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Medisense</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { height: 100%; overflow: hidden; font-family: "Segoe UI", system-ui, sans-serif; color: #f4f1ea;
    background: radial-gradient(1200px 700px at 50% 0%, #1d3b34 0%, #0f1f1b 55%, #0a1512 100%); }
  .layer { position: absolute; inset: 0; transition: opacity .5s; }
  body:not(.web) #webl, body:not(.phones) #phonel { opacity: 0; pointer-events: none; }
  #W { position: absolute; inset: 0; width: 1440px; height: 900px; border: 0; background: #fff; }
  .badge { position: absolute; top: 14px; right: 18px; z-index: 5; font-size: 12px; letter-spacing: .12em;
    text-transform: uppercase; padding: 6px 12px; border-radius: 99px; background: rgba(10,21,18,.82); color: #f4f1ea; }
  .top { position: absolute; top: 22px; left: 0; right: 0; text-align: center; }
  .eyebrow { font-size: 12px; letter-spacing: .28em; text-transform: uppercase; opacity: .65; }
  .title { font-family: Georgia, "Times New Roman", serif; font-size: 30px; margin-top: 4px; }
  .stage { position: absolute; top: 84px; left: 0; right: 0; display: flex; justify-content: center; gap: 120px; }
  .side { display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .who { display: flex; align-items: center; gap: 10px; font-size: 14px; }
  .who b { font-size: 15px; }
  .pill { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; padding: 4px 10px; border-radius: 99px; background: rgba(244,241,234,.12); }
  .phone { width: 368px; height: 648px; border-radius: 54px; padding: 11px; background: #0b0b0b;
    box-shadow: 0 0 0 2px #2b2b2b, 0 30px 80px rgba(0,0,0,.55); transition: box-shadow .4s; }
  .phone.active { box-shadow: 0 0 0 2px #2b2b2b, 0 0 0 7px rgba(126,214,180,.55), 0 30px 80px rgba(0,0,0,.55); }
  .phone iframe { width: 346px; height: 626px; border: 0; border-radius: 44px; background: #f4f1ea; display: block; }
  .cap { position: absolute; z-index: 8; bottom: 20px; left: 50%; transform: translateX(-50%); max-width: 1040px; min-height: 56px;
    display: flex; align-items: center; gap: 14px; padding: 14px 24px; border-radius: 16px;
    background: rgba(10,21,18,.9); border: 1px solid rgba(244,241,234,.14); font-size: 18px; line-height: 1.35;
    box-shadow: 0 12px 40px rgba(0,0,0,.3); transition: opacity .35s; opacity: 0; pointer-events: none; }
  .cap.on { opacity: 1; }
  .cap .n { flex: none; font-weight: 700; color: #7ed6b4; font-size: 18px; }
  .cover { position: absolute; inset: 0; z-index: 9; display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; background: #0f1f1b; transition: opacity .7s; }
  .cover.off { opacity: 0; pointer-events: none; }
  .cover .t { font-family: Georgia, serif; font-size: 52px; margin-top: 10px; }
  .cover .s { margin-top: 14px; opacity: .72; font-size: 18px; max-width: 900px; line-height: 1.5; }
  .cover .ids { margin-top: 22px; font-family: Consolas, monospace; font-size: 14px; opacity: .6; letter-spacing: .04em; }
</style></head><body class="web">
<div class="layer" id="webl"><iframe id="W" name="web" allow="camera; microphone; autoplay" src="about:blank"></iframe>
  <div class="badge" id="wb"></div></div>
<div class="layer" id="phonel">
  <div class="top"><div class="eyebrow" id="pe">Medisense</div><div class="title" id="pt"></div></div>
  <div class="stage">
    <div class="side"><div class="who"><span class="pill" id="lp"></span><b id="ln"></b></div>
      <div class="phone" id="pl"><iframe id="L" allow="camera; microphone; autoplay" src="about:blank"></iframe></div></div>
    <div class="side"><div class="who"><span class="pill" id="rp"></span><b id="rn"></b></div>
      <div class="phone" id="pr"><iframe id="R" allow="camera; microphone; autoplay" src="about:blank"></iframe></div></div>
  </div>
</div>
<div class="cap" id="cap"><span class="n" id="n"></span><span id="t"></span></div>
<div class="cover" id="cover"><div class="eyebrow" id="ce"></div><div class="t" id="ct"></div><div class="s" id="cs"></div><div class="ids" id="ci"></div></div>
</body></html>"""


# The app hides its shell when framed (the phone previews); the web view must look like the real site.
FULL_APP = """(() => { if (window.name !== 'web') return;
  const off = () => { const el = document.documentElement;
    if (el && el.hasAttribute('data-embedded')) el.removeAttribute('data-embedded'); };
  const timer = setInterval(off, 30); setTimeout(() => clearInterval(timer), 20000);
  document.addEventListener('DOMContentLoaded', () => { off();
    new MutationObserver(off).observe(document.documentElement, { attributes: true, attributeFilter: ['data-embedded'] }); });
})();"""


class FrameProxy:
    """Looks like a Page to the web walkthrough helpers: finding elements happens inside the web
    frame, while mouse, timing and captions use the stage page. The frame fills the stage from
    0,0, so mouse coordinates are the same in both."""

    def __init__(self, frame, page):
        self._frame = frame
        self._page = page

    def __getattr__(self, name):
        return getattr(self._frame if hasattr(self._frame, name) else self._page, name)


class Stage(PhoneStage):
    def __init__(self, page, slow: float, t0: float):
        super().__init__(page, slow, t0)
        self.W = page.frame_locator("#W")
        from record_module08 import Steady

        self.d = Steady(FrameProxy(self.W, page), "", 1 / slow, True)

    def js(self, code: str, arg=None):
        self.page.evaluate(code, arg)

    def card(self, eyebrow: str, title: str, sub: str = "", ids: str = "", hold: float = 3200):
        """A title card over everything; call reveal() to lift it."""
        self.js(
            """([e, t, s, i]) => { for (const [k, v] of [['ce', e], ['ct', t], ['cs', s], ['ci', i]])
                 document.getElementById(k).textContent = v;
               document.getElementById('cover').classList.remove('off');
               document.getElementById('cap').classList.remove('on'); }""",
            [eyebrow, title, sub, ids],
        )
        self.wait(700 + hold)

    def reveal(self, after: float = 900):
        self.js("document.getElementById('cover').classList.add('off')")
        self.wait(after)

    def web(self, url: str, badge: str):
        self.js(
            """([u, b]) => { document.body.className = 'web'; document.getElementById('wb').textContent = b;
                 const f = document.getElementById('W'); if (u) f.src = u;
                 document.getElementById('cap').classList.remove('on'); }""",
            [url, badge],
        )

    def say(self, n: str, text: str, hold: float = 2600):
        """Caption in web mode (over the page)."""
        self.d.caption(n, text, hold)

    def phones(self, title: str, left, right):
        """left/right = (url or '', pill, name), None to leave as is, or 'hide'. An empty url keeps
        the phone on its current screen."""
        self.js(
            """([t, l, r]) => { document.body.className = 'phones'; document.getElementById('pt').textContent = t;
                 for (const [side, v] of [['L', l], ['R', r]]) {
                   const box = document.getElementById(side === 'L' ? 'pl' : 'pr').parentElement;
                   box.style.display = v === 'hide' ? 'none' : '';
                   if (!v || v === 'hide') continue;
                   const [u, p, n] = v; document.getElementById(side.toLowerCase() + 'p').textContent = p;
                   document.getElementById(side.toLowerCase() + 'n').textContent = n;
                   if (u) document.getElementById(side).src = u; } }""",
            [title, *[list(v) if isinstance(v, tuple) else v for v in (left, right)]],
        )
        self.page.evaluate("() => window.__caption && window.__caption('')")

    def clear(self):
        self.js("document.getElementById('cap').classList.remove('on')")
        self.wait(300)


def run(name: str, out: pathlib.Path, walkthrough, cookies: dict[str, str], dry: bool):
    """Records one take. cookies maps a person's short name to their session token."""
    from playwright.sync_api import sync_playwright

    tmp = out / f".tmp-{name}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=FLAGS)
        opts = dict(viewport={"width": 1440, "height": 900}, locale="en-AU", timezone_id="Australia/Brisbane")
        extra = {} if dry else {"record_video_dir": str(tmp), "record_video_size": {"width": 1440, "height": 900}}
        ctx = browser.new_context(**opts, **extra)
        ctx.add_cookies([{"name": "medisense_session", "value": v, "url": host(k)} for k, v in cookies.items()])
        ctx.add_init_script(OVERLAY)
        ctx.add_init_script(FULL_APP)
        ctx.route(STAGE_URL, lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=PAGE))
        page = ctx.new_page()
        t0 = time.time()
        page.goto(STAGE_URL)
        page.set_default_timeout(120000)
        s = Stage(page, 0.3 if dry else 1.0, t0)
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
