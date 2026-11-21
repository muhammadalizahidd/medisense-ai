"""
AI Enhancements 01–07, part 3: caregiver sign-in, attachments, check-in automation, clarification
and the admin queues. Sarah's therapist app (left), Linh's caregiver account (right).

    python scripts/demo-videos/record_ai3.py [--dry]
"""

import argparse
import json
import pathlib
import re
import shutil
import time

from playwright.sync_api import sync_playwright

from call_stage import STAGE, token
from record_ai2 import ADMIN, FLAGS, LEFT, RIGHT, STAGE_URL
from record_call import Stage

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "AI-Enhancements-01-07-Part-3-Final"
PHOTO = "d:/tmp/medisense/knee-photo.png"

PAGE = (
    STAGE.replace("A video visit, from both sides", "AI enhancements: the final pieces")
    .replace("Medisense · Telehealth module", "Medisense · AI Enhancements · part 3")
    .replace(">Video visits<", ">Caregiver sign-in and more<")
    .replace("Therapist app and patient app, step by step", "Caregiver account · attachments · check-in automation · clarification · queues")
    .replace("Medisense · Telehealth", "Medisense · AI Enhancements")
    .replace("<b>Harper Nguyen</b>", "<b>Linh Nguyen · caregiver</b>")
)


def install(ctx):
    ctx.add_cookies([
        {"name": "medisense_session", "value": token("sarah.txt"), "url": LEFT},
        {"name": "medisense_session", "value": open("d:/tmp/medisense/linh.tok").read().strip(), "url": RIGHT},
        {"name": "medisense_session", "value": token("jo.txt"), "url": ADMIN},
    ])
    ctx.route(STAGE_URL, lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=PAGE))


