"""
Records the Module 14 (Therapy Session Management) walkthrough.

    python scripts/demo-videos/record_module14.py --therapist sarah.txt --lead neil.txt --finance morgan.txt
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
NAME = "Module-14-Therapy-Session-Management"

COVER = r"""
(() => {
  try { if (sessionStorage.getItem('__cover_done')) return; } catch (e) { return; }
  const add = () => {
    if (document.getElementById('__cover')) return;
    const c = document.createElement('div');
    c.id = '__cover';
    c.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0c3b2e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:Manrope,system-ui,sans-serif;transition:opacity 600ms ease';
    c.innerHTML = '<div style="font-size:20px;letter-spacing:.18em;text-transform:uppercase;opacity:.75">Medisense · Module 14</div><div style="font-size:54px;font-weight:500">Therapy Session Management</div><div style="font-size:20px;opacity:.8">Prepare · check in · document · hand over</div>';
    document.documentElement.appendChild(c);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
"""


def search(d: Steady, text: str):
    box = d.page.get_by_label("Search sessions")
    box.fill("")
    d.type(box, text)
    d.wait(1000)


def open_row(d: Steady, *texts: str):
    rows = d.page.locator("tbody tr")
    for t in texts:
        rows = rows.filter(has_text=t)
    d.click(rows.first.locator("a").first, pause_after=400)
    d.page.locator("[role=tablist]").first.wait_for(timeout=240000)


def settled(d: Steady, text: str, timeout: int = 120000):
    d.page.get_by_text(text).first.wait_for(timeout=timeout)


def ai_done(d: Steady):
    d.page.get_by_role("status").filter(has_text="Preparing").or_(d.page.get_by_role("status").filter(has_text="Drafting")).first.wait_for(state="detached", timeout=120000)


def walkthrough(d: Steady, ctx, url: str, tokens: dict):
    d.page.goto(d.base + "/therapist/sessions", wait_until="load", timeout=240000)
    ready(d)
    d.wait(2600)
    d.page.evaluate("""() => { try { sessionStorage.setItem('__cover_done','1') } catch (e) {}
      const c = document.getElementById('__cover'); if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 700); } }""")
    d.wait(900)
    d.caption("", "Sarah Thompson's sessions: every visit prepared, conducted, documented and handed over.", 3400)
    d.caption("1", "Today, in progress, notes to sign, did not attend, unverified delivery and sync issues.", 2600)
    d.click(d.page.get_by_role("radio", name="Today").or_(d.page.get_by_role("button", name="Today", exact=True)).first, pause_after=1800)
    d.click(d.page.get_by_role("radio", name="All").or_(d.page.get_by_role("button", name="All", exact=True)).first, pause_after=1000)

    d.caption("2", "Mason Fernando's first home visit, in about an hour.", 400)
    search(d, "Mason")
    open_row(d, "Initial Assessment")
    d.wait(1600)
    d.caption("3", "AI prepares a brief from signed notes, goals and documented risks, citing each source.", 600)
    d.click(d.page.get_by_role("button", name="Prepare brief"), pause_after=800)
    ai_done(d)
    d.wait(3400)

    tab(d, "Prepare")
    d.caption("4", "A home visit checklist: access, pets, infection, manual handling and lone-worker check-in.", 600)
    for _ in range(10):
        # Confirm the next item that isn't confirmed yet.
        row = d.page.locator("li").filter(has=d.page.get_by_role("button", name="Not applicable")).filter(
            has_not=d.page.locator("button.bg-healthy-bg")
        ).filter(has_not=d.page.locator("button.bg-sunken"))
        before = row.count()
        if not before:
            break
        d.click(row.first.get_by_role("button", name="Confirmed"), pause_after=300)
        # Each click saves and refreshes the list; wait for it before looking for the next item.
        for _ in range(40):
            if row.count() < before:
                break
            d.page.wait_for_timeout(250)
        d.wait(700)
    d.type(d.page.get_by_label("Attendee name"), "Rosa Fernando")
    d.type(d.page.get_by_label("Authority"), "Mother, nominated carer")
    d.click(d.page.get_by_role("button", name="Add attendee"), pause_after=1800)

    tab(d, "Check-in & safety")
    d.caption("5", "Identity and location are confirmed before any clinical activity begins.", 600)
    d.click(d.page.get_by_label("Participant identity confirmed"), pause_after=500)
    d.click(d.page.get_by_label("Site and address confirmed"), pause_after=500)
    d.click(d.page.get_by_role("button", name="Check in and start"), pause_after=600)
    settled(d, "Identity and location confirmed")
    d.wait(2200)
    d.caption("6", "Unsafe to proceed would stop the visit, never mark it complete, and alert the Clinical Lead.", 2800)

    tab(d, "Activities")
    d.caption("7", "Each activity records result, unit, method, support level, response and source.", 600)
    d.type(d.page.get_by_label("Activity", exact=True), "Transfer practice")
    choose(d, "Result type", "Numeric")
    d.type(d.page.get_by_label("Result", exact=True), "4")
    d.type(d.page.get_by_label("Method and conditions"), "Bed to chair, standard height")
    d.click(d.page.get_by_role("button", name="Record activity"), pause_after=1200)
    settled(d, "Check: Add a unit")
    d.caption("8", "Rules flag a number without a unit. Sarah fixes it so results stay comparable.", 600)
    d.click(d.page.get_by_role("button", name="Edit").first, pause_after=800)
    choose(d, "Unit", "reps")
    d.click(d.page.get_by_role("button", name="Save changes"), pause_after=2400)

    d.caption("9", "Harper Nguyen's home visit has been under way for 40 minutes.", 400)
    d.go("/therapist/sessions", 400)
    ready(d)
    search(d, "Harper")
    open_row(d, "Assessment Continuation")
    d.wait(1400)
    tab(d, "Activities", 2600)
    tab(d, "End & handover")
    d.caption("10", "Ending the session: disposition, follow-ups and tasks for scheduling and clinical.", 600)
    d.click(d.page.get_by_label("New Session", exact=True), pause_after=400)
    d.click(d.page.get_by_label("Report", exact=True), pause_after=400)
    d.click(d.page.get_by_role("button", name="End session"), pause_after=600)
    settled(d, "Task created")
    d.wait(2200)

    tab(d, "Notes")
    d.caption("11", "AI drafts the SOAP note from the recorded activities only. Nothing is invented.", 600)
    d.click(d.page.get_by_role("button", name="Draft note with AI"), pause_after=800)
    ai_done(d)
    settled(d, "AI draft · unverified")
    d.wait(3200)
    d.caption("12", "The draft stays unverified until Sarah reviews it. Then she signs.", 600)
    d.click(d.page.get_by_role("button", name="I've reviewed the AI draft"), pause_after=1600)
    d.click(d.page.get_by_role("button", name="Sign note"), pause_after=600)
    settled(d, "Signed and locked.")
    d.wait(2400)

    d.caption("13", "Lachlan O'Brien's note was edited on the phone offline and on the web. Sarah chooses.", 400)
    d.go("/therapist/sessions", 400)
    ready(d)
    search(d, "Lachlan")
    open_row(d, "Treatment", "Draft")
    d.wait(1000)
    tab(d, "Notes", 2600)
    d.click(d.page.get_by_role("button", name="Keep this version").first, pause_after=2600)

    d.caption("14", "Alex Chen's telehealth review: consent, recording states and every call event.", 400)
    d.go("/therapist/sessions", 400)
    ready(d)
    search(d, "Alex Chen")
    open_row(d, "Review")
    d.wait(1000)
    tab(d, "Telehealth", 3600)

    d.caption("15", "Morgan Blake in finance verifies delivery from the facts, without the clinical note.", 400)
    as_user(ctx, url, tokens["finance"])
    d.go("/care/sessions", 400)
    ready(d)
    search(d, "Harper")
    open_row(d, "Assessment Continuation")
    d.wait(1600)
    choose(d, "Delivery verification", "Verified")
    d.type(d.page.get_by_label("Note for billing"), "Attended, times and signature confirmed")
    d.click(d.page.get_by_role("button", name="Save verification"), pause_after=2600)

    d.caption("16", "Neil Hensley, Clinical Lead: psychology sessions stay at status level, even for him.", 400)
    as_user(ctx, url, tokens["lead"])
    d.go("/care/sessions", 400)
    ready(d)
    search(d, "Alex Chen")
    open_row(d, "Psychology")
    d.wait(3400)
    d.caption("", "Sessions that are safe, documented and verified: AI drafts, rules check, people sign.", 4200)
    d.clear_caption()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--therapist", required=True)
    ap.add_argument("--lead", required=True)
    ap.add_argument("--finance", required=True)
    ap.add_argument("--url", default="http://localhost:3000")
    args = ap.parse_args()
    tokens = {"therapist": session_cookie(args.therapist), "lead": session_cookie(args.lead), "finance": session_cookie(args.finance)}
    width, height = 1920, 1080
    tmp = OUT / f".tmp-{NAME}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        warm = browser.new_context(viewport={"width": width, "height": height})
        for role, path in (("therapist", "/therapist/sessions"), ("lead", "/care/sessions"), ("finance", "/care/sessions")):
            warm.clear_cookies()
            warm.add_cookies([{"name": "medisense_session", "value": tokens[role], "url": args.url}])
            pg = warm.new_page()
            pg.goto(args.url + path, wait_until="load", timeout=240000)
            pg.locator("table").first.wait_for(timeout=240000)
            pg.locator("tbody a").first.click()
            pg.locator("[role=tablist]").first.wait_for(timeout=240000)
            for t in ("Prepare", "Activities", "Notes", "End & handover", "History"):
                tb = pg.get_by_role("tab", name=t)
                if tb.count():
                    tb.first.click()
                    pg.wait_for_timeout(700)
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
