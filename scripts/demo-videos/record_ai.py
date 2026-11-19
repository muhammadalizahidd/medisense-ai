"""
AI Enhancements 01–07, both apps live: Sarah's therapist app (left), Harper's patient app (right).

    python scripts/demo-videos/record_ai.py [--dry]

Snapshot Sarah + Harper first; restore afterwards and clear aiEnhance rows the take created.
"""

import argparse
import json
import pathlib
import re
import shutil
import time

from playwright.sync_api import sync_playwright

from call_stage import FLAGS, LEFT, RIGHT, STAGE, STAGE_URL, token
from record_call import Stage

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "AI-Enhancements-01-07-Both-Apps"

PAGE = (
    STAGE.replace("A video visit, from both sides", "AI that supports therapists and patients")
    .replace("Medisense · Telehealth module", "Medisense · AI Enhancements 01 to 07")
    .replace(">Video visits<", ">AI Enhancements<")
    .replace("Therapist app and patient app, step by step", "Coach · check-in · coordination · risk · insights · caregiver · assistant")
    .replace("Medisense · Telehealth", "Medisense · AI Enhancements")
)


def install(ctx, sarah, harper):
    ctx.add_cookies([
        {"name": "medisense_session", "value": sarah, "url": LEFT},
        {"name": "medisense_session", "value": harper, "url": RIGHT},
    ])
    ctx.route(STAGE_URL, lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=PAGE))


