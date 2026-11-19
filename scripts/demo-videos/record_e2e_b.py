"""
Connected demonstration B: an assessment over more than one visit → AI-drafted report → signed →
released to the patient, then the follow-up booked through the copilot and the booking agent.

    python scripts/demo-videos/record_e2e_b.py [--dry]

Sarah Thompson (web, then therapist app) and Harper Nguyen (patient app).
Restore the e2e baseline before and after a take.
"""

import argparse
import pathlib
import re

from e2e_stage import Stage, file_token, host, run, staff_token
from record_module12 import choose, ready, tab
from record_module16 import NDIS, accept_section, open_row, resolve_all, search

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "E2E-B-Assessment-to-Signed-Report"


def web_part(s: Stage):
    d, W = s.d, s.W
    s.card("Medisense · Connected demonstration B", "From assessment to a signed report",
           "Findings gathered over more than one visit, a report drafted by AI from that evidence only, "
           "signed by the therapist and released to the patient. Then the follow-up is booked.",
           "Sarah Thompson · web and therapist app   ·   Harper Nguyen · patient app", 1800)
    s.web(f"{host('sarah')}/therapist/progress", "Sarah Thompson · Occupational Therapist · web")
    s.settle(W.locator("table, [role=tablist]").first)
    d.wait(1600)
    s.reveal()
    s.say("1", "Sarah Thompson's episodes: goals against baseline and target, reviews and reports due.", 3000)
    tab(d, "Episodes")
    search(d, "Harper")
    open_row(d, "Harper")
    d.wait(1600)
    s.say("2", "Harper Nguyen's occupational therapy episode. Progress is shown only where it can be calculated.", 3200)

    tab(d, "Reassessment")
    s.say("3", "Visit one, at home: Sarah starts the reassessment and records what she observed.", 500)
    d.click(W.get_by_role("button", name="Start reassessment"), pause_after=1600)
    d.type(W.get_by_label("Finding"), "Prepares a sandwich three days a week using the picture recipe card.")
    d.click(W.get_by_role("button", name="Save finding"), pause_after=1600)
    s.say("4", "It stays In progress between visits. Nothing is final until she signs.", 500)
    d.wait(1200)  # the saved finding re-renders the form
    for attempt in range(3):
        try:
            d.click(W.get_by_role("button", name="Save and continue next visit"), pause_after=1800)
            break
        except Exception:
            d.wait(1000)
    s.say("5", "Visit two, by telehealth: another domain, another setting, added to the same reassessment.", 500)
    choose(d, "Review domain", "Mobility")
    choose(d, "Review setting", "Telehealth")
    d.type(W.get_by_label("Finding"), "Kitchen transfers observed by video: stand-by supervision only.")
    d.click(W.get_by_role("button", name="Save finding"), pause_after=1600)
    s.say("6", "Sarah writes her own interpretation, confirms risk and consent, and signs.", 400)
    d.type(W.get_by_label("Clinical interpretation"),
           "Meal preparation goal met with written prompts; transfers stable. Continue the plan at a reduced frequency.")
    d.click(W.get_by_label("Risks and consent reviewed for this reassessment"), pause_after=400)
    d.click(W.get_by_role("button", name="Sign reassessment"), pause_after=2400)

    tab(d, "Reports")
    s.say("7", "An NDIS progress report, created from the episode.", 400)
    d.click(W.get_by_role("button", name="Create report"), pause_after=600)
    s.settle(W.get_by_role("tab", name="Compose"))
    d.wait(1400)
    s.say("8", "AI drafts each section from the signed evidence only, with the visits it came from. The draft never reaches Harper.", 500)
    d.click(W.get_by_role("button", name="Draft with AI"), pause_after=800)
    s.settle(W.get_by_text("AI draft · not clinically verified").first)
    d.wait(2600)
    s.say("9", "Sarah reviews and accepts every section herself.", 400)
    for title in NDIS:
        accept_section(d, title)
    tab(d, "Checks & sign")
    s.say("10", "Rules flag data gaps first. She resolves each one, confirms the checklist and signs.", 800)
    resolve_all(d, "Checked against the evidence")
    W.get_by_text("data check(s) first").wait_for(state="hidden", timeout=60000)
    d.wait(1200)
    box = W.get_by_label("I reviewed this report against the checklist.")
    for _ in range(4):
        if box.is_checked():
            break
        d.click(box, pause_after=900)
    sign = W.get_by_role("button", name="Sign report")
    for _ in range(40):
        if sign.is_enabled():
            break
        if not box.is_checked():
            d.click(box, pause_after=600)
        d.wait(500)
    d.click(sign, pause_after=600)
    s.settle(W.get_by_text("Signed", exact=False).first)
    d.wait(2000)
    tab(d, "Release")
    s.say("11", "Only the signed version can be released, after the recipient's authority and consent are checked.", 600)
    d.click(W.get_by_label("Authority verified (scope and expiry)"), pause_after=400)
    d.click(W.get_by_label("Consent for this release verified"), pause_after=400)
    d.click(W.get_by_role("button", name="Release report"), pause_after=2800)


