"""
The patient journey in four short films, core workflow only (no reports or insights):

  1. A patient comes into Medisense   admin on the web: referral read by AI, documents chased,
                                       therapist assigned and first visit booked, a caller booked by phone
  2. The therapist takes over          therapist app: her day, briefing, AI note, patient file, assessment, messages
  3. The patient's side                patient app: home, booking with AI, visits, plan and coach, concern, messages
  4. The admin keeps care moving       admin on the web and phone: schedule, follow-up booking, patient
                                       requests, verified billing

    E2E_BASE=http://localhost:3000 python scripts/demo-videos/record_journey.py --part 1 [--dry]

Restore the e2e baseline before and after each take: the agents really book and confirm.
"""

import argparse
import json
import pathlib
import re
import shutil
import time

import record_full_system as F
from app_stage import PAGE as APP_PAGE
from app_stage import AppStage
from e2e_stage import BASE, file_token, staff_token
from record import OVERLAY
from record_tour import APP_URL

NAMES = {
    1: "Journey-1-A-Patient-Comes-In",
    2: "Journey-2-The-Therapist-Takes-Over",
    3: "Journey-3-The-Patients-Side",
    4: "Journey-4-The-Admin-Keeps-Care-Moving",
}
LUCAS = "6af876dae62e775d1bec9a61"
OLIVIA = F.OLIVIA
SLOT = F.SLOT
JO = "jo.marsh@medisense.test"
NEIL = "neil.hensley@medisense.test"
SARAH = "sarah.thompson@medisense.test"


# ------------------------------------------------------------------ helpers for the phone stage


def stage(t: F.Tour, token: str) -> AppStage:
    """Opens the phone stage under the current title card."""
    t.as_user(token)
    t.page.goto(APP_URL, wait_until="domcontentloaded")
    s = AppStage(t.page, t.slow, t.t0)
    s.waits = t.waits
    t.page.evaluate("window.__caption && window.__caption('')")
    t.lift(300)
    return s


def nav(s: AppStage, name, settle: float = 1500):
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


def close_sheet(s: AppStage, settle: float = 900):
    s.click(sheet(s).get_by_role("button", name="Close").last, settle)


def end_card(t: F.Tour, eyebrow: str, title: str, sub: str, hold: float = 3600):
    t.card(eyebrow, title, sub, hold)


# ------------------------------------------------------------------ 1 · a patient comes in


