"""
The admin app, end to end: Jo Marsh runs the practice from her phone.

    python scripts/demo-videos/record_app_admin.py [--dry]

Restore the e2e baseline before and after a take (d:/tmp/medisense/app_take.sh does both).
"""

import argparse
import pathlib
import re

from app_stage import BASE, AppStage, run
from e2e_stage import staff_token

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "Admin-App-Complete-Workflow"
APP = f"{BASE}/mobile/staff"
SLOT = re.compile(r"^(Mon|Tue|Wed|Thu|Fri), \d+ \w+, ")

CHAPTERS = [
    "Today's briefing",
    "Book someone new",
    "The team's schedule",
    "Ask Medisense",
    "Booking agent",
    "Operations agent",
    "Work, by access",
]


def nav(s: AppStage, name: str, settle: float = 1500):
    s.click(s.L.get_by_role("navigation", name="App sections").get_by_role("button", name=name, exact=True), settle)


def sheet(s: AppStage):
    return s.L.locator("[role=dialog]").last


def scroll_main(s: AppStage, y: int, settle: float = 1200):
    s.L.locator(".no-scrollbar.overflow-y-auto").first.evaluate(f"e => e.scrollBy({{top: {y}, behavior: 'smooth'}})")
    s.wait(settle)


def scroll_sheet(s: AppStage, y: int, settle: float = 1100):
    sheet(s).locator(".no-scrollbar.overflow-y-auto").first.evaluate(f"e => e.scrollBy({{top: {y}, behavior: 'smooth'}})")
    s.wait(settle)


