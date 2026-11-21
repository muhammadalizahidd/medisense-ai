"""
Records the Module 15 (AI Clinical Documentation) walkthrough.

    python scripts/demo-videos/record_module15.py --therapist sarah.txt --lead neil.txt --intake jo.txt
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
NAME = "Module-15-AI-Clinical-Documentation"

COVER = r"""
(() => {
  try { if (sessionStorage.getItem('__cover_done')) return; } catch (e) { return; }
  const add = () => {
    if (document.getElementById('__cover')) return;
    const c = document.createElement('div');
    c.id = '__cover';
    c.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0c3b2e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:Manrope,system-ui,sans-serif;transition:opacity 600ms ease';
    c.innerHTML = '<div style="font-size:20px;letter-spacing:.18em;text-transform:uppercase;opacity:.75">Medisense · Module 15</div><div style="font-size:54px;font-weight:500">AI Clinical Documentation</div><div style="font-size:20px;opacity:.8">Capture · draft with AI · verify · sign</div>';
    document.documentElement.appendChild(c);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
"""


def search(d: Steady, text: str):
    box = d.page.get_by_label("Search notes")
    box.fill("")
    d.type(box, text)
    d.wait(1000)


def open_row(d: Steady, *texts: str):
    rows = d.page.locator("tbody tr")
    for t in texts:
        rows = rows.filter(has_text=t)
    d.click(rows.first.locator("a").first, pause_after=400)
    d.page.locator("[role=tablist]").first.wait_for(timeout=240000)


def until_fewer(d: Steady, locator, before: int, timeout_s: float = 12):
    for _ in range(int(timeout_s * 4)):
        if locator.count() < before:
            return
        d.page.wait_for_timeout(250)


def click_all(d: Steady, name: str, pause: float = 900, limit: int = 10):
    """Click every visible button with this name, waiting for each save to land first."""
    for _ in range(limit):
        btn = d.page.get_by_role("button", name=name, exact=True).filter(visible=True)
        n = btn.count()
        if not n:
            return
        d.click(btn.first, pause_after=200)
        until_fewer(d, d.page.get_by_role("button", name=name, exact=True).filter(visible=True), n)
        d.wait(pause)


def accept_section(d: Steady, title: str):
    """Accept one AI section and wait until it shows as accepted."""

    def card():
        return d.page.locator("div.rounded-card").filter(has=d.page.get_by_text(title, exact=True)).filter(has=d.page.locator("textarea"))

    btn = card().get_by_role("button", name="Accept", exact=True)
    if not btn.count():
        return
    d.click(btn.first, pause_after=200)
    for _ in range(60):
        if card().get_by_role("button", name="Reviewed").count():
            break
        d.page.wait_for_timeout(250)
    d.wait(800)


def ai_done(d: Steady):
    d.page.get_by_role("status").filter(has_text="Drafting").first.wait_for(state="detached", timeout=120000)


def walkthrough(d: Steady, ctx, url: str, tokens: dict):
    d.page.goto(d.base + "/therapist/documentation", wait_until="load", timeout=240000)
    ready(d)
    d.wait(2600)
    d.page.evaluate("""() => { try { sessionStorage.setItem('__cover_done','1') } catch (e) {}
      const c = document.getElementById('__cover'); if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 700); } }""")
    d.wait(900)
    d.caption("", "Sarah Thompson's documentation: every note from capture to signature.", 3200)
    d.caption("1", "Open, overdue, AI drafts, warnings, co-sign and signed, with filters that drive the table.", 2400)
    d.click(d.page.get_by_role("button").filter(has_text="Overdue").first, pause_after=1800)
    d.click(d.page.get_by_role("button").filter(has_text="Open notes").first, pause_after=1000)
    d.caption("2", "Every page has a guide: what it's for, what you can do, and how it works.", 400)
    d.click(d.page.get_by_role("button", name="Page guide"), pause_after=3200)
    d.page.keyboard.press("Escape")
    d.wait(800)

    d.caption("3", "A new note in three clicks: participant, visit and note type. The rest is filled in.", 400)
    d.click(d.page.get_by_role("button", name="New note"), pause_after=900)
    choose(d, "Participant and service", "Harper Nguyen · Occupational Therapy")
    d.wait(900)
    d.click(d.page.get_by_label("This is the right participant and encounter."), pause_after=500)
    d.click(d.page.get_by_role("button", name="Start note"), pause_after=600)
    d.page.locator("[role=tablist]").first.wait_for(timeout=240000)
    d.wait(1800)
    d.caption("4", "The next step is always one button away.", 600)
    d.click(d.page.get_by_role("button", name="Start capture"), pause_after=1200)
    d.type(d.page.get_by_label("Observations"), "Dressing: upper body independent with set-up; lower body needed physical help with socks and shoes. Bed to chair transfer with stand-by supervision.")
    d.click(d.page.get_by_role("button", name="Save observations"), pause_after=1600)
    d.caption("5", "Dictation: start, pause, resume and stop. It never records the visit itself.", 600)
    d.click(d.page.get_by_role("button", name="Start", exact=True), pause_after=4200)
    d.click(d.page.get_by_role("button", name="Pause"), pause_after=1400)
    d.click(d.page.get_by_role("button", name="Resume"), pause_after=2600)
    d.click(d.page.get_by_role("button", name="Stop and transcribe"), pause_after=600)
    d.page.get_by_text("Dictation transcribed").first.wait_for(timeout=30000)
    d.wait(1400)

    tab(d, "Transcript")
    d.caption("6", "Uncertain words are highlighted. Sarah confirms or corrects them; originals are kept.", 900)
    for _ in range(4):
        # Only the highlighted (uncertain) segments need a decision.
        flagged = d.page.locator("li.bg-watch-bg")
        n = flagged.count()
        if not n:
            break
        d.click(flagged.first.get_by_role("button", name="Confirm as heard"), pause_after=200)
        until_fewer(d, d.page.locator("li.bg-watch-bg"), n)
        d.wait(900)
    d.wait(1200)

    tab(d, "Sources & draft")
    d.caption("7", "Sarah ticks the sources to use. Nothing else reaches the AI.", 600)
    boxes = d.page.locator("ul li input[type=checkbox]").filter(visible=True)
    for i in range(min(boxes.count(), 4)):
        if not boxes.nth(i).is_checked():
            d.click(boxes.nth(i), pause_after=350)
    d.caption("8", "With the participant's AI consent recorded, AI drafts each section and cites its sources.", 600)
    consent = d.page.get_by_role("button", name="Participant consented to AI processing")
    if consent.count():
        d.click(consent.first, pause_after=300)
        d.page.get_by_role("button", name="Generate draft").wait_for(timeout=20000)
        d.wait(900)
    d.click(d.page.get_by_role("button", name="Generate draft"), pause_after=800)
    ai_done(d)
    d.page.get_by_text("AI generated · not clinically verified").first.wait_for(timeout=60000)
    d.wait(2600)
    d.caption("9", "Sarah accepts, edits or rejects every section. Nothing is accepted for her.", 600)
    for title in ("Subjective", "Objective", "Assessment", "Plan"):
        accept_section(d, title)

    tab(d, "Review & sign")
    d.caption("10", "Rules show anything blocking. She confirms she reviewed and verified the note, then signs.", 900)
    d.click(d.page.get_by_label("I reviewed and verified this note.", exact=False), pause_after=1600)
    d.click(d.page.get_by_role("button", name="Sign note"), pause_after=600)
    d.page.get_by_text("Author signed").first.wait_for(timeout=30000)
    d.wait(2200)

    tab(d, "Addenda & sharing")
    d.caption("11", "Only a summary Sarah writes is shared, and only with an authorised recipient.", 600)
    d.type(d.page.get_by_label("Summary to share"), "Thanks for today, Harper. Keep practising with the long-handled shoe horn; we'll review it next visit.")
    d.click(d.page.get_by_label("I checked this recipient is authorised to receive it"), pause_after=500)
    d.click(d.page.get_by_role("button", name="Share summary"), pause_after=2600)

    d.caption("12", "Mason Fernando's draft: AI wrote a diagnosis that no source supports.", 400)
    d.go("/therapist/documentation", 400)
    ready(d)
    search(d, "Mason")
    open_row(d, "Initial assessment summary")
    d.wait(800)
    tab(d, "Review & sign", 2600)
    tab(d, "Sources & draft", 1200)
    d.caption("13", "Sarah rejects the unsupported section, and the rule check clears with it.", 600)
    synth = d.page.locator("div").filter(has=d.page.get_by_text("Clinical synthesis", exact=True)).filter(has=d.page.get_by_role("button", name="Reject")).last
    d.click(synth.get_by_role("button", name="Reject"), pause_after=1800)
    tab(d, "Review & sign", 2400)
    # Rejecting the section removes the unsupported claim, so the rule clears on its own.
    res = d.page.get_by_label("Resolution").filter(visible=True)
    if res.count():
        d.type(res.first, "Diagnosis removed: not in any source")
        d.click(d.page.get_by_role("button", name="Resolve").first, pause_after=2400)

    d.caption("14", "Helen's team reviews supervised notes: Neil co-signs a trainee's session note.", 400)
    as_user(ctx, url, tokens["lead"])
    d.go("/care/documentation", 400)
    ready(d)
    search(d, "Matilda")
    open_row(d, "Therapy session note")
    d.wait(1600)
    d.type(d.page.get_by_label("Feedback"), "Clear and complete. Approved.")
    d.click(d.page.get_by_role("button", name="Approve and co-sign"), pause_after=2600)

    d.caption("15", "Jo Marsh in intake sees completion only: no note content, transcript or recording.", 400)
    as_user(ctx, url, tokens["intake"])
    d.go("/care/documentation", 400)
    ready(d)
    search(d, "Harper")
    open_row(d, "SOAP")
    d.wait(3200)
    d.caption("", "Documentation that is fast and accountable: AI drafts, rules check, clinicians sign.", 4200)
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
        for role, path in (("therapist", "/therapist/documentation"), ("lead", "/care/documentation"), ("intake", "/care/documentation")):
            warm.clear_cookies()
            warm.add_cookies([{"name": "medisense_session", "value": tokens[role], "url": args.url}])
            pg = warm.new_page()
            pg.goto(args.url + path, wait_until="load", timeout=240000)
            pg.locator("table").first.wait_for(timeout=240000)
            pg.locator("tbody a").first.click()
            pg.locator("[role=tablist]").first.wait_for(timeout=240000)
            for t in ("Capture", "Transcript", "Sources & draft", "Review & sign", "Addenda & sharing"):
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
