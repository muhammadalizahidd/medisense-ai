"""
AI Enhancements 01–07, part 2: the parts that complete the specs, on both apps and the web.

    python scripts/demo-videos/record_ai2.py [--dry]

Snapshot Sarah + Harper first; restore afterwards and clear aiEnhance rows the take created.
"""

import argparse
import json
import pathlib
import re
import shutil
import time

from playwright.sync_api import sync_playwright

from call_stage import STAGE, token
from record_call import Stage

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "AI-Enhancements-01-07-Part-2-Complete"

HOSTS = ["stage.demo.localhost", "sarah.demo.localhost", "harper.demo.localhost", "admin.demo.localhost"]
FLAGS = [
    "--host-resolver-rules=" + ",".join(f"MAP {h} 127.0.0.1:3000" for h in HOSTS),
    "--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--lang=en-AU",
]
STAGE_URL = "http://stage.demo.localhost/__stage"
LEFT = "http://sarah.demo.localhost"
RIGHT = "http://harper.demo.localhost"
ADMIN = "http://admin.demo.localhost"

PAGE = (
    STAGE.replace("A video visit, from both sides", "AI enhancements: completing the specs")
    .replace("Medisense · Telehealth module", "Medisense · AI Enhancements · part 2")
    .replace(">Video visits<", ">Completing 01 to 07<")
    .replace("Therapist app and patient app, step by step", "Caregiver access · templates · links · feedback · consent · oversight")
    .replace("Medisense · Telehealth", "Medisense · AI Enhancements")
)


def install(ctx):
    ctx.add_cookies([
        {"name": "medisense_session", "value": token("sarah.txt"), "url": LEFT},
        {"name": "medisense_session", "value": token("harper.txt"), "url": RIGHT},
        {"name": "medisense_session", "value": token("jo.txt"), "url": ADMIN},
    ])
    ctx.route(STAGE_URL, lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=PAGE))