def part1(t: F.Tour):
    d, P = t.d, t.page
    t.card("The patient journey · 1 of 4", "A patient comes into Medisense",
           "From a referral email to a booked first visit: the admin's part.", 2400)
    t.card("Step 1", "A referral arrives", "Jo Marsh, intake officer, opens Referrals and intake.", 900)
    t.as_user(staff_token(JO))
    t.web("/care/referrals", lambda p: p.locator("main table tbody tr").first)
    t.lift()
    t.say("1", "Every referral and the stage it's at: waiting for information, triage, funding review, accepted.", 2600)
    t.say("2", "A new referral comes in by email. Jo pastes it, and AI reads it into the referral form.", 300)
    d.click(P.get_by_role("button", name="New").first, pause_after=500)
    d.click(P.get_by_role("button", name=re.compile("^New referral")), pause_after=800)
    dlg = P.get_by_role("dialog")
    d.click(dlg.get_by_role("button", name="Use sample referral"), pause_after=1400)
    d.click(dlg.get_by_role("button", name=re.compile("Read referral with AI")), pause_after=300)
    P.wait_for_url(re.compile("/care/new"), timeout=150000)
    t.settle(P.get_by_role("region", name="AI draft"))
    t.wait(1200)
    t.say("3", "The form opens filled in, marked as an AI draft. What the email didn't say is listed for Jo.", 2800)
    t.say("4", "Consent is never ticked by AI. Jo checks each step against the email before submitting.", 2400)

    t.card("Step 2", "Chasing what's missing", "The operations agent prepares the request; Jo confirms it.", 900)
    t.web("/care/operations?tab=agent", lambda p: p.locator("#agent-q"))
    t.lift()
    t.say("5", "Another referral is waiting on documents. Jo asks the operations agent in plain English.", 300)
    d.type(P.locator("#agent-q"), "Request the missing documents for Casey Morgan's referral", delay=16)
    d.click(P.locator("form").filter(has=P.locator("#agent-q")).get_by_role("button", name="Ask"), pause_after=300)
    card = P.locator("div.rounded-card").filter(has_text="Request missing items").filter(
        has=P.get_by_role("button", name="Confirm", exact=True)).last
    t.settle(card)
    t.say("6", "A proposal: the referral, what will be sent, its checks and who approves. Nothing is sent yet.", 2600)
    d.click(card.get_by_role("button", name="Confirm", exact=True), pause_after=400)
    t.settle(P.locator("div.rounded-card").filter(has_text="Request missing items").get_by_text("Completed", exact=True).first)
    t.wait(1400)

    t.card("Step 3", "Matched to a therapist", "Accepted patients waiting for a therapist are assigned and booked.", 900)
    t.web("/care", lambda p: p.locator("main table tbody tr").first)
    t.lift()
    t.say("7", "Lucas Ferreira's referral has been accepted. He's waiting for a therapist.", 300)
    top = P.locator("form").filter(has=P.get_by_label("Ask Medisense", exact=True))
    d.click(top.get_by_role("button", name="Ask"), pause_after=900)
    panel = P.get_by_role("dialog", name="Ask Medisense AI")
    d.click(panel.get_by_role("tab", name="Booking agent"), pause_after=1200)
    d.click(panel.get_by_role("button", name=re.compile("Assign and book a waiting patient")), pause_after=1000)
    d.click(panel.get_by_role("button", name="Lucas Ferreira", exact=True), pause_after=600)
    eligible = panel.get_by_text(re.compile("top eligible therapists")).first
    t.settle(eligible)
    eligible.scroll_into_view_if_needed()
    t.wait(600)
    t.say("8", "The booking agent checks discipline, region, credentials and capacity. Only eligible therapists, with reasons.", 2800)
    d.click(panel.get_by_role("button", name=re.compile("^Best match")), pause_after=1000)
    t.say("9", "Real free times only, checked against visits and leave.", 300)
    d.click(panel.get_by_role("button", name=SLOT).first, pause_after=600)
    confirm = panel.get_by_text("Needs your confirmation").first
    t.settle(confirm)
    confirm.scroll_into_view_if_needed()
    t.wait(500)
    t.say("10", "Jo confirms: Lucas is assigned and his first visit is held. The therapist is told.", 300)
    d.click(panel.get_by_role("button", name="Confirm", exact=True).last, pause_after=600)
    t.settle(panel.get_by_text(re.compile(r"^Done\.")).first)
    t.wait(1800)

    t.say("11", "Some patients simply call. A name and a phone number are enough to book them in.", 300)
    d.click(panel.get_by_role("tab", name="New to Medisense"), pause_after=1000)
    d.type(panel.get_by_label("Full name"), "Peter Lawson", delay=40)
    d.type(panel.get_by_label("Phone"), "0412 557 903", delay=40)
    d.click(panel.get_by_role("button", name="OT", exact=True), pause_after=900)
    d.click(panel.get_by_role("radio", name="Emma Clarke"), pause_after=900)
    d.click(panel.get_by_role("radio", name="Home visit"), pause_after=400)
    d.click(panel.get_by_role("radio", name=SLOT).first, pause_after=600)
    d.type(panel.get_by_placeholder(re.compile("Called about")), "Fall at home last week; daughter will be there", delay=14)
    d.click(panel.get_by_role("button", name="Book visit"), pause_after=600)
    t.settle(panel.get_by_text("Visit booked").first)
    t.say("12", "Booked. Peter gets a record with an MRN, Emma is told, and intake completes the rest later.", 3000)
    P.keyboard.press("Escape")
    t.wait(500)

    t.card("Step 4", "Lucas is now a patient", "One record, with his MRN, his therapist and his first visit.", 900)
    t.web(f"/care/{LUCAS}", lambda p: p.get_by_role("region", name="Quick actions"))
    t.lift()
    t.say("13", "His record: the MRN he signs in with, his services and the therapist now assigned.", 2800)
    d.click(P.get_by_role("tab", name=re.compile("^Follow-ups")), pause_after=1600)
    t.say("14", "The first visit is on the calendar. From here, the therapist takes over.", 2600)
    end_card(t, "Next · 2 of 4", "The therapist takes over", "Her day, the visit, the note and the plan.")


