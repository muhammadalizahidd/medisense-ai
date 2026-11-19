"""
Menus that follow each person's access, and booking someone new from the portal with a name and phone.

    E2E_BASE=http://localhost:3001 python scripts/demo-videos/record_web_access.py [--dry]

Uses the product tour's stage (title cards between people, captions on every step).
Restore the e2e baseline before and after a take.
"""

import argparse
import json
import pathlib
import re
import shutil
import time

from app_stage import PAGE as APP_PAGE
from e2e_stage import BASE, staff_token
from record import OVERLAY
from record_tour import APP_URL, COVER, OUT, Tour

NAME = "Access-Menus-and-Quick-Booking"
SLOT = re.compile(r"^(Mon|Tue|Wed|Thu|Fri), \d+ \w+, ")
NAV = "nav[aria-label='Primary']"


def walkthrough(t: Tour):
    d, P = t.d, t.page
    t.card("Medisense · Access and booking", "Every menu fits the person",
           "Sections for patients, therapists, scheduling, finance and operations, shown by responsibility.", 1400)
    t.as_user(staff_token("sam.rivera@medisense.test"))
    t.web("/care/schedule", lambda p: p.get_by_role("button", name="Book someone new"))
    t.lift()
    t.say("1", "The menu is split into sections: patients, therapists, scheduling, finance, and operations and AI.", 2600)
    d.hover(P.locator(NAV).get_by_role("link", name="Referrals and intake"), 700)
    d.hover(P.locator(NAV).get_by_role("link", name="Therapists"), 700)
    d.hover(P.locator(NAV).get_by_role("link", name="Funding and agreements"), 700)
    t.say("2", "Sam Rivera does intake and scheduling, so billing, assessments and clinical review stay out of the menu.", 2800)

    t.say("3", "A caller who isn't in Medisense yet: a name and phone are enough to book a visit.", 300)
    d.click(P.get_by_role("button", name="Book someone new"), pause_after=900)
    dlg = P.get_by_role("dialog")
    d.type(dlg.get_by_label("Full name"), "Grace Whitfield", delay=40)
    d.type(dlg.get_by_label("Phone"), "0433 128 640", delay=40)
    d.click(dlg.get_by_role("button", name="OT", exact=True), pause_after=700)
    t.say("4", "Clinicians with their next real free times, checked against their visits and leave.", 300)
    d.click(dlg.get_by_role("radio", name="Emma Clarke"), pause_after=800)
    d.click(dlg.get_by_role("radio", name="Video visit"), pause_after=400)
    d.click(dlg.get_by_role("radio", name=SLOT).first, pause_after=500)
    d.type(dlg.get_by_placeholder(re.compile("Called about")), "Struggling with showering since hospital discharge", delay=14)
    d.click(dlg.get_by_role("button", name="Book visit"), pause_after=400)
    t.settle(dlg.get_by_text("Visit booked").first)
    t.say("5", "Booked: a provisional record with an MRN opens, Emma is told, and intake completes the details.", 3000)

    t.card("Finance", "Morgan Blake, Finance Manager", "The same portal, with only the sections finance works in.", 900)
    t.as_user(staff_token("morgan.blake@medisense.test"))
    t.web("/care/billing", lambda p: p.locator(NAV).get_by_role("link", name="Billing and finance"))
    t.lift()
    t.say("6", "Morgan sees finance, operations and reports. Patient records and clinical work aren't in the menu.", 3000)
    d.hover(P.locator(NAV).get_by_role("link", name="Billing and finance"), 900)

    t.card("Clinical", "Helen Brooks, Clinical Lead", "Clinical review, assessments, plans and recordings.", 900)
    t.as_user(staff_token("helen.brooks@medisense.test"))
    t.web("/care/assessments", lambda p: p.locator(NAV).get_by_role("link", name="Assessments"))
    t.lift()
    t.say("7", "Helen leads clinical work, so patients, assessments, plans and recordings come first; billing stays hidden.", 3000)
    d.hover(P.locator(NAV).get_by_role("link", name="Treatment plans"), 900)

    t.card("Medisense", "Menus follow responsibilities", "A Super Admin sees everything. Everyone else sees exactly their work.", 2600)


def warm(page, ctx):
    for who, paths in (("sam.rivera@medisense.test", ["/care/schedule", "/api/care/schedule/quick"]),
                       ("morgan.blake@medisense.test", ["/care/billing"]),
                       ("helen.brooks@medisense.test", ["/care/assessments"])):
        ctx.add_cookies([{"name": "medisense_session", "value": staff_token(who), "url": BASE}])
        for p in paths:
            try:
                page.goto(BASE + p, timeout=180000)
                page.wait_for_timeout(5000)
            except Exception as error:
                print("warm-up note:", p, str(error).splitlines()[0][:100])


def main():
    from playwright.sync_api import sync_playwright

    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    tmp = OUT / f".tmp-{NAME}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--autoplay-policy=no-user-gesture-required", "--lang=en-AU"])
        opts = dict(viewport={"width": 1440, "height": 900}, locale="en-AU", timezone_id="Australia/Brisbane")

        def context(record: bool):
            extra = {"record_video_dir": str(tmp), "record_video_size": {"width": 1440, "height": 900}} if record else {}
            ctx = browser.new_context(**opts, **extra)
            ctx.add_init_script(OVERLAY)
            ctx.add_init_script(COVER)
            ctx.route(APP_URL, lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=APP_PAGE))
            return ctx

        wctx = context(False)
        warm(wctx.new_page(), wctx)
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
