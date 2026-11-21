"""
Records the Module 08 (Operations & Workflow Automation) walkthrough.

    python scripts/demo-videos/record_module08.py --cookie <curl cookie jar> [--shots]

--cookie   a curl cookie jar holding a signed-in Neil Hensley session (so no password is typed
           on screen). Make one with: curl -c neil.txt -d '{...}' http://localhost:3000/api/auth/login
--shots    take full-page screenshots of every tab instead of recording a video
Output goes to the repo's demo-videos folder next to the Module 06 and 07 videos.
"""

import argparse
import pathlib
import shutil
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from record import OVERLAY, Director  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "Module-08-Operations-Workflow"
# A title card over the first page load, so the video never opens on loading placeholders.
COVER = r"""
(() => {
  try { if (sessionStorage.getItem('__cover_done')) return; } catch (e) { return; }
  const add = () => {
    if (document.getElementById('__cover')) return;
    const c = document.createElement('div');
    c.id = '__cover';
    c.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0c3b2e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:Manrope,system-ui,sans-serif;transition:opacity 600ms ease';
    c.innerHTML = '<div style="font-size:20px;letter-spacing:.18em;text-transform:uppercase;opacity:.75">Medisense · Module 08</div><div style="font-size:54px;font-weight:500">Operations &amp; Workflow Automation</div><div style="font-size:20px;opacity:.8">Rules route the work · AI suggests · people decide</div>';
    document.documentElement.appendChild(c);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
"""

TABS = ["overview", "queue", "review", "matching", "approvals", "notifications", "rules", "log", "reports", "settings"]


class Steady(Director):
    """Survives a dev-server reload mid-step: captions retry, navigation waits for the page."""

    def caption(self, step: str, text: str, hold: float = 2600):
        for _ in range(4):
            try:
                super().caption(step, text, 0)
                break
            except Exception:
                self.page.wait_for_timeout(1500)
        self.wait(hold)

    def clear_caption(self):
        try:
            super().clear_caption()
        except Exception:
            pass

    def go(self, path: str, settle: float = 2200):
        self.page.goto(self.base + path, wait_until="load", timeout=180000)
        if path.startswith("/care/operations") and "/rules/" not in path and "/tasks/" not in path:
            self.page.get_by_role("tablist", name="Operations").wait_for(timeout=180000)
        self.wait(settle)


def session_cookie(jar: str) -> str:
    for line in pathlib.Path(jar).read_text().splitlines():
        parts = line.split("\t")
        if len(parts) >= 7 and parts[5] == "medisense_session":
            return parts[6]
    raise SystemExit("No medisense_session cookie in that jar.")


def tab(d: Steady, label: str, settle: float = 2200):
    d.click(d.page.get_by_role("tab", name=label).first, pause_after=settle)


def scroll_table(d: Steady, steps: int = 3):
    box = d.page.locator("div.h-\\[600px\\]").filter(visible=True).first
    if box.count():
        d.move_to(box)
        for _ in range(steps):
            d.page.mouse.wheel(0, 420)
            d.wait(650)
        d.page.mouse.wheel(0, -420 * steps)
        d.wait(500)