def walkthrough(s: Stage):
    L, R = s.L, s.R
    s.page.evaluate(f"document.getElementById('L').src='{LEFT}/mobile/therapist'; document.getElementById('R').src='{RIGHT}/mobile/patient'")
    s.settle(L.get_by_text("Today's schedule").first)
    s.settle(R.get_by_text("Needs your attention").first)
    s.wait(2000)
    s.page.evaluate("const c = document.getElementById('cover'); c.style.opacity = '0'; setTimeout(() => c.remove(), 900)")
    s.wait(1200)
    s.caption("", "Part 2: the remaining requirements of documents 01 to 07, live on both apps and the web.", 4000)
    lnav = L.get_by_role("navigation", name="App sections")
    rnav = R.get_by_role("navigation", name="App sections")

    def close(side):
        s.click(side.get_by_role("button", name="Close").last, 900)

    def open_patient(name):
        s.click(lnav.get_by_role("button", name="Patients", exact=True), 1200)
        s.click(L.get_by_role("button", name=f"Open {name}"), 1400)
        s.click(L.get_by_role("tab", name="AI", exact=True), 1200)

    # ---------- 06 caregiver access ----------
    s.focus("L")
    s.caption("06", "Caregiver access is now set by the therapist: what Linh may answer for Harper, and until when.", 300)
    open_patient("Harper Nguyen")
    s.settle(L.get_by_text("Caregiver access").first)
    L.get_by_text("Caregiver access").first.scroll_into_view_if_needed()
    s.wait(1400)
    s.click(L.get_by_role("checkbox", name="Concerns", exact=True), 500)
    s.type(L.get_by_label("Until (YYYY-MM-DD, optional)"), "2026-12-31", delay=40)
    s.click(L.get_by_role("button", name="Save access"), 2000)

    # ---------- 01 coach: draft, edit steps, FAQ mode ----------
    s.caption("01", "Sarah drafts the coach, edits a step in her own words, and chooses how questions are answered.", 300)
    s.click(L.get_by_role("button", name=re.compile("Draft guidance with AI|Redraft with AI")).first, 600)
    s.settle(L.get_by_role("button", name="Edit steps").first)
    s.wait(1800)
    s.click(L.get_by_role("button", name="Edit steps").first, 1000)
    step = L.get_by_label(re.compile("^Step 1 ·"))
    step.fill("")
    s.type(step, "Sit at the table and lay out the picture recipe card.", delay=20)
    s.click(L.get_by_role("button", name="Save edits"), 1600)
    s.click(L.get_by_role("radio", name="Approved FAQ only", exact=True), 1600)
    s.caption("01", "Approved FAQ only: the coach answers from Sarah's approved answers, with no AI at all.", 2400)
    s.click(L.get_by_role("button", name="Approve and publish"), 2000)

    s.focus("R")
    s.caption("01", "Harper can read the steps aloud or switch language. Numbers are copied exactly, or the original is shown.", 300)
    s.click(rnav.get_by_role("button", name="My care", exact=True), 1600)
    s.click(R.locator("button").filter(has_text="Guide me").first, 2000)
    s.click(R.get_by_role("radio", name="Vietnamese", exact=True), 600)
    s.settle(R.get_by_text(re.compile("translation|original")).first)
    s.wait(3600)
    s.click(R.get_by_role("radio", name="English", exact=True), 1600)
    s.caption("01", "Her question is answered from the approved FAQ, and she can rate every answer.", 300)
    s.type(R.get_by_label("Ask about this activity"), "How long does each session take?")
    s.click(R.get_by_role("button", name="Ask", exact=True), 600)
    s.settle(R.get_by_text("Approved FAQ").first)
    s.wait(2000)
    s.click(R.get_by_role("button", name="Helpful", exact=True).last, 1600)
    s.caption("06", "Linh may log activities, so she appears here; her access and expiry are shown.", 300)
    s.click(R.get_by_role("tab", name="Log today"), 1000)
    s.click(R.get_by_role("radio", name=re.compile("Linh Nguyen")), 2600)
    close(R)

    # ---------- 06 + 04 concerns: scope, duplicates, withdraw ----------
    s.caption("06", "Concerns aren't in Linh's access any more, so only Harper can report one.", 300)
    s.click(rnav.get_by_role("button", name="Home", exact=True), 1200)
    s.click(R.get_by_role("button", name="Report a concern"), 1400)
    s.settle(R.get_by_text(re.compile("can't answer this for you")).first)
    s.wait(2600)

    def concern(desc):
        s.click(R.get_by_role("radio", name="Worse", exact=True), 400)
        s.click(R.get_by_role("radio", name="Yes", exact=True), 400)
        s.click(R.get_by_role("checkbox", name="Mobility", exact=True), 300)
        s.type(R.get_by_label("Tell us what happened"), desc, delay=14)
        s.click(R.get_by_role("button", name="Send to my care team"), 600)
        s.settle(R.locator("[role=dialog]").filter(has_text="Withdraw this report").first)
        s.wait(1400)

    s.caption("04", "Two similar reports are linked as a possible duplicate. Neither is deleted.", 300)
    concern("Knee stiff and slow getting up this morning.")
    close(R)
    s.click(R.get_by_role("button", name="Report a concern"), 1200)
    concern("Knee stiff again, worse on the stairs.")
    s.settle(R.get_by_text(re.compile("possible duplicate")).first)
    s.wait(2400)
    s.caption("04", "Harper can withdraw a report. It stays on record with the withdrawal in its history.", 300)
    s.click(R.get_by_role("button", name="Withdraw this report").first, 2200)

    # ---------- 07 assistant: consent, feedback ----------
    s.caption("07", "AI settings: Harper can turn AI off. Then nothing about her is sent to the AI service.", 300)
    s.click(R.get_by_role("button", name=re.compile("Ask Medisense")), 1400)
    s.click(R.get_by_role("button", name="AI settings"), 900)
    s.click(R.get_by_role("radio", name="Withdrawn", exact=True), 400)
    s.click(R.get_by_role("button", name="Save", exact=True), 1400)
    s.type(R.get_by_label("Message", exact=True), "When is my next appointment?", delay=18)
    s.click(R.get_by_role("button", name="Send"), 600)
    s.settle(R.get_by_text(re.compile("turned AI assistance off")).first)
    s.wait(2800)
    s.caption("07", "Turned back on, it answers from her records, and she flags an answer for review.", 300)
    s.click(R.get_by_role("button", name="AI settings"), 900)
    s.click(R.get_by_role("radio", name="Allowed", exact=True), 400)
    s.click(R.get_by_role("button", name="Save", exact=True), 1400)
    s.type(R.get_by_label("Message", exact=True), "Why do I owe money?", delay=18)
    s.click(R.get_by_role("button", name="Send"), 600)
    s.settle(R.get_by_role("button", name="Inaccurate").last)
    s.wait(2600)
    s.click(R.get_by_role("button", name="Inaccurate").last, 1800)

    s.focus("L")
    s.caption("07", "The flag reaches Sarah's review inbox with the answer it refers to.", 300)
    s.click(L.get_by_role("button", name="Back").first, 900)
    s.click(lnav.get_by_role("button", name="Today", exact=True), 1200)
    s.click(L.get_by_role("button", name=re.compile("Patient updates to review")), 1400)
    s.settle(L.get_by_text("AI answers flagged · 1").first)
    s.wait(2600)
    s.click(L.get_by_role("button", name="Mark reviewed").first, 1600)
    close(L)

    # ---------- 02 check-in templates and link ----------
    s.caption("02", "Sarah sends a pre-visit check-in with a template. Telehealth adds its own questions.", 300)
    s.click(lnav.get_by_role("button", name="Schedule", exact=True), 1600)
    s.click(L.get_by_role("button", name=re.compile("Harper Nguyen")).first, 1600)
    s.click(L.get_by_role("radio", name="Telehealth", exact=True), 600)
    s.click(L.get_by_role("button", name=re.compile("Send check-in|Send again")), 600)
    s.settle(L.get_by_text(re.compile("Secure link for someone without the app")).first)
    link = L.locator("a[href^='/checkin/']").first.get_attribute("href")
    s.wait(2400)
    s.focus("R")
    s.caption("02", "Harper's visit shows the request and the telehealth questions.", 300)
    close(R)
    s.click(rnav.get_by_role("button", name="Visits", exact=True), 1400)
    s.click(R.locator("button").filter(has_text="Telehealth").first, 1400)
    s.click(R.get_by_role("button", name=re.compile("Pre-visit check-in")), 1400)
    s.settle(R.get_by_text("Is your camera and microphone working?").first)
    R.get_by_text("Is your camera and microphone working?").first.scroll_into_view_if_needed()
    s.wait(3000)

    # ---------- web: link, visitor assistant, oversight ----------
    s.caption("02", "Without the app, the secure link asks for the date of birth before showing anything.", 300)
    s.page.evaluate(f"document.getElementById('R').src='{RIGHT}{link}'")
    s.settle(R.get_by_text("Participant's date of birth").first)
    s.wait(1200)
    R.get_by_label("Participant's date of birth").fill("1952-04-16")
    s.wait(600)
    s.click(R.get_by_role("button", name="Continue"), 600)
    s.settle(R.get_by_label("Your name"))
    s.type(R.get_by_label("Your name"), "Linh Nguyen", delay=20)
    s.click(R.get_by_role("radio", name="Carer", exact=True), 400)
    s.click(R.get_by_role("radio", name="About the same", exact=True), 400)
    s.click(R.get_by_role("button", name="Send to my care team"), 600)
    s.settle(R.get_by_text("Thank you").first)
    s.wait(2000)

    s.caption("07", "On the referral page, visitors get a general assistant. It can't see anyone's records.", 300)
    s.page.evaluate(f"document.getElementById('R').src='{RIGHT}/refer'")
    s.click(R.get_by_role("button", name=re.compile("Questions before you refer")), 800)
    s.click(R.get_by_role("button", name="What documents do I need?"), 400)
    s.click(R.get_by_role("button", name="Send"), 600)
    s.settle(R.get_by_text("Answered", exact=True).first)
    s.wait(3400)

    s.focus("L")
    s.caption("Admin", "Admins see AI oversight in counts only: usage, flags, consent and the safety escalation queue, never clinical text.", 300)
    s.page.evaluate(f"document.getElementById('L').src='{ADMIN}/care/ai-oversight'")
    s.settle(L.get_by_text("AI turned off by patients").first)
    s.wait(4200)
    L.get_by_text("Safety escalations · supervisor queue").first.scroll_into_view_if_needed()
    s.wait(2600)
    s.focus(None)
    s.caption("", "Every remaining requirement now runs in both apps and on the web, with people approving every AI output.", 5000)


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
            (OUT / f".{NAME}.waits.json").write_text(json.dumps(s.waits))
            shutil.rmtree(tmp, ignore_errors=True)
            print(f"{'Saved' if ok else 'Saved partial'} {final} ({time.time() - started:.0f}s)")
        else:
            print("dry run", "ok" if ok else "stopped", f"{time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