def phone_part(s: Stage):
    L, R = s.L, s.R
    s.card("Therapist app and patient app", "Released, then followed up",
           "Harper reads the signed report on her phone. Sarah asks the copilot and books the follow-up.", "", 1200)
    s.phones("Released report and follow-up",
             (f"{host('sarah')}/mobile/therapist", "Therapist app", "Sarah Thompson"),
             (f"{host('harper')}/mobile/patient", "Patient app", "Harper Nguyen"))
    s.settle(L.get_by_text("Today's schedule").first)
    s.settle(R.get_by_text("Needs your attention").first)
    s.wait(1200)
    s.reveal()
    lnav = L.get_by_role("navigation", name="App sections")
    rnav = R.get_by_role("navigation", name="App sections")

    s.focus("R")
    s.caption("12", "Harper sees the released report under Documents, marked new. Drafts and clinical notes never appear here.", 300)
    s.click(rnav.get_by_role("button", name="Me", exact=True), 1400)
    s.click(R.get_by_role("tab", name=re.compile("^Documents")), 1600)
    s.click(R.get_by_role("button", name=re.compile("NDIS therapy progress report")).first, 3200)
    s.click(R.get_by_role("button", name="Close").last, 800)

    s.focus("L")
    s.caption("13", "Sarah asks the copilot. It answers from Harper's records she can access, and cites them.", 300)
    s.click(lnav.get_by_role("button", name="Patients", exact=True), 1200)
    s.click(L.get_by_role("button", name="Open Harper Nguyen"), 1400)
    s.click(L.get_by_role("tab", name="AI", exact=True), 1200)
    s.click(L.get_by_role("tab", name="Copilot", exact=True), 1200)
    s.type(L.get_by_placeholder("Ask the copilot"), "Summarise Harper's latest assessment and prepare a follow-up", delay=18)
    s.click(L.get_by_role("button", name="Send").last, 600)
    s.settle(L.get_by_text("Needs your confirmation").first)
    L.get_by_text("Needs your confirmation").first.scroll_into_view_if_needed()
    s.wait(1600)
    s.caption("14", "A follow-up is a proposal she confirms. The copilot never books on its own.", 300)
    s.click(L.get_by_role("button", name="Confirm", exact=True).last, 2200)
    s.click(L.get_by_role("button", name="Back").first, 900)

    s.caption("15", "The booking agent offers Harper's real free times with Sarah. Sarah picks one and confirms.", 300)
    s.click(lnav.get_by_role("button", name="Today", exact=True), 1200)
    s.click(L.get_by_role("button", name=re.compile("Booking agent")).first, 1400)
    s.click(L.get_by_role("button", name=re.compile("Book a follow-up visit")).first, 1000)
    s.click(L.get_by_role("button", name="Harper Nguyen", exact=True), 800)
    s.settle(L.get_by_text("Real free times:").first)
    s.wait(1400)
    s.click(L.get_by_text("Real free times:").locator("xpath=../..").get_by_role("button").nth(2), 600)
    s.settle(L.get_by_text("Needs your confirmation").first)
    L.get_by_text("Needs your confirmation").first.scroll_into_view_if_needed()
    s.wait(1600)
    s.click(L.get_by_role("button", name="Confirm", exact=True).last, 600)
    s.settle(L.get_by_text(re.compile("^Done\\.")).first)
    s.wait(2200)

    s.focus("R")
    s.caption("16", "The same visit appears in Harper's app straight away.", 300)
    s.click(rnav.get_by_role("button", name="Visits", exact=True), 600)
    booked = R.locator("button, a, li, div").filter(has_text=re.compile("1:30 pm to")).last
    s.settle(booked)
    booked.scroll_into_view_if_needed()
    s.wait(3600)
    s.focus(None)
    s.caption("", "Evidence over several visits, an AI draft from that evidence only, and a person signing before anyone sees it.", 4200)


def walkthrough(s: Stage):
    web_part(s)
    phone_part(s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    cookies = {"sarah": staff_token("sarah.thompson@medisense.test"), "harper": file_token("harper.txt")}
    run(NAME, OUT, walkthrough, cookies, a.dry)


if __name__ == "__main__":
    main()
