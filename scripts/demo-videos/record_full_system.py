"""
The whole Medisense system, core features only, in one take (about 15 to 20 minutes):
the office on the web, the therapist on the web, then the therapist, patient and admin apps.

    E2E_BASE=http://localhost:3000 python scripts/demo-videos/record_full_system.py [--dry]

Title cards cover every move between people and screens, so there is never a blank or loading
frame; long server waits are logged for the edit. Restore the e2e baseline before and after.
"""

import argparse
import json
import pathlib
import re
import shutil
import time

import record_app_admin
import record_app_patient
import record_app_therapist
from app_stage import PAGE as APP_PAGE
from app_stage import AppStage
from e2e_stage import BASE, file_token, staff_token
from record import OVERLAY
from record_tour import APP_URL, COVER, OUT, Tour

NAME = "Medisense-Full-System-Walkthrough"

# A richer look for this film only: glass captions with a step badge, mint click ripples, and title
# cards that rise in with a light sweep and an accent line. Other recordings keep their own style.
PREMIUM = r"""
(() => {
  const css = `
    #__demo_caption { background: linear-gradient(135deg, rgba(10,32,27,.94), rgba(16,52,43,.92)) !important;
      border: 1px solid rgba(126,214,180,.28) !important; border-radius: 18px !important;
      box-shadow: 0 18px 50px rgba(0,0,0,.35), 0 0 0 6px rgba(126,214,180,.06) !important;
      padding: 15px 24px 15px 18px !important; font: 500 19px/1.45 "Manrope", "Segoe UI", system-ui, sans-serif !important;
      letter-spacing: .005em; backdrop-filter: blur(8px); bottom: 34px !important; }
    #__demo_caption b { display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 30px;
      padding: 0 8px; margin-right: 12px !important; border-radius: 999px; background: #7ed6b4; color: #0c1f1a !important;
      font-size: 14px; font-weight: 800 !important; vertical-align: 1px; box-shadow: 0 0 0 5px rgba(126,214,180,.18); }
    .__demo_ripple { border-color: rgba(126,214,180,.95) !important; border-width: 3px !important;
      box-shadow: 0 0 18px rgba(126,214,180,.55); }
    #__tc, .cover { background: radial-gradient(1100px 680px at 50% 38%, #1f4a3f 0%, #10261f 55%, #08130f 100%) !important; overflow: hidden; }
    #__tc::before, .cover::before { content: ""; position: absolute; inset: -40%;
      background: conic-gradient(from 0deg, transparent 0 70%, rgba(126,214,180,.10) 80%, transparent 90%);
      animation: __sweep 9s linear infinite; pointer-events: none; }
    #__tc::after, .cover::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 4px;
      background: linear-gradient(90deg, transparent, #7ed6b4, transparent); opacity: .7; }
    #__tc > div, .cover > div { position: relative; animation: __rise .9s cubic-bezier(.2,.7,.2,1) both; }
    #__tc > div:nth-child(2), .cover > div:nth-child(2) { animation-delay: .12s; letter-spacing: -.01em;
      text-shadow: 0 6px 30px rgba(0,0,0,.35); }
    #__tc > div:nth-child(2)::after, .cover > div:nth-child(2)::after { content: ""; display: block; width: 84px; height: 3px;
      margin: 18px auto 0; border-radius: 3px; background: #7ed6b4; box-shadow: 0 0 16px rgba(126,214,180,.8);
      animation: __grow 1s .35s cubic-bezier(.2,.7,.2,1) both; }
    #__tc > div:nth-child(3), .cover > div:nth-child(3) { animation-delay: .26s; }
    #__tc > div:first-child, .cover > div:first-child { color: #7ed6b4; opacity: .95 !important; }
    @keyframes __rise { from { opacity: 0; transform: translateY(18px); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
    @keyframes __grow { from { width: 0; opacity: 0; } to { width: 84px; opacity: 1; } }
    @keyframes __sweep { to { transform: rotate(360deg); } }
    .note { border-color: rgba(126,214,180,.28) !important; box-shadow: 0 24px 70px rgba(0,0,0,.4), 0 0 0 6px rgba(126,214,180,.05) !important; }
    .chap.on .dot { box-shadow: 0 0 0 6px rgba(126,214,180,.18), 0 0 18px rgba(126,214,180,.6) !important; }
  `;
  const add = () => {
    if (document.getElementById('__premium')) return;
    const s = document.createElement('style'); s.id = '__premium'; s.textContent = css;
    document.documentElement.appendChild(s);
  };
  if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add);
  new MutationObserver(add).observe(document, { childList: true });
})();
"""
SLOT = re.compile(r"^(Mon|Tue|Wed|Thu|Fri), \d+ \w+, ")
NAV = "nav[aria-label='Primary']"
OLIVIA = "6af876d9e62e775d1bec9a59"
MASON = "6af8ba54e62e775d1beca0d1"


