"""
Records the Module 13 (Treatment Plans & Goals) walkthrough.

    python scripts/demo-videos/record_module13.py --therapist sarah.txt --lead neil.txt --intake jo.txt
"""

import argparse
import pathlib
import shutil
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from record import OVERLAY  # noqa: E402
from record_module08 import Steady, session_cookie  # noqa: E402
from record_module12 import as_user, choose, ready, tab  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "Module-13-Treatment-Plans-and-Goals"

COVER = r"""
(() => {
  try { if (sessionStorage.getItem('__cover_done')) return; } catch (e) { return; }
  const add = () => {
    if (document.getElementById('__cover')) return;
    const c = document.createElement('div');
    c.id = '__cover';
    c.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0c3b2e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:Manrope,system-ui,sans-serif;transition:opacity 600ms ease';
    c.innerHTML = '<div style="font-size:20px;letter-spacing:.18em;text-transform:uppercase;opacity:.75">Medisense · Module 13</div><div style="font-size:54px;font-weight:500">Treatment Plans &amp; Goals</div><div style="font-size:20px;opacity:.8">Measurable goals · interventions · reviews · the clinician signs</div>';
    document.documentElement.appendChild(c);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
"""


def search(d: Steady, text: str):
    box = d.page.get_by_label("Search plans")
    box.fill("")
    d.type(box, text)
    d.wait(1000)


def open_row(d: Steady, has_text: str = ""):
    rows = d.page.locator("tbody tr")
    if has_text:
        rows = rows.filter(has_text=has_text)
    d.click(rows.first.locator("a").first, pause_after=400)
    d.page.locator("[role=tablist]").first.wait_for(timeout=240000)


def clear(loc):
    loc.fill("")
    return loc


def ai_done(d: Steady):
    d.page.get_by_role("status").filter(has_text="Drafting").or_(d.page.get_by_role("status").filter(has_text="Summarising")).first.wait_for(state="detached", timeout=120000)