# ------------------------------------------------------------------ 2 · the therapist takes over


THERAPIST_CHAPTERS = ["Her day", "Visit briefing", "Notes with AI", "Patient file", "Assessment", "Messages"]


def part2(t: F.Tour):
    t.card("The patient journey · 2 of 4", "The therapist takes over",
           "Sarah Thompson, occupational therapist, runs her day from the therapist app.", 2400)
    s = stage(t, staff_token(SARAH))
    L = s.L
    s.setup("Therapist app", "Sarah Thompson · Occupational Therapist", THERAPIST_CHAPTERS, f"{BASE}/mobile/therapist")
    s.settle(L.get_by_text("Today's schedule").first)
    s.wait(2400)
    s.reveal()

    s.chapter(0)
    s.say("Her day", "Her visits, notes to write, tasks and new patients, all on one screen.", 3200)
    scroll_main(s, 520, 1800)
    s.say("Her day", "Visits coming up sit on a timeline, home visits and video calls marked.", 2400)

    s.chapter(1)
    s.say("Visit briefing", "Before she knocks: precautions, consent, the last visit and the current goals.", 300)
    upcoming = L.get_by_role("region", name="Coming up")
    s.settle(upcoming)
    upcoming.scroll_into_view_if_needed()
    s.wait(600)
    s.click(upcoming.get_by_role("button").first, 2400)
    scroll_sheet(s, 320, 2000)
    scroll_sheet(s, -320, 700)
    close_sheet(s)

    s.chapter(2)
    s.say("Notes with AI", "After the visit, she jots rough notes or dictates them.", 300)
    notes = L.get_by_role("region", name="Notes to write")
    s.settle(notes)
    notes.scroll_into_view_if_needed()
    s.wait(1200)
    s.click(notes.get_by_role("button").first, 1800)
    s.type(sheet(s).get_by_label("Your rough notes"),
           "Kitchen practice: made a cup of tea at the bench with the rollator, two rests. Knee pain 4/10 after. "
           "Daughter present. Keep weekly visits; trial a perching stool next time.", delay=10)
    s.say("Notes with AI", "AI arranges what she wrote into a SOAP draft. It never invents findings.", 300)
    s.click(sheet(s).get_by_role("button", name=re.compile("Draft the note with AI")), 600)
    s.settle(sheet(s).get_by_text("AI draft, needs your approval").first)
    s.wait(2200)
    scroll_sheet(s, 300, 1500)
    s.say("Notes with AI", "The clinical assessment is always in her own words. She adds it, then signs.", 300)
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
    scroll_sheet(s, 400, 900)
    s.click(sheet(s).get_by_role("button", name=re.compile("Sign note as")), 600)
    s.settle(s.L.get_by_text("Note signed").first)
    s.wait(1600)
    s.say("Notes with AI", "Signed. The family sees only the plain-language summary in their app.", 2400)
    if L.locator("[role=dialog]").count():
        close_sheet(s)

    s.chapter(3)
    nav(s, "Patients", 1600)
    s.say("Patient file", "Each patient's file is one tap away.", 300)
    s.click(L.get_by_role("button", name="Open Isabella Kowalski"), 1800)
    s.settle(L.get_by_role("tab", name="History"))
    s.wait(1400)
    s.say("Patient file", "The full history: visits, notes, assessments and plans, newest first.", 2600)
    s.click(L.get_by_role("tab", name="Goals", exact=True), 2400)
    s.say("Patient file", "Goals with where the patient started, where they are now and the target.", 2400)

    s.chapter(4)
    s.click(L.get_by_role("tab", name="Assess", exact=True), 1800)
    s.say("Assessment", "Assessments run in the app: each visit's findings, then a report AI drafts from them.", 300)
    s.click(L.get_by_role("button", name="Visits, report and signing"), 2000)
    s.settle(sheet(s).get_by_text("Visit 1").first)
    s.wait(1400)
    s.click(sheet(s).get_by_role("tab", name="Report"), 1800)
    s.say("Assessment", "The report cites the evidence behind every section, from documented findings only.", 2800)
    scroll_sheet(s, 420, 1700)
    s.click(sheet(s).get_by_role("tab", name="Sign"), 1600)
    s.say("Assessment", "Signing stays blocked until nothing is missing; rules list exactly what's left.", 2600)
    close_sheet(s)

    s.chapter(5)
    s.click(L.get_by_role("button", name="Back").first, 1000)
    nav(s, "Messages", 1600)
    s.say("Messages", "Messages with patients and families stay inside Medisense, with files, clips and voice notes.", 300)
    s.click(L.get_by_role("button", name=re.compile("Harper Nguyen")).first, 1800)
    s.settle(L.get_by_text(re.compile("See you both")).first)
    s.wait(1200)
    L.get_by_text(re.compile("See you both")).last.scroll_into_view_if_needed()
    s.wait(2400)
    s.chapter(len(THERAPIST_CHAPTERS))
    s.say("Therapist app", "Her whole day on her phone. AI drafts; she decides and signs.", 3000)
    s.card("Next · 3 of 4", "The patient's side", "What the patient sees, and what they can do themselves.", 3400)


