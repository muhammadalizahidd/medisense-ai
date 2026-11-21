"""
The patient app, end to end: Harper Nguyen's care from her phone.

    python scripts/demo-videos/record_app_patient.py [--dry]

Restore the e2e baseline before and after a take (d:/tmp/medisense/app_take.sh does both).
"""

import argparse
import pathlib
import re

from app_stage import BASE, AppStage, run
from e2e_stage import file_token

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "Patient-App-Complete-Workflow"
APP = f"{BASE}/mobile/patient"
OUTCOME = re.compile(r"^\s*(Answered|No authorised source|Human review|Needs clarification)\s*$")

CHAPTERS = [
    "Home",
    "Ask Medisense",
    "Book a visit with AI",
    "Visits",
    "My care and home coach",
    "Report a concern",
    "Messages and files",
    "Documents and payments",
]


def nav(s: AppStage, name: str | re.Pattern, settle: float = 1500):
    navl = s.L.get_by_role("navigation", name="App sections")
    btn = navl.get_by_role("button", name=name) if isinstance(name, re.Pattern) else navl.get_by_role("button", name=name, exact=True)
    s.click(btn, settle)


def sheet(s: AppStage):
    return s.L.locator("[role=dialog]").last


def scroll_main(s: AppStage, y: int, settle: float = 1200):
    s.L.locator(".no-scrollbar.overflow-y-auto").first.evaluate(f"e => e.scrollBy({{top: {y}, behavior: 'smooth'}})")
    s.wait(settle)


def scroll_sheet(s: AppStage, y: int, settle: float = 1100):
    sheet(s).locator(".no-scrollbar, .overflow-y-auto").first.evaluate(f"e => e.scrollBy({{top: {y}, behavior: 'smooth'}})")
    s.wait(settle)


def close(s: AppStage, settle: float = 900):
    s.click(s.L.get_by_role("button", name="Close").last, settle)


def ask(s: AppStage, text: str):
    before = s.L.get_by_text(OUTCOME).count()
    s.type(s.L.get_by_label("Message", exact=True), text, delay=20)
    s.click(s.L.get_by_role("button", name="Send"), 500)
    s.settle(s.L.get_by_text(OUTCOME).nth(before))
    s.L.get_by_text(OUTCOME).nth(before).scroll_into_view_if_needed()
    s.wait(600)