def walkthrough(s: Stage):
    L, R = s.L, s.R
    s.page.evaluate(f"document.getElementById('L').src='{LEFT}/mobile/therapist'; document.getElementById('R').src='{RIGHT}/mobile/patient'")
    s.settle(L.get_by_text("Today's schedule").first)
    s.settle(R.get_by_text(re.compile("Daughter, caregiver")).first)
    s.wait(2000)
    s.page.evaluate("const c = document.getElementById('cover'); c.style.opacity = '0'; setTimeout(() => c.remove(), 900)")
    s.wait(1200)
    lnav = L.get_by_role("navigation", name="App sections")

    def close(side):
        s.click(side.get_by_role("button", name="Close").last, 900)

    # ---------- 06 caregiver's own account ----------
    s.focus("R")
    s.caption("06", "Linh signs in on her own caregiver account. The app shows who she cares for and exactly what she may do.", 4200)
    s.caption("07", "Her assistant offers caregiver questions, and restricted records stay out of reach.", 300)
    s.click(R.get_by_role("button", name=re.compile("Ask Medisense")), 1400)
    s.click(R.get_by_role("button", name="Can I see the psychology notes?"), 400)
    s.click(R.get_by_role("button", name="Send"), 600)
    s.settle(R.get_by_text(re.compile("Answered|No authorised source|Human review")).first)
    s.wait(3600)
    close(R)

    # ---------- 04 concern with a photo ----------
    s.caption("04", "She reports a concern with a photo. It's saved as caregiver-reported, whatever the form says.", 300)
    s.click(R.get_by_role("button", name="Report a concern"), 1400)
    s.click(R.get_by_role("radio", name="Worse", exact=True), 400)
    s.click(R.get_by_role("radio", name="Yes", exact=True), 400)
    s.click(R.get_by_role("checkbox", name="Mobility", exact=True), 300)
    s.type(R.get_by_label("Tell us what happened"), "Mum's knee looked swollen after the stairs.", delay=16)
    R.get_by_label("Attach a photo or document").set_input_files(PHOTO)
    s.settle(R.get_by_text(re.compile("knee-photo.png")).first)
    s.wait(1400)
    s.click(R.get_by_role("button", name="Send to my care team"), 600)
    s.settle(R.locator("[role=dialog]").filter(has_text="Withdraw this report").first)
    s.wait(2000)
    close(R)

    s.focus("L")
    s.caption("04", "Sarah sees the report, labelled caregiver-reported, with the photo only the care team can open.", 300)
    s.click(L.get_by_role("button", name=re.compile("Patient updates to review")), 1400)
    s.click(L.get_by_role("button", name=re.compile("Harper Nguyen · Therapist follow-up")).first, 1400)
    s.settle(L.get_by_alt_text(re.compile("Attachment")).first)
    L.get_by_alt_text(re.compile("Attachment")).first.scroll_into_view_if_needed()
    s.wait(3800)
    close(L)
    close(L)

    # ---------- 06 revoke and restore ----------
    s.caption("06", "Sarah withdraws Linh's access. Linh's app stops showing anything about Harper.", 300)
    s.click(lnav.get_by_role("button", name="Patients", exact=True), 1200)
    s.click(L.get_by_role("button", name="Open Harper Nguyen"), 1400)
    s.click(L.get_by_role("tab", name="AI", exact=True), 1200)
    s.settle(L.get_by_role("button", name="Revoke").first)
    L.get_by_text("Caregiver access").first.scroll_into_view_if_needed()
    s.wait(900)
    s.click(L.get_by_role("button", name="Revoke").first, 1600)
    s.page.evaluate(f"document.getElementById('R').src='{RIGHT}/mobile/patient'")
    s.focus("R")
    s.settle(R.get_by_text("Caregiver access ended").first)
    s.wait(3400)
    s.focus("L")
    s.caption("06", "Restoring it is just as quick, and every change is logged.", 300)
    s.click(L.get_by_role("button", name="Restore access").first, 2000)
    s.page.evaluate(f"document.getElementById('R').src='{RIGHT}/mobile/patient'")
    s.settle(R.get_by_text(re.compile("Daughter, caregiver")).first)
    s.wait(1600)

    # ---------- 03 clarification ----------
    s.caption("03", "Care-team updates can be acknowledged or sent back with a request to clarify.", 300)
    s.click(L.get_by_role("tab", name="Care team"), 1000)
    s.click(L.get_by_role("button", name=re.compile("coordination briefing")), 600)
    s.settle(L.get_by_label("To"))
    s.type(L.get_by_label("To"), "Physiotherapist", delay=18)
    s.type(L.get_by_label("Exactly what will be shared"), "Harper finds stairs harder this week; knee swelling reported by her daughter.", delay=10)
    s.click(L.get_by_role("button", name="Share", exact=True), 1600)
    s.click(L.get_by_role("button", name="Ask to clarify").last, 1600)
    s.settle(L.get_by_text("Clarification requested").first)
    s.wait(2400)

    # ---------- 02 check-in editing, channel, automation ----------
    s.caption("02", "Sarah edits the check-in questions, adds SMS, and can send them automatically before each visit.", 300)
    s.click(L.get_by_role("button", name="Back").first, 900)
    s.click(lnav.get_by_role("button", name="Schedule", exact=True), 1400)
    s.click(L.get_by_role("button", name=re.compile("Harper Nguyen")).first, 1600)
    s.type(L.get_by_label("Add a question"), "Did the new shower chair arrive?", delay=18)
    s.click(L.get_by_role("button", name="Add", exact=True), 800)
    s.click(L.get_by_role("radio", name="SMS (simulated)", exact=True), 600)
    s.click(L.get_by_role("button", name=re.compile("Send check-in|Send again")), 1800)
    s.click(L.get_by_role("radio", name="48", exact=True), 2400)
    s.caption("02", "Rule · Automation: from now on it goes 48 hours before each visit; Sarah still reviews every answer.", 3200)

    # ---------- admin queues ----------
    s.caption("Admin", "Admins see the follow-up work queue and insights waiting for review, in minimal detail.", 300)
    s.page.evaluate(f"document.getElementById('L').src='{ADMIN}/care/ai-oversight'")
    s.settle(L.get_by_text("Follow-up work queue · minimal details").first)
    L.get_by_text("Follow-up work queue · minimal details").first.scroll_into_view_if_needed()
    s.wait(4200)
    s.focus(None)
    s.caption("", "All seven AI enhancement documents, finished: both apps, the web, and people approving every AI output.", 5000)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    tmp = OUT / f".tmp-{NAME}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=FLAGS)
        opts = dict(viewport={"width": 1440, "height": 900}, locale="en-AU", timezone_id="Australia/Brisbane")
        extra = {} if args.dry else {"record_video_dir": str(tmp), "record_video_size": {"width": 1440, "height": 900}}
        ctx = browser.new_context(**opts, **extra)
        install(ctx)
        page = ctx.new_page()
        t0 = time.time()
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
            final.unlink(missing_ok=True)
            pathlib.Path(video.path()).rename(final)
            shutil.rmtree(tmp, ignore_errors=True)
            print(f"{'Saved' if ok else 'Saved partial'} {final} ({time.time() - started:.0f}s)")
        else:
            print("dry run", "ok" if ok else "stopped", f"{time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