# ------------------------------------------------------------------ 3 · the patient's side


PATIENT_CHAPTERS = ["Home", "Book a visit with AI", "Visits", "My plan and home coach", "Report a concern", "Messages"]


def part3(t: F.Tour):
    t.card("The patient journey · 3 of 4", "The patient's side",
           "Harper Nguyen, 74, signs in with her MRN. Her care, in her pocket.", 2400)
    s = stage(t, file_token("harper.txt"))
    L = s.L
    s.setup("Patient app", "Harper Nguyen · Aspley", PATIENT_CHAPTERS, f"{BASE}/mobile/patient")
    s.settle(L.get_by_text("Needs your attention").first)
    s.wait(2400)
    s.reveal()

    s.chapter(0)
    s.say("Home", "What needs her attention first: visits to confirm, a plan to read, feedback to give.", 3000)
    scroll_main(s, 520, 1900)
    s.say("Home", "Her therapist, her next visits and new files, at a glance.", 2200)
    scroll_main(s, -900, 900)

    s.chapter(1)
    s.say("Book a visit with AI", "She books in her own words. Only real free times with her own therapist are offered.", 300)
    s.click(L.get_by_role("button", name=re.compile("Ask Medisense")).first, 1400)
    s.click(L.get_by_role("tab", name="Booking agent"), 1400)
    s.click(L.get_by_role("button", name="Book a video visit on Tuesday morning").first, 600)
    s.settle(L.get_by_text(re.compile("AI understood")).first)
    s.wait(1500)
    slot = L.get_by_role("button", name=re.compile(r"^(Mon|Tue|Wed|Thu|Fri), \d+ \w+, ")).first
    s.settle(slot)
    slot.scroll_into_view_if_needed()
    s.wait(900)
    s.click(slot, 600)
    s.settle(L.get_by_text("Needs your confirmation").first)
    L.get_by_text("Needs your confirmation").first.scroll_into_view_if_needed()
    s.say("Book a visit with AI", "She sees exactly what will happen and confirms. The clinic confirms the held visit.", 1400)
    s.click(L.get_by_role("button", name="Confirm", exact=True).last, 600)
    s.settle(L.get_by_text(re.compile(r"^Done\.")).first)
    s.wait(2000)
    s.click(L.get_by_role("button", name="Close").last, 900)

    s.chapter(2)
    nav(s, "Visits", 1800)
    s.say("Visits", "Every visit with its date and type: a home visit or a video call.", 2400)
    s.click(L.locator("button").filter(has_text=re.compile("Booked")).first, 1800)
    s.say("Visits", "She confirms she'll be there, or asks to change or cancel. Video visits open from here.", 300)
    there = L.get_by_role("button", name=re.compile("be there"))
    if there.count():
        s.click(there, 2200)
    else:
        s.wait(2400)
    s.click(L.get_by_role("button", name="Close").last, 900)

    s.chapter(3)
    nav(s, "My care", 1800)
    s.say("My plan and home coach", "Her treatment plan: goals with progress and the home activities her therapist approved.", 2800)
    guide = L.locator("button").filter(has_text="Guide me")
    if guide.count():
        s.click(guide.first, 2000)
        s.say("My plan and home coach", "The home coach explains each activity step by step, in plain words.", 3000)
        scroll_sheet(s, 360, 1500)
        s.click(L.get_by_role("button", name="Close").last, 900)
    else:
        scroll_main(s, 600, 2200)
        scroll_main(s, -900, 800)

    s.chapter(4)
    nav(s, "Home", 1200)
    s.say("Report a concern", "If something gets harder, she tells her care team. A rule routes it to her therapist.", 300)
    s.click(L.get_by_role("button", name="Report a concern"), 1400)
    s.click(L.get_by_role("radio", name="Worse", exact=True), 400)
    s.click(L.get_by_role("radio", name="Yes", exact=True), 400)
    s.click(L.get_by_role("checkbox", name="Mobility", exact=True), 300)
    s.type(L.get_by_label("Tell us what happened"), "Standing at the kitchen bench is harder this week; I had to sit down twice.", delay=12)
    s.click(L.get_by_role("button", name="Send to my care team"), 600)
    s.settle(L.get_by_text(re.compile("Withdraw this report|sent", re.I)).first)
    s.wait(2400)
    s.click(L.get_by_role("button", name="Close").last, 900)

    s.chapter(5)
    nav(s, re.compile("Messages"), 1600)
    s.say("Messages", "Messages with Sarah: her home program, photos, video clips and voice notes.", 300)
    s.click(L.get_by_role("button", name=re.compile("Sarah Thompson")).first, 1800)
    s.settle(L.get_by_text(re.compile("See you both")).first)
    s.wait(1000)
    L.get_by_text(re.compile("See you both")).last.scroll_into_view_if_needed()
    s.wait(2400)
    s.chapter(len(PATIENT_CHAPTERS))
    s.say("Patient app", "Her care in one app. Clinical notes, risks and recordings never appear here.", 3000)
    s.card("Next · 4 of 4", "The admin keeps care moving", "Schedules, requests and billing behind every visit.", 3400)