def walkthrough(d: Steady, ctx, url: str, tokens: dict):
    d.page.goto(d.base + "/therapist/plans", wait_until="load", timeout=240000)
    ready(d)
    d.wait(2600)
    d.page.evaluate("""() => { try { sessionStorage.setItem('__cover_done','1') } catch (e) {}
      const c = document.getElementById('__cover'); if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 700); } }""")
    d.wait(900)
    d.caption("", "Sarah Thompson's treatment plans: one versioned plan for every service episode.", 3400)
    d.caption("1", "Active, waiting, draft, co-sign and overdue-review figures, with charts that filter the table.", 2400)
    d.click(d.page.get_by_role("button").filter(has_text="Active plans").first, pause_after=1800)
    d.click(d.page.get_by_role("button").filter(has_text="Not started").first, pause_after=1800)

    create = d.page.get_by_role("button", name="Create plan")
    if True:
        if create.count():
            d.caption("2", "An episode without a plan: Create plan links the latest signed assessment.", 600)
            d.click(create.first, pause_after=600)
            d.page.locator("[role=tablist]").first.wait_for(timeout=240000)
        else:
            d.click(d.page.get_by_role("button").filter(has_text="Drafts").first, pause_after=1400)
            d.caption("2", "Mason Fernando's draft plan, started from his occupational therapy episode.", 600)
            open_row(d, "Mason")
        d.wait(1800)
        d.caption("3", "Plan details: rationale, priorities, dates, frequency and the informed discussion.", 600)
        d.type(clear(d.page.get_by_label("Primary concern and clinical rationale (required)")), "Reduced independence in personal care after hospital discharge; goals agreed with the participant.")
        d.type(clear(d.page.get_by_label("Participant priorities and preferences")), "Wants to shower without help and cook again.")
        d.page.get_by_label("Start date", exact=True).fill(time.strftime("%Y-%m-%d"))
        d.page.get_by_label("Review date", exact=True).fill(time.strftime("%Y-%m-%d", time.localtime(time.time() + 56 * 86400)))
        d.type(clear(d.page.get_by_label("Recommended frequency")), "Weekly, 60 minutes, 8 weeks")
        choose(d, "Informed discussion", "Agreed")
        d.type(clear(d.page.get_by_label("Discussion notes and authority")), "Discussed with the participant, who agreed.")
        reason = d.page.get_by_label("No source assessment: why?")
        if reason.count() and not reason.input_value():
            d.type(reason, "Goals set from the referral and first visit.")
        ack = d.page.get_by_role("checkbox").filter(visible=True)
        if d.page.get_by_text("Acknowledge before activation.").count():
            d.click(ack.first, pause_after=400)
        d.click(d.page.get_by_role("button", name="Save details"), pause_after=2000)

        tab(d, "Goals")
        d.caption("4", "AI suggests SMART wording from Sarah's notes. She sets every baseline and target.", 600)
        d.type(d.page.get_by_label("Notes for AI"), "Wants to shower alone; currently needs supervision. Would like to make a simple lunch again.")
        d.click(d.page.get_by_role("button", name="Draft SMART wording"), pause_after=800)
        ai_done(d)
        d.wait(3200)
        d.caption("5", "A goal records measure, direction, baseline, target, unit and the testing context.", 600)
        d.click(d.page.get_by_role("button", name="Add goal"), pause_after=900)
        d.type(d.page.get_by_label("Short title"), "Walk to the letterbox")
        d.type(d.page.get_by_label("Functional outcome"), "Walk to the letterbox and back with a four-wheeled walker within 8 weeks.")
        d.type(d.page.get_by_label("Baseline", exact=True), "20")
        d.type(d.page.get_by_label("Target", exact=True), "60")
        d.type(d.page.get_by_label("Testing context"), "Front path, four-wheeled walker, stand-by supervision")
        d.click(d.page.get_by_role("button", name="Save goal"), pause_after=2000)

        tab(d, "Interventions")
        d.caption("6", "Each intervention serves goals, with dosage, a home program, precautions and stop criteria.", 600)
        d.click(d.page.get_by_role("button", name="Add intervention"), pause_after=900)
        d.type(d.page.get_by_label("Intervention", exact=True), "Graded walking program")
        d.click(d.page.get_by_role("checkbox", name="Includes a home program"), pause_after=400)
        d.type(d.page.get_by_label("Home program instructions"), "Walk to the letterbox twice a day with the walker.")
        d.click(d.page.get_by_role("button", name="Save", exact=True), pause_after=2000)

        tab(d, "Overview")
        d.caption("7", "Rules validate the plan. Signing activates it and asks Scheduling to book the visits.", 900)
        validate = d.page.get_by_role("button", name="Validate")
        if validate.count():
            d.click(validate.first, pause_after=1800)
        sign = d.page.get_by_role("button", name="Sign and activate")
        sign.first.wait_for(timeout=20000)
        d.click(sign.first, pause_after=600)
        d.page.get_by_text("Signed and active.").first.wait_for(timeout=20000)
        d.wait(2400)
        d.go("/therapist/plans", 400)
        ready(d)

    d.caption("8", "Harper Nguyen's active plan: two goals, shared with Harper.", 400)
    search(d, "Harper")
    open_row(d)
    d.wait(1800)
    tab(d, "Goals", 2200)
    d.scroll(380)
    d.wait(1400)
    d.caption("9", "Sarah records a measurement with its source and context, so results compare.", 600)
    d.click(d.page.get_by_role("button", name="Record measurement").nth(1), pause_after=800)
    d.type(d.page.get_by_label("Value", exact=True), "3")
    d.type(d.page.get_by_label("Test context"), "Home kitchen, picture recipe card")
    d.click(d.page.get_by_role("button", name="Save", exact=True).filter(visible=True).first, pause_after=2200)
    d.scroll(-380)
    tab(d, "Progress & review", 1800)
    d.caption("10", "Numeric goals chart against the target. Ordinal goals are shown as recorded, never as a percentage.", 3200)
    d.caption("11", "AI summarises signed measurements with cautions. Sarah interprets them.", 600)
    d.click(d.page.get_by_role("button", name="Summarise progress").or_(d.page.get_by_role("button", name="Summarise again")).first, pause_after=800)
    ai_done(d)
    d.wait(3400)
    tab(d, "Patient sharing", 1800)
    d.caption("12", "Only chosen goals and home activities reach verified recipients. Internal notes never do.", 3000)

    d.caption("13", "Lachlan O'Brien: version 1 was superseded by a revised plan after reassessment.", 400)
    d.go("/therapist/plans", 400)
    ready(d)
    search(d, "Lachlan")
    open_row(d, "v2")
    d.wait(1400)
    tab(d, "Versions & timeline", 2600)
    d.caption("14", "Signed versions stay read-only, and every change records who, when and why.", 3000)

    d.caption("15", "Neil Hensley, Clinical Lead: a psychology plan needs his co-signature first.", 400)
    as_user(ctx, url, tokens["lead"])
    d.go("/care/plans", 400)
    ready(d)
    d.wait(1600)
    search(d, "Alex Chen")
    open_row(d, "Psychology")
    d.wait(1800)
    cosign = d.page.get_by_role("button", name="Approve and co-sign")
    if cosign.count():
        d.click(cosign.first, pause_after=2600)
    else:
        d.wait(2400)

    d.caption("16", "Jo Marsh in intake sees readiness only: frequency, review dates and tasks.", 400)
    as_user(ctx, url, tokens["intake"])
    d.go("/care/plans", 400)
    ready(d)
    search(d, "Harper")
    open_row(d)
    d.wait(3000)
    d.caption("", "Plans that are measurable and reviewed: AI suggests, rules check, the clinician signs.", 4200)
    d.clear_caption()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--therapist", required=True)
    ap.add_argument("--lead", required=True)
    ap.add_argument("--intake", required=True)
    ap.add_argument("--url", default="http://localhost:3000")
    args = ap.parse_args()
    tokens = {"therapist": session_cookie(args.therapist), "lead": session_cookie(args.lead), "intake": session_cookie(args.intake)}
    width, height = 1920, 1080
    tmp = OUT / f".tmp-{NAME}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        warm = browser.new_context(viewport={"width": width, "height": height})
        for role, path in (("therapist", "/therapist/plans"), ("lead", "/care/plans"), ("intake", "/care/plans")):
            warm.clear_cookies()
            warm.add_cookies([{"name": "medisense_session", "value": tokens[role], "url": args.url}])
            pg = warm.new_page()
            pg.goto(args.url + path, wait_until="load", timeout=240000)
            pg.locator("table").first.wait_for(timeout=240000)
            pg.locator("tbody a").first.click()
            pg.locator("[role=tablist]").first.wait_for(timeout=240000)
            for t in ("Goals", "Progress & review", "Versions & timeline"):
                tb = pg.get_by_role("tab", name=t)
                if tb.count():
                    tb.first.click()
                    pg.wait_for_timeout(800)
            pg.close()
            print("warmed", role)
        warm.close()
        ctx = browser.new_context(viewport={"width": width, "height": height}, record_video_dir=str(tmp), record_video_size={"width": width, "height": height})
        ctx.add_cookies([{"name": "medisense_session", "value": tokens["therapist"], "url": args.url}])
        ctx.add_init_script(OVERLAY)
        ctx.add_init_script(COVER)
        page = ctx.new_page()
        d = Steady(page, args.url.rstrip("/"), 1.0, True)
        started = time.time()
        ok = True
        try:
            walkthrough(d, ctx, args.url, tokens)
        except Exception as error:
            ok = False
            print(f"Stopped: {error}".splitlines()[0])
            page.screenshot(path=str(OUT / f"{NAME}-failed.png"))
        video = page.video
        ctx.close()
        browser.close()
        if video:
            final = OUT / f"{NAME}{'' if ok else '-incomplete'}.webm"
            final.unlink(missing_ok=True)
            pathlib.Path(video.path()).rename(final)
            shutil.rmtree(tmp, ignore_errors=True)
            print(f"{'Saved' if ok else 'Saved partial'} {final} ({time.time() - started:.0f}s)")


if __name__ == "__main__":
    main()