# ------------------------------------------------------------------ part 1: the office


def office(t: Tour):
    d, P = t.d, t.page
    t.card("Medisense · The whole system", "Clinical operations, connected",
           "The office, the therapist, and three apps: one live record from referral to billing.", 2200)
    t.card("Part 1 · The office on the web", "Jo Marsh, intake, scheduling and finance",
           "Referrals read by AI, patients, bookings, the team, operations and finance.", 1400)
    t.as_user(staff_token("jo.marsh@medisense.test"))

    # Menus by access
    t.web("/care/referrals", lambda p: p.locator("main table tbody tr").first)
    t.lift()
    t.say("1", "Every menu follows the person's responsibilities, in sections: patients, therapists, scheduling, finance, operations.", 2600)
    d.hover(P.locator(NAV).get_by_role("link", name="Patients", exact=True), 600)
    d.hover(P.locator(NAV).get_by_role("link", name="Scheduling"), 600)
    t.say("2", "Referrals and intake: every stage with its count, the checks a person must make, and who owns it.", 2400)
    t.scroll(380)
    t.scroll(-380)

    # A referral read by AI
    t.say("3", "A referral arrives by email. Jo pastes it, and AI fills in the referral form for her to check.", 300)
    d.click(P.get_by_role("button", name="New").first, pause_after=500)
    d.click(P.get_by_role("button", name=re.compile("^New referral")), pause_after=800)
    dlg = P.get_by_role("dialog")
    d.click(dlg.get_by_role("button", name="Use sample referral"), pause_after=1400)
    t.say("4", "AI copies only what the email says. Anything missing is listed; consent is never ticked for her.", 300)
    d.click(dlg.get_by_role("button", name=re.compile("Read referral with AI")), pause_after=300)
    P.wait_for_url(re.compile("/care/new"), timeout=150000)
    t.settle(P.get_by_role("region", name="AI draft"))
    t.wait(1200)
    t.say("5", "The live form opens filled in, marked as an AI draft, with what wasn't in the referral.", 2800)
    d.click(P.get_by_role("button", name=re.compile("^Continue")), pause_after=1400)
    t.say("6", "Each step is checked against the original before Jo submits it through intake, triage and funding.", 2400)

    # Patients, one roof
    t.card("Patients", "Every patient, everything in one place", "Assessments, plans, follow-ups and actions from the list.", 900)
    t.web("/care", lambda p: p.locator("main table tbody tr").first.get_by_role("link", name=re.compile(r"\d+%")))
    t.lift()
    t.say("7", "Every patient in one list. Each row shows their latest assessment and treatment plan, with one-click actions.", 2600)
    d.hover(P.locator("main table tbody tr").nth(1).get_by_role("link", name=re.compile("Clinical record")), 1000)
    t.card("Patients", "Olivia Grant's record", "Quick actions, follow-ups, assessments and plans.", 700)
    t.web(f"/care/{OLIVIA}", lambda p: p.get_by_role("region", name="Quick actions"))
    t.lift()
    t.say("8", "One record: book, assessment, plan, clinical record and funding are a click away.", 2400)
    d.click(P.get_by_role("tab", name=re.compile("^Follow-ups")), pause_after=1600)
    t.say("9", "Follow-ups: every visit with its note, who attended, and the patient's rating.", 2200)
    d.click(P.get_by_role("tab", name=re.compile("^Assessments")), pause_after=1400)
    t.say("10", "Her assessments over time, each opening the full report.", 1800)
    d.click(P.get_by_role("tab", name=re.compile("^Treatment plans")), pause_after=1400)
    t.say("11", "Treatment plans with each version kept: active, superseded and completed.", 1800)

    # Book a visit with real free times
    t.say("12", "Booking a visit: choose her clinician and the real free times open right underneath.", 300)
    d.click(P.get_by_role("button", name=re.compile("^Book a visit")).first, pause_after=900)
    dlg = P.get_by_role("dialog")
    d.click(dlg.get_by_role("radio").first, pause_after=900)
    d.click(dlg.get_by_role("radio", name=SLOT).first, pause_after=500)
    d.click(dlg.get_by_role("button", name="Book visit"), pause_after=300)
    t.settle(dlg.get_by_text("Visit booked").first)
    t.say("13", "Booked. The clinician and the patient are both told, and it's on the schedule now.", 2200)
    P.keyboard.press("Escape")
    t.wait(500)

    # The team
    t.card("Therapists", "The team and their sessions", "Credentials, caseload and every session delivered.", 800)
    t.web("/care/therapists", lambda p: p.locator("main table tbody tr").first)
    t.lift()
    t.say("14", "The team: status, sessions delivered, working days, approved services, credentials and caseload.", 2600)
    t.web("/care/therapists", lambda p: p.locator("main table tbody tr").first)
    href = P.locator("a[href*='?tab=sessions']").first.get_attribute("href") or "/care/therapists"
    t.card("Therapists", "A therapist's sessions", "Every session with its patient, note and recording.", 700)
    t.web(href, lambda p: p.get_by_role("region", name="Session figures"))
    t.lift()
    t.say("15", "Every session she's had: patient, video or home visit, signed note, recording and rating.", 2400)
    t.scroll(420)
    d.click(P.get_by_role("tab", name=re.compile("^Patients")), pause_after=1400)
    t.say("16", "Her patients, with sessions each and a way into their follow-ups, assessments and plans.", 2200)

    # Scheduling
    t.card("Scheduling", "The whole team's calendar", "Holds, confirmations, reminders and exceptions.", 800)
    t.web("/care/schedule", lambda p: p.get_by_role("button", name=re.compile("^Book a visit")))
    t.lift()
    t.say("17", "The calendar for every clinician, with filters, confirmations, reminders and exceptions.", 2600)

    # Operations agent
    t.card("Operations", "The operations agent", "Answers from live records; changes are proposals Jo confirms.", 900)
    t.web("/care/operations?tab=agent", lambda p: p.locator("#agent-q"))
    t.lift()
    t.say("18", "The morning briefing is counted from live records. Ask in plain English at the bottom.", 300)
    d.type(P.locator("#agent-q"), "Request the missing documents for Casey Morgan's referral", delay=16)
    d.click(P.locator("form").filter(has=P.locator("#agent-q")).get_by_role("button", name="Ask"), pause_after=300)
    card = P.locator("div.rounded-card").filter(has_text="Request missing items").filter(
        has=P.get_by_role("button", name="Confirm", exact=True)).last
    t.settle(card)
    t.say("19", "A proposal with the record, before and after, its checks and who approves. Nothing happens until Jo confirms.", 2600)
    d.click(card.get_by_role("button", name="Confirm", exact=True), pause_after=400)
    t.settle(P.locator("div.rounded-card").filter(has_text="Request missing items").get_by_text("Completed", exact=True).first)
    t.wait(1200)

    # Ask Medisense
    t.say("20", "Ask Medisense AI answers any question about the practice, from the records.", 300)
    top = P.locator("form").filter(has=P.get_by_label("Ask Medisense", exact=True))
    d.click(top.get_by_role("button", name="Ask"), pause_after=900)
    box = P.get_by_role("dialog", name="Ask Medisense AI").get_by_label("Question")
    d.type(box, "Which patients need a therapist?", delay=18)
    box.press("Enter")
    t.settle(P.get_by_text("AI answer. Check before acting", exact=False).first)
    t.wait(2400)
    P.keyboard.press("Escape")
    t.wait(400)

    # Finance and reports
    t.card("Finance", "Funding and billing", "NDIS plans and agreements; only verified services become billable.", 800)
    t.web("/care/billing?tab=queue", lambda p: p.locator("main table tbody tr").first)
    t.lift()
    t.say("21", "Verified visits arrive as billable lines with payer and agreement checks, ready to invoice.", 2600)
    t.card("Reports", "Reports and analytics", "Live figures for every role.", 700)
    t.web("/care/reports", lambda p: p.locator("main").get_by_role("tab").first)
    t.lift()
    t.say("22", "Operational, clinical and finance reports, with filters that change every figure.", 2600)
    t.scroll(450)


