"""
Records the Module 16 (Progress Monitoring & Clinical Reports) walkthrough.

    python scripts/demo-videos/record_module16.py --therapist sarah.txt --lead neil.txt --intake jo.txt
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
from record_module12 import choose, ready, tab  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "Module-16-Progress-Monitoring-and-Clinical-Reports"

COVER = r"""
(() => {
  try { if (sessionStorage.getItem('__cover_done')) return; } catch (e) { return; }
  const add = () => {
    if (document.getElementById('__cover')) return;
    const c = document.createElement('div');
    c.id = '__cover';
    c.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0c3b2e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:Manrope,system-ui,sans-serif;transition:opacity 600ms ease';
    c.innerHTML = '<div style="font-size:20px;letter-spacing:.18em;text-transform:uppercase;opacity:.75">Medisense · Module 16</div><div style="font-size:54px;font-weight:500">Progress Monitoring &amp; Clinical Reports</div><div style="font-size:20px;opacity:.8">Measured outcomes · reassessment · signed, released reports</div>';
    document.documentElement.appendChild(c);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
"""

NDIS = ["Participant goals", "Service delivered (period and frequency)", "Baseline and current outcomes", "Approach", "Observed progress and barriers", "Recommendations"]


def search(d: Steady, text: str):
    box = d.page.get_by_label("Search progress")
    box.fill("")
    d.type(box, text)
    d.wait(1000)


def open_row(d: Steady, *texts: str):
    rows = d.page.locator("tbody tr").filter(visible=True)
    for t in texts:
        rows = rows.filter(has_text=t)
    d.click(rows.first.locator("a").first, pause_after=400)
    d.page.locator("[role=tablist]").first.wait_for(timeout=240000)


def gone(d: Steady, locator, timeout_s: float = 15):
    for _ in range(int(timeout_s * 4)):
        if not locator.count():
            return
        d.page.wait_for_timeout(250)


def accept_section(d: Steady, title: str):
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
    d.wait(700)


def resolve_all(d: Steady, text: str):
    for _ in range(8):
        res = d.page.get_by_label("Resolution").filter(visible=True)
        n = res.count()
        if not n:
            return
        d.type(res.first, text)
        d.click(d.page.get_by_role("button", name="Resolve").filter(visible=True).first, pause_after=200)
        for _ in range(40):
            if d.page.get_by_label("Resolution").filter(visible=True).count() < n:
                break
            d.page.wait_for_timeout(250)
        d.wait(600)


def walkthrough(d: Steady, ctx, url: str, tokens: dict):
    d.page.goto(d.base + "/therapist/progress", wait_until="load", timeout=240000)
    ready(d)
    d.wait(2600)
    d.page.evaluate("""() => { try { sessionStorage.setItem('__cover_done','1') } catch (e) {}
      const c = document.getElementById('__cover'); if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 700); } }""")
    d.wait(900)
    d.caption("", "Sarah Thompson's episodes: goals against baseline and target, reviews and reports.", 3400)
    d.caption("1", "Active episodes, overdue reviews, goals improving, reports due, awaiting approval and released.", 2600)
    d.click(d.page.get_by_role("tab", name="Report centre"), pause_after=2200)
    d.click(d.page.get_by_role("tab", name="Episodes"), pause_after=1200)

    d.caption("2", "Harper Nguyen's occupational therapy episode.", 400)
    search(d, "Harper")
    open_row(d, "Harper")
    d.wait(2000)
    d.caption("3", "Progress only where it is calculable. Categorical goals and changed methods say why not.", 3400)
    d.scroll(520)
    d.wait(2400)
    d.scroll(-520)

    tab(d, "Record observation")
    d.caption("4", "One observation: value, unit, method, source, setting and conditions.", 600)
    d.type(d.page.get_by_label("Result", exact=True), "3")
    d.type(d.page.get_by_label("Conditions (aid, assistance, test conditions, interpreter, fatigue)"), "Picture recipe card, seated")
    d.click(d.page.get_by_role("button", name="Save observation"), pause_after=2200)

    tab(d, "Reassessment")
    d.caption("5", "A reassessment covers only the relevant domains, across home and telehealth visits.", 600)
    d.click(d.page.get_by_role("button", name="Start reassessment"), pause_after=1800)
    d.type(d.page.get_by_label("Finding"), "Prepares a sandwich three days a week with the picture card.")
    d.click(d.page.get_by_role("button", name="Save finding"), pause_after=1800)
    d.click(d.page.get_by_role("button", name="Save and continue next visit"), pause_after=2000)
    choose(d, "Review domain", "Mobility")
    choose(d, "Review setting", "Telehealth")
    d.type(d.page.get_by_label("Finding"), "Kitchen transfers observed by video: stand-by supervision.")
    d.click(d.page.get_by_role("button", name="Save finding"), pause_after=1800)
    d.caption("6", "Sarah writes her interpretation, checks risk and consent, and signs.", 600)
    d.type(d.page.get_by_label("Clinical interpretation"), "Meal preparation goal met with written prompts; transfers stable. Continue the plan with a reduced visit frequency.")
    d.click(d.page.get_by_label("Risks and consent reviewed for this reassessment"), pause_after=400)
    d.click(d.page.get_by_role("button", name="Sign reassessment"), pause_after=2600)

    tab(d, "Reports")
    d.caption("7", "An NDIS progress report, created from the episode with its own task and due date.", 600)
    d.click(d.page.get_by_role("button", name="Create report"), pause_after=600)
    d.page.get_by_role("tab", name="Compose").wait_for(timeout=60000)
    d.wait(1600)
    d.caption("8", "AI drafts from verified evidence only, citing each source. Drafts never reach the participant.", 600)
    d.click(d.page.get_by_role("button", name="Draft with AI"), pause_after=800)
    d.page.get_by_role("status").filter(has_text="Drafting").first.wait_for(state="detached", timeout=120000)
    d.page.get_by_text("AI draft · not clinically verified").first.wait_for(timeout=60000)
    d.wait(2600)
    d.caption("9", "Sarah reviews every section.", 400)
    for title in NDIS:
        accept_section(d, title)
    tab(d, "Checks & sign")
    d.caption("10", "Rules flag data gaps. Sarah resolves each one, confirms the checklist and signs.", 900)
    resolve_all(d, "Checked against the evidence")
    d.page.get_by_text("data check(s) first").wait_for(state="hidden", timeout=60000)
    d.wait(1500)
    box = d.page.get_by_label("I reviewed this report against the checklist.")
    for _ in range(4):
        if box.is_checked():
            break
        d.click(box, pause_after=900)
    sign = d.page.get_by_role("button", name="Sign report")
    for _ in range(40):
        if sign.is_enabled():
            break
        if not box.is_checked():
            d.click(box, pause_after=600)
        d.wait(500)
    d.click(sign, pause_after=600)
    d.page.get_by_text("Signed", exact=False).first.wait_for(timeout=30000)
    d.wait(2200)
    tab(d, "Release")
    d.caption("11", "Release only the signed version, after checking the recipient's authority and consent.", 600)
    d.click(d.page.get_by_label("Authority verified (scope and expiry)"), pause_after=400)
    d.click(d.page.get_by_label("Consent for this release verified"), pause_after=400)
    d.click(d.page.get_by_role("button", name="Release report"), pause_after=2600)

    d.caption("12", "Neil Hensley, Clinical Lead: the approval queue for co-signature.", 400)
    switch(d, ctx, url, tokens["lead"], "Neil Hensley|Director of Clinical Services", "/care/progress?tab=approvals", "Neil Hensley")
    d.wait(1800)
    rows = d.page.locator("tbody tr").filter(visible=True).filter(has_text="In Review")
    if rows.count():
        d.click(rows.first.locator("a").first, pause_after=400)
        d.page.locator("[role=tablist]").first.wait_for(timeout=120000)
        d.wait(1200)
        tab(d, "Checks & sign", 1800)
        fb = d.page.get_by_label("Feedback")
        if fb.count():
            d.type(fb, "Reviewed against the evidence. Approved.")
            d.click(d.page.get_by_role("button", name="Approve and co-sign"), pause_after=2600)

    d.caption("13", "Jo Marsh in intake sees due dates, status and releases, not report content.", 400)
    switch(d, ctx, url, tokens["intake"], "Jo Marsh|Intake Officer", "/care/progress?tab=reports", "Jo Marsh")
    d.wait(1600)
    search(d, "Harper")
    open_row(d, "Released")
    d.wait(3400)
    d.caption("", "Progress that is measured honestly, and reports that are signed before anyone sees them.", 4200)
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
        for role, path in (("therapist", "/therapist/progress"), ("lead", "/care/progress"), ("intake", "/care/progress")):
            warm.clear_cookies()
            warm.add_cookies([{"name": "medisense_session", "value": tokens[role], "url": args.url}])
            pg = warm.new_page()
            pg.goto(args.url + path, wait_until="load", timeout=240000)
            pg.locator("table").first.wait_for(timeout=240000)
            pg.locator("tbody a").first.click()
            pg.locator("[role=tablist]").first.wait_for(timeout=240000)
            for t in ("Record observation", "Reassessment", "Reports", "Discharge"):
                tb = pg.get_by_role("tab", name=t)
                if tb.count():
                    tb.first.click()
                    pg.wait_for_timeout(700)
            pg.goto(args.url + path + "?tab=reports", wait_until="load", timeout=240000)
            pg.locator("table").first.wait_for(timeout=240000)
            link = pg.locator("tbody a").filter(visible=True)
            if link.count():
                link.first.click()
                pg.locator("[role=tablist]").first.wait_for(timeout=240000)
                pg.wait_for_timeout(1200)
            pg.close()
            print("warmed", role)
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
