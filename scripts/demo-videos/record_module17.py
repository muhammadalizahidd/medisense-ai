"""
Records the Module 17 (Therapist Tasks & Care Coordination) walkthrough.

    python scripts/demo-videos/record_module17.py --therapist sarah.txt --lead neil.txt --intake jo.txt
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
from record_patient import ROLE_CARD, switch  # noqa: E402
from record_module12 import choose, ready  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "Module-17-Therapist-Tasks-and-Care-Coordination"

COVER = r"""
(() => {
  try { if (sessionStorage.getItem('__cover_done')) return; } catch (e) { return; }
  const add = () => {
    if (document.getElementById('__cover')) return;
    const c = document.createElement('div');
    c.id = '__cover';
    c.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0c3b2e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:Manrope,system-ui,sans-serif;transition:opacity 600ms ease';
    c.innerHTML = '<div style="font-size:20px;letter-spacing:.18em;text-transform:uppercase;opacity:.75">Medisense · Module 17</div><div style="font-size:54px;font-weight:500">Therapist Tasks &amp; Care Coordination</div><div style="font-size:20px;opacity:.8">Every task has an owner, a due date and an outcome</div>';
    document.documentElement.appendChild(c);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
"""


def search(d: Steady, text: str):
    box = d.page.get_by_label("Search tasks")
    box.fill("")
    d.type(box, text)
    d.wait(1000)


def open_row(d: Steady, *texts: str):
    rows = d.page.locator("tbody tr").filter(visible=True)
    for t in texts:
        rows = rows.filter(has_text=t)
    d.click(rows.first.locator("a").first, pause_after=400)
    d.page.get_by_text("Activity and audit").first.wait_for(timeout=240000)


def scope(d: Steady, label: str, pause: float = 1600):
    d.click(d.page.get_by_role("button", name=label, exact=True).first, pause_after=pause)


def back(d: Steady, path: str = "/therapist/coordination"):
    d.go(path, 400)
    ready(d)


def walkthrough(d: Steady, ctx, url: str, tokens: dict):
    d.page.goto(d.base + "/therapist/coordination", wait_until="load", timeout=240000)
    ready(d)
    d.wait(2600)
    d.page.evaluate("""() => { try { sessionStorage.setItem('__cover_done','1') } catch (e) {}
      const c = document.getElementById('__cover'); if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 700); } }""")
    d.wait(900)
    d.caption("", "Sarah Thompson's tasks and care coordination: one place for every follow-up.", 3400)
    d.caption("1", "Open, due today, overdue, waiting, pending review and AI suggestions, with charts that filter.", 2400)
    scope(d, "Overdue")
    scope(d, "Waiting")
    scope(d, "My tasks", 1000)

    d.caption("2", "AI suggests tasks from signed notes and plan reviews. Sarah decides; duplicates are flagged.", 600)
    d.click(d.page.get_by_role("tab", name="AI suggestions"), pause_after=2200)
    accept = d.page.get_by_role("button", name="Accept", exact=True).filter(visible=True)
    if accept.count():
        d.click(accept.first, pause_after=2200)
    reject = d.page.get_by_role("button", name="Reject", exact=True).filter(visible=True)
    if reject.count():
        d.click(reject.last, pause_after=2000)
    d.click(d.page.get_by_role("tab", name="Tasks"), pause_after=1000)

    d.caption("3", "A new task needs an owner with access to the record, a due date and clear instructions.", 600)
    d.click(d.page.get_by_role("button", name="New task"), pause_after=900)
    d.type(d.page.get_by_label("Title"), "Call Harper's mother about the shower chair")
    choose(d, "Participant", "Harper Nguyen")
    choose(d, "Owner", "Sarah Thompson · Clinician")
    d.page.get_by_label("Due", exact=True).first.fill(time.strftime("%Y-%m-%dT%H:%M", time.localtime(time.time() + 86400)))
    d.type(d.page.get_by_label("Instructions"), "Confirm the chair arrived and fits the recess; book a fitting visit if not.")
    d.type(d.page.get_by_label("Checklist item"), "Confirm delivery")
    d.click(d.page.get_by_role("button", name="Add", exact=True), pause_after=500)
    d.click(d.page.get_by_role("button", name="Create task"), pause_after=600)
    d.page.get_by_text("Activity and audit").first.wait_for(timeout=60000)
    d.wait(1600)

    d.caption("4", "Every contact attempt is recorded. No answer moves the task to Waiting on Patient.", 600)
    d.type(d.page.get_by_label("Attempt outcome"), "No answer, voicemail left")
    d.type(d.page.get_by_label("Next attempt"), "Tomorrow morning")
    d.click(d.page.get_by_role("button", name="Record attempt"), pause_after=2200)
    d.type(d.page.get_by_label("Attempt outcome"), "Spoke with Harper's mother: chair fits well")
    d.click(d.page.get_by_role("button", name="Record attempt"), pause_after=2200)
    d.caption("5", "A clinical follow-up closes only with an outcome. Completing never signs a note.", 600)
    d.type(d.page.get_by_label("Outcome"), "Chair delivered and fits; no fitting visit needed.")
    d.click(d.page.get_by_role("button", name="Complete task"), pause_after=2600)

    d.caption("6", "A handover to psychology: only shareable documents, with sharing authority confirmed.", 400)
    back(d)
    scope(d, "Team tasks", 900)
    search(d, "Handover")
    open_row(d, "Handover")
    d.wait(2600)
    auth = d.page.get_by_label("Sharing authority confirmed")
    if auth.count() and not auth.is_checked():
        d.click(auth, pause_after=500)
    send = d.page.get_by_role("button", name="Send handover")
    if send.count():
        d.click(send, pause_after=2600)

    d.caption("7", "A booking request goes to Scheduling; their response shows on Sarah's task.", 400)
    back(d)
    search(d, "continued assessment")
    open_row(d, "continued assessment")
    d.wait(3200)

    d.caption("8", "Edited on the phone offline and on the web: Sarah chooses, nothing is overwritten.", 400)
    back(d)
    search(d, "home program")
    open_row(d, "home program")
    d.wait(1600)
    keep = d.page.get_by_role("button", name="Keep this version")
    if keep.count():
        d.click(keep.first, pause_after=2600)

    d.caption("9", "Neil Hensley, Clinical Lead: supervision reviews wait for an authorised reviewer.", 400)
    switch(d, ctx, url, tokens["lead"], "Neil Hensley|Director of Clinical Services", "/care/coordination?tab=supervision", "Neil Hensley")
    d.wait(1800)
    rows = d.page.locator("tbody tr").filter(visible=True).filter(has_text="Supervisor review")
    if rows.count():
        d.click(rows.first.locator("a").first, pause_after=400)
        d.page.get_by_text("Activity and audit").first.wait_for(timeout=120000)
        d.wait(1400)
        fb = d.page.get_by_label("Review feedback")
        if fb.count():
            d.type(fb, "Walk distance added. Approved.")
            d.click(d.page.get_by_role("button", name="Approve"), pause_after=2600)

    d.caption("10", "Jo Marsh in admin sees a psychology follow-up as status only.", 400)
    switch(d, ctx, url, tokens["intake"], "Jo Marsh|Intake Officer", "/care/coordination", "Jo Marsh")
    d.click(d.page.get_by_role("button", name="Team tasks", exact=True).first, pause_after=900)
    search(d, "Restricted")
    rows = d.page.locator("tbody tr").filter(visible=True).filter(has_text="Restricted")
    if rows.count():
        d.click(rows.first.locator("a").first, pause_after=400)
        d.page.get_by_text("Activity and audit").first.wait_for(timeout=120000)
    d.wait(3000)
    d.caption("", "Coordination without loose ends: AI suggests, rules check, clinicians own the outcome.", 4200)
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
        browser = p.chromium.launch(headless=True, args=["--lang=en-AU"])
        warm = browser.new_context(viewport={"width": width, "height": height})
        for role, path in (("therapist", "/therapist/coordination"), ("lead", "/care/coordination"), ("intake", "/care/coordination")):
            warm.clear_cookies()
            warm.add_cookies([{"name": "medisense_session", "value": tokens[role], "url": args.url}])
            pg = warm.new_page()
            pg.goto(args.url + path, wait_until="load", timeout=240000)
            pg.locator("table").first.wait_for(timeout=240000)
            for t in ("AI suggestions", "Care team", "Supervision", "Tasks"):
                tb = pg.get_by_role("tab", name=t)
                if tb.count():
                    tb.first.click()
                    pg.wait_for_timeout(500)
            link = pg.locator("tbody a").filter(visible=True)
            if link.count():
                link.first.click()
                pg.get_by_text("Activity and audit").first.wait_for(timeout=240000)
                pg.wait_for_timeout(1000)
            pg.close()
            print("warmed", role, flush=True)
        warm.close()
        ctx = browser.new_context(viewport={"width": width, "height": height}, locale="en-AU", timezone_id="Australia/Brisbane", record_video_dir=str(tmp), record_video_size={"width": width, "height": height})
        ctx.add_cookies([{"name": "medisense_session", "value": tokens["therapist"], "url": args.url}])
        ctx.add_init_script(OVERLAY)
        ctx.add_init_script(COVER)
        ctx.add_init_script(ROLE_CARD)
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
