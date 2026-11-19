"""
Connected demonstration D: pre-visit check-in → AI briefing → multidisciplinary handoff.

    python scripts/demo-videos/record_e2e_d.py [--dry]

Sarah Thompson (therapist app) sends Harper Nguyen (patient app) a check-in and reviews the
source-linked brief. Then a care-team handoff for Alex Chen, who sees Sarah for OT and Nadia Hassan
for psychology: Sarah shares only a permitted summary and Nadia acknowledges it in her own app.
Restore the e2e baseline before and after a take.
"""

import argparse
import pathlib
import re

from e2e_stage import Stage, file_token, host, run, staff_token

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "E2E-D-Check-in-to-Care-Team-Handoff"


def open_patient(s: Stage, side, name: str):
    nav = side.get_by_role("navigation", name="App sections")
    s.click(nav.get_by_role("button", name="Patients", exact=True), 1200)
    s.click(side.get_by_role("button", name=f"Open {name}"), 1400)
    s.click(side.get_by_role("tab", name="AI", exact=True), 1200)


def walkthrough(s: Stage):
    L, R = s.L, s.R
    s.card("Medisense · Connected demonstration D", "Check-in to care-team handoff",
           "The patient answers a pre-visit check-in, AI prepares a source-linked brief for the therapist, "
           "and two clinicians coordinate while each keeps their own record.",
           "Sarah Thompson · Harper Nguyen · Alex Chen's OT and psychologist", 1800)
    s.phones("Pre-visit check-in",
             (f"{host('sarah')}/mobile/therapist", "Therapist app", "Sarah Thompson"),
             (f"{host('harper')}/mobile/patient", "Patient app", "Harper Nguyen"))
    s.settle(L.get_by_text("Today's schedule").first)
    s.settle(R.get_by_text("Needs your attention").first)
    s.wait(1600)
    s.reveal()
    lnav = L.get_by_role("navigation", name="App sections")
    rnav = R.get_by_role("navigation", name="App sections")

    s.focus("L")
    s.caption("1", "Sarah sends Harper a pre-visit check-in from her next visit, using the home-visit template.", 300)
    s.click(lnav.get_by_role("button", name="Schedule", exact=True), 1600)
    s.click(L.get_by_role("button", name=re.compile("Harper Nguyen")).first, 1600)
    s.click(L.get_by_role("button", name=re.compile("Send check-in|Send again")), 600)
    s.settle(L.get_by_text(re.compile("Secure link for someone without the app")).first)
    s.wait(2200)
    s.click(L.get_by_role("button", name="Close").last, 800)

    s.focus("R")
    s.caption("2", "Harper's visit now asks for the check-in. She answers in her own words.", 300)
    s.click(rnav.get_by_role("button", name="Visits", exact=True), 1400)
    s.click(R.locator("button").filter(has_text="Sarah Thompson").first, 1400)
    s.click(R.get_by_role("button", name=re.compile("Pre-visit check-in")), 1400)
    s.click(R.get_by_role("radio", name="Worse", exact=True), 500)
    s.type(R.get_by_label("What's worse?"), "Standing at the bench for more than a few minutes.", delay=14)
    s.click(R.get_by_role("radio", name="Yes", exact=True), 500)
    s.type(R.get_by_label("Tell us about it"), "Getting out of the shower chair is slower.", delay=14)
    s.type(R.get_by_label("Questions for your therapist"), "Would a stool in the kitchen help?", delay=14)
    tick = R.get_by_text("These answers are accurate to the best of my knowledge.")
    tick.scroll_into_view_if_needed()
    s.click(tick, 600)
    s.caption("3", "Without the confirmation the check-in can't be sent; she can also save a draft.", 1800)
    s.click(R.get_by_role("button", name="Send", exact=True), 2200)

    s.focus("L")
    s.caption("4", "Sarah's brief: AI lays what Harper reported beside what is recorded, with each source. It's marked self-reported.", 300)
    s.click(lnav.get_by_role("button", name="Today", exact=True), 1200)
    s.click(L.get_by_role("button", name=re.compile("Patient updates to review")), 1400)
    s.click(L.get_by_role("button", name=re.compile("Harper Nguyen ·")).filter(has_text=re.compile("visit")).first, 1600)
    s.settle(L.get_by_text("AI briefing · patient-reported vs recorded").first)
    s.wait(4200)
    s.click(L.get_by_role("button", name=re.compile("Mark reviewed|Reviewed")).last, 1800)
    s.click(L.get_by_role("button", name="Close").last, 900)

    s.card("Care-team coordination", "Two clinicians, one patient, separate records",
           "Alex Chen sees Sarah for occupational therapy and Nadia Hassan for psychology.", "", 1200)
    s.phones("Multidisciplinary handoff",
             (f"{host('sarah')}/mobile/therapist", "Therapist app · OT", "Sarah Thompson"),
             (f"{host('nadia')}/mobile/therapist", "Therapist app · psychology", "Nadia Hassan"))
    s.settle(L.get_by_text("Today's schedule").first)
    s.settle(R.get_by_text("Today's schedule").first)
    s.wait(1000)
    s.reveal()
    s.focus("L")
    s.caption("5", "Sarah refreshes the care-team briefing. Alex's psychology record is restricted, so it is left out, not summarised.", 300)
    open_patient(s, L, "Alex Chen")
    s.click(L.get_by_role("tab", name="Care team", exact=True), 1200)
    s.click(L.get_by_role("button", name=re.compile("Generate coordination briefing|Refresh coordination briefing")), 600)
    s.settle(L.get_by_text("Share an update").first)
    L.get_by_text(re.compile("restricted record")).first.scroll_into_view_if_needed()
    s.wait(3600)
    s.caption("6", "Sarah shares exactly what Nadia needs, kept to the care team. The preview says who will see it.", 300)
    share = L.get_by_label("To", exact=True)
    share.scroll_into_view_if_needed()
    s.type(share, "Psychologist", delay=20)
    s.type(L.get_by_label("Exactly what will be shared"),
           "Alex is more anxious about cooking alone since the kitchen trial. Could you cover this in Thursday's session?", delay=12)
    s.click(L.get_by_role("button", name="Share", exact=True), 2400)

    s.focus("R")
    s.caption("7", "Nadia sees the shared update on Alex's care team, not Sarah's notes, and acknowledges it.", 300)
    open_patient(s, R, "Alex Chen")
    s.click(R.get_by_role("tab", name="Care team", exact=True), 1600)
    ack = R.get_by_role("button", name="Acknowledge").first
    s.settle(ack)
    ack.scroll_into_view_if_needed()
    s.wait(1600)
    s.click(ack, 2400)

    s.focus("L")
    s.caption("8", "Sarah sees it was acknowledged.", 300)
    s.click(L.get_by_role("button", name="Back").first, 900)
    s.click(L.get_by_role("button", name="Open Alex Chen"), 1400)
    s.click(L.get_by_role("tab", name="AI", exact=True), 1000)
    s.click(L.get_by_role("tab", name="Care team", exact=True), 1200)
    s.settle(L.get_by_text("Acknowledged", exact=True).first)
    L.get_by_text("Acknowledged", exact=True).first.scroll_into_view_if_needed()
    s.wait(2600)

    s.card("Access check", "A therapist who isn't assigned",
           "Olivia Reyes isn't part of Alex Chen's care team.", "", 1000)
    s.web(f"{host('olivia')}/care/6af8b781e62e775d1beca0bb", "Olivia Reyes · Physiotherapist · web")
    s.wait(3000)
    s.reveal()
    s.say("9", "Olivia opens a direct link to Alex's record. She isn't on his care team, so nothing is shown: she lands back on her own patients.", 5200)
    s.say("", "A check-in becomes a sourced brief; clinicians share only what's needed, each keeping their own record.", 4400)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    cookies = {
        "sarah": staff_token("sarah.thompson@medisense.test"),
        "harper": file_token("harper.txt"),
        "nadia": staff_token("nadia.hassan@medisense.test"),
        "olivia": staff_token("olivia.reyes@medisense.test"),
    }
    run(NAME, OUT, walkthrough, cookies, a.dry)


if __name__ == "__main__":
    main()
