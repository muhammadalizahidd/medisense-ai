"""
Records the Module 10 (Therapist Dashboard & Workspace) walkthrough.

    python scripts/demo-videos/record_module10.py [--shots]

Signs in through the demo staff accounts (no password on screen) and follows the five section 11
scenarios: Sarah Thompson (OT, APT-1001), Marcus Bell (speech at school, APT-1002), Olivia Reyes
(physio with a precaution, APT-1003), Nadia Hassan (psychology telehealth, APT-1004) and Lucy Grant
(nursing, APT-1005). Steps that already happened on an earlier run are skipped, not repeated.
--shots    full-page screenshots of every tab for each therapist instead of a video.
"""

import argparse
import pathlib
import re
import shutil
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from record import OVERLAY, Director  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "Module-10-Therapist-Workspace"
COVER = r"""
(() => {
  try { if (sessionStorage.getItem('__cover_done')) return; } catch (e) { return; }
  const add = () => {
    if (document.getElementById('__cover')) return;
    const c = document.createElement('div');
    c.id = '__cover';
    c.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0c3b2e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:Manrope,system-ui,sans-serif;transition:opacity 600ms ease';
    c.innerHTML = '<div style="font-size:20px;letter-spacing:.18em;text-transform:uppercase;opacity:.75">Medisense · Module 10</div><div style="font-size:54px;font-weight:500">Therapist Dashboard &amp; Workspace</div><div style="font-size:20px;opacity:.8">One workspace for the clinician\'s whole day</div>';
    document.documentElement.appendChild(c);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
"""

TABS = ["home", "schedule", "visits", "telehealth", "clients", "tasks", "assessments", "documentation", "alerts", "settings"]
PEOPLE = {
    "sarah": "sarah.thompson@medisense.test",
    "marcus": "marcus.bell@medisense.test",
    "olivia": "olivia.reyes@medisense.test",
    "nadia": "nadia.hassan@medisense.test",
    "lucy": "lucy.grant@medisense.test",
}
WS = "/therapist/workspace"


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

    def go(self, path: str, settle: float = 2200):
        self.page.goto(self.base + path, wait_until="load", timeout=180000)
        if path.startswith(WS):
            self.page.get_by_role("tablist", name="My workspace").wait_for(timeout=180000)
        self.wait(settle)


def sign_in(page, base: str, who: str):
    # The context's request shares its cookie jar, so the browser is signed in as this person.
    res = page.context.request.post(base + "/api/auth/demo", data={"email": PEOPLE[who]}, timeout=180000)
    status = res.status
    if status != 200:
        raise SystemExit(f"Demo sign-in failed for {who} ({status})")


def open_ws(page, url: str, t: str):
    """Opens a workspace tab, retrying once if the dev server was busy recompiling."""
    for attempt in range(3):
        try:
            page.goto(f"{url}{WS}?tab={t}", wait_until="load", timeout=180000)
            page.get_by_role("tablist", name="My workspace").wait_for(timeout=120000)
            return
        except Exception:
            if attempt == 2:
                raise


def tab(d: Steady, label: str, settle: float = 2000):
    d.click(d.page.get_by_role("tab", name=re.compile(f"^{label}")), pause_after=settle)


def dialog(d: Steady, name: str):
    return d.page.get_by_role("dialog", name=re.compile(name))


def close_dialog(d: Steady):
    d.page.keyboard.press("Escape")
    d.wait(800)


def field(scope, label: str):
    return scope.get_by_label(re.compile(f"^{label}"))


def appears(locator, timeout: float = 60000) -> bool:
    """Waits for an element that loads after its sheet opens; False if it never comes."""
    try:
        locator.first.wait_for(state="visible", timeout=timeout)
        return True
    except Exception:
        return False


def switch_to(d: Steady, who: str, name: str, step: str, text: str):
    d.caption(step, text, 1200)
    sign_in(d.page, d.base, who)
    d.go(WS, 1800)
    d.caption(step, text, 1800)


def pick_visit(d: Steady, patient: str):
    d.click(d.page.get_by_role("region", name="Visits").get_by_role("button").filter(has_text=patient), pause_after=1500)