def walkthrough(s: AppStage):
    L = s.L
    s.card("Medisense · Patient app", "Harper's care, in her pocket",
           "Harper Nguyen, 74: visits, her plan, an assistant that answers from her own records, and her therapist a message away.", 600)
    s.setup("Patient app", "Harper Nguyen · Aspley", CHAPTERS, APP)
    s.settle(L.get_by_text("Needs your attention").first)
    s.wait(2600)
    s.reveal()

    # 1 Home
    s.chapter(0)
    s.say("Home", "What needs her attention first: visits to confirm, a plan to read, invoices and feedback.", 3200)
    scroll_main(s, 520, 2000)
    s.say("Home", "Her therapist, her visits, new files and what's to pay, at a glance.", 2400)
    scroll_main(s, -900, 900)

    # 2 Ask Medisense
    s.chapter(1)
    s.say("Ask Medisense", "She asks in her own words. Answers come only from her approved plan and records.", 300)
    s.click(L.get_by_role("button", name=re.compile("Ask Medisense")).first, 1400)
    ask(s, "What activities should I do today?")
    src = L.get_by_role("button", name=re.compile("plan · v")).last
    if src.count():
        s.say("Ask Medisense", "Each answer shows its source: the approved plan, its version and the passage used.", 300)
        s.click(src, 600)
        hide = L.get_by_role("button", name="Hide source")
        s.settle(hide)
        L.get_by_text("Only approved, current versions are used", exact=False).last.scroll_into_view_if_needed()
        s.wait(3200)
        s.click(hide, 800)

    # 3 Booking agent
    s.chapter(2)
    s.say("Book a visit with AI", "The booking agent books only real free times with her own therapist.", 300)
    s.click(L.get_by_role("tab", name="Booking agent"), 1400)
    s.click(L.get_by_role("button", name="Book a video visit on Tuesday morning").first, 600)
    s.settle(L.get_by_text(re.compile("AI understood")).first)
    s.wait(1600)
    slot = L.get_by_role("button", name=re.compile(r"^(Mon|Tue|Wed|Thu|Fri), \d+ \w+, ")).first
    s.settle(slot)
    slot.scroll_into_view_if_needed()
    s.wait(1000)
    s.click(slot, 600)
    s.settle(L.get_by_text("Needs your confirmation").first)
    L.get_by_text("Needs your confirmation").first.scroll_into_view_if_needed()
    s.say("Book a visit with AI", "She sees exactly what will happen and confirms. The clinic then confirms the held visit.", 1400)
    s.click(L.get_by_role("button", name="Confirm", exact=True).last, 600)
    s.settle(L.get_by_text(re.compile(r"^Done\.")).first)
    s.wait(2200)
    close(s)

    # 4 Visits
    s.chapter(3)
    nav(s, "Visits", 1800)
    s.say("Visits", "Every visit with its date and type: home visit or video.", 2400)
    s.click(L.locator("button").filter(has_text=re.compile("Booked")).first, 1800)
    s.say("Visits", "She confirms she'll be there, or asks to change or cancel. Video visits open from here.", 300)
    there = L.get_by_role("button", name=re.compile("be there"))
    if there.count():
        s.click(there, 2200)
    else:
        s.wait(2400)
    close(s)

    # 5 My care
    s.chapter(4)
    nav(s, "My care", 1800)
    s.say("My care and home coach", "Her treatment plan: goals with progress and the home activities her therapist approved.", 2800)
    guide = L.locator("button").filter(has_text="Guide me")
    if guide.count():
        s.click(guide.first, 2000)
        s.say("My care and home coach", "The home coach explains each activity step by step, in plain words she can read aloud.", 3200)
        scroll_sheet(s, 360, 1600)
        close(s)
    else:
        scroll_main(s, 600, 2200)
        scroll_main(s, -900, 800)

    # 6 Concern
    s.chapter(5)
    nav(s, "Home", 1200)
    s.say("Report a concern", "If something is harder, she tells her care team. A rule routes it to her therapist.", 300)
    s.click(L.get_by_role("button", name="Report a concern"), 1400)
    s.click(L.get_by_role("radio", name="Worse", exact=True), 400)
    s.click(L.get_by_role("radio", name="Yes", exact=True), 400)
    s.click(L.get_by_role("checkbox", name="Mobility", exact=True), 300)
    s.type(L.get_by_label("Tell us what happened"), "Standing at the kitchen bench is harder this week; I had to sit down twice.", delay=12)
    s.click(L.get_by_role("button", name="Send to my care team"), 600)
    s.settle(L.get_by_text(re.compile("Withdraw this report|sent", re.I)).first)
    s.wait(2600)
    close(s)

    # 7 Messages
    s.chapter(6)
    nav(s, re.compile("Messages"), 1600)
    s.say("Messages and files", "Messages with Sarah: her home program PDF, photos, video clips and voice notes.", 300)
    s.click(L.get_by_role("button", name=re.compile("Sarah Thompson")).first, 1800)
    s.settle(L.get_by_text(re.compile("See you both")).first)
    s.wait(1000)
    img = L.locator("img[alt$='.png']").first
    if img.count():
        img.scroll_into_view_if_needed()
        s.wait(2400)
    vid = L.locator("video").last
    if vid.count():
        vid.scroll_into_view_if_needed()
        s.wait(600)
        vid.evaluate("v => { v.muted = true; v.play(); }")
        s.wait(4200)
        vid.evaluate("v => v.pause()")
    L.get_by_text(re.compile("See you both")).last.scroll_into_view_if_needed()
    s.wait(1800)
    back = L.get_by_role("button", name=re.compile("^Back$"))
    if back.count():
        s.click(back.first, 900)

    # 8 Documents and payments
    s.chapter(7)
    nav(s, "Me", 1600)
    s.say("Documents and payments", "Reports her therapist released, signed agreements and her invoices.", 300)
    s.click(L.get_by_role("tab", name=re.compile("^Documents")), 2400)
    s.click(L.get_by_role("tab", name=re.compile("^Payments")), 2600)
    s.say("Documents and payments", "Each invoice with its status and who pays. Clinical notes never appear here.", 2400)
    s.chapter(len(CHAPTERS))
    nav(s, "Home", 1200)
    s.say("Patient app", "Her whole care in one app, with every change confirmed by her or her care team.", 3400)
    s.card("Medisense", "Patient app", "Home · assistant · booking · visits · plan · concerns · messages · documents", 2200)


def warm(page):
    page.goto(APP)
    page.get_by_text("Needs your attention").first.wait_for()
    navl = page.get_by_role("navigation", name="App sections")
    for tab in ["Visits", "My care", "Me", "Home"]:
        navl.get_by_role("button", name=tab, exact=True).click()
        page.wait_for_timeout(2500)
    navl.get_by_role("button", name=re.compile("Messages")).click()
    page.wait_for_timeout(2500)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    run(NAME, OUT, walkthrough, file_token("harper.txt"), a.dry, warm)


if __name__ == "__main__":
    main()
