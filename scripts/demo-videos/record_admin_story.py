"""
The admin's day in about four minutes: how Neil Hensley (Super Admin) runs the practice and where AI
takes work off his desk: briefing, operations agent, AI referral intake, Ask Medisense, the booking
agent and quick booking for a new caller, then billing and reports.

    E2E_BASE=http://localhost:3000 python scripts/demo-videos/record_admin_story.py [--dry]

Restore the e2e baseline before and after a take: the agents really book and confirm.
"""

import argparse
import json
import pathlib
import re
import shutil
import time

import record_full_system as F
from app_stage import PAGE as APP_PAGE
from e2e_stage import BASE, staff_token
from record import OVERLAY

NAME = "Medisense-Admin-Workflow"
SLOT = F.SLOT


def walkthrough(t):
    d, P = t.d, t.page
    t.card("Medisense · For the admin", "Less admin, more care",
           "How a practice admin runs the day, and where AI takes the work off their desk.", 2200)
    t.card("Neil Hensley · Super Admin", "The morning, at a glance", "Live figures for the whole practice, before the first call.", 900)
    t.as_user(staff_token("neil.hensley@medisense.test"))

    # 1 Overview
    t.web("/", lambda p: F.Loaded(p))
    t.lift()
    t.say("1", "Neil sees the whole practice at once: patients, today's visits, notes due and team capacity.", 2800)
    t.say("2", "Every figure is counted from live records. No spreadsheets to build each morning.", 2400)
    t.scroll(420)
    t.wait(900)
    t.scroll(-420)

    # 2 Operations agent
    t.card("AI takes the chasing", "The operations agent", "It reads the records, finds what's stuck and proposes the fix.", 900)
    t.web("/care/operations?tab=agent", lambda p: p.locator("#agent-q"))
    t.lift()
    t.say("3", "The morning briefing lists what needs attention today, worked out by the agent from live records.", 2600)
    t.say("4", "Instead of writing emails, Neil asks in plain English.", 300)
    d.type(P.locator("#agent-q"), "Request the missing documents for Casey Morgan's referral", delay=16)
    d.click(P.locator("form").filter(has=P.locator("#agent-q")).get_by_role("button", name="Ask"), pause_after=300)
    card = P.locator("div.rounded-card").filter(has_text="Request missing items").filter(
        has=P.get_by_role("button", name="Confirm", exact=True)).last
    t.settle(card)
    t.say("5", "The agent prepares the request: the record, what changes, its checks and who approves.", 2600)
    t.say("6", "Nothing happens until a person confirms. One click replaces the follow-up email.", 300)
    d.click(card.get_by_role("button", name="Confirm", exact=True), pause_after=400)
    t.settle(P.locator("div.rounded-card").filter(has_text="Request missing items").get_by_text("Completed", exact=True).first)
    t.wait(1600)

    # 3 Referral read by AI
    t.card("AI takes the typing", "A referral, read by AI", "No retyping emails and letters into forms.", 900)
    t.web("/care/referrals", lambda p: p.locator("main table tbody tr").first)
    t.lift()
    t.say("7", "A new referral arrives by email. Neil pastes it in, and AI reads it into the referral form.", 300)
    d.click(P.get_by_role("button", name="New").first, pause_after=500)
    d.click(P.get_by_role("button", name=re.compile("^New referral")), pause_after=800)
    dlg = P.get_by_role("dialog")
    d.click(dlg.get_by_role("button", name="Use sample referral"), pause_after=1400)
    d.click(dlg.get_by_role("button", name=re.compile("Read referral with AI")), pause_after=300)
    P.wait_for_url(re.compile("/care/new"), timeout=150000)
    t.settle(P.get_by_role("region", name="AI draft"))
    t.wait(1200)
    t.say("8", "The form opens filled in and marked as an AI draft. What the referral didn't say is listed.", 2800)
    t.say("9", "Neil checks it instead of typing it: minutes of data entry become a quick review.", 2400)

    # 4 Ask Medisense
    t.card("AI takes the searching", "Ask Medisense", "Questions answered from the records, with sources.", 900)
    t.web("/care", lambda p: p.locator("main table tbody tr").first)
    t.lift()
    t.say("10", "Any question about the practice, in plain English. No reports to run.", 300)
    top = P.locator("form").filter(has=P.get_by_label("Ask Medisense", exact=True))
    d.click(top.get_by_role("button", name="Ask"), pause_after=900)
    panel = P.get_by_role("dialog", name="Ask Medisense AI")
    box = panel.get_by_label("Question")
    d.type(box, "Which referrals need attention today?", delay=18)
    box.press("Enter")
    t.settle(P.get_by_text("AI answer. Check before acting", exact=False).first)
    t.wait(1200)
    t.say("11", "Counted from live records: each referral, what it is waiting for, and a link to act on it.", 3000)

    # 5 Booking agent
    t.say("12", "Then the booking agent takes over the matching and the diary.", 300)
    d.click(panel.get_by_role("tab", name="Booking agent"), pause_after=1200)
    d.click(panel.get_by_role("button", name=re.compile("Assign and book a waiting patient")), pause_after=1000)
    d.click(panel.get_by_role("button", name="Lucas Ferreira", exact=True), pause_after=600)
    eligible = panel.get_by_text(re.compile("top eligible therapists")).first
    t.settle(eligible)
    eligible.scroll_into_view_if_needed()
    t.wait(600)
    t.say("13", "It checks discipline, region, credentials and capacity, and shows only eligible therapists, with reasons.", 2800)
    d.click(panel.get_by_role("button", name=re.compile("^Best match")), pause_after=1000)
    t.say("14", "Real free times only, checked against visits and leave.", 300)
    d.click(panel.get_by_role("button", name=SLOT).first, pause_after=600)
    confirm = panel.get_by_text("Needs your confirmation").first
    t.settle(confirm)
    confirm.scroll_into_view_if_needed()
    t.wait(500)
    t.say("15", "A proposal with its checks. Neil confirms, and the patient is assigned and booked.", 300)
    d.click(panel.get_by_role("button", name="Confirm", exact=True).last, pause_after=600)
    t.settle(panel.get_by_text(re.compile(r"^Done\.")).first)
    t.wait(1800)

    # 6 New caller
    t.say("16", "A caller who isn't a patient yet? A name and a phone number are enough.", 300)
    d.click(panel.get_by_role("tab", name="New to Medisense"), pause_after=1000)
    d.type(panel.get_by_label("Full name"), "Peter Lawson", delay=40)
    d.type(panel.get_by_label("Phone"), "0412 557 903", delay=40)
    d.click(panel.get_by_role("button", name="OT", exact=True), pause_after=900)
    t.say("17", "Therapists appear with their next real free times.", 300)
    d.click(panel.get_by_role("radio", name="Emma Clarke"), pause_after=900)
    d.click(panel.get_by_role("radio", name="Home visit"), pause_after=400)
    d.click(panel.get_by_role("radio", name=SLOT).first, pause_after=600)
    d.type(panel.get_by_placeholder(re.compile("Called about")), "Fall at home last week; daughter will be there", delay=14)
    d.click(panel.get_by_role("button", name="Book visit"), pause_after=600)
    t.settle(panel.get_by_text("Visit booked").first)
    t.say("18", "Booked in seconds. A record opens with an MRN, Emma is told, and intake completes the rest.", 3000)
    P.keyboard.press("Escape")
    t.wait(500)

    # 7 Billing
    t.card("Rules take the checking", "Billing, already verified", "Only delivered, verified visits become billable.", 900)
    t.web("/care/billing?tab=queue", lambda p: p.locator("main table tbody tr").first)
    t.lift()
    t.say("19", "Delivered visits arrive as billable lines, with payer and agreement checks already run.", 2800)
    t.say("20", "No reconciling timesheets: rules check, a person approves the claim.", 2400)

    # 8 Reports
    t.card("Always in control", "Reports and oversight", "The whole practice, filtered any way he needs.", 800)
    t.web("/care/reports", lambda p: p.locator("main").get_by_role("tab").first)
    t.lift()
    t.say("21", "Operational, clinical and finance reports, with filters that change every figure.", 2600)
    t.scroll(450)
    t.wait(900)
    t.say("22", "Every AI draft and every approval is logged, so oversight takes minutes, not days.", 2600)

    t.card("What AI takes off the admin's desk",
           "Reading · chasing · searching · matching · booking",
           "AI drafts and proposes. Rules check. People decide. Less admin, more care.", 3600)


