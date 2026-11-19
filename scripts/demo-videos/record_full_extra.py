"""
Extra office sections for the full-system walkthrough, recorded on their own and spliced in at a
title card: sessions, plans, progress, documentation and AI oversight. Starts and ends on a card.

    E2E_BASE=http://localhost:3000 python scripts/demo-videos/record_full_extra.py [--dry]
"""

import argparse
import json
import pathlib
import shutil
import time

import record_full_system as F
from app_stage import PAGE as APP_PAGE
from e2e_stage import BASE, staff_token
from record import OVERLAY

NAME = "Full-System-Extra"


def walkthrough(t):
    t.as_user(staff_token("jo.marsh@medisense.test"))
    F.section(t, "Clinical oversight", "Every session, across the team", "What was delivered, by whom, and what's still open.",
              "/care/sessions", [
                  ("", "Every session across the team: delivered, cancelled or not attended, with notes still to finish.", 2600),
                  ("", "Clinical leads see where documentation is behind before it becomes a problem.", 2200),
              ])
    F.section(t, "Clinical oversight", "Treatment plans for every patient", "Active, under review and overdue for review.",
              "/care/plans", [
                  ("", "Every treatment plan by state, with goals achieved and reviews that are overdue.", 2600),
              ], open_first="main table tbody tr a", after_open=[
                  ("", "A plan's goals, interventions and review history, version by version.", 2400),
              ])
    F.section(t, "Clinical oversight", "Progress and reports", "Outcomes over time and reports released to funders.",
              "/care/progress", [
                  ("", "Progress across every episode of care, and reports reviewed before release.", 2600),
              ])
    F.section(t, "Clinical oversight", "Documentation", "Notes drafted, pending signature and signed.",
              "/care/documentation", [
                  ("", "Every clinical note's state: AI drafts, notes waiting for signature and signed notes.", 2600),
              ])
    F.section(t, "Governance", "AI oversight", "Every AI action logged, with who approved it.",
              "/care/ai-oversight", [
                  ("", "Every AI draft and suggestion is logged with its sources and the person who approved it.", 2800),
                  ("", "Systems supporting therapists: AI drafts, rules check, people decide.", 2200),
              ])
    t.card("Medisense", "Clinical oversight", "Sessions · plans · progress · documentation · AI oversight", 1600)


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

        wctx = context(False)
        wctx.add_cookies([{"name": "medisense_session", "value": staff_token("jo.marsh@medisense.test"), "url": BASE}])
        wp = wctx.new_page()
        for path in ["/care/sessions", "/care/plans", "/care/progress", "/care/documentation", "/care/ai-oversight"]:
            wp.goto(BASE + path, timeout=180000)
            wp.wait_for_timeout(5000)
        wctx.close()

        ctx = context(not a.dry)
        page = ctx.new_page()
        page.set_default_timeout(150000)
        page.goto(F.APP_URL)
        t = F.Tour(page, ctx, 0.3 if a.dry else 1.0)
        # Open on a card that matches the one before the splice point.
        t.card("Clinical oversight", "Sessions, plans and progress", "Everything clinical, seen from the office.", 1200)
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