def sarah(d: Steady):
    d.go(WS, 500)
    d.wait(2400)
    d.page.evaluate("""() => { try { sessionStorage.setItem('__cover_done','1') } catch (e) {}
      const c = document.getElementById('__cover'); if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 700); } }""")
    d.wait(900)
    d.caption("", "Sarah Thompson, OT, starts her day. She sees only her own patients, visits and work.", 3600)
    d.caption("1", "Her day at a glance: visits, pending notes, open assessments, tasks due, patients and alerts.", 3400)
    d.hover(d.page.get_by_role("region", name="Next appointment"), 1200)
    d.caption("2", "Next appointment: APT-1001, Jordan Mills, functional capacity assessment at home.", 3200)
    d.scroll(420)
    d.caption("3", "Prioritised work is a rule: safety first, then time-bound visits, notes, then follow-ups.", 3200)
    d.scroll(-420)
    d.type(d.page.get_by_label("Search my records"), "APT-1001")
    d.caption("4", "Search covers names, MRN, referral, appointment and task IDs, only within her own caseload.", 3000)
    d.page.get_by_label("Search my records").fill("")
    brief = d.page.get_by_role("button", name=re.compile("^(Prepare my brief|Refresh)$"))
    d.move_to(brief)
    d.caption("5", "The AI morning brief reads her real records and cites the source behind every point.", 1200)
    d.click(brief, pause_after=600)
    d.page.get_by_text("Suggestions only. Your signed records are never changed.").wait_for(timeout=90000)
    d.wait(1500)
    d.move_to(d.page.get_by_text(re.compile("^From APT-1001")).first)
    d.caption("6", "Each point links to its record. Anything without a matching record is marked unverified.", 3400)
    accept = d.page.get_by_role("button", name="Accept")
    if accept.count():
        d.click(accept.first, pause_after=1200)
        d.caption("7", "Sarah accepts or rejects each suggestion. Nothing is applied to a clinical record.", 2600)
    d.scroll(1400)
    d.caption("8", "Capacity is explained, not scored: contact, travel, notes time, leave and what's left.", 3600)
    d.scroll(-1800)

    tab(d, "My schedule")
    d.caption("9", "My schedule: day, week and list views with date, mode, status and sort filters.", 1400)
    d.click(d.page.get_by_role("button", name="Week", exact=True), pause_after=1600)
    d.caption("10", "The week shows visits, telehealth, travel, planned notes time and leave together.", 3200)
    d.click(d.page.get_by_role("button", name="List", exact=True), pause_after=1800)

    tab(d, "Visits and travel")
    pick_visit(d, "Jordan Mills")
    d.caption("11", "A home visit shows the address, access, support person and travel. No video controls.", 3400)
    start = d.page.get_by_role("button", name=re.compile("^(Start (home )?visit|Continue visit)$"))
    if start.count() and start.first.is_enabled():
        d.click(start, pause_after=1400)
        check = dialog(d, "Before you start")
        if check.count():
            d.caption("12", "Readiness checks run before the visit can start.", 2000)
            d.click(check.get_by_role("button", name="Start visit"), pause_after=2000)
        sheet = dialog(d, "Visit ·")
        sheet.wait_for(timeout=60000)
        d.wait(1800)
        who = field(sheet, "Who is present")
        if appears(who):
            d.caption("13", "On arrival: who is present and a safety confirmation. Arrival time is kept apart from the booking.", 600)
            d.type(who, "Jordan and Karen Mills (mother)")
            tick = sheet.get_by_role("checkbox", name=re.compile("I have confirmed the participant"))
            if tick.count() and not tick.first.is_checked():
                d.click(sheet.get_by_text(re.compile("^I have confirmed the participant")), pause_after=800)
            else:
                d.hover(sheet.get_by_text(re.compile("^I have confirmed the participant")), 900)
            d.click(sheet.get_by_role("button", name="Check in"), pause_after=2400)
        interventions = field(sheet, "Interventions")
        if appears(interventions):
            d.caption("14", "Part one of the FCA: what was done, and how Jordan responded.", 600)
            d.type(interventions, "Observed morning routine: dressing, breakfast preparation and packing a school bag.")
            d.type(field(sheet, "Response"), "Needed verbal prompts for sequencing; fatigued after 40 minutes.")
            d.click(sheet.get_by_role("button", name="Save and check out"), pause_after=2600)
        note = dialog(d, "session note")
        if appears(note):
            d.caption("15", "Straight on to the note. AI arranges her rough notes into SOAP; she reviews and signs.", 800)
            d.type(field(note, "Rough notes"), "Morning routine observed at home. Dressing with verbal prompts, breakfast prep needed help sequencing. Part two next week covers community access.", 12)
            d.click(note.get_by_role("button", name=re.compile("Draft SOAP note")), pause_after=800)
            try:
                note.get_by_text("Check every line before signing.").wait_for(timeout=60000)
            except Exception:
                pass
            d.wait(2000)
            d.scroll(500)
            d.caption("16", "It stays a draft: saved for later, never signed for her.", 2200)
            d.click(note.get_by_role("button", name="Save draft"), pause_after=2200)
            if dialog(d, "session note").count():
                close_dialog(d)
    while d.page.get_by_role("dialog").count():
        close_dialog(d)
    d.wait(1200)

    cont = d.page.get_by_role("button", name=re.compile("^(Start assessment|Continue assessment)"))
    if cont.count():
        d.caption("17", "The FCA continues over two visits. Continue opens the same draft, never a duplicate.", 1200)
        d.click(cont, pause_after=600)
        d.page.wait_for_url(re.compile("/therapist/assessments/"), timeout=120000)
        d.wait(3500)
        d.scroll(600)
        d.caption("18", "Sections can be saved part-way, or marked Not applicable or Unable to assess with a reason.", 3200)
        d.go(f"{WS}?tab=visits", 1500)
        pick_visit(d, "Jordan Mills")

    d.click(d.page.get_by_role("button", name="Request follow-up"), pause_after=1200)
    d.caption("19", "Request follow-up drafts a task for scheduling with a recommended date and reason.", 2200)
    d.click(dialog(d, "Request a follow-up").get_by_role("button", name="Send request"), pause_after=2400)
    d.click(d.page.get_by_role("button", name="Supervisor review"), pause_after=1200)
    sup = dialog(d, "Request supervisor review")
    d.type(field(sup, "What would you like"), "Please review my FCA approach before part two.")
    d.caption("20", "Supervisor review creates a linked task for the Clinical Lead. It never marks anything approved.", 1800)
    d.click(sup.get_by_role("button", name="Send request"), pause_after=2600)

    tab(d, "Assessments")
    d.caption("21", "Assessment queue: progress counts form sections only, never clinical improvement.", 3400)
    tab(d, "Documentation")
    d.caption("22", "Documentation queue: not started, draft, ready for signature, signed, amendment required.", 3400)
    tab(d, "My tasks")
    d.click(d.page.get_by_role("button", name=re.compile("^Delegated")), pause_after=1600)
    d.caption("23", "Tasks she delegated, like the follow-up and the review request, with owner and last action.", 3200)
    d.click(d.page.get_by_role("button", name=re.compile("^Mine")), pause_after=1000)
    tab(d, "Work settings")
    d.caption("24", "Personal settings only: notifications, default view, AI suggestions. Clinical policy can't be changed here.", 3400)