def main():
    from playwright.sync_api import sync_playwright

    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    tmp = F.OUT / f".tmp-{NAME}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--lang=en-AU"])
        opts = dict(viewport={"width": 1440, "height": 900}, locale="en-AU", timezone_id="Australia/Brisbane")

        def context(record: bool):
            extra = {"record_video_dir": str(tmp), "record_video_size": {"width": 1440, "height": 900}} if record else {}
            ctx = browser.new_context(**opts, **extra)
            ctx.add_init_script(OVERLAY)
            ctx.add_init_script(F.COVER)
            ctx.add_init_script(F.PREMIUM)
            ctx.route(F.APP_URL, lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=APP_PAGE))
            return ctx

        # Load every screen once, unrecorded, so nothing loads for the first time on camera.
        wctx = context(False)
        wctx.add_cookies([{"name": "medisense_session", "value": staff_token("neil.hensley@medisense.test"), "url": BASE}])
        wp = wctx.new_page()
        for path in ["/", "/care/operations?tab=agent", "/care/referrals", "/care/new", "/care", "/care/billing?tab=queue",
                     "/care/reports", "/api/care/schedule/quick"]:
            wp.goto(BASE + path, timeout=180000)
            wp.wait_for_timeout(4000)
        wctx.close()

        ctx = context(not a.dry)
        page = ctx.new_page()
        page.set_default_timeout(150000)
        page.goto(F.APP_URL)
        t = F.Tour(page, ctx, 0.3 if a.dry else 1.0)
        ok = True
        started = time.time()
        try:
            walkthrough(t)
        except Exception as error:
            ok = False
            print(f"Stopped: {error}".splitlines()[0])
            page.screenshot(path=str(F.OUT / f"{NAME}-failed.png"))
        video = page.video
        ctx.close()
        browser.close()
        if video and not a.dry:
            final = F.OUT / f"{NAME}{'' if ok else '-incomplete'}.webm"
            final.unlink(missing_ok=True)
            pathlib.Path(video.path()).rename(final)
            (F.OUT / f".{NAME}.waits.json").write_text(json.dumps(t.waits))
            shutil.rmtree(tmp, ignore_errors=True)
            print(f"{'Saved' if ok else 'Saved partial'} {final} ({time.time() - started:.0f}s)")
        else:
            print("dry run", "ok" if ok else "stopped", f"{time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