# ------------------------------------------------------------------ 4 · the admin keeps care moving


def part4(t: F.Tour):
    d, P = t.d, t.page
    t.card("The patient journey · 4 of 4", "The admin keeps care moving",
           "Behind every visit: the schedule, patient requests, verified billing and who has access.", 2400)
    t.card("The schedule", "The whole team's calendar", "Every clinician, with confirmations and exceptions.", 900)
    t.as_user(staff_token(JO))
    t.web("/care/schedule", lambda p: p.get_by_role("button", name=re.compile("^Book a visit")))
    t.lift()
    t.say("1", "Every clinician's visits this week: home visits, video calls, confirmations and reminders.", 2800)
    t.say("2", "Exceptions such as a visit not yet confirmed are flagged before they become a missed visit.", 2400)

    t.card("Follow-up visits", "Booking the next visit", "From the patient's record, with real free times.", 900)
    t.web(f"/care/{OLIVIA}", lambda p: p.get_by_role("region", name="Quick actions"))
    t.lift()
    t.say("3", "Olivia needs her next visit. Jo books it from her record: choose the clinician, see real free times.", 300)
    d.click(P.get_by_role("button", name=re.compile("^Book a visit")).first, pause_after=900)
    dlg = P.get_by_role("dialog")
    d.click(dlg.get_by_role("radio").first, pause_after=900)
    d.click(dlg.get_by_role("radio", name=SLOT).first, pause_after=500)
    d.click(dlg.get_by_role("button", name="Book visit"), pause_after=300)
    t.settle(dlg.get_by_text("Visit booked").first)
    t.say("4", "Booked. Olivia and her clinician are both told, and it's on the calendar.", 2400)
    P.keyboard.press("Escape")
    t.wait(500)

    t.card("Patient requests", "Changes patients ask for", "Sent from the patient app; a person approves or declines.", 900)
    t.web("/care/patient-requests", lambda p: p.get_by_role("button", name=re.compile("Approve")).first)
    t.lift()
    t.say("5", "When a patient updates their details in the app, the change waits here for review.", 2600)
    row = P.locator("main").locator("li, tr, article").filter(has_text="Noah Bennett").filter(
        has=P.get_by_role("button", name=re.compile("Approve"))).first
    t.say("6", "Jo checks Noah's new email address and approves it. The record updates, and Noah is told.", 300)
    d.click(row.get_by_role("button", name=re.compile("Approve")), pause_after=1800)
    t.wait(1200)

    t.card("Billing", "Only delivered visits are billed", "Rules verify each visit before it reaches the queue.", 900)
    t.web("/care/billing?tab=queue", lambda p: p.locator("main table tbody tr").first)
    t.lift()
    t.say("7", "Delivered, verified visits arrive as billable lines, with funding and agreement checks already run.", 2800)
    t.say("8", "No timesheets to reconcile: rules check, and a person approves each claim.", 2400)

    t.card("Users and access", "Who can do what",
           "Neil Hensley, Super Admin, gives each person access to exactly their work.", 1000)
    t.as_user(staff_token(NEIL))
    t.web("/care/users", lambda p: p.locator("main table tbody tr").first)
    t.lift()
    t.say("9", "Every staff login in one place: office staff and therapists, their responsibilities and last sign-in.", 2800)
    t.say("10", "A new scheduler starts on Monday. Neil creates her account.", 300)
    d.click(P.get_by_role("button", name="Create user").first, pause_after=900)
    dlg = P.get_by_role("dialog")
    d.type(dlg.get_by_label("Full name"), "Chloe Bennett", delay=40)
    d.type(dlg.get_by_label("Work email"), "chloe.bennett@medisense.test", delay=24)
    d.type(dlg.get_by_label("Phone (optional)"), "0412 300 900", delay=30)
    d.click(dlg.get_by_text("Scheduler", exact=True), pause_after=500)
    d.click(dlg.get_by_text("Finance", exact=True), pause_after=600)
    # Bring the menu preview into view, below the responsibilities.
    dlg.get_by_role("region", name="What they'll see").evaluate("e => e.scrollIntoView({behavior: 'smooth', block: 'center'})")
    t.wait(1200)
    t.say("11", "Her responsibilities decide her menu. The preview shows exactly what she will see, and nothing more.", 3000)
    d.click(dlg.get_by_role("button", name="Create user", exact=True), pause_after=400)
    t.settle(dlg.get_by_text("has been created").first)
    t.wait(800)
    t.say("12", "A temporary password, shown once. She chooses her own the first time she signs in.", 2800)
    d.click(dlg.get_by_role("button", name="Done"), pause_after=900)
    row = P.locator("main table tbody tr").filter(has_text="Sam Rivera")
    t.say("13", "Manage any account: change responsibilities, reset a password, or deactivate someone who leaves.", 300)
    d.click(row.get_by_role("button", name=re.compile("^Manage")), pause_after=1400)
    t.settle(P.get_by_role("dialog").get_by_text("What they can open").first)
    t.wait(2400)
    P.keyboard.press("Escape")
    t.wait(500)

    t.card("On the go", "The admin app", "The same work from the phone.", 1000)
    s = stage(t, staff_token(JO))
    L = s.L
    s.setup("Admin app", "Jo Marsh · Intake · Scheduler · Finance", ["Today's briefing", "The team's schedule"], f"{BASE}/mobile/staff")
    s.settle(L.get_by_text("Safety escalations open").first)
    s.wait(2200)
    s.reveal()
    s.chapter(0)
    s.say("Today's briefing", "What needs her today, counted from live records. Every figure opens the list behind it.", 3000)
    s.chapter(1)
    nav(s, "Schedule", 1800)
    s.settle(L.locator("ol li button").first)
    s.wait(1200)
    s.say("The team's schedule", "Every visit by day and clinician, with its status, wherever she is.", 3000)
    s.chapter(2)
    s.card("Medisense", "Systems supporting therapists",
           "A patient comes in, a therapist cares for them, the patient stays involved, and the admin keeps it moving.", 4400)


