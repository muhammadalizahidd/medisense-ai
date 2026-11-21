"""
Records the Module 12 (Clinical Assessments) walkthrough.

    python scripts/demo-videos/record_module12.py --therapist sarah.txt --lead neil.txt --intake jo.txt
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

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "Module-12-Clinical-Assessments"

COVER = r"""
(() => {
  try { if (sessionStorage.getItem('__cover_done')) return; } catch (e) { return; }
  const add = () => {
    if (document.getElementById('__cover')) return;
    const c = document.createElement('div');
    c.id = '__cover';
    c.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0c3b2e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:Manrope,system-ui,sans-serif;transition:opacity 600ms ease';
    c.innerHTML = '<div style="font-size:20px;letter-spacing:.18em;text-transform:uppercase;opacity:.75">Medisense · Module 12</div><div style="font-size:54px;font-weight:500">Clinical Assessments</div><div style="font-size:20px;opacity:.8">Templates that document, never diagnose · the clinician signs</div>';
    document.documentElement.appendChild(c);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
"""


def ready(d: Steady):
    d.page.locator("table, [role=tablist]").first.wait_for(timeout=240000)


def tab(d: Steady, label: str, settle: float = 1700):
    d.click(d.page.get_by_role("tab", name=label).first, pause_after=settle)


def choose(d: Steady, label: str, option: str):
    d.click(d.page.get_by_label(label, exact=True).filter(visible=True).first, pause_after=400)
    d.click(d.page.get_by_role("option", name=option, exact=True).first, pause_after=500)


def as_user(ctx, url: str, token: str):
    ctx.clear_cookies()
    ctx.add_cookies([{"name": "medisense_session", "value": token, "url": url}])


def walkthrough(d: Steady, ctx, url: str, tokens: dict):
    d.page.goto(d.base + "/therapist/assessments", wait_until="load", timeout=240000)
    ready(d)
    d.wait(2600)
    d.page.evaluate("""() => { try { sessionStorage.setItem('__cover_done','1') } catch (e) {}
      const c = document.getElementById('__cover'); if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 700); } }""")
    d.wait(900)
    d.caption("", "Sarah Thompson's assessment queue: every episode from request to signed report.", 3400)
    d.caption("1", "Status mix and open work by discipline, with filters that drive the table.", 2600)
    d.click(d.page.get_by_role("button").filter(has_text="Paused").first, pause_after=1800)
    d.click(d.page.get_by_role("button").filter(has_text="Open").first, pause_after=1000)
    d.caption("2", "OT-001: Jordan Mills' home Functional Capacity Assessment, over two visits.", 600)
    d.click(d.page.get_by_role("link", name="Functional Capacity Assessment").first, pause_after=400)
    ready(d)
    d.wait(2200)
    d.caption("3", "Rules show what blocks signing: two sections still have no findings.", 3200)
    tab(d, "Plan & template")
    d.caption("4", "Purpose, template and version, instrument licences, location, consent and the safety review.", 3400)
    d.scroll(400)
    d.wait(1600)
    d.scroll(-400)
    tab(d, "Workspace")
    d.caption("5", "Each finding records its source, ability, context and result. Reported and observed stay apart.", 900)
    d.click(d.page.get_by_role("button", name="NDIS functional domains").first, pause_after=1200)
    choose(d, "Item", "Self-care")
    choose(d, "Performance", "Supervision")
    d.type(d.page.get_by_label("Observation").filter(visible=True).first, "Observed showering with stand-by supervision; needs prompts to sequence.")
    d.click(d.page.get_by_role("button", name="Save finding").first, pause_after=1800)
    d.click(d.page.get_by_role("button", name="Home environment and access").first, pause_after=1000)
    choose(d, "Item", "Bathroom")
    d.type(d.page.get_by_label("Observation").filter(visible=True).first, "Shower recess has a 40 mm hob; no grab rail.")
    d.click(d.page.get_by_role("button", name="Save finding").first, pause_after=1800)
    tab(d, "Measures & scores")
    d.caption("6", "Scores are entered by hand with tool and version. Unlicensed tools are restricted for scoring.", 3200)
    tab(d, "Evidence")
    d.caption("7", "Photos only with photo consent; every item has a date, sensitivity and sharing scope.", 2800)
    tab(d, "Report")
    d.caption("8", "AI drafts the report from documented findings only, citing every one.", 600)
    d.click(d.page.get_by_role("button", name="Redraft with AI").first, pause_after=500)
    d.page.get_by_text("AI draft · needs your review").first.wait_for(timeout=120000)
    d.wait(1500)
    d.scroll(420)
    d.wait(1800)
    d.click(d.page.get_by_role("button", name="Mark reviewed").first, pause_after=1600)
    d.scroll(-420)
    tab(d, "Review & missing")
    d.caption("9", "AI may suggest observations from the visit notes. Sarah accepts or discards each one.", 900)
    d.wait(1500)

    def tap(name: str, pause: float) -> bool:
        # Suggestions can be replaced by a live refresh between finding and clicking them.
        btn = d.page.get_by_role("button", name=name, exact=True).filter(visible=True)
        if not btn.count():
            return False
        before = btn.count()
        try:
            btn.first.click(timeout=4000)
            d.page.wait_for_function(
                "([n, c]) => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === n && b.offsetParent).length < c",
                arg=[name, before],
                timeout=15000,
            )
        except Exception:
            return False
        d.wait(pause)
        return True

    tap("Accept", 1800)
    for _ in range(6):
        if not tap("Discard", 1500):
            break
    tab(d, "Approval & sharing")
    d.caption("10", "With nothing blocking, Sarah signs. The record locks; changes now need an addendum.", 900)
    d.click(d.page.get_by_role("button", name="Sign assessment").first, pause_after=2600)
    d.caption("11", "Report only: the service closes and a release and billing task goes to the team.", 900)
    d.click(d.page.get_by_role("checkbox", name="Participant").first, pause_after=500)
    d.click(d.page.get_by_role("button", name="Save release decision").first, pause_after=2200)
    tab(d, "History")
    d.caption("12", "Every material change is recorded with who, when and why.", 2600)

    d.caption("13", "Neil Hensley, Clinical Lead: a physiotherapy reassessment compared with its baseline.", 400)
    as_user(ctx, url, tokens["lead"])
    d.go("/care/assessments", 400)
    ready(d)
    d.wait(1600)
    d.type(d.page.get_by_label("Search assessments"), "PT-001")
    d.wait(1000)
    d.click(d.page.get_by_role("link", name="Physiotherapy").first, pause_after=400)
    ready(d)
    d.wait(1200)
    tab(d, "Measures & scores", 2400)
    d.caption("14", "Only results with the same method sit beside the baseline. Nothing is interpreted for you.", 3200)
    d.caption("15", "Psychology needs a Clinical Lead co-signature before the report can be released.", 400)
    d.go("/care/assessments", 400)
    ready(d)
    d.type(d.page.get_by_label("Search assessments"), "PSY-001")
    d.wait(1000)
    d.click(d.page.get_by_role("link", name="Psychological Therapy").first, pause_after=400)
    ready(d)
    d.wait(1000)
    tab(d, "Approval & sharing", 1600)
    co = d.page.get_by_role("button", name="Co-sign")
    if co.count():
        d.type(d.page.get_by_label("Co-sign note"), "Reviewed with the treating psychologist.")
        d.click(co.first, pause_after=2400)

    d.caption("16", "Jo Marsh in intake sees status, visits and history only: no clinical responses.", 400)
    as_user(ctx, url, tokens["intake"])
    d.go("/care/assessments", 400)
    ready(d)
    d.type(d.page.get_by_label("Search assessments"), "OT-002")
    d.wait(900)
    d.click(d.page.locator("tbody a").first, pause_after=400)
    ready(d)
    d.wait(3000)
    d.caption("", "Assessments that document, never diagnose: AI assists, rules check, the clinician signs.", 4200)
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
        for role, path in (("therapist", "/therapist/assessments"), ("lead", "/care/assessments"), ("intake", "/care/assessments")):
            warm.clear_cookies()
            warm.add_cookies([{"name": "medisense_session", "value": tokens[role], "url": args.url}])
            pg = warm.new_page()
            pg.goto(args.url + path, wait_until="load", timeout=240000)
            pg.locator("table").first.wait_for(timeout=240000)
            pg.locator("tbody a").first.click()
            pg.locator("[role=tablist]").first.wait_for(timeout=240000)
            pg.wait_for_timeout(1500)
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
