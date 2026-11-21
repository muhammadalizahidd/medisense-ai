"""
Telehealth video visit, both sides at once: Sarah's therapist app (left) and Harper's patient app (right).

    python scripts/demo-videos/record_call.py [--dry]

Before a take: snapshot Sarah + Harper and move Harper's next video visit to ~15 minutes from now
(d:/tmp/medisense/move_visit.mjs soon); restore both snapshots afterwards.
"""

import argparse
import json
import pathlib
import re
import shutil
import time

from playwright.sync_api import sync_playwright

from call_stage import FLAGS, LEFT, RIGHT, STAGE_URL, install, token

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "Telehealth-Video-Visit-Both-Apps"


class Stage:
    def __init__(self, page, slow: float, t0: float):
        self.page = page
        self.slow = slow
        self.t0 = t0  # when the page (and its video) started
        self.waits: list[list[float]] = []  # [start, end] seconds into the video spent waiting on the server
        self.L = page.frame_locator("#L")
        self.R = page.frame_locator("#R")

    def settle(self, loc, timeout: float = 150000):
        """Waits for the server; long waits are logged so the edit can cut them."""
        t = time.time()
        loc.wait_for(timeout=timeout)
        if time.time() - t > 2.5:
            self.waits.append([t - self.t0 + 1.0, time.time() - self.t0 - 0.2])

    def wait(self, ms: float):
        self.page.wait_for_timeout(ms * self.slow)

    def caption(self, n: str, text: str, hold: float = 0):
        self.page.evaluate(
            """([n, t]) => { const c = document.getElementById('cap'); c.classList.remove('on');
                setTimeout(() => { document.getElementById('n').textContent = n;
                  document.getElementById('t').textContent = t; c.classList.add('on'); }, 250); }""",
            [n, text],
        )
        self.wait(350 + hold)

    def focus(self, side: str | None):
        self.page.evaluate(
            """(s) => { for (const [id, k] of [['pl','L'],['pr','R']])
                  document.getElementById(id).classList.toggle('active', s === k); }""",
            side,
        )

    def click(self, loc, pause: float = 900):
        self.settle(loc.first)
        loc.scroll_into_view_if_needed()
        self.wait(350)
        loc.click()
        self.wait(pause)

    def type(self, loc, text: str, delay: int = 35):
        self.settle(loc.first)
        loc.scroll_into_view_if_needed()
        loc.click()
        loc.press_sequentially(text, delay=delay * self.slow)
        self.wait(300)


