"""
Therapist App walkthrough (Modules 10 to 17, mobile): a clinician's day on the phone.

    python scripts/demo-videos/record_therapist_app.py --therapist sarah.txt [--dry]

Snapshot Sarah's data first and restore it afterwards (d:/tmp/medisense/snap_sarah.mjs).
"""

import argparse
import pathlib
import re
import shutil
import time

from playwright.sync_api import sync_playwright

from record import OVERLAY
from record_module08 import Steady, session_cookie
from record_patient import MODULES, cover, lift_cover

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "Therapist-App-Modules-10-17"
APP = "/mobile/therapist"
MODULES[10] = (NAME, "Therapist App", "Visits · notes · goals · assessments · video calls · every portal workspace")


def nav(d: Steady, name: str, settle: float = 1600):
    d.click(d.page.get_by_role("navigation", name="App sections").get_by_role("button", name=name, exact=True), pause_after=settle)


def phone_scroll(d: Steady, y: int, settle: float = 1100):
    d.page.locator(".no-scrollbar.overflow-y-auto").first.evaluate(f"e => e.scrollBy({{top: {y}, behavior: 'smooth'}})")
    d.wait(settle)


def sheet(d: Steady):
    return d.page.locator("[role=dialog]").last


def sheet_scroll(d: Steady, y: int, settle: float = 900):
    sheet(d).locator(".no-scrollbar, .overflow-y-auto").first.evaluate(f"e => e.scrollBy({{top: {y}, behavior: 'smooth'}})")
    d.wait(settle)


def close_sheet(d: Steady):
    d.click(sheet(d).get_by_role("button", name="Close").last, pause_after=900)


def back(d: Steady, settle: float = 1000):
    d.click(d.page.get_by_role("button", name="Back").last, pause_after=settle)


def hub(d: Steady, title: str, wait_text: str, caption: tuple[str, str], hold: float = 3000):
    d.click(d.page.get_by_role("button", name=title).first, pause_after=600)
    frame = d.page.frame_locator(f"iframe[title='{title}']")
    frame.get_by_text(wait_text).first.wait_for(timeout=120000)
    d.wait(1800)
    d.caption(caption[0], caption[1], hold)
    back(d, 900)


