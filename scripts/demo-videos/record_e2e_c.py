"""
Connected demonstration C: approved home support → patient question → concern → clinical follow-up,
and a caregiver's limited access.

    python scripts/demo-videos/record_e2e_c.py [--dry]

Sarah Thompson (therapist app), Harper Nguyen (patient app), Linh Nguyen (caregiver, patient app).
Restore the e2e baseline before and after a take.
"""

import argparse
import pathlib
import re

from e2e_stage import Stage, file_token, host, run, staff_token

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "E2E-C-Home-Support-to-Clinical-Follow-up"


OUTCOME = re.compile(r"^\s*(Answered|No authorised source|Human review|Needs clarification|Urgent concern)\s*$")


def ask(s: Stage, side, text: str):
    before = side.get_by_text(OUTCOME).count()
    s.type(side.get_by_label("Message", exact=True), text, delay=18)
    s.click(side.get_by_role("button", name="Send"), 600)
    s.settle(side.get_by_text(OUTCOME).nth(before))
    side.get_by_text(OUTCOME).nth(before).scroll_into_view_if_needed()
    s.wait(500)
    side.get_by_role("button", name="Helpful").last.scroll_into_view_if_needed()
    s.wait(1200)


def walkthrough(s: Stage):
    L, R = s.L, s.R
    s.card("Medisense · Connected demonstration C", "Home support to clinical follow-up",
           "The therapist publishes approved home guidance. The patient asks about it, then reports a difficulty. "
           "Rules route it to the therapist, who decides. Nothing changes the therapy automatically.",
           "Sarah Thompson · therapist app   ·   Harper Nguyen and her daughter Linh · patient app", 1800)
    s.phones("Approved home support",
             (f"{host('sarah')}/mobile/therapist", "Therapist app", "Sarah Thompson"),
             (f"{host('harper')}/mobile/patient", "Patient app", "Harper Nguyen"))
    s.settle(L.get_by_text("Today's schedule").first)
    s.settle(R.get_by_text("Needs your attention").first)
    s.wait(1600)
    s.reveal()
    lnav = L.get_by_role("navigation", name="App sections")
    rnav = R.get_by_role("navigation", name="App sections")

    s.focus("L")
    s.caption("1", "Sarah opens Harper's home coach. AI drafts plain-language steps from her approved plan only.", 300)
    s.click(lnav.get_by_role("button", name="Patients", exact=True), 1200)
    s.click(L.get_by_role("button", name="Open Harper Nguyen"), 1400)
    s.click(L.get_by_role("tab", name="AI", exact=True), 1400)
    s.click(L.get_by_role("button", name=re.compile("Draft guidance with AI|Redraft with AI")).first, 600)
    s.settle(L.get_by_role("button", name="Approve and publish").first)
    L.get_by_role("button", name="Approve and publish").first.scroll_into_view_if_needed()
    s.wait(2600)
    s.caption("2", "Nothing reaches Harper until Sarah approves it. She publishes.", 300)
    s.click(L.get_by_role("button", name="Approve and publish").first, 2200)

    s.focus("R")
    s.caption("3", "Harper asks what to do today. The answer comes only from her current published plan.", 300)
    s.click(R.get_by_role("button", name=re.compile("Ask Medisense")).first, 1400)
    ask(s, R, "What activities should I do today?")
    src = R.get_by_role("button", name=re.compile("plan · v")).last
    if src.count():
        s.caption("4", "The source opens: the approved plan, its version and the exact passage used.", 300)
        s.click(src, 600)
        hide = R.get_by_role("button", name="Hide source")
        s.settle(hide)
        R.get_by_text("Only approved, current versions are used", exact=False).last.scroll_into_view_if_needed()
        s.wait(3600)
        s.click(hide, 800)
    s.click(R.get_by_role("button", name="Close").last, 900)

    s.caption("5", "Later, standing at the bench is harder. Harper reports it in the app.", 300)
    s.click(rnav.get_by_role("button", name="Home", exact=True), 1000)
    s.click(R.get_by_role("button", name="Report a concern"), 1400)
    s.click(R.get_by_role("radio", name="Worse", exact=True), 400)
    s.click(R.get_by_role("radio", name="Yes", exact=True), 400)
    s.click(R.get_by_role("checkbox", name="Mobility", exact=True), 300)
    s.type(R.get_by_label("Tell us what happened"), "Standing at the kitchen bench is harder this week. I had to sit down twice.", delay=14)
    s.click(R.get_by_role("button", name="Send to my care team"), 600)
    s.settle(R.get_by_text(re.compile("Withdraw this report|sent", re.I)).first)
    s.wait(2600)
    s.click(R.get_by_role("button", name="Close").last, 800)

    s.focus("L")
    s.caption("6", "A rule files it in Sarah's review inbox with a category. It's a routing rule, not a diagnosis.", 300)
    s.click(L.get_by_role("button", name="Back").first, 900)
    s.click(lnav.get_by_role("button", name="Today", exact=True), 1200)
    s.click(L.get_by_role("button", name=re.compile("Patient updates to review")), 1400)
    s.click(L.get_by_role("button", name=re.compile("Harper Nguyen ·")).first, 1600)
    s.caption("7", "AI summarises it with context and says what is uncertain. Harper's own words stay unchanged.", 3800)
    s.caption("8", "Sarah decides: a follow-up, her comment, and a message to Harper. The plan itself is not changed.", 300)
    s.click(L.get_by_role("radio", name="Follow-up Requested", exact=True), 500)
    s.type(L.get_by_label("Clinical comment", exact=True), "Review bench standing at Thursday's visit; consider a perching stool.", delay=14)
    s.type(L.get_by_label(re.compile("^Message to the patient")),
           "Thanks Harper. Sit for meal prep until Thursday; I'll check the bench height with you then.", delay=14)
    s.click(L.get_by_role("button", name="Save decision"), 2200)

    s.focus("R")
    s.caption("9", "Harper gets Sarah's reply in her app.", 300)
    s.click(rnav.get_by_role("button", name="Home", exact=True), 1200)
    s.click(R.get_by_role("button", name=re.compile("My follow-ups")), 1600)
    upd = R.get_by_text(re.compile("Sit for meal prep")).first
    try:
        upd.wait_for(timeout=15000)
        upd.scroll_into_view_if_needed()
    except Exception:
        print("NOTE reply not shown under My follow-ups")
    s.wait(3400)
    s.click(R.get_by_role("button", name="Close").last, 800)

    s.card("Patient app · caregiver account", "Linh asks for more than she may see",
           "Linh is Harper's daughter and an authorised caregiver with limited access.", "", 1000)
    s.phones("A caregiver's limited access", None,
             (f"{host('linh')}/mobile/patient", "Patient app · caregiver", "Linh Nguyen"))
    s.settle(R.get_by_role("button", name=re.compile("Ask Medisense")).first)
    s.wait(1200)
    s.reveal()
    s.focus("R")
    s.caption("10", "Linh asks for Harper's clinical assessment. Being family doesn't open clinical records.", 300)
    s.click(R.get_by_role("button", name=re.compile("Ask Medisense")).first, 1400)
    ask(s, R, "Can I see Mum's clinical assessment?")
    s.wait(2400)
    s.caption("11", "She can see the guidance Harper's therapist shared, with its source.", 300)
    ask(s, R, "What activities should Mum do today?")
    s.wait(2600)
    s.focus(None)
    s.caption("", "Approved guidance answers questions. Concerns reach the therapist by rule. Only a clinician changes the care.", 4400)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    cookies = {
        "sarah": staff_token("sarah.thompson@medisense.test"),
        "harper": file_token("harper.txt"),
        "linh": open("d:/tmp/medisense/linh.tok").read().strip(),
    }
    run(NAME, OUT, walkthrough, cookies, a.dry)


if __name__ == "__main__":
    main()