class Loaded:
    """Ready when the page has real content and no skeletons left, whatever the page."""

    def __init__(self, page, text: int = 600):
        self.page = page
        self.text = text

    def wait_for(self, timeout: float = 150000):
        self.page.wait_for_function(
            """(n) => { const m = document.querySelector('main'); if (!m) return false;
                 return m.querySelectorAll('.animate-pulse').length === 0 && m.innerText.length > n; }""",
            arg=self.text, timeout=timeout, polling=200,
        )


def section(t: Tour, eyebrow: str, title: str, sub: str, path: str, lines: list[tuple[str, str, float]],
            scroll: int = 420, open_first: str | None = None, after_open: list[tuple[str, str, float]] | None = None):
    """A title card, the page drawn underneath it, then captions; optionally opens the first row."""
    P = t.page
    t.card(eyebrow, title, sub, 800)
    t.web(path, lambda p: Loaded(p))
    t.lift()
    for n, text, hold in lines:
        t.say(n, text, hold)
    if scroll:
        t.scroll(scroll)
        t.wait(900)
        t.scroll(-scroll)
    if open_first:
        row = P.locator(open_first).first
        if row.count():
            t.d.click(row, pause_after=300)
            t.settle(Loaded(P, 900))
            t.wait(900)
            for n, text, hold in after_open or []:
                t.say(n, text, hold)
            t.scroll(scroll)


