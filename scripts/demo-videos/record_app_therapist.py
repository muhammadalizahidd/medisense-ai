"""
The therapist app, end to end: Sarah Thompson's day from first look to last message.

    python scripts/demo-videos/record_app_therapist.py [--dry]

Restore the e2e baseline before and after a take (d:/tmp/medisense/app_take.sh does both).
"""

import argparse
import pathlib
import re

from app_stage import BASE, AppStage, run
from e2e_stage import staff_token
from record import OVERLAY  # noqa: F401

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "Therapist-App-Complete-Workflow"
APP = f"{BASE}/mobile/therapist"

CHAPTERS = [
    "Today at a glance",
    "Visit briefing",
    "Notes with AI",
    "Schedule",
    "Patient file",
    "Assessment: visits, report, sign",
    "AI assistants",
    "Booking agent",
    "Tasks",
    "Messages and files",
]


def nav(s: AppStage, name: str, settle: float = 1500):
    s.click(s.L.get_by_role("navigation", name="App sections").get_by_role("button", name=name, exact=True), settle)


def sheet(s: AppStage):
    return s.L.locator("[role=dialog]").last


def scroll_main(s: AppStage, y: int, settle: float = 1200):
    s.L.locator(".no-scrollbar.overflow-y-auto").first.evaluate(f"e => e.scrollBy({{top: {y}, behavior: 'smooth'}})")
    s.wait(settle)


def scroll_sheet(s: AppStage, y: int, settle: float = 1100):
    sheet(s).locator(".no-scrollbar, .overflow-y-auto").first.evaluate(f"e => e.scrollBy({{top: {y}, behavior: 'smooth'}})")
    s.wait(settle)


def close(s: AppStage, settle: float = 900):
    s.click(sheet(s).get_by_role("button", name="Close").last, settle)