def marcus(d: Steady):
    switch_to(d, "marcus", "Marcus Bell", "25", "Marcus Bell, speech pathologist: a school visit for Emma Carter.")
    tab(d, "Visits and travel")
    pick_visit(d, "Emma Carter")
    d.caption("26", "School visits show the school contact, room and permission. Here permission isn't recorded.", 3200)
    start = d.page.get_by_role("button", name=re.compile("^Start (home )?visit$"))
    if start.count() and start.first.is_enabled():
        d.click(start, pause_after=1500)
        d.caption("27", "So the visit can't start. The reason and the fix are shown, and the team is told.", 3400)
        close_dialog(d)
    tab(d, "Alerts")
    d.caption("28", "Alerts are rules, not AI: missing consent for this school visit.", 3000)


def olivia(d: Steady):
    switch_to(d, "olivia", "Olivia Reyes", "29", "Olivia Reyes, physiotherapist: Noah Bennett's home visit has a precaution.")
    tab(d, "Visits and travel")
    pick_visit(d, "Noah Bennett")
    start = d.page.get_by_role("button", name=re.compile("^Start (home )?visit$"))
    if start.count() and start.first.is_enabled():
        d.click(start, pause_after=1500)
        d.caption("30", "A precaution must be read and confirmed before the visit can start.", 3400)
        close_dialog(d)
    tab(d, "Alerts")
    d.caption("31", "Risk review and an expiring funding authorisation, each with an Acknowledge step.", 1400)
    ack = d.page.get_by_role("button", name="Acknowledge")
    if ack.count():
        d.click(ack.first, pause_after=2000)
    d.caption("31", "Acknowledging is recorded but never resolves the issue itself.", 2400)