def office_more(t: Tour):
    section(t, "Funding", "NDIS funding and agreements", "Plans, budgets and signed service agreements.",
            "/care/funding", [
                ("23", "Every participant's plan: what they reported against what was verified, and budgets by payer.", 2600),
                ("24", "Agreements are reviewed, signed securely and amended; a booking is blocked until funding is ready.", 2600),
            ])
    section(t, "Patients", "Changes patients ask for", "Requests from the patient app, approved or declined by a person.",
            "/care/patient-requests", [
                ("25", "Changes patients ask for in their app: contact details, health information, consent.", 2400),
                ("26", "Staff check each against ID or the record, then approve or decline with a reason.", 2400),
            ])
    section(t, "Care coordination", "Tasks between the care team", "Handoffs, follow-ups and deadlines, with who owns each.",
            "/care/coordination", [
                ("27", "Care-team tasks: handoffs, follow-ups and deadlines, each with an owner and what's overdue.", 2600),
            ])
    section(t, "Clinical records", "Everything clinical, in one record", "Notes, documents, access levels and history.",
            "/care/records", [
                ("28", "Every patient's clinical record, with access levels so people only see what they should.", 2400),
            ], open_first="main table tbody tr a", after_open=[
                ("29", "Notes, documents and history in one place; signed records change only by amendment.", 2600),
            ])


def therapist_clinical(t: Tour):
    section(t, "Clinical work", "AI clinical documentation", "Notes drafted from rough notes or dictation, signed by the clinician.",
            "/therapist/documentation", [
                ("36", "Her notes to write and sign. AI drafts from what she wrote; she checks, edits and signs.", 2600),
            ], open_first="main table tbody tr a", after_open=[
                ("37", "A SOAP note with its sources. The clinical assessment is always in her own words.", 2600),
            ])
    section(t, "Clinical work", "Assessments with an AI-drafted report", "Findings, measures, then a report that cites its evidence.",
            "/therapist/assessments", [
                ("38", "Her assessments by status, from requested to signed.", 2200),
            ], open_first="main table tbody tr a", after_open=[
                ("39", "Each assessment records findings by section; the report is drafted only from what's documented.", 2600),
            ])
    section(t, "Clinical work", "Treatment plans and goals", "Goals with baselines, targets and progress, reviewed on time.",
            "/therapist/plans", [
                ("40", "Treatment plans with their goals, review dates and what's been achieved.", 2200),
            ], open_first="main table tbody tr a", after_open=[
                ("41", "A plan: goals with where the patient started, where they are now and the target.", 2600),
            ])
    section(t, "Clinical work", "Progress and reports", "Outcomes over time and reports for funders.",
            "/therapist/progress", [
                ("42", "Progress across her caseload, and reports drafted for review before they're released.", 2600),
            ])
    section(t, "Clinical work", "AI assistants", "Home coach, check-ins, insights and her clinical copilot.",
            "/therapist/ai", [
                ("43", "Pre-visit check-ins, the home coach, care-team briefings and a copilot that answers from her records.", 2800),
                ("44", "Every AI step is a suggestion; she reviews, approves and signs.", 2000),
            ], scroll=520)


