"""
Records the Module 11 (Clinical Patient Records) walkthrough.

    python scripts/demo-videos/record_module11.py --therapist sarah.txt --lead neil.txt --intake jo.txt

Each argument is a curl cookie jar holding a signed-in session (Sarah Thompson, Neil Hensley,
Jo Marsh), so no password is typed on screen. Saved to demo-videos/ beside the other modules.
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
NAME = "Module-11-Clinical-Patient-Records"

COVER = r"""
(() => {
  try { if (sessionStorage.getItem('__cover_done')) return; } catch (e) { return; }
  const add = () => {
    if (document.getElementById('__cover')) return;
    const c = document.createElement('div');
    c.id = '__cover';
    c.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0c3b2e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:Manrope,system-ui,sans-serif;transition:opacity 600ms ease';
    c.innerHTML = '<div style="font-size:20px;letter-spacing:.18em;text-transform:uppercase;opacity:.75">Medisense · Module 11</div><div style="font-size:54px;font-weight:500">Clinical Patient Records</div><div style="font-size:20px;opacity:.8">One longitudinal record · permission-aware · nothing assumed</div>';
    document.documentElement.appendChild(c);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
"""


def wait_ready(d: Steady):
    d.page.locator("table, [role=tablist]").first.wait_for(timeout=240000)


def tab(d: Steady, label: str, settle: float = 1800):
    d.click(d.page.get_by_role("tab", name=label).first, pause_after=settle)


def as_user(d: Steady, ctx, url: str, token: str):
    ctx.clear_cookies()
    ctx.add_cookies([{"name": "medisense_session", "value": token, "url": url}])


def walkthrough(d: Steady, ctx, url: str, tokens: dict):
    d.page.goto(d.base + "/therapist/records", wait_until="load", timeout=240000)
    wait_ready(d)
    d.wait(2600)
    d.page.evaluate("""() => { try { sessionStorage.setItem('__cover_done','1') } catch (e) {}
      const c = document.getElementById('__cover'); if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 700); } }""")
    d.wait(900)
    d.caption("", "Sarah Thompson, OT, opens her clinical records: only the participants assigned to her.", 3400)
    d.hover(d.page.get_by_text("My participants").first, 1200)
    d.caption("1", "Search all shows other names locked, with a Request access route. Nothing clinical leaks.", 900)
    d.click(d.page.get_by_role("button", name="Search all").first, pause_after=1800)
    d.click(d.page.get_by_role("button", name="My clients").first, pause_after=900)
    d.caption("2", "Alex Chen has two episodes: OT with Sarah, and psychology with another clinician.", 900)
    d.click(d.page.get_by_role("link", name="Alex Chen").first, pause_after=500)
    wait_ready(d)
    d.wait(2200)
    d.caption("3", "The summary: identity, referral, next visit, alerts, episodes and the visit safety plan.", 3400)
    d.caption("4", "Ask Medisense lists history gaps. Every point cites its source; Sarah approves it.", 900)
    d.click(d.page.get_by_role("button", name="History gaps").first, pause_after=900)
    draft = d.page.get_by_role("button", name="Draft with AI")
    if draft.count():
        d.click(draft.first, pause_after=600)
        d.page.get_by_role("button", name="Approve").first.wait_for(timeout=90000)
        d.wait(2600)
        d.scroll(380)
        d.wait(2000)
        d.click(d.page.get_by_role("button", name="Approve").first, pause_after=1600)
        d.scroll(-380)

    tab(d, "History")
    d.caption("5", "History keeps Recorded, Unknown, Not assessed and Not applicable apart. A blank is never a no.", 3200)
    d.scroll(520)
    d.wait(1400)
    d.scroll(-520)
    tab(d, "Conditions & medicines")
    d.caption("6", "Referral-reported and clinician-confirmed conditions stay separate, with their source.", 3000)
    tab(d, "Risks & safety")
    d.caption("7", "Severity is set by the clinician, never AI. A high risk opens a review task for the Clinical Lead.", 3200)
    tab(d, "Clinical entries")
    d.caption("8", "Psychology notes stay with psychology: Sarah sees only that the entry exists.", 2400)
    d.scroll(600)
    d.wait(1500)
    d.scroll(-600)
    tab(d, "Timeline")
    d.caption("9", "One timeline: referral, visits, entries, addenda, risks and consent, filterable by discipline.", 3000)
    d.scroll(500)
    d.wait(1200)
    d.scroll(-500)
    tab(d, "Consent")
    d.caption("10", "Telehealth, recording and AI-scribe consent are recorded separately. Here AI scribe was refused.", 3200)
    tab(d, "Reconciliation")
    d.caption("11", "Conflicts and gaps are flagged for a person to reconcile; both sources are kept.", 2600)
    tab(d, "Access log")
    d.caption("12", "Every view and change is logged with who, when and why.", 2600)

    d.caption("13", "Jordan Mills: a home visit saved as incomplete can't be signed until it's finished.", 600)
    d.go("/therapist/records", 400)
    wait_ready(d)
    d.click(d.page.get_by_role("link", name="Jordan Mills").first, pause_after=400)
    wait_ready(d)
    d.wait(1200)
    tab(d, "Clinical entries", 2600)
    d.scroll(300)
    d.wait(1500)

    d.caption("14", "Now Neil Hensley, Clinical Lead, sees every record at the level his role allows.", 400)
    as_user(d, ctx, url, tokens["lead"])
    d.go("/care/records", 400)
    wait_ready(d)
    d.wait(2400)
    d.page.mouse.move(900, 600)
    for _ in range(3):
        d.page.mouse.wheel(0, 380)
        d.wait(600)
    d.caption("15", "Opening a record asks for a purpose first. Clinical Lead access is authorised, not blanket.", 600)
    d.go("/care/records", 400)
    wait_ready(d)
    d.click(d.page.get_by_role("link", name="Alex Chen").first, pause_after=400)
    wait_ready(d)
    d.wait(2600)
    open_btn = d.page.get_by_role("button", name="Open record")
    if open_btn.count():
        d.click(open_btn.first, pause_after=2600)
    tab(d, "Clinical entries", 2400)
    d.caption("16", "With the purpose recorded, the psychology entries open, and the view is logged.", 3000)

    d.caption("17", "Jo Marsh in intake sees identity, referral and documents only: no clinical history.", 400)
    as_user(d, ctx, url, tokens["intake"])
    d.go("/care/records", 400)
    wait_ready(d)
    d.click(d.page.get_by_role("link", name="Alex Chen").first, pause_after=400)
    wait_ready(d)
    d.wait(3200)
    d.caption("", "One record, many roles: the right detail for each person, and every access logged.", 4200)
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
        # Warm every screen first so nothing compiles on camera.
        warm = browser.new_context(viewport={"width": width, "height": height})
        for role, paths in (("therapist", ["/therapist/records"]), ("lead", ["/care/records"]), ("intake", ["/care/records"])):
            warm.clear_cookies()
            warm.add_cookies([{"name": "medisense_session", "value": tokens[role], "url": args.url}])
            pg = warm.new_page()
            for path in paths:
                pg.goto(args.url + path, wait_until="load", timeout=240000)
                pg.locator("table").first.wait_for(timeout=240000)
                link = pg.get_by_role("link", name="Alex Chen").first
                if link.count():
                    link.click()
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
