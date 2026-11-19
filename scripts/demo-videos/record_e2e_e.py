"""
Connected demonstration E: telehealth visit → AI-drafted note → verified billing → invoice the
patient can see.

    python scripts/demo-videos/record_e2e_e.py [--dry]

Sarah Thompson (therapist app) and Harper Nguyen (patient app) hold a video visit; Sarah signs the
note; Morgan Blake (finance, web) prepares, approves and issues the invoice; Harper sees it.
Run pre_e.sh first (moves Harper's next video visit to about ten minutes from now); restore the
e2e baseline before and after a take.
"""

import argparse
import pathlib
import re

from e2e_stage import Stage, file_token, host, run, staff_token

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "E2E-E-Telehealth-to-Verified-Billing"


def call_part(s: Stage):
    L, R = s.L, s.R
    s.card("Medisense · Connected demonstration E", "Telehealth to verified billing",
           "A video visit with separate consents, a note drafted by AI and signed by the therapist, "
           "then a billable line only for the verified service, approved by finance and visible to the patient.",
           "Sarah Thompson · therapist app   ·   Harper Nguyen · patient app   ·   Morgan Blake · finance, web", 1800)
    s.phones("A video visit",
             (f"{host('sarah')}/mobile/therapist", "Therapist app", "Sarah Thompson"),
             (f"{host('harper')}/mobile/patient", "Patient app", "Harper Nguyen"))
    s.settle(L.get_by_text("Today's schedule").first)
    s.settle(R.get_by_text("Needs your attention").first)
    s.wait(1600)
    s.reveal()
    rnav = R.get_by_role("navigation", name="App sections")

    s.focus("R")
    s.caption("1", "Harper's video visit with Sarah starts in a few minutes. It shows on her Home and in Visits.", 3200)
    s.focus("L")
    s.caption("2", "Sarah opens the visit and starts the call. First she records that video is clinically suitable.", 300)
    s.click(L.get_by_role("button", name=re.compile("Open briefing|Continue visit")), 1600)
    s.click(L.get_by_role("button", name="Start video call"), 600)
    room = L.frame_locator("iframe[title^='Video call']")
    s.settle(room.get_by_text("1. Clinical suitability"))
    s.wait(1400)
    s.type(room.locator("textarea").first, "Home program follow-up; suitable by video with her daughter nearby.", delay=18)
    s.click(room.get_by_role("button", name="Record", exact=True).filter(has_text="Record"), 600)
    s.settle(room.get_by_text("Suitable for telehealth").first)
    s.wait(1000)
    s.click(room.get_by_role("button", name=re.compile("Create and send link")), 600)
    s.settle(room.get_by_role("button", name="Create a new link"))
    s.wait(1200)

    s.focus("R")
    s.caption("3", "Harper joins from her visit: identity first, then each consent as a separate choice.", 300)
    s.click(rnav.get_by_role("button", name="Visits", exact=True), 1400)
    s.click(R.locator("button").filter(has_text="Telehealth").first, 1400)
    s.click(R.get_by_role("button", name="Join", exact=True), 600)
    join = R.frame_locator("iframe[title^='Video visit']")
    s.settle(join.get_by_text("Confirm who's joining"))
    s.wait(1000)
    s.type(join.get_by_label("Your name"), "Harper Nguyen")
    join.get_by_label("Participant's date of birth").fill("1952-04-16")
    s.wait(500)
    s.click(join.get_by_role("button", name="Continue"), 1600)
    s.caption("4", "Video is required. Recording and AI transcription are optional, and she agrees to both.", 300)
    s.click(join.get_by_role("checkbox", name=re.compile("^Recording")), 500)
    s.click(join.get_by_role("checkbox", name=re.compile("^AI transcription")), 600)
    s.click(join.get_by_role("button", name="Save my choices"), 1600)
    s.click(join.get_by_role("button", name="Test my device"), 2000)
    s.click(join.get_by_role("button", name="Continue"), 1600)
    s.click(join.get_by_role("button", name="Enter the waiting room"), 2400)

    s.focus("L")
    s.caption("5", "Sarah sees who is waiting, identity verified and the consents given, and admits Harper.", 300)
    admit = room.get_by_role("button", name=re.compile("^Admit"))
    s.settle(admit)
    admit.scroll_into_view_if_needed()
    s.wait(2600)
    s.click(admit, 1200)
    room.get_by_role("button", name="End call").scroll_into_view_if_needed()
    s.wait(2600)
    s.caption("6", "Recording is off by default. Because Harper agreed, Sarah may allow it for this visit.", 300)
    s.click(room.get_by_role("checkbox", name=re.compile("I permit recording")), 600)
    s.wait(900)
    s.click(room.get_by_role("button", name="Record", exact=True).filter(has_not_text="Record"), 1200)
    s.focus("R")
    s.settle(join.get_by_text("Recording", exact=True).first)
    s.caption("7", "Harper can see that the visit is being recorded.", 2800)
    s.focus("L")
    s.caption("8", "With her consent, what's said is transcribed to help draft the note.", 300)
    add = room.get_by_role("button", name="Add sample line")
    if add.count():
        s.click(add, 1300)
        s.click(add, 1600)

    s.caption("9", "Sarah ends the call. The actual duration is kept for billing, and the note opens.", 300)
    s.click(room.get_by_role("button", name="End call"), 600)
    s.settle(room.get_by_label("Rough notes"))
    s.wait(1400)
    s.caption("10", "She jots her own rough notes. AI arranges them into a SOAP draft from what she wrote and the session.", 300)
    s.type(room.get_by_label("Rough notes"),
           "Meal prep 3x this week with the picture card, seated. Stood 4 min at bench then sat. Continue program; trial perching stool.",
           delay=8)
    s.click(room.get_by_role("button", name=re.compile("Draft SOAP note")), 600)
    s.settle(room.get_by_text("AI draft", exact=True).first)
    s.wait(2600)
    s.caption("11", "The clinical assessment is Sarah's own judgement. She checks every line and signs.", 300)
    # The note's text areas, in order: rough notes, Subjective, Objective, Assessment, Plan, summary.
    areas = room.locator("textarea")
    for n, text in ((1, "Harper reports meal prep three times this week using the picture card."),
                    (2, "Stood four minutes at the bench, then sat to finish."),
                    (3, "Meal preparation goal progressing; standing tolerance limits bench tasks."),
                    (4, "Continue the home program; trial a perching stool next visit."),
                    (5, "Great work on meal prep. Keep sitting to prepare; we'll try a perching stool next visit.")):
        box = areas.nth(n)
        box.scroll_into_view_if_needed()
        if len(box.input_value().strip()) < 12:
            box.fill("")
            s.type(box, text, delay=10)
        else:
            s.wait(1200)
    sign = room.get_by_role("button", name="Sign note")
    if not sign.is_enabled():
        print("DEBUG note fields", [areas.nth(i).input_value()[:40] for i in range(areas.count())])
    s.click(sign, 2400)
    s.focus(None)