def walkthrough(d: Steady):
    d.go("/care/operations", 500)
    d.page.get_by_role("tablist", name="Operations").wait_for(timeout=180000)
    d.wait(2600)
    d.page.evaluate("""() => { try { sessionStorage.setItem('__cover_done','1') } catch (e) {}
      const c = document.getElementById('__cover'); if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 700); } }""")
    d.wait(900)
    d.caption("", "Medisense Operations: one command centre for every referral, task, rule and approval.", 3600)
    d.caption("1", "The pulse: on-time rate, open work and 14-day trends, all from live records.", 3200)
    d.hover(d.page.get_by_text("Operations pulse").first, 1600)
    d.scroll(520)
    d.caption("2", "Throughput and automation outcomes: what rules created, closed, escalated or skipped.", 3400)
    d.scroll(560)
    d.caption("3", "SLA by team. Click a team and the whole overview filters to it.", 1200)
    d.click(d.page.get_by_role("button", name="Clinical").filter(has_text="open").first, pause_after=2600)
    d.click(d.page.get_by_role("button", name="Clinical").filter(has_text="open").first, pause_after=1200)
    d.scroll(600)
    d.caption("4", "Needs attention, a live activity feed, and every automation with its run count.", 3600)
    d.scroll(-2400, steps=16)

    tab(d, "Work queue")
    d.caption("5", "The unified work queue: hundreds of tasks, filtered, sorted and searchable.", 2600)
    scroll_table(d)
    d.click(d.page.get_by_role("tab", name="Escalated").first, pause_after=1600)
    d.click(d.page.get_by_role("tab", name="All").first, pause_after=900)
    d.type(d.page.get_by_label("Search tasks"), "REF-MRN-1511")
    d.wait(1600)
    d.caption("6", "Open any task in a side panel without losing your place.", 900)
    d.click(d.page.locator("tbody button").filter(visible=True).first, pause_after=2600)
    d.page.keyboard.press("Escape")
    d.wait(700)
    d.page.get_by_label("Search tasks").fill("")
    d.wait(900)
    d.caption("7", "Bulk actions are safe ones only. Clinical and restricted tasks are always skipped.", 900)
    boxes = d.page.locator("tbody input[type=checkbox]").filter(visible=True)
    for i in range(3):
        d.click(boxes.nth(i), pause_before=150, pause_after=350)
    d.wait(1800)
    for i in range(3):
        boxes.nth(i).click()
    d.wait(500)

    tab(d, "AI referral review")
    d.caption("8", "AI referral review: rules check completeness first, then AI cross-checks the documents.", 3000)
    d.click(d.page.get_by_role("button").filter(has_text="Taylor Singh").first, pause_after=1800)
    d.scroll(520)
    d.caption("9", "AI found the school letter disagrees with the form, and quotes its evidence.", 3600)
    d.scroll(420)
    d.wait(1800)
    d.caption("10", "A person decides every finding. Rejecting leaves the submitted value untouched.", 3000)
    d.scroll(-1200, steps=10)

    tab(d, "Therapist matching")
    d.caption("11", "Therapist matching: hard eligibility gates first, then a ranked, explained shortlist.", 1200)
    physio = d.page.get_by_role("button").filter(has_text="Physiotherapy")
    if physio.count():
        d.click(physio.first, pause_after=3200)
    d.scroll(420)
    d.wait(1600)
    d.caption("12", "Nothing is assigned until a scheduler approves. Risk cases never auto-assign.", 3000)
    d.scroll(-600)

    tab(d, "Approvals")
    d.caption("13", "Approvals and escalations: named approver, SLA, and the full decision history.", 1200)
    d.click(d.page.get_by_role("button", name="History").first, pause_after=1500)
    scroll_table(d, 2)
    d.click(d.page.locator("tbody button").filter(visible=True).first, pause_after=2800)
    d.page.keyboard.press("Escape")
    d.wait(700)

    tab(d, "Notifications")
    d.caption("14", "Notifications: versioned templates, consent and quiet hours. Every delivery is simulated.", 3000)
    d.click(d.page.get_by_role("button").filter(has_text="Failed").first, pause_after=1800)
    d.click(d.page.get_by_role("button").filter(has_text="Failed").first, pause_after=900)
    scroll_table(d, 2)

    tab(d, "Rules")
    d.caption("15", "Every rule in the automation catalogue, versioned, with its run mode and activity.", 2600)
    scroll_table(d, 2)
    d.click(d.page.get_by_role("link", name="Risk or behaviour flag").first, pause_after=2600)
    d.caption("16", "The rule builder: trigger, conditions, action, escalation, approval and versions.", 2400)
    d.scroll(700)
    d.wait(1500)
    d.scroll(700)
    d.wait(1200)
    d.go("/care/operations?tab=log", 3500)

    d.caption("17", "The run log: every rule run with its version, input, actions and outcome.", 2600)
    scroll_table(d, 3)

    tab(d, "Reports")
    d.caption("18", "Reports with documented denominators, and N/A where there's nothing to divide by.", 3000)
    d.scroll(560)
    d.wait(2000)
    d.scroll(-560)

    tab(d, "Settings")
    d.caption("19", "Working hours, quiet hours, thresholds and who can change workflow rules.", 3200)
    d.go("/care/operations", 3500)
    d.caption("", "Rules route the work, AI suggests, people decide. Every step is logged.", 4200)
    d.clear_caption()