def walkthrough(s: Stage):
    L, R = s.L, s.R
    s.page.evaluate(f"document.getElementById('L').src='{LEFT}/mobile/therapist'; document.getElementById('R').src='{RIGHT}/mobile/patient'")
    s.settle(L.get_by_text("Today's schedule").first)
    s.settle(R.get_by_text("Needs your attention").first)
    s.wait(2500)
    s.page.evaluate("const c = document.getElementById('cover'); c.style.opacity = '0'; setTimeout(() => c.remove(), 900)")
    s.wait(1200)

    s.caption("", "Sarah Thompson (therapist app) and Harper Nguyen (patient app). One video visit, both phones live.", 4200)
    s.focus("L")
    s.caption("1", "Sarah's day shows the video visit with Harper as her next visit.", 3200)
    s.focus("R")
    s.caption("2", "Harper's app shows the same visit as her next visit.", 3200)

    # Therapist opens the room
    s.focus("L")
    s.caption("3", "Sarah opens the visit briefing and starts the video call inside the app.", 300)
    s.click(L.get_by_role("button", name=re.compile("Open briefing|Continue visit")), 1800)
    s.click(L.get_by_role("button", name="Start video call"), 600)
    room = L.frame_locator("iframe[title^='Video call']")
    s.settle(room.get_by_text("1. Clinical suitability"))
    s.wait(2600)
    s.caption("4", "The room opens with Harper not yet there. First, Sarah confirms the visit is safe to deliver by video.", 300)
    s.type(room.locator("textarea").first, "Follow-up on home program; suitable for video with daughter nearby.", delay=22)
    s.click(room.get_by_role("button", name="Record", exact=True).filter(has_text="Record"), 600)
    s.settle(room.get_by_text("Suitable for telehealth").first)
    s.wait(1600)
    s.caption("5", "She sends Harper a one-time, appointment-specific link. No account is needed to use it.", 300)
    s.click(room.get_by_role("button", name=re.compile("Create and send link")), 600)
    s.settle(room.get_by_role("button", name="Create a new link"))
    s.wait(2000)

    # Patient joins
    s.focus("R")
    s.caption("6", "In the patient app, Harper opens the visit. Join is available from an hour before.", 300)
    s.click(R.get_by_role("navigation", name="App sections").get_by_role("button", name="Visits", exact=True), 1800)
    s.click(R.locator("button").filter(has_text="Telehealth").first, 1600)
    s.click(R.get_by_role("button", name="Join", exact=True), 600)
    join = R.frame_locator("iframe[title^='Video visit']")
    s.settle(join.get_by_text("Confirm who's joining"))
    s.wait(1600)
    s.caption("7", "She confirms who's joining and the participant's date of birth, so it's the right person.", 300)
    s.type(join.get_by_label("Your name"), "Harper Nguyen")
    join.get_by_label("Participant's date of birth").fill("1952-04-16")
    s.wait(700)
    s.click(join.get_by_role("button", name="Continue"), 2000)
    s.caption("8", "Each consent is a separate choice. Only the video consultation is required.", 300)
    s.click(join.get_by_role("checkbox", name=re.compile("^Recording")), 500)
    s.click(join.get_by_role("checkbox", name=re.compile("^AI transcription")), 700)
    s.click(join.get_by_role("button", name="Save my choices"), 2000)
    s.caption("9", "A quick check of her camera, microphone and connection.", 300)
    s.click(join.get_by_role("button", name="Test my device"), 2400)
    s.click(join.get_by_role("button", name="Continue"), 2000)
    s.caption("10", "She enters the waiting room. Nobody joins the call until the clinician lets them in.", 300)
    s.click(join.get_by_role("button", name="Enter the waiting room"), 3000)

    # Therapist admits
    s.focus("L")
    s.caption("11", "Sarah's room updates by itself: who is waiting, identity verified, their consents and device check.", 300)
    admit = room.get_by_role("button", name=re.compile("^Admit"))
    s.settle(admit)
    admit.scroll_into_view_if_needed()
    s.wait(4200)
    s.caption("12", "She admits Harper.", 300)
    s.click(admit, 1200)
    s.focus(None)
    room.get_by_role("button", name="End call").scroll_into_view_if_needed()
    s.wait(3600)
    s.settle(join.get_by_text(re.compile("simulated video", re.I)).first)
    s.wait(800)
    s.caption("13", "Both are in the call. Each side sees the other's tile and their own camera.", 4200)
    if s.slow < 1:
        for f in s.page.frames:
            if "/telehealth/room/" in f.url or "/join/" in f.url:
                print("DEBUG", f.url[:60], f.evaluate("""() => { const W = document.documentElement.clientWidth; const out = [];
                  for (const e of document.querySelectorAll('body *')) { const r = e.getBoundingClientRect();
                    if (r.right > W + 1 && r.width > 0 && !out.some(o => e.closest(o[3]))) out.push([e.tagName, (e.className||'').toString().slice(0,100), Math.round(r.width), e.tagName]); }
                  return [isSecureContext, W, document.documentElement.scrollWidth, out.slice(0, 5)]; }"""))

    # Recording and transcription
    s.focus("L")
    s.caption("14", "Recording is off by default. Harper agreed, so Sarah can allow it for this visit, then record.", 300)
    s.click(room.get_by_role("checkbox", name=re.compile("I permit recording")), 600)
    s.settle(room.get_by_role("checkbox", name=re.compile("I permit recording")).and_(room.locator(":checked")))
    s.wait(1200)
    rec = room.get_by_role("button", name="Record", exact=True).filter(has_not_text="Record")
    s.click(rec, 1200)
    room.get_by_role("button", name="End call").scroll_into_view_if_needed()
    s.wait(900)
    s.focus("R")
    s.settle(join.get_by_text("Recording", exact=True).first)
    s.caption("15", "Harper sees immediately that the visit is being recorded.", 3800)
    s.focus("L")
    s.caption("16", "Because Harper agreed to AI transcription, what's said is captured to help draft Sarah's note.", 300)
    add = room.get_by_role("button", name="Add sample line")
    if add.count():
        s.click(add, 1600)
        s.click(add, 2000)
    s.wait(1200)

    # End
    s.caption("17", "Sarah ends the call. The actual duration is recorded for billing.", 300)
    s.click(room.get_by_role("button", name="End call"), 600)
    s.settle(room.get_by_text("Write session note").first)
    s.wait(2000)
    s.focus("R")
    s.settle(join.get_by_text("The visit has ended").first)
    s.caption("18", "Harper's screen tells her the visit has ended and a summary will come in her app.", 3800)
    s.focus("L")
    s.caption("19", "Sarah goes straight to writing and signing the session note. The recording is kept in Recordings, with access logged.", 4600)
    s.focus(None)
    s.caption("", "Telehealth: a secure link, identity check, separate consents, a waiting room the clinician controls, and a full record.", 5200)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    tmp = OUT / f".tmp-{NAME}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=FLAGS)
        opts = dict(viewport={"width": 1440, "height": 900}, locale="en-AU", timezone_id="Australia/Brisbane",
                    permissions=["camera", "microphone"])
        if not args.dry:
            warm = browser.new_context(**opts)
            install(warm, token("sarah.txt"), token("harper.txt"))
            for url in (f"{LEFT}/mobile/therapist", f"{RIGHT}/mobile/patient"):
                pg = warm.new_page()
                pg.goto(url, wait_until="load", timeout=240000)
                pg.wait_for_timeout(3000)
                pg.close()
            warm.close()
        extra = {} if args.dry else {"record_video_dir": str(tmp), "record_video_size": {"width": 1440, "height": 900}}
        ctx = browser.new_context(**opts, **extra)
        install(ctx, token("sarah.txt"), token("harper.txt"))
        page = ctx.new_page()
        t0 = time.time()
        if args.dry:
            page.on("response", lambda r: "/api/" in r.url and r.status >= 400 and print("HTTP", r.status, r.request.method, r.url[:90], (r.text() or "")[:160]))
            page.on("requestfailed", lambda r: "/api/" in r.url and print("FAILED", r.url[:90], r.failure))
        page.goto(STAGE_URL)
        page.set_default_timeout(120000)
        s = Stage(page, 0.3 if args.dry else 1.0, t0)
        started = time.time()
        ok = True
        try:
            walkthrough(s)
        except Exception as error:
            ok = False
            print(f"Stopped: {error}".splitlines()[0])
            page.screenshot(path=str(OUT / f"{NAME}-failed.png"))
        video = page.video
        ctx.close()
        browser.close()
        if video and not args.dry:
            final = OUT / f"{NAME}{'' if ok else '-incomplete'}.webm"
            (OUT / f".{NAME}.waits.json").write_text(json.dumps(s.waits))
            final.unlink(missing_ok=True)
            pathlib.Path(video.path()).rename(final)
            shutil.rmtree(tmp, ignore_errors=True)
            print(f"{'Saved' if ok else 'Saved partial'} {final} ({time.time() - started:.0f}s)")
        else:
            print("dry run", "ok" if ok else "stopped", f"{time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