def finance_part(s: Stage):
    d, W = s.d, s.W
    s.card("Finance · web", "Only a verified service is billed",
           "Attended, checked out and signed: the visit becomes a billable line. No clinical narrative goes on a bill.",
           "Morgan Blake · Finance Manager", 1200)
    s.web(f"{host('morgan')}/care/billing?tab=queue", "Morgan Blake · Finance Manager · web")
    s.settle(W.get_by_label("Search finance"))
    s.settle(W.locator("table").first)
    d.wait(1200)
    s.reveal()
    s.say("12", "Morgan's billing queue. The video visit arrives as a line, priced from Harper's agreement for the minutes actually delivered.", 400)
    d.type(W.get_by_label("Search finance"), "Harper", delay=40)
    d.wait(1600)
    s.say("13", "Older lines wait on payer and agreement checks. The verified telehealth visit is ready to bill.", 300)
    d.click(W.get_by_role("button", name=re.compile("^Ready to bill")), pause_after=1800)
    pick = W.locator("tbody tr").filter(has_text="Telehealth").get_by_role("checkbox").first
    s.say("14", "She selects it and prepares the invoice. Lines are grouped by participant, payer and agreement.", 400)
    d.click(pick, pause_after=600)
    d.click(W.get_by_role("button", name=re.compile("^Prepare")), pause_after=2400)
    d.click(W.get_by_role("tab", name=re.compile("^Invoices")), pause_after=1800)
    d.click(W.locator("tbody tr").filter(has_text="Draft").first.locator("a").first, pause_after=1600)
    s.settle(W.get_by_role("button", name="Send for approval"))
    d.wait(1600)
    s.say("15", "A draft is never sent. It goes for approval, is approved by a person, then issued.", 400)
    d.click(W.get_by_role("button", name="Send for approval"), pause_after=1800)
    d.click(W.get_by_role("button", name=re.compile("^Approve")), pause_after=1800)
    d.click(W.get_by_role("button", name="Issue invoice"), pause_after=2600)


def patient_part(s: Stage):
    R = s.R
    s.card("Patient app", "Harper sees the released invoice", "Only issued invoices reach the patient.", "", 1000)
    s.phones("Released to the patient", "hide", (f"{host('harper')}/mobile/patient", "Patient app", "Harper Nguyen"))
    s.settle(R.get_by_text("Needs your attention").first)
    s.wait(800)
    s.reveal()
    rnav = R.get_by_role("navigation", name="App sections")
    s.focus("R")
    s.caption("16", "Under Payments, the issued invoice for her video visit, with its status and who pays.", 300)
    s.click(rnav.get_by_role("button", name="Me", exact=True), 1200)
    s.click(R.get_by_role("tab", name=re.compile("^Payments")), 3200)
    s.focus(None)
    s.caption("", "A consented video visit, a note the therapist signs, and a bill only for what was verified.", 4400)


def walkthrough(s: Stage):
    call_part(s)
    finance_part(s)
    patient_part(s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    cookies = {
        "sarah": staff_token("sarah.thompson@medisense.test"),
        "harper": file_token("harper.txt"),
        "morgan": staff_token("morgan.blake@medisense.test"),
    }
    run(NAME, OUT, walkthrough, cookies, a.dry)


if __name__ == "__main__":
    main()