def warm_up(browser, url: str, token: str, width: int, height: int):
    """Visits every screen once, unrecorded, so the dev server has compiled and cached it all."""
    ctx = browser.new_context(viewport={"width": width, "height": height})
    ctx.add_cookies([{"name": "medisense_session", "value": token, "url": url}])
    page = ctx.new_page()
    for t in TABS:
        page.goto(f"{url}/care/operations?tab={t}", wait_until="load", timeout=240000)
        page.get_by_role("tablist", name="Operations").wait_for(timeout=240000)
        page.wait_for_timeout(1500)
        print("warmed", t)
    page.goto(f"{url}/care/operations?tab=rules", wait_until="load", timeout=240000)
    page.get_by_role("tablist", name="Operations").wait_for(timeout=240000)
    page.get_by_role("link", name="Risk or behaviour flag").first.click()
    page.get_by_role("heading", name="Risk or behaviour flag").first.wait_for(timeout=240000)
    page.goto(f"{url}/care/operations?tab=matching", wait_until="load", timeout=240000)
    page.get_by_role("tablist", name="Operations").wait_for(timeout=240000)
    physio = page.get_by_role("button").filter(has_text="Physiotherapy")
    if physio.count():
        physio.first.click()
        page.wait_for_timeout(4000)
    ctx.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cookie", required=True)
    parser.add_argument("--url", default="http://localhost:3000")
    parser.add_argument("--size", default="1920x1080")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--shots", action="store_true")
    args = parser.parse_args()
    width, height = (int(n) for n in args.size.split("x"))
    token = session_cookie(args.cookie)
    OUT.mkdir(exist_ok=True)
    tmp = OUT / f".tmp-{NAME}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        if not args.shots:
            warm_up(browser, args.url, token, width, height)
        opts = {"viewport": {"width": width, "height": height}}
        if not args.shots:
            opts.update(record_video_dir=str(tmp), record_video_size={"width": width, "height": height})
        context = browser.new_context(**opts)
        context.add_cookies([{"name": "medisense_session", "value": token, "url": args.url}])
        context.add_init_script(OVERLAY)
        if not args.shots:
            context.add_init_script(COVER)
        page = context.new_page()
        d = Steady(page, args.url.rstrip("/"), args.speed, True)
        if args.shots:
            shots = pathlib.Path(__file__).parent / "output" / "m08-shots"
            shots.mkdir(parents=True, exist_ok=True)
            for t in TABS:
                page.goto(f"{args.url}/care/operations?tab={t}", wait_until="load", timeout=180000)
                page.get_by_role("tablist", name="Operations").wait_for(timeout=180000)
                page.wait_for_timeout(3500)
                page.screenshot(path=str(shots / f"{t}.png"), full_page=True)
                print("shot", t)
            browser.close()
            return
        started = time.time()
        ok = True
        try:
            walkthrough(d)
        except Exception as error:
            ok = False
            print(f"Stopped: {error}".splitlines()[0])
            page.screenshot(path=str(OUT / f"{NAME}-failed.png"))
        video = page.video
        context.close()
        browser.close()
        if video:
            final = OUT / f"{NAME}{'' if ok else '-incomplete'}.webm"
            final.unlink(missing_ok=True)
            pathlib.Path(video.path()).rename(final)
            shutil.rmtree(tmp, ignore_errors=True)
            print(f"{'Saved' if ok else 'Saved partial'} {final} ({time.time() - started:.0f}s)")


if __name__ == "__main__":
    main()