def walkthrough(s: AppStage):
    L = s.L
    s.card("Medisense · Therapist app", "A therapist's day, on her phone",
           "Sarah Thompson, occupational therapist: visits, AI notes, assessments, booking and messages.", 600)
    s.setup("Therapist app", "Sarah Thompson · Occupational Therapist", CHAPTERS, APP)
    s.settle(L.get_by_text("Today's schedule").first)
    s.wait(2600)
    s.reveal()

    # 1 Today
    s.chapter(0)
    s.say("Today", "Her next visit, notes and tasks due, new patients and the day's schedule, all on one screen.", 3400)
    scroll_main(s, 520, 1800)
    s.say("Today", "Every visit for the day sits on a timeline, with video calls marked.", 2600)
    scroll_main(s, -900, 1000)

    # 2 Briefing
    s.chapter(1)
    s.say("Visit briefing", "Before she knocks: precautions, consent, the last visit and current goals.", 300)
    s.click(L.get_by_role("button", name="Open briefing"), 2400)
    scroll_sheet(s, 320, 2000)
    scroll_sheet(s, -320, 800)
    close(s)

    # 3 Notes with AI
    s.chapter(2)
    s.say("Notes with AI", "Notes due are listed here. Sarah jots rough notes or dictates them.", 300)
    notes = L.get_by_role("region", name="Notes to write")
    s.settle(notes)
    notes.scroll_into_view_if_needed()
    s.wait(1400)
    s.click(notes.get_by_role("button").first, 1800)
    s.type(sheet(s).get_by_label("Your rough notes"),
           "Kitchen practice: made a cup of tea at the bench with the rollator, two rests. Knee pain 4/10 after. "
           "Daughter present. Keep weekly visits; trial a perching stool next time.", delay=10)
    s.say("Notes with AI", "AI arranges what she wrote into a SOAP draft. It never invents findings.", 300)
    s.click(sheet(s).get_by_role("button", name=re.compile("Draft the note with AI")), 600)
    s.settle(sheet(s).get_by_text("AI draft, needs your approval").first)
    s.wait(2400)
    scroll_sheet(s, 300, 1600)
    s.say("Notes with AI", "The clinical assessment is always her own words. She adds it, then signs.", 300)
    s.type(sheet(s).get_by_label("Assessment (your clinical judgement)"),
           "Standing tolerance improving with rest breaks; knee pain limits bench time. Perching stool likely to help.", delay=10)
    for label, text in (("Subjective", "Daughter reports she made tea three times this week."),
                        ("Objective", "Stood at the bench with the rollator, two rests; knee pain 4/10 after."),
                        ("Plan", "Continue weekly visits; trial a perching stool next visit."),
                        ("Summary the patient sees", "Great work in the kitchen. Keep resting when you need to; we'll try a stool next time.")):
        box = sheet(s).get_by_label(label, exact=True)
        if box.count() and len(box.input_value().strip()) < 5:
            box.scroll_into_view_if_needed()
            s.type(box, text, delay=8)
    scroll_sheet(s, 400, 1000)
    s.click(sheet(s).get_by_role("button", name=re.compile("Sign note as")), 600)
    s.settle(s.L.get_by_text("Note signed").first)
    s.wait(1800)
    s.say("Notes with AI", "Signed. The family sees only the plain-language summary in their app.", 2400)
    if L.locator("[role=dialog]").count():
        close(s)

    # 4 Schedule
    s.chapter(3)
    nav(s, "Schedule", 1800)
    s.say("Schedule", "Two weeks of visits, day by day: home visits and video calls, each with its time.", 2400)
    scroll_main(s, 700, 2200)
    scroll_main(s, -1400, 800)

    # 5 Patient file
    s.chapter(4)
    nav(s, "Patients", 1600)
    s.say("Patient file", "Every patient's file is one tap away.", 300)
    s.click(L.get_by_role("button", name="Open Isabella Kowalski"), 1800)
    s.settle(L.get_by_role("tab", name="History"))
    s.wait(1600)
    s.say("Patient file", "The full history: visits, notes, follow-ups, assessments and plans, newest first.", 2600)
    s.click(L.get_by_role("tab", name="Goals", exact=True), 2400)
    s.say("Patient file", "Goals with where she started, where she is now and the target.", 2200)

    # 6 Assessment native
    s.chapter(5)
    s.click(L.get_by_role("tab", name="Assess", exact=True), 1800)
    s.say("Assessment", "Assessments run natively in the app: visits, the AI-drafted report and signing.", 300)
    s.click(L.get_by_role("button", name="Visits, report and signing"), 2000)
    s.settle(sheet(s).get_by_text("Visit 1").first)
    s.wait(1400)
    s.say("Assessment", "Each visit keeps its place, author and what's still outstanding.", 1800)
    scroll_sheet(s, 700, 1400)
    s.click(sheet(s).get_by_role("radio", name="Telehealth"), 500)
    s.type(sheet(s).get_by_label("What happened"),
           "Video visit with mum: morning routine timed at 40 min; grabber used for the top shelf.", delay=10)
    s.say("Assessment", "Every note box can dictate, and Write with AI tidies the wording. She checks it before saving.", 300)
    s.click(sheet(s).get_by_role("button", name="Write with AI"), 600)
    s.settle(sheet(s).get_by_text("AI draft · check before saving").first)
    s.wait(1800)
    s.click(sheet(s).get_by_role("button", name="Save visit"), 2000)
    scroll_sheet(s, -3000, 600)
    s.click(sheet(s).get_by_role("tab", name="Report"), 1800)
    s.say("Assessment", "The report is drafted by AI from documented findings only, each section citing its evidence.", 2800)
    scroll_sheet(s, 420, 1800)
    scroll_sheet(s, -600, 600)
    s.click(sheet(s).get_by_role("tab", name="Sign"), 1600)
    s.say("Assessment", "Signing is blocked until nothing is missing. Rules list exactly what's left.", 2600)
    scroll_sheet(s, 500, 1800)
    close(s)

    # 7 AI assistants
    s.chapter(6)
    s.click(L.get_by_role("tab", name="AI", exact=True), 1800)
    s.say("AI assistants", "Home coach, insights, care team and copilot for this patient. Suggestions only; she decides.", 2800)
    copilot = L.get_by_role("tab", name="Copilot", exact=True)
    if copilot.count():
        s.click(copilot, 1400)
        s.click(L.get_by_role("button", name="Prepare me for the next visit"), 500)
        s.click(L.get_by_role("button", name=re.compile("^Send")).last, 600)
        out = L.get_by_text(re.compile(r"^\s*(Answered|No authorised source|Human review|Needs clarification)\s*$"))
        s.settle(out.last)
        out.last.scroll_into_view_if_needed()
        s.say("AI assistants", "The copilot answers from her own records of this patient, with sources.", 3000)
    s.click(L.get_by_role("button", name="Back").first, 1000)

    # 8 Booking agent
    s.chapter(7)
    nav(s, "Today", 1400)
    s.say("Booking agent", "The booking agent does fixed tasks with real free times. Nothing is booked until she confirms.", 300)
    s.click(L.get_by_role("button", name=re.compile("Booking agent")), 1800)
    s.click(sheet(s).get_by_role("button", name=re.compile("Book a follow-up visit")), 1200)
    s.click(sheet(s).get_by_role("button", name="Harper Nguyen", exact=True), 800)
    s.settle(sheet(s).get_by_text("Real free times:").first)
    s.wait(1400)
    s.click(sheet(s).get_by_role("button", name=re.compile(r"^(Mon|Tue|Wed|Thu|Fri), \d+ \w+, ")).first, 600)
    s.settle(sheet(s).get_by_text("Needs your confirmation").first)
    sheet(s).get_by_text("Needs your confirmation").first.scroll_into_view_if_needed()
    s.say("Booking agent", "A proposal with the checks it ran. She confirms and the visit is booked for both sides.", 1400)
    s.click(sheet(s).get_by_role("button", name="Confirm", exact=True).last, 600)
    s.settle(sheet(s).get_by_text(re.compile("^Done\\.")).first)
    s.wait(2200)
    close(s)

    # 9 Tasks
    s.chapter(8)
    s.click(L.get_by_role("button", name=re.compile("^Tasks")), 1800)
    s.say("Tasks", "Her care tasks, with priority, the patient and what's overdue.", 2600)
    scroll_sheet(s, 500, 1600) if L.locator("[role=dialog]").count() else scroll_main(s, 500, 1600)
    if L.locator("[role=dialog]").count():
        close(s)
    else:
        nav(s, "Today", 1000)

    # 10 Messages
    s.chapter(9)
    nav(s, "Messages", 1600)
    s.say("Messages and files", "Messages with patients and families stay inside Medisense, with documents, video clips and voice notes.", 300)
    s.click(L.get_by_role("button", name=re.compile("Harper Nguyen")).first, 1800)
    s.settle(L.get_by_text(re.compile("See you both")).first)
    s.wait(1200)
    vid = L.locator("video").last
    if vid.count():
        vid.scroll_into_view_if_needed()
        s.wait(800)
        vid.evaluate("v => { v.muted = true; v.play(); }")
        s.wait(4200)
        vid.evaluate("v => v.pause()")
    L.get_by_text(re.compile("See you both")).last.scroll_into_view_if_needed()
    s.wait(2200)
    s.chapter(len(CHAPTERS))
    s.say("Therapist app", "Every therapist feature of the portal, built for the phone, with people approving every AI step.", 3600)
    s.card("Medisense", "Therapist app", "Visits · AI notes · assessments · booking · messages", 2200)


def warm(page):
    """Loads the app and its screens once, unrecorded, so the take has no first-load delays."""
    page.goto(APP)
    page.get_by_text("Today's schedule").first.wait_for()
    for tab in ["Schedule", "Patients", "Clinical", "Messages", "Today"]:
        page.get_by_role("navigation", name="App sections").get_by_role("button", name=tab, exact=True).click()
        page.wait_for_timeout(2500)
    page.get_by_role("navigation", name="App sections").get_by_role("button", name="Patients", exact=True).click()
    page.get_by_role("button", name="Open Isabella Kowalski").click()
    for tab in ["Goals", "Assess", "AI", "History"]:
        page.get_by_role("tab", name=tab, exact=True).click()
        page.wait_for_timeout(2500)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    run(NAME, OUT, walkthrough, staff_token("sarah.thompson@medisense.test"), a.dry, warm)


if __name__ == "__main__":
    main()