def nadia(d: Steady):
    switch_to(d, "nadia", "Nadia Hassan", "32", "Nadia Hassan, psychologist: a telehealth session with Olivia Reed.")
    tab(d, "Telehealth lobby")
    d.caption("33", "Telehealth lobby: readiness, link status and recording consent for today's sessions.", 3200)
    d.caption("34", "Olivia declined recording, so recording is not permitted. It is always off by default.", 3200)
    tab(d, "Visits and travel")
    pick_visit(d, "Olivia Reed")
    d.caption("35", "Telehealth visits show lobby readiness instead of travel and address.", 3000)
    d.click(d.page.get_by_role("link", name=re.compile("Host telehealth")), pause_after=600)
    d.page.wait_for_url(re.compile("/telehealth/room/"), timeout=120000)
    d.wait(4000)
    d.caption("36", "Only the assigned clinician can host. Joining the waiting room never grants recording consent.", 3600)


def lucy(d: Steady):
    switch_to(d, "lucy", "Lucy Grant", "37", "Lucy Grant, nurse: William Park's home visit and handover.")
    tab(d, "Visits and travel")
    pick_visit(d, "William Park")
    d.caption("38", "Ready to go: address, key safe access and readiness checks all clear.", 3000)
    tab(d, "Home")
    d.click(d.page.get_by_role("button", name="Care-team message"), pause_after=1200)
    msg = dialog(d, "Send a care-team message")
    d.click(field(msg, "To"), pause_after=500)
    d.click(d.page.get_by_role("option", name=re.compile("Helen Brooks")), pause_after=600)
    d.click(field(msg, "Patient"), pause_after=500)
    d.click(d.page.get_by_role("option", name="William Park"), pause_after=600)
    d.type(field(msg, "Message"), "Wound review today. Please hand over to the GP practice nurse for Friday's dressing change.")
    d.caption("39", "Secure care-team messages go only to permitted staff, with a confirm step before sending.", 1200)
    d.click(msg.get_by_role("button", name="Review message"), pause_after=1600)
    d.click(msg.get_by_role("button", name="Confirm and send"), pause_after=2400)
    d.caption("", "Module 10: one workspace for the clinician's day. AI suggests, rules check, people decide.", 4200)


def walkthrough(d: Steady):
    sarah(d)
    marcus(d)
    olivia(d)
    nadia(d)
    lucy(d)


def warm_up(browser, url: str, width: int, height: int):
    """Visits every tab once per therapist, unrecorded, so the dev server has compiled it all."""
    ctx = browser.new_context(viewport={"width": width, "height": height})
    page = ctx.new_page()
    for who in PEOPLE:
        sign_in(page, url, who)
        for t in TABS:
            open_ws(page, url, t)
            page.wait_for_timeout(800)
        print("warmed", who)
    ctx.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:3000")
    parser.add_argument("--size", default="1920x1080")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--shots", action="store_true")
    args = parser.parse_args()
    width, height = (int(n) for n in args.size.split("x"))
    OUT.mkdir(exist_ok=True)
    tmp = OUT / f".tmp-{NAME}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        if args.shots:
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            shots = pathlib.Path(__file__).parent / "output" / "m10-shots"
            shots.mkdir(parents=True, exist_ok=True)
            for who in PEOPLE:
                sign_in(page, args.url, who)
                for t in TABS:
                    if (shots / f"{who}-{t}.png").exists() and who in ("sarah", "marcus"):
                        continue
                    open_ws(page, args.url, t)
                    page.wait_for_timeout(2500)
                    page.screenshot(path=str(shots / f"{who}-{t}.png"), full_page=True)
                print("shots", who)
            browser.close()
            return
        warm_up(browser, args.url, width, height)
        context = browser.new_context(
            viewport={"width": width, "height": height},
            record_video_dir=str(tmp),
            record_video_size={"width": width, "height": height},
        )
        context.add_init_script(OVERLAY)
        context.add_init_script(COVER)
        page = context.new_page()
        sign_in(page, args.url, "sarah")
        d = Steady(page, args.url.rstrip("/"), args.speed, True)
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