def walkthrough(d: Steady):
    d.go(APP, 400)
    d.page.get_by_text("Today's schedule").first.wait_for(timeout=120000)
    d.wait(2400)
    lift_cover(d)
    d.caption("1", "Sarah Thompson's day on her phone: the next visit, her progress and today's schedule.", 3800)
    phone_scroll(d, 380, 1400)
    d.caption("2", "Visits sit on a timeline. Notes due and visits to confirm follow underneath.", 3000)
    phone_scroll(d, -600, 1200)

    # Visit: briefing and check-in
    d.caption("3", "Before she knocks, the briefing shows precautions, consent, the last visit and current goals.", 400)
    d.click(d.page.get_by_role("button", name="Open briefing"), pause_after=2600)
    sheet_scroll(d, 300, 1800)
    sheet_scroll(d, -300, 900)
    d.caption("4", "On arrival she checks in: who is present and that it's safe to start. The time is recorded.", 400)
    d.click(sheet(d).get_by_role("button", name=re.compile("arrived")), pause_after=1200)
    d.type(sheet(d).get_by_placeholder("For example, participant and mother"), "Lachlan and his support worker, Ben")
    d.wait(600)
    d.click(sheet(d).get_by_role("button", name="Check in", exact=True), pause_after=2600)
    d.clear_caption()

    # Notes: dictation, AI draft, clinician's assessment, sign
    d.caption("5", "After a visit, notes are due. Sarah dictates rough notes on the phone.", 400)
    notes = d.page.get_by_role("region", name="Notes to write")
    notes.scroll_into_view_if_needed()
    d.wait(800)
    d.click(notes.get_by_role("button").first, pause_after=1800)
    d.type(
        sheet(d).get_by_label("Your rough notes"),
        "Kitchen task practice: made a cup of tea standing at the bench with the rollator, needed two rests. "
        "Knee pain 4 out of 10 afterwards. Daughter present. Keep weekly visits; trial a perching stool next time.",
        delay=12,
    )
    d.caption("6", "AI turns them into a SOAP draft from what she said, never inventing findings.", 400)
    d.click(sheet(d).get_by_role("button", name=re.compile("Draft the note with AI")), pause_after=800)
    sheet(d).get_by_text("AI draft, needs your approval").wait_for(timeout=120000)
    d.wait(2600)
    sheet_scroll(d, 260, 1800)
    d.caption("7", "The clinical assessment is always the clinician's own. Sarah adds hers, then signs.", 400)
    d.type(
        sheet(d).get_by_label("Assessment (your clinical judgement)"),
        "Standing tolerance improving with rest breaks; knee pain limits time at the bench. Perching stool likely to help.",
        delay=12,
    )
    sheet_scroll(d, 300, 1400)
    d.click(sheet(d).get_by_role("button", name=re.compile("Sign note as")), pause_after=2600)
    d.caption("8", "Signed. The family sees only the plain summary in their app.", 2800)
    d.clear_caption()

    # Schedule and a video call
    nav(d, "Schedule", 1800)
    d.caption("9", "Her appointments for the next two weeks, day by day, with video calls marked.", 3400)
    video = d.page.get_by_role("button", name=re.compile("Video call"))
    if video.count():
        video.first.scroll_into_view_if_needed()
        d.wait(900)
        d.click(video.first, pause_after=2400)
        d.caption("10", "A telehealth visit starts the video call right inside the app.", 400)
        d.click(sheet(d).get_by_role("button", name="Start video call"), pause_after=600)
        d.page.frame_locator("iframe[title^='Video call']").locator("body").wait_for(timeout=120000)
        d.wait(5200)
        back(d, 1200)
    phone_scroll(d, -2000, 600)
    d.clear_caption()

    # Patient: history, goals, assessments
    nav(d, "Patients", 1800)
    d.caption("11", "Every patient's file is one tap away.", 400)
    d.click(d.page.get_by_role("button", name="Open Harper Nguyen"), pause_after=1600)
    d.page.get_by_text("Visits done").first.wait_for(timeout=60000)
    d.page.get_by_role("tab", name="History").wait_for(timeout=60000)
    d.wait(2200)
    d.caption("12", "The full history: every visit, note, follow-up, assessment and plan, newest first.", 3600)
    d.page.locator(".no-scrollbar.overflow-y-auto").last.evaluate("e => e.scrollBy({top: 520, behavior: 'smooth'})")
    d.wait(2200)
    d.page.locator(".no-scrollbar.overflow-y-auto").last.evaluate("e => e.scrollTo({top: 0, behavior: 'smooth'})")
    d.wait(900)
    d.click(d.page.get_by_role("tab", name="Goals"), pause_after=2600)
    d.caption("13", "Goals with started, now and target, and progress towards each.", 3000)
    d.caption("14", "She records today's measure against a goal.", 400)
    d.click(d.page.get_by_role("button", name="Record progress").last, pause_after=1400)
    d.type(sheet(d).locator("input").first, "3", delay=60)
    d.type(sheet(d).locator("textarea").first, "Made lunch three times this week with the recipe cards.", delay=12)
    d.click(sheet(d).get_by_role("button", name="Save measurement"), pause_after=2600)
    d.caption("15", "And adds a new goal agreed with Harper.", 400)
    d.click(d.page.get_by_role("button", name="Add a goal"), pause_after=1400)
    why = sheet(d).get_by_label("Why revise the plan?")
    if why.count():
        d.caption("15", "Her plan is signed, so a new goal creates a new version to sign; the signed one stays on record.", 400)
        d.type(why, "New mobility goal agreed with Harper at today's review", delay=14)
    d.type(sheet(d).get_by_label("Goal", exact=True), "Walk to the letterbox and back", delay=18)
    d.type(sheet(d).get_by_label("What success looks like"), "Harper walks to the letterbox and back with her rollator without stopping.", delay=12)
    d.click(sheet(d).get_by_role("radio", name="Mobility"), pause_after=500)
    d.type(sheet(d).get_by_label("Unit", exact=True), "metres", delay=30)
    d.type(sheet(d).get_by_label("Now", exact=True), "20", delay=60)
    d.type(sheet(d).get_by_label("Target", exact=True), "60", delay=60)
    d.click(sheet(d).get_by_role("button", name="Add goal"), pause_after=2800)
    d.click(d.page.get_by_role("tab", name="Assessments"), pause_after=2400)
    d.caption("16", "Assessments: start an initial assessment, record what she observes, or open the full form.", 400)
    d.click(d.page.get_by_role("button", name="Record observation").first, pause_after=2400)
    d.click(sheet(d).get_by_role("radio", name="Supervision"), pause_after=500)
    d.type(sheet(d).locator("textarea").first, "Showered with the chair and long-handled sponge; needed prompting for the back.", delay=12)
    d.click(sheet(d).get_by_role("button", name="Save observation"), pause_after=2600)
    d.click(d.page.get_by_role("button", name="Open full assessment").first, pause_after=600)
    d.page.frame_locator("iframe[title$='assessment']").locator("main").first.wait_for(timeout=120000)
    d.wait(3200)
    d.caption("17", "The full assessment workspace, the same one the office uses, inside the app.", 3200)
    back(d, 900)
    back(d, 1200)
    d.clear_caption()

    # Clinical hub: every portal workspace in the app
    nav(d, "Clinical", 1800)
    d.caption("18", "Everything in the portal is here too: assessments, plans, sessions, documentation, reports and records.", 3800)
    hub(d, "Treatment plans", "Active plans", ("19", "Treatment plans for every service, with goals, interventions and reviews."))
    hub(d, "Documentation", "Open notes", ("20", "Documentation: notes, AI drafts, signing and amendments."))
    hub(d, "Progress and reports", "Active episodes", ("21", "Progress and clinical reports, ready to release."))
    hub(d, "Clinical records", "My participants", ("22", "Clinical records with history, risks and consent."))
    hub(d, "Care coordination", "Open", ("23", "Shared tasks, handovers and the care team."))
    phone_scroll(d, 520, 1600)
    hub(d, "Schedule and billing", "Visits today", ("24", "Her calendar, availability and billable visits."))
    phone_scroll(d, -1200, 600)
    d.clear_caption()

    # Tasks
    d.click(d.page.get_by_role("button", name=re.compile("My tasks")), pause_after=1800)
    d.caption("25", "Her care coordination tasks, with priority, the patient and what's overdue.", 3000)
    task = d.page.get_by_role("button", name=re.compile("In Progress")).first
    d.click(task, pause_after=1800)
    d.caption("26", "She records what was done and completes the task; the team sees it straight away.", 400)
    d.type(sheet(d).get_by_label("What was done?"), "Updated the home program with standing tolerance and perching stool steps; copy shared with the family.", delay=12)
    d.click(sheet(d).get_by_role("button", name=re.compile("Complete task")), pause_after=2600)
    d.clear_caption()

    # Messages and profile
    nav(d, "Messages", 1800)
    d.caption("27", "Messages with patients and families stay inside Medisense.", 400)
    d.click(d.page.get_by_role("button", name=re.compile("Harper Nguyen")).first, pause_after=600)
    d.page.get_by_text(re.compile("See you both")).first.wait_for(timeout=60000)
    d.wait(3000)
    back_btn = d.page.get_by_role("button", name=re.compile("^Back$"))
    if back_btn.count():
        d.click(back_btn.first, pause_after=1000)
    nav(d, "Today", 1400)
    d.click(d.page.get_by_role("button", name="My profile"), pause_after=600)
    d.page.get_by_text(re.compile("^Usually")).first.wait_for(timeout=60000)
    d.wait(1200)
    d.caption("28", "Her caseload against capacity and her working week.", 3400)
    nav(d, "Today", 1600)
    d.caption("", "Every therapist feature of the portal, built for the phone.", 4000)
    d.clear_caption()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--therapist", required=True)
    ap.add_argument("--url", default="http://localhost:3000")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    token = session_cookie(args.therapist)
    tmp = OUT / f".tmp-{NAME}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--lang=en-AU", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        if not args.dry:
            warm = browser.new_context(viewport={"width": 1440, "height": 900}, locale="en-AU", timezone_id="Australia/Brisbane")
            warm.add_cookies([{"name": "medisense_session", "value": token, "url": args.url}])
            pg = warm.new_page()
            pg.goto(args.url + APP, wait_until="load", timeout=240000)
            pg.wait_for_timeout(3000)
            warm.close()
        extra = {} if args.dry else {"record_video_dir": str(tmp), "record_video_size": {"width": 1440, "height": 900}}
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="en-AU", timezone_id="Australia/Brisbane", permissions=["camera", "microphone"], **extra)
        ctx.add_cookies([{"name": "medisense_session", "value": token, "url": args.url}])
        ctx.add_init_script("if (window.top === window) {\n" + OVERLAY + "\n}")
        ctx.add_init_script("if (window.top === window) {\n" + cover(10).replace("Medisense · Module 10", "Medisense · Modules 10 to 17") + "\n}")
        page = ctx.new_page()
        d = Steady(page, args.url.rstrip("/"), 4.0 if args.dry else 1.0, True)
        started = time.time()
        ok = True
        try:
            walkthrough(d)
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