PARTS = {1: part1, 2: part2, 3: part3, 4: part4}
WARM = {
    1: (JO, ["/care/referrals", "/care/new", "/care/operations?tab=agent", "/care", "/api/care/schedule/quick", f"/care/{LUCAS}"]),
    2: (SARAH, ["/mobile/therapist"]),
    3: (None, ["/mobile/patient"]),
    4: (JO, ["/care/schedule", f"/care/{OLIVIA}", "/care/patient-requests", "/care/billing?tab=queue", "/mobile/staff"]),
    5: (NEIL, ["/care/users"]),
}


def main():
    from playwright.sync_api import sync_playwright

    ap = argparse.ArgumentParser()
    ap.add_argument("--part", type=int, required=True, choices=[1, 2, 3, 4])
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    name = NAMES[a.part]
    tmp = F.OUT / f".tmp-{name}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
                                                          "--autoplay-policy=no-user-gesture-required", "--lang=en-AU"])
        opts = dict(viewport={"width": 1440, "height": 900}, locale="en-AU", timezone_id="Australia/Brisbane")

        def context(record: bool):
            extra = {"record_video_dir": str(tmp), "record_video_size": {"width": 1440, "height": 900}} if record else {}
            ctx = browser.new_context(**opts, **extra)
            ctx.add_init_script(OVERLAY)
            ctx.add_init_script(F.COVER)
            ctx.add_init_script(F.PREMIUM)
            ctx.route(APP_URL, lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=APP_PAGE))
            return ctx

        # Load the screens once, unrecorded, so nothing loads for the first time on camera.
        for who, paths in [WARM[a.part]] + ([WARM[5]] if a.part == 4 else []):
            wctx = context(False)
            wctx.add_cookies([{"name": "medisense_session", "value": staff_token(who) if who else file_token("harper.txt"), "url": BASE}])
            wp = wctx.new_page()
            for path in paths:
                try:
                    wp.goto(BASE + path, timeout=180000)
                    wp.wait_for_timeout(4500)
                except Exception as error:
                    print("warm-up note:", path, str(error).splitlines()[0][:100])
            wctx.close()

        ctx = context(not a.dry)
        page = ctx.new_page()
        page.set_default_timeout(150000)
        page.goto(APP_URL)
        t = F.Tour(page, ctx, 0.3 if a.dry else 1.0)
        ok = True
        started = time.time()
        try:
            PARTS[a.part](t)
        except Exception as error:
            ok = False
            print(f"Stopped: {error}".splitlines()[0])
            page.screenshot(path=str(F.OUT / f"{name}-failed.png"))
        video = page.video
        ctx.close()
        browser.close()
        if video and not a.dry:
            final = F.OUT / f"{name}{'' if ok else '-incomplete'}.webm"
            final.unlink(missing_ok=True)
            pathlib.Path(video.path()).rename(final)
            (F.OUT / f".{name}.waits.json").write_text(json.dumps(t.waits))
            shutil.rmtree(tmp, ignore_errors=True)
            print(f"{'Saved' if ok else 'Saved partial'} {final} ({time.time() - started:.0f}s)")
        else:
            print("dry run", "ok" if ok else "stopped", f"{time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