def walkthrough(s: Stage):
    L, R = s.L, s.R
    s.page.evaluate(f"document.getElementById('L').src='{LEFT}/mobile/therapist'; document.getElementById('R').src='{RIGHT}/mobile/patient'")
    s.settle(L.get_by_text("Today's schedule").first)
    s.settle(R.get_by_text("Needs your attention").first)
    s.wait(2500)
    s.page.evaluate("const c = document.getElementById('cover'); c.style.opacity = '0'; setTimeout(() => c.remove(), 900)")
    s.wait(1200)
    s.caption("", "Seven AI enhancements, both apps live. AI drafts and explains; the therapist approves; nothing changes care on its own.", 4600)

    lnav = L.get_by_role("navigation", name="App sections")
    rnav = R.get_by_role("navigation", name="App sections")

    def open_patient(name: str):
        s.click(lnav.get_by_role("button", name="Patients", exact=True), 1200)
        s.click(L.get_by_role("button", name=f"Open {name}"), 1400)
        s.click(L.get_by_role("tab", name="AI", exact=True), 1200)

    def back():
        s.click(L.get_by_role("button", name="Back").first, 900)

    def close(side):
        s.click(side.get_by_role("button", name="Close").last, 900)

    # ---------------- 01 Home Therapy Coach ----------------
    s.focus("L")
    s.caption("01", "Home Therapy Coach. Sarah opens Harper's AI tab: the coach works only from a published home activity.", 300)
    open_patient("Harper Nguyen")
    s.settle(L.get_by_role("button", name=re.compile("Draft guidance with AI|Redraft with AI")).first)
    s.wait(1600)
    s.caption("01", "AI turns the approved instructions into plain steps. Every step names its source; it can't add doses or exercises.", 300)
    s.click(L.get_by_role("button", name=re.compile("Draft guidance with AI|Redraft with AI")).first, 600)
    s.settle(L.get_by_text("AI draft · review before publishing").first)
    s.wait(3600)
    s.caption("01", "Nothing reaches Harper until Sarah approves and publishes it.", 300)
    s.click(L.get_by_role("button", name="Approve and publish"), 2200)

    s.focus("R")
    s.caption("01", "Harper's My care now has a Home coach: the exact amount, precautions and approved steps.", 300)
    s.click(rnav.get_by_role("button", name="My care", exact=True), 1600)
    s.click(R.locator("button").filter(has_text="Guide me").first, 2400)
    s.caption("01", "She asks a question. The answer comes only from the approved guidance, with its source.", 300)
    s.type(R.get_by_label("Ask about this activity"), "What do I do first?")
    s.click(R.get_by_role("button", name="Ask", exact=True), 600)
    s.settle(R.get_by_text("Answered", exact=True).first)
    s.wait(2600)
    s.caption("01", "Asking to change the dose is refused. She can send the question to Sarah instead.", 300)
    s.type(R.get_by_label("Ask about this activity"), "Can I do it twice as many times this week?")
    s.click(R.get_by_role("button", name="Ask", exact=True), 600)
    s.settle(R.get_by_text("Change refused").first)
    s.wait(2000)
    s.click(R.get_by_role("button", name="Ask my therapist").first, 1800)

    # ---------------- 06 Family & Caregiver ----------------
    s.caption("06", "Caregiver support. Harper's daughter Linh is a verified caregiver; she logs today's practice on Harper's behalf.", 300)
    s.click(R.get_by_role("tab", name="Log today"), 1200)
    s.click(R.get_by_role("radio", name=re.compile("Linh Nguyen")), 600)
    s.click(R.get_by_role("radio", name="Partially completed", exact=True), 400)
    s.click(R.get_by_role("radio", name="Moderate", exact=True), 400)
    s.click(R.get_by_role("radio", name="Equipment unavailable", exact=True), 400)
    s.type(R.get_by_label("Anything else? (optional)"), "Used the recipe cards; we don't have the stool yet.", delay=18)
    s.caption("06", "It is saved as caregiver-reported, never as a clinical observation, and doesn't change the plan.", 300)
    s.click(R.get_by_role("button", name="Save", exact=True), 2000)

    # ---------------- 02 Pre-appointment check-in ----------------
    s.caption("02", "Pre-appointment check-in. Before her next visit Harper answers a short check-in.", 300)
    s.click(rnav.get_by_role("button", name="Visits", exact=True), 1600)
    s.click(R.locator("button").filter(has_text="Telehealth").first, 1600)
    s.click(R.get_by_role("button", name=re.compile("Pre-visit check-in")), 1600)
    s.click(R.get_by_role("radio", name="Worse", exact=True), 500)
    s.type(R.get_by_label("What's worse?"), "Knee is sorer after walking to the shops", delay=18)
    s.click(R.get_by_role("radio", name="Yes", exact=True), 500)
    s.type(R.get_by_label("Tell us about it"), "Standing at the bench for more than 5 minutes", delay=18)
    s.type(R.get_by_label("Pain today, 0 to 10 (optional)"), "6")
    s.click(R.get_by_role("radio", name="Most", exact=True), 400)
    s.click(R.get_by_role("radio", name="Moderate", exact=True), 400)
    s.type(R.get_by_label("Questions for your therapist"), "Can we try a perching stool?", delay=18)
    s.click(R.get_by_role("radio", name="Can attend", exact=True), 400)
    s.click(R.get_by_role("checkbox", name=re.compile("accurate to the best")), 500)
    s.click(R.get_by_role("button", name="Send", exact=True), 600)
    s.settle(R.get_by_text(re.compile("^Sent ")).first)
    s.wait(1800)
    close(R)

    s.focus("L")
    s.caption("02", "Sarah's inbox gets it at once. AI prepares a brief that keeps patient-reported apart from recorded facts.", 300)
    back()
    s.click(lnav.get_by_role("button", name="Today", exact=True), 1200)
    s.click(L.get_by_role("button", name=re.compile("Patient updates to review")), 1600)
    s.click(L.get_by_role("button", name=re.compile("Harper Nguyen · Occupational")).first, 1200)
    s.settle(L.get_by_text("AI briefing · patient-reported vs recorded").first)
    s.wait(4200)
    s.caption("02", "Rule-based flags show the exact answers that caused them. Sarah marks it reviewed.", 2600)
    s.click(L.get_by_role("button", name="Mark reviewed"), 1800)

    # ---------------- 04 Early risk detection ----------------
    s.focus("R")
    s.caption("04", "Early risk detection. Harper reports a concern from her home screen.", 300)
    s.click(rnav.get_by_role("button", name="Home", exact=True), 1400)
    s.click(R.get_by_role("button", name="Report a concern"), 1400)
    s.click(R.get_by_role("radio", name="Worse", exact=True), 400)
    s.click(R.get_by_role("radio", name="Yes", exact=True), 500)
    s.click(R.get_by_role("checkbox", name="Mobility", exact=True), 300)
    s.click(R.get_by_role("checkbox", name="Falls", exact=True), 300)
    s.type(R.get_by_label("Tell us what happened"), "Slipped getting out of the shower yesterday. Not hurt, but shaky since.", delay=16)
    s.click(R.get_by_role("radio", name="One", exact=True), 400)
    s.click(R.get_by_role("radio", name="Yesterday", exact=True), 400)
    s.click(R.get_by_role("button", name="Send to my care team"), 600)
    s.settle(R.get_by_text("We've told your care team").first)
    s.caption("04", "A fall is a safety escalation by rule. Harper sees approved safety guidance; the app never claims 24/7 monitoring.", 4200)
    close(R)

    s.focus("L")
    s.caption("04", "Sarah gets an AI review card: what changed, the comparison and what's uncertain, with the original report unchanged.", 300)
    s.click(L.get_by_role("button", name=re.compile("Harper Nguyen · Safety escalation")).first, 1200)
    s.settle(L.get_by_text("AI review card · needs verification").first)
    s.wait(4400)
    s.caption("04", "She decides: follow-up requested, with a comment and a message to Harper.", 300)
    s.click(L.get_by_role("radio", name="Follow-up Requested", exact=True), 500)
    s.type(L.get_by_label(re.compile("^Clinical comment")), "Phone call today; review shower transfer at Thursday's visit.", delay=14)
    s.type(L.get_by_label(re.compile("^Message to the patient")), "Thanks Harper. I'll call you today to talk about the shower.", delay=14)
    s.click(L.get_by_role("button", name="Save decision"), 600)
    s.settle(L.get_by_text("Patient updates", exact=True).first)
    s.wait(1200)
    close(L)

    s.focus("R")
    s.settle(R.get_by_text(re.compile("From your therapist")).first)
    s.caption("04", "Harper's follow-ups were open the whole time; Sarah's reply arrives there live.", 300)
    s.wait(3200)
    close(R)

    # ---------------- 05 Treatment effectiveness ----------------
    s.focus("L")
    s.caption("05", "Treatment effectiveness. For a goal, the trend is computed by rule from recorded values; AI only describes it.", 300)
    open_patient("Harper Nguyen")
    s.click(L.get_by_role("tab", name="Insights"), 1200)
    s.click(L.get_by_role("button", name="View effectiveness insight").nth(1), 600)
    s.settle(L.get_by_text(re.compile("AI trend draft")).first)
    s.wait(4000)
    s.caption("05", "Sarah records her own interpretation and edits what Harper will see, then approves.", 300)
    s.click(L.get_by_role("button", name="Review", exact=True), 1200)
    s.click(L.get_by_role("radio", name="Progressing", exact=True), 400)
    s.type(L.get_by_label("Why (your clinical reasoning)"), "Lunch prep frequency up with picture cards; continue current plan.", delay=14)
    s.click(L.get_by_role("radio", name="Review next visit", exact=True), 400)
    s.click(L.get_by_role("button", name="Approve", exact=True), 2000)
    s.focus("R")
    s.caption("05", "Harper sees only the approved summary, never the draft.", 300)
    s.click(rnav.get_by_role("button", name="My care", exact=True), 1400)
    s.settle(R.get_by_text("Updates from your care team").first)
    R.get_by_text("Updates from your care team").first.scroll_into_view_if_needed()
    s.wait(3600)

    # ---------------- 03 Care coordination ----------------
    s.focus("L")
    s.caption("03", "Care coordination. Alex Chen sees OT and Psychology. The assistant briefs on what Sarah may see.", 300)
    back()
    open_patient("Alex Chen")
    s.click(L.get_by_role("tab", name="Care team"), 1000)
    s.click(L.get_by_role("button", name=re.compile("coordination briefing")), 600)
    s.settle(L.get_by_text(re.compile("restricted record omitted")).first)
    s.wait(1200)
    s.caption("03", "Psychology records are restricted, so they're left out, and with one shareable discipline no cross-team suggestions are made.", 4400)
    s.caption("03", "Sharing is explicit: Sarah picks who sees it and previews exactly what's sent.", 300)
    s.type(L.get_by_label("To"), "Alex's psychologist", delay=18)
    s.type(L.get_by_label("Exactly what will be shared"), "OT update: Alex completed the community outing goal twice this fortnight.", delay=12)
    s.click(L.get_by_role("button", name="Share", exact=True), 2000)

    # ---------------- 07 Patient assistant and clinical copilot ----------------
    s.focus("R")
    s.caption("07", "Patient assistant. Harper asks Medisense; answers come only from her own records, with sources and a next step.", 300)
    s.click(rnav.get_by_role("button", name="Home", exact=True), 1200)
    s.click(R.get_by_role("button", name=re.compile("Ask Medisense")), 1400)
    s.type(R.get_by_label("Message", exact=True), "When is my next appointment?", delay=20)
    s.click(R.get_by_role("button", name="Send"), 600)
    s.settle(R.get_by_text(re.compile("Answered|No authorised source")).first)
    s.wait(3600)
    s.type(R.get_by_label("Message", exact=True), "Can I double my exercises?", delay=20)
    s.click(R.get_by_role("button", name="Send"), 600)
    s.settle(R.get_by_text("Human review").first)
    s.caption("07", "It won't change treatment, and offers her plan or her care team instead.", 3600)

    s.focus("L")
    s.caption("07", "Clinical copilot. Sarah asks about Harper; it answers from her records, cites them, and only proposes tasks.", 300)
    back()
    open_patient("Harper Nguyen")
    s.click(L.get_by_role("tab", name="Copilot"), 1000)
    s.type(L.get_by_label("Message", exact=True), "Prepare me for the next visit", delay=20)
    s.click(L.get_by_role("button", name="Send"), 600)
    s.settle(L.get_by_text("Answered", exact=True).first)
    s.wait(5200)
    s.focus(None)
    s.caption("", "AI drafts, explains and flags. Therapists review, approve and sign. Same features in the therapist portal.", 5200)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    tmp = OUT / f".tmp-{NAME}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=FLAGS)
        opts = dict(viewport={"width": 1440, "height": 900}, locale="en-AU", timezone_id="Australia/Brisbane",
                    permissions=["camera", "microphone"])
        extra = {} if args.dry else {"record_video_dir": str(tmp), "record_video_size": {"width": 1440, "height": 900}}
        ctx = browser.new_context(**opts, **extra)
        install(ctx, token("sarah.txt"), token("harper.txt"))
        page = ctx.new_page()
        t0 = time.time()
        page.goto(STAGE_URL)
        page.set_default_timeout(120000)
        s = Stage(page, 0.3 if args.dry else 1.0, t0)
        started = time.time()
        ok = True
        try:
            walkthrough(s)
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
            (OUT / f".{NAME}.waits.json").write_text(json.dumps(s.waits))
            shutil.rmtree(tmp, ignore_errors=True)
            print(f"{'Saved' if ok else 'Saved partial'} {final} ({time.time() - started:.0f}s)")
        else:
            print("dry run", "ok" if ok else "stopped", f"{time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
