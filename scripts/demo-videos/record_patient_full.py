"""
The whole patient app in one video (Modules 18 to 22): referral progress, dashboard and profile,
visits and telehealth, treatment and progress, documents, payments and messages.

    python scripts/demo-videos/record_patient_full.py --patient harper.txt --intake jo.txt --therapist sarah.txt [--dry]

Wrap each take with d:/tmp/medisense/snap_harper.mjs save / restore.
"""

import argparse
import pathlib
import shutil
import time

from playwright.sync_api import sync_playwright

from record import OVERLAY
from record_module08 import Steady, session_cookie
from record_module12 import as_user
from record_patient import APP, MODULES, ROLE_CARD, app_ready, cover, m18, m19, m20, m21, m22

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "Patient-App-Full-Workflow"
MODULES[23] = (NAME, "Patient App", "Referral · dashboard · visits · treatment · documents and payments")

SECTIONS = [
    ("Referral and its progress", m18),
    ("Dashboard and profile", m19),
    ("Appointments and telehealth", m20),
    ("My treatment and progress", m21),
    ("Documents, payments and messages", m22),
]


def back_to_patient(d: Steady, ctx, url: str, token: str, title: str):
    """Signs Harper back in behind a card naming the next part of the app."""
    d.page.evaluate(f"() => {{ try {{ sessionStorage.setItem('__role', {('Harper Nguyen|' + title)!r}) }} catch (e) {{}} }}")
    as_user(ctx, url, token)
    d.page.goto(d.base + APP, wait_until="load", timeout=240000)
    app_ready(d)
    d.wait(1600)
    d.page.evaluate("""() => { try { sessionStorage.removeItem('__role') } catch (e) {}
      const c = document.getElementById('__role'); if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 600); } }""")
    d.wait(700)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--patient", required=True)
    ap.add_argument("--intake", required=True)
    ap.add_argument("--therapist", required=True)
    ap.add_argument("--url", default="http://localhost:3000")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    tokens = {"patient": session_cookie(args.patient), "intake": session_cookie(args.intake), "therapist": session_cookie(args.therapist)}
    tmp = OUT / f".tmp-{NAME}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--lang=en-AU"])
        if not args.dry:
            warm = browser.new_context(viewport={"width": 1440, "height": 900}, locale="en-AU", timezone_id="Australia/Brisbane")
            for role, path in (("patient", APP), ("intake", "/care/patient-requests"), ("intake", "/care/referrals"), ("intake", "/care/operations?tab=queue"), ("therapist", "/therapist/coordination")):
                warm.clear_cookies()
                warm.add_cookies([{"name": "medisense_session", "value": tokens[role], "url": args.url}])
                pg = warm.new_page()
                pg.goto(args.url + path, wait_until="load", timeout=240000)
                pg.wait_for_timeout(2000)
                pg.close()
            warm.close()
        extra = {} if args.dry else {"record_video_dir": str(tmp), "record_video_size": {"width": 1440, "height": 900}}
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="en-AU", timezone_id="Australia/Brisbane", **extra)
        ctx.add_cookies([{"name": "medisense_session", "value": tokens["patient"], "url": args.url}])
        ctx.add_init_script("if (window.top === window) {\n" + OVERLAY + "\n}")
        ctx.add_init_script(
            "if (window.top === window) {\n"
            + cover(23).replace("Medisense · Module 23", "Medisense · Patient App · Modules 18 to 22")
            + "\n}"
        )
        ctx.add_init_script(ROLE_CARD)
        page = ctx.new_page()
        d = Steady(page, args.url.rstrip("/"), 4.0 if args.dry else 1.0, True)
        started = time.time()
        ok = True
        try:
            for i, (title, walk) in enumerate(SECTIONS):
                if i:
                    back_to_patient(d, ctx, args.url, tokens["patient"], title)
                walk(d, ctx, args.url, tokens)
                print("done", title, round(time.time() - started), flush=True)
        except Exception as error:
            ok = False
            print(f"Stopped: {error}".splitlines()[0])
            page.evaluate("() => document.getElementById('__role')?.remove()")
            page.screenshot(path=str(OUT / f"{NAME}-failed.png"))
        video = page.video
        ctx.close()
        browser.close()
        if video and not args.dry:
            final = OUT / f"{NAME}{'' if ok else '-incomplete'}.webm"
            final.unlink(missing_ok=True)
            pathlib.Path(video.path()).rename(final)
            shutil.rmtree(tmp, ignore_errors=True)
            print(f"{'Saved' if ok else 'Saved partial'} {final} ({time.time() - started:.0f}s)")
        else:
            print("dry run", "ok" if ok else "stopped", f"{time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