# ------------------------------------------------------------------ part 2: the therapist on the web


def therapist_web(t: Tour):
    d, P = t.d, t.page
    t.card("Part 2 · The therapist on the web", "Sarah Thompson, occupational therapist",
           "Her day, her patients, recordings and messages.", 1400)
    t.as_user(staff_token("sarah.thompson@medisense.test"))
    t.web("/therapist/workspace?tab=schedule", lambda p: p.get_by_text("How the day is spent").first)
    t.lift()
    t.say("30", "Her day as a timeline: visits, video calls, travel and protected notes time.", 2600)
    d.click(P.get_by_role("radio", name="Week").or_(P.get_by_role("button", name="Week", exact=True)).first, pause_after=1200)
    t.say("31", "The week shows the load per day and every visit at a glance.", 2200)

    t.card("Patients", "Mason Fernando's file", "Profile, follow-ups, assessments and plans.", 700)
    t.web(f"/therapist/patients/{MASON}", lambda p: p.get_by_role("tab", name=re.compile("^Follow-ups")))
    t.lift()
    t.say("32", "A patient file: profile and documents first, then follow-ups, assessments and treatment plans.", 2400)
    d.click(P.get_by_role("tab", name=re.compile("^Follow-ups")), pause_after=1600)
    t.say("33", "Every visit with its note, rating and what's still to do.", 2000)

    t.card("Telehealth", "Recordings with consent", "Reviewed only with a stated purpose; every view is logged.", 700)
    t.web("/telehealth/recordings", lambda p: p.get_by_role("button", name="Review recording").first)
    t.lift()
    t.say("34", "Recordings play only after Sarah states why. Video, audio and the consented transcript.", 300)
    d.type(P.get_by_label(re.compile("^Purpose of this review")).first, "Checking goal measures for the progress report", delay=14)
    d.click(P.get_by_role("button", name="Review recording").first, pause_after=600)
    vid = P.locator("video").first
    t.settle(vid)
    vid.evaluate("v => { v.muted = true; v.play(); }")
    t.wait(4600)
    vid.evaluate("v => v.pause()")

    t.card("Messages", "Talking with families", "Documents, photos, video clips and voice notes.", 700)
    t.web("/messages", lambda p: p.get_by_text(re.compile("See you both")).last)
    t.lift()
    t.say("35", "Messages stay inside Medisense, with documents, photos, video clips and voice notes.", 2400)


# ------------------------------------------------------------------ parts 3 to 5: the apps


def app_part(t: Tour, eyebrow: str, title: str, sub: str, module, token: str):
    """Opens the phone stage under the current title card, then runs that app's full walkthrough."""
    t.card(eyebrow, title, sub, 1200)
    t.as_user(token)
    t.page.goto(APP_URL, wait_until="domcontentloaded")
    s = AppStage(t.page, t.slow, t.t0)
    s.waits = t.waits
    t.page.evaluate("window.__caption && window.__caption('')")
    t.lift(300)
    module.walkthrough(s)


