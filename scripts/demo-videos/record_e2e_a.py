"""
Connected demonstration A: referral → intake → therapist assignment.

    python scripts/demo-videos/record_e2e_a.py [--dry]

Jo Marsh (web) asks the operations agent about referrals, requests missing documents through a
confirmed proposal, then uses the booking agent in the Ask AI drawer to assign and book a waiting
patient. Olivia Reyes accepts the new patient in the therapist app.
Restore the e2e baseline before and after a take.
"""

import argparse
import pathlib
import re

from e2e_stage import Stage, host, run, staff_token

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "E2E-A-Referral-to-Therapist-Assignment"


def ask_agent(s: Stage, question: str):
    d, W = s.d, s.W
    before = W.get_by_text(re.compile("AI answer · from live records|From live records · AI unavailable")).count()
    box = W.locator("#agent-q")
    box.fill("")
    d.type(box, question, delay=26)
    d.click(W.locator("main").get_by_role("button", name="Ask", exact=True), pause_after=600)
    answer = re.compile("AI answer · from live records|From live records · AI unavailable")
    s.settle(W.get_by_text(answer).nth(before))
    d.wait(600)
    W.get_by_text(answer).nth(before).scroll_into_view_if_needed()
    d.wait(900)


def walkthrough(s: Stage):
    d, W, L = s.d, s.W, s.L
    s.card("Medisense · Connected demonstration A", "Referral to therapist assignment",
           "Intake asks the operations agent what needs attention, requests missing documents, "
           "and assigns a waiting patient with the booking agent. The therapist accepts in her app.",
           "Jo Marsh · web   ·   Olivia Reyes · therapist app", 1800)
    s.web(f"{host('jo')}/care/ai-agent", "Jo Marsh · Intake & Operations · web")
    s.settle(W.get_by_text("Today's operations briefing").first)
    s.settle(W.locator("section[aria-label='Daily operations briefing'] a").first)
    d.wait(1800)
    s.reveal()

    s.say("1", "Jo Marsh opens the operations agent. Today's briefing is counted from live records, in the order of the daily SOP.", 3600)
    d.hover(W.locator("section[aria-label='Daily operations briefing'] a").nth(2), 1600)

    s.say("2", "She asks in plain English. The agent answers from live referrals and cites the approved intake checklist.", 400)
    ask_agent(s, "Which referrals need attention today?")
    d.wait(3200)
    src = W.get_by_role("button", name=re.compile("Referral intake checklist")).first
    if src.count():
        s.say("3", "Every source opens: title, version, approval status, owning module and the passage used.", 300)
        d.click(src, pause_after=3400)
        W.locator("body").press("Escape")
        d.wait(900)

    s.say("4", "Casey Morgan's referral is missing a document. The agent drafts the request as a proposal; nothing is sent yet.", 400)
    ask_agent(s, "Request the missing documents for Casey Morgan's referral")
    card = W.get_by_text("Needs your confirmation").first
    s.settle(card)
    d.hover(card, 600)
    d.wait(1800)
    s.say("5", "The proposal shows the action, the record, before and after, the checks, and who must approve.", 3400)
    mine = W.locator("div.rounded-card").filter(has_text="Request missing items").filter(
        has=W.get_by_role("button", name="Confirm", exact=True)).last
    d.click(mine.get_by_role("button", name="Confirm", exact=True), pause_after=600)
    s.settle(W.locator("div.rounded-card").filter(has_text="Request missing items").get_by_text("Completed", exact=True).first)
    d.wait(2200)

    s.say("6", "Asked again, the agent recognises the request was already sent. It is never sent twice.", 400)
    ask_agent(s, "Request the missing documents for Casey Morgan's referral")
    dup = W.get_by_text("Duplicate", exact=True).last
    s.settle(dup)
    dup.scroll_into_view_if_needed()
    d.hover(dup, 3200)

    s.say("7", "The run history records who asked, what ran, the outcome and the record it changed.", 600)
    hist = W.get_by_text("Run history").first
    d.move_to(hist)
    d.wait(3000)

    s.say("8", "Now a waiting patient. Jo opens Ask Medisense AI and switches to the booking agent.", 400)
    # Scrolling the answers into view also scrolls the frame's root, which hides the sticky top bar.
    W.locator("html").evaluate("e => { e.scrollTop = 0; document.body.scrollTop = 0; }")
    d.wait(400)
    top = W.locator("form").filter(has=W.get_by_label("Ask Medisense", exact=True))
    d.click(top.get_by_role("button", name="Ask"), pause_after=1200)
    d.click(W.get_by_role("tab", name="Booking agent"), pause_after=1600)
    s.say("9", "The agent can only do a fixed set of tasks for her role, with real free times. Nothing is booked until she confirms.", 3200)
    d.click(W.get_by_role("button", name=re.compile("Assign and book a waiting patient")), pause_after=1400)
    s.say("10", "Only patients waiting for a therapist are offered.", 300)
    d.click(W.get_by_role("button", name="Lucas Ferreira", exact=True), pause_after=600)
    s.settle(W.get_by_text(re.compile("top eligible therapists")).first)
    d.wait(1000)
    s.say("11", "The top eligible therapists: registration, scope, region and capacity are checked first, with the reasons shown.", 3600)
    d.click(W.get_by_role("button", name=re.compile("^Best match")), pause_after=1200)
    s.say("12", "Real free times from her working hours, leave, travel buffers and existing visits.", 2000)
    d.click(W.get_by_text("Real free times:").locator("xpath=..").get_by_role("button").first, pause_after=600)
    s.settle(W.get_by_text("Needs your confirmation").first)
    d.wait(800)
    d.scroll(400)
    s.say("13", "The proposal holds the first visit and asks the therapist to accept. Jo confirms.", 3000)
    panel = W.get_by_role("dialog")
    d.click(panel.get_by_role("button", name="Confirm", exact=True).first, pause_after=600)
    s.settle(panel.get_by_text(re.compile("^Done\\.")).first)
    d.wait(3000)

    s.card("Therapist app", "Olivia Reyes accepts", "The request reaches the assigned therapist's phone straight away.", "", 1200)
    s.phones("The assignment arrives", (f"{host('olivia')}/mobile/therapist", "Therapist app", "Olivia Reyes"), "hide")
    s.settle(L.get_by_text("New patients for you").first)
    s.wait(1200)
    s.reveal()
    s.focus("L")
    s.caption("14", "Lucas Ferreira is waiting for Olivia: the service, how often and where.", 300)
    s.click(L.get_by_role("button", name=re.compile("Lucas Ferreira")).first, 2400)
    s.caption("15", "She accepts. Lucas joins her caseload and the held visit stays in her schedule.", 300)
    s.click(L.get_by_role("button", name="Accept", exact=True), 2600)
    nav = L.get_by_role("navigation", name="App sections")
    s.click(nav.get_by_role("button", name="Schedule", exact=True), 1200)
    s.settle(L.get_by_text(re.compile("Lucas Ferreira")).first)
    L.get_by_text(re.compile("Lucas Ferreira")).first.scroll_into_view_if_needed()
    s.wait(3000)
    s.focus(None)
    s.caption("", "Referral to assignment: the agent finds, drafts and proposes. People confirm every step.", 4200)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    cookies = {
        "jo": staff_token("jo.marsh@medisense.test"),
        "olivia": staff_token("olivia.reyes@medisense.test"),
    }
    run(NAME, OUT, walkthrough, cookies, a.dry)


if __name__ == "__main__":
    main()