def walkthrough(s: AppStage):
    L = s.L
    s.card("Medisense · Admin app", "The practice, in her pocket",
           "Jo Marsh, intake, scheduling and finance: the briefing, quick bookings and the AI agents, on her phone.", 600)
    s.setup("Admin app", "Jo Marsh · Intake · Scheduler · Finance", CHAPTERS, APP)
    s.settle(L.get_by_text("Safety escalations open").first)
    s.wait(2600)
    s.reveal()

    # 1 Briefing
    s.chapter(0)
    s.say("Today's briefing", "Counted from live records each morning. Every figure opens the list behind it.", 3000)
    scroll_main(s, 430, 1800)
    s.say("Today's briefing", "Quick actions, the practice today and the week's bookings, at a glance.", 2400)
    scroll_main(s, 520, 1800)
    s.say("Today's briefing", "Her own tasks from rules and colleagues, with what's overdue.", 2000)
    scroll_main(s, -1400, 800)

    # 2 Quick booking
    s.chapter(1)
    s.say("Book someone new", "A caller who isn't in Medisense yet. A name and phone are enough to book.", 300)
    s.click(L.get_by_role("button", name=re.compile("^Book someone new")).first, 1400)
    s.type(sheet(s).get_by_label("Full name"), "Peter Lawson", delay=40)
    s.type(sheet(s).get_by_label("Phone"), "0412 557 903", delay=40)
    s.click(sheet(s).get_by_role("button", name="OT", exact=True), 900)
    s.say("Book someone new", "Clinicians with their next real free times, checked against visits and leave.", 300)
    s.click(sheet(s).get_by_role("radio", name="Emma Clarke"), 900)
    scroll_sheet(s, 420, 900)
    s.click(sheet(s).get_by_role("radio", name="Home visit"), 400)
    s.click(sheet(s).get_by_role("radio", name=SLOT).first, 600)
    s.type(sheet(s).get_by_placeholder(re.compile("Called about")), "Fall at home last week; daughter will be there", delay=14)
    s.click(sheet(s).get_by_role("button", name="Book visit"), 600)
    s.settle(sheet(s).get_by_text("Visit booked").first)
    s.say("Book someone new", "Booked. A provisional record opens with an MRN, Emma is told, and intake completes the rest.", 3200)
    s.click(L.get_by_role("button", name="Close Book someone new"), 900)

    # 3 Schedule
    s.chapter(2)
    nav(s, "Schedule", 1800)
    s.say("The team's schedule", "Every clinician's visits, day by day: home visits and video calls.", 300)
    s.settle(L.locator("ol li button").first)
    s.wait(1600)
    s.click(L.get_by_role("group", name="Choose a day").get_by_role("button").nth(1), 1600)
    s.say("The team's schedule", "Filter by clinician; Peter's new visit is already on Emma's day.", 300)
    s.click(L.get_by_role("group", name="Clinician").get_by_role("button", name="Emma Clarke"), 1800)
    peter = L.locator("ol li button").filter(has_text="Peter Lawson")
    if peter.count():
        s.click(peter.first, 1600)
    else:
        s.click(L.locator("ol li button").first, 1600)
    s.say("The team's schedule", "Each visit with its time, service, confirmation and reference.", 2400)
    s.click(L.get_by_role("button", name=re.compile("^Close ")).last, 900)

    # 4 Ask
    s.chapter(3)
    nav(s, "Ask AI", 1400)
    s.say("Ask Medisense", "Ask in plain English. Answers come from Medisense records and link to where she acts.", 300)
    s.click(L.get_by_role("button", name="Which referrals need attention today?"), 600)
    s.settle(L.get_by_text("AI answer. Check before acting", exact=False).first)
    s.wait(1200)
    scroll_main(s, 300, 2400)
    scroll_main(s, -600, 600)

    # 5 Booking agent
    s.chapter(4)
    s.say("Booking agent", "Fixed tasks with real free times. Nothing is booked until she confirms.", 300)
    s.click(L.get_by_role("tab", name="Booking agent"), 1400)
    s.click(L.get_by_role("button", name=re.compile("Assign and book a waiting patient")), 1000)
    s.click(L.get_by_role("button", name="Lucas Ferreira", exact=True), 600)
    s.settle(L.get_by_text(re.compile("top eligible therapists")).first)
    L.get_by_text(re.compile("top eligible therapists")).first.scroll_into_view_if_needed()
    s.say("Booking agent", "Only eligible clinicians, each with a score and the reasons behind it.", 2000)
    s.click(L.get_by_role("button", name=re.compile("^Best match")), 1000)
    s.click(L.get_by_role("button", name=SLOT).first, 600)
    s.settle(L.get_by_text("Needs your confirmation").first)
    L.get_by_text("Needs your confirmation").first.scroll_into_view_if_needed()
    s.say("Booking agent", "A proposal with its checks. She confirms; the first visit is held for the clinician.", 1600)
    s.click(L.get_by_role("button", name="Confirm", exact=True).last, 600)
    s.settle(L.get_by_text(re.compile(r"^Done\.")).first)
    s.wait(2000)

    # 6 Operations agent
    s.chapter(5)
    s.say("Operations agent", "The operations agent answers from live records, with facts and sources.", 300)
    s.click(L.get_by_role("tab", name="Operations"), 1200)
    s.click(L.get_by_role("button", name="Which invoices are overdue?"), 600)
    L.get_by_text("Checking live records…").first.wait_for(state="detached", timeout=150000)
    s.wait(1400)
    scroll_main(s, 360, 2600)
    scroll_main(s, -800, 600)

    # 7 Work
    s.chapter(6)
    nav(s, "Work", 1600)
    s.say("Work, by access", "Every portal section her responsibilities open. Others never see what isn't theirs.", 2800)
    scroll_main(s, 520, 2000)
    s.click(L.get_by_role("button", name="Referrals and intake", exact=True), 600)
    s.settle(L.locator("iframe[title='Referrals and intake']"))
    s.wait(3600)
    s.say("Work, by access", "The full portal screen inside the app, with the same live data.", 1800)
    s.click(L.get_by_role("button", name="Back"), 900)
    nav(s, "Me", 1600)
    s.say("Work, by access", "Her roles, and what each one opens. Menus follow responsibilities.", 2600)
    s.chapter(len(CHAPTERS))
    nav(s, "Home", 1200)
    s.say("Admin app", "The whole practice from anywhere, with people approving every AI step.", 3000)
    s.card("Medisense", "Admin app", "Briefing · quick booking · schedule · Ask AI · booking agent · operations agent", 2200)


def warm(page):
    page.goto(APP)
    page.get_by_text("Safety escalations open").first.wait_for()
    navl = page.get_by_role("navigation", name="App sections")
    for tab in ["Schedule", "Ask AI", "Work", "Me", "Home"]:
        navl.get_by_role("button", name=tab, exact=True).click()
        page.wait_for_timeout(2500)
    page.goto(f"{BASE}/care/referrals")
    page.wait_for_timeout(4000)
    page.goto(f"{BASE}/api/care/schedule/quick")
    page.wait_for_timeout(1000)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    run(NAME, OUT, walkthrough, staff_token("jo.marsh@medisense.test"), a.dry, warm)


if __name__ == "__main__":
    main()