def walkthrough(t: Tour):
    office(t)
    office_more(t)
    therapist_web(t)
    therapist_clinical(t)
    app_part(t, "Part 3 · The therapist app", "The same work, on her phone",
             "Briefings, AI notes, assessments, booking and messages, wherever she is.",
             record_app_therapist, staff_token("sarah.thompson@medisense.test"))
    app_part(t, "Part 4 · The patient app", "Harper Nguyen, 74",
             "Her visits, her plan, an assistant that answers from her own records.",
             record_app_patient, file_token("harper.txt"))
    app_part(t, "Part 5 · The admin app", "The practice from anywhere",
             "The briefing, quick booking, the team's schedule and the AI agents.",
             record_app_admin, staff_token("jo.marsh@medisense.test"))
    t.page.evaluate(
        """() => { const c = document.getElementById('cover'); if (!c) return;
             document.getElementById('ce').textContent = 'Medisense';
             document.getElementById('ct').textContent = 'Systems supporting therapists';
             document.getElementById('cs').textContent = 'AI drafts and suggests. Rules check. People decide and sign.';
             c.classList.remove('off'); }"""
    )
    t.wait(4200)


def warm(page, ctx):
    """Loads every screen once, unrecorded, so nothing loads for the first time on camera."""
    jo, sarah, harper = (staff_token("jo.marsh@medisense.test"), staff_token("sarah.thompson@medisense.test"),
                         file_token("harper.txt"))
    for tok, paths in ((jo, ["/care/referrals", "/care/new", "/care", f"/care/{OLIVIA}", "/care/therapists",
                             "/care/schedule", "/care/operations?tab=agent", "/care/billing?tab=queue",
                             "/care/reports", "/mobile/staff", "/api/care/schedule/quick", "/care/funding",
                             "/care/patient-requests", "/care/coordination", "/care/records"]),
                       (sarah, ["/therapist/workspace?tab=schedule", f"/therapist/patients/{MASON}",
                                "/telehealth/recordings", "/messages", "/mobile/therapist", "/therapist/documentation",
                                "/therapist/assessments", "/therapist/plans", "/therapist/progress", "/therapist/ai"]),
                       (harper, ["/mobile/patient"])):
        ctx.add_cookies([{"name": "medisense_session", "value": tok, "url": BASE}])
        for p in paths:
            try:
                page.goto(BASE + p, timeout=180000)
                page.wait_for_timeout(5000)
            except Exception as error:
                print("warm-up note:", p, str(error).splitlines()[0][:100])
    for module, tok in ((record_app_therapist, sarah), (record_app_patient, harper), (record_app_admin, jo)):
        ctx.add_cookies([{"name": "medisense_session", "value": tok, "url": BASE}])
        try:
            module.warm(page)
        except Exception as error:
            print("warm-up note:", module.__name__, str(error).splitlines()[0][:100])


def main():
    from playwright.sync_api import sync_playwright

    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    tmp = OUT / f".tmp-{NAME}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
                                                          "--autoplay-policy=no-user-gesture-required", "--lang=en-AU"])
        opts = dict(viewport={"width": 1440, "height": 900}, locale="en-AU", timezone_id="Australia/Brisbane")

        def context(record: bool):
            extra = {"record_video_dir": str(tmp), "record_video_size": {"width": 1440, "height": 900}} if record else {}
            ctx = browser.new_context(**opts, **extra)
            ctx.add_init_script(OVERLAY)
            ctx.add_init_script(COVER)
            ctx.add_init_script(PREMIUM)
            ctx.route(APP_URL, lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=APP_PAGE))
            return ctx

        wctx = context(False)
        wpage = wctx.new_page()
        wpage.set_default_timeout(180000)
        warm(wpage, wctx)
        wctx.close()

        ctx = context(not a.dry)
        page = ctx.new_page()
        page.set_default_timeout(150000)
        page.goto(APP_URL)
        t = Tour(page, ctx, 0.3 if a.dry else 1.0)
        ok = True
        started = time.time()
        try:
            walkthrough(t)
        except Exception as error:
            ok = False
            print(f"Stopped: {error}".splitlines()[0])
            page.screenshot(path=str(OUT / f"{NAME}-failed.png"))
        video = page.video
        ctx.close()
        browser.close()
        if video and not a.dry:
            final = OUT / f"{NAME}{'' if ok else '-incomplete'}.webm"
            final.unlink(missing_ok=True)
            pathlib.Path(video.path()).rename(final)
            (OUT / f".{NAME}.waits.json").write_text(json.dumps(t.waits))
            shutil.rmtree(tmp, ignore_errors=True)
            print(f"{'Saved' if ok else 'Saved partial'} {final} ({time.time() - started:.0f}s)")
        else:
            print("dry run", "ok" if ok else "stopped", f"{time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
