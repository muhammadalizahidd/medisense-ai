"""
Records the patient-app walkthroughs, one video per module (18 to 22).

    python scripts/demo-videos/record_patient.py --module 18 --patient harper.txt --intake jo.txt --therapist sarah.txt

Run Module 18 first after resetting the scenario; the later modules continue from its state.
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
from record_module12 import as_user, ready  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
MODULES = {
    18: ("Module-18-Patient-Registration-and-Referral", "Patient Registration &amp; Referral", "Refer without an account · track every service · answer what we ask"),
    19: ("Module-19-Patient-Dashboard-and-Profile", "Patient Dashboard &amp; Profile", "What needs you today · details you control · changes staff approve"),
    20: ("Module-20-Patient-Appointments-and-Telehealth", "Patient Appointments &amp; Telehealth", "Confirm, change or request visits · ready for every video visit"),
    21: ("Module-21-My-Treatment-and-Progress", "My Treatment &amp; Progress", "Only what your clinician shared · log home activities · check in weekly"),
    22: ("Module-22-Documents-Payments-and-Communication", "Documents, Payments &amp; Communication", "Released documents · uploads · invoices · consents · messages"),
}


def cover(n: int) -> str:
    _, title, sub = MODULES[n]
    return r"""
(() => {
  try { if (sessionStorage.getItem('__cover_done')) return; } catch (e) { return; }
  const add = () => {
    if (document.getElementById('__cover')) return;
    const c = document.createElement('div');
    c.id = '__cover';
    c.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0c3b2e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:Manrope,system-ui,sans-serif;transition:opacity 600ms ease';
    c.innerHTML = '<div style="font-size:18px;letter-spacing:.18em;text-transform:uppercase;opacity:.75">Medisense · Module %d</div><div style="font-size:46px;font-weight:500">%s</div><div style="font-size:18px;opacity:.8">%s</div>';
    document.documentElement.appendChild(c);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
""" % (n, title, sub)


APP = "/mobile/patient"

# A role card covers the moment the signed-in person changes, so no other account flashes on screen.
ROLE_CARD = r"""
(() => {
  let who = null;
  try { who = sessionStorage.getItem('__role'); } catch (e) { return; }
  const hideTools = () => document.querySelectorAll('button').forEach((b) => {
    if (b.textContent && b.textContent.includes('Fill sample data')) b.style.display = 'none';
  });
  const add = () => {
    hideTools();
    new MutationObserver(hideTools).observe(document.documentElement, { childList: true, subtree: true });
    if (!who || document.getElementById('__role')) return;
    const c = document.createElement('div');
    c.id = '__role';
    c.style.cssText = 'position:fixed;inset:0;z-index:2147483645;background:#0c3b2e;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-family:Manrope,system-ui,sans-serif;transition:opacity 500ms ease';
    const [name, role] = who.split('|');
    c.innerHTML = '<div style="font-size:16px;letter-spacing:.18em;text-transform:uppercase;opacity:.7">Now signed in as</div><div style="font-size:40px;font-weight:500">' + name + '</div><div style="font-size:18px;opacity:.8">' + role + '</div>';
    document.documentElement.appendChild(c);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
"""
SAMPLE = pathlib.Path(__file__).resolve().parent / "sample-files"


def switch(d: Steady, ctx, url, token: str, who: str, path: str, wait_for: str):
    """Signs in as another person behind a role card, then reveals the page once it shows them."""
    d.page.evaluate(f"() => {{ try {{ sessionStorage.setItem('__role', {who!r}) }} catch (e) {{}} }}")
    as_user(ctx, url, token)
    d.page.goto(d.base + path, wait_until="load", timeout=240000)
    d.page.get_by_text(wait_for).filter(visible=True).first.wait_for(timeout=240000)
    ready(d)
    d.wait(1800)
    d.page.evaluate("""() => { try { sessionStorage.removeItem('__role') } catch (e) {}
      const c = document.getElementById('__role'); if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 600); } }""")
    d.wait(900)


def lift_cover(d: Steady):
    d.page.evaluate("""() => { try { sessionStorage.setItem('__cover_done','1') } catch (e) {}
      const c = document.getElementById('__cover'); if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 700); } }""")
    d.wait(900)


def app_ready(d: Steady):
    d.page.get_by_text("Needs your attention").first.wait_for(timeout=240000)


def nav(d: Steady, name: str, settle: float = 1500):
    d.click(d.page.get_by_role("navigation", name="App sections").get_by_role("button", name=name, exact=True), pause_after=settle)


def seg(d: Steady, name: str, settle: float = 1300):
    d.click(d.page.get_by_role("tab", name=name).first, pause_after=settle)


def scroll(d: Steady, y: int, settle: float = 900):
    d.page.locator(".no-scrollbar.overflow-y-auto").first.evaluate(f"e => e.scrollBy({{top: {y}, behavior: 'smooth'}})")
    d.wait(settle)


def sheet_scroll(d: Steady, y: int, settle: float = 800):
    d.page.locator("[role=dialog] .no-scrollbar").first.evaluate(f"e => e.scrollBy({{top: {y}, behavior: 'smooth'}})")
    d.wait(settle)


def button(d: Steady, name: str, settle: float = 1200, exact: bool = False):
    d.click(d.page.get_by_role("button", name=name, exact=exact).filter(visible=True).first, pause_after=settle)


def pick(d: Steady, name: str, settle: float = 500):
    d.click(d.page.get_by_role("radio", name=name, exact=True).first, pause_after=settle)


def in_sheet(d: Steady, name: str, settle: float = 2400):
    d.click(d.page.locator("[role=dialog]").get_by_role("button", name=name).last, pause_after=settle)


def close_sheet(d: Steady):
    d.click(d.page.locator("[role=dialog] header button").first, pause_after=800)


def toast_gone(d: Steady):
    d.wait(1800)


def m18(d: Steady, ctx, url, tokens):
    d.go("/refer", 400)
    d.page.locator("form, main").first.wait_for(timeout=240000)
    d.wait(2400)
    lift_cover(d)
    d.caption("", "Anyone can refer without an account: one form, all 17 supports, a reference at the end.", 3400)
    d.page.mouse.wheel(0, 700)
    d.wait(1600)
    d.page.mouse.wheel(0, 900)
    d.wait(1600)
    d.clear_caption()
    d.go(APP, 400)
    app_ready(d)
    nav(d, "Me", 300)
    d.page.get_by_text("MRN-04092026-0001").first.wait_for(timeout=120000)
    d.wait(600)
    d.caption("1", "Harper Nguyen signs in to the patient app with her MRN. Her referrals live under Me.", 1600)
    seg(d, "Referrals", 1800)
    d.caption("2", "Each requested service has its own status, with a timeline of where the referral is.", 3000)
    d.caption("3", "Intake asked for more information. Harper answers and attaches a GP letter.", 600)
    button(d, "Send information", 900)
    d.type(d.page.get_by_label("Your answer"), "GP letter attached. My knee is the main concern for walking.")
    d.page.locator("[role=dialog] input[type=file]").set_input_files(str(SAMPLE / "GP-letter-knee.pdf"))
    d.wait(900)
    button(d, "Send to our team", 2600)
    d.caption("4", "The referral goes straight back to intake for review; nothing is lost.", 2800)
    scroll(d, 500, 1600)
    d.caption("6", "Jo Marsh in intake sees the answered request back in her queue.", 600)
    switch(d, ctx, url, tokens["intake"], "Jo Marsh|Intake Officer", "/care/referrals", "Jo Marsh")
    d.wait(2400)
    d.caption("", "One referral, many services, every status visible to the family.", 3600)
    d.clear_caption()


def m19(d: Steady, ctx, url, tokens):
    d.go(APP, 400)
    app_ready(d)
    d.wait(2400)
    lift_cover(d)
    d.caption("", "Harper's dashboard: visits, new documents, balance due, and what needs her today.", 3600)
    d.caption("1", "Each item opens the right place: plans, visits, invoices, check-ins.", 3000)
    nav(d, "Me")
    d.caption("2", "Preferred name, pronouns and postal address change straight away.", 600)
    button(d, "Edit", 900, exact=True)
    pn = d.page.get_by_label("Preferred name")
    pn.fill("")
    d.type(pn, "Harper")
    pick(d, "She/her")
    button(d, "Save", 2200, exact=True)
    d.caption("3", "A new mobile number only applies after a verification code.", 600)
    button(d, "Change", 900, exact=True)
    d.type(d.page.get_by_label("New mobile phone"), "0400 222 333")
    button(d, "Send code", 1600, exact=True)
    d.type(d.page.get_by_label("Verification code"), "246810")
    button(d, "Verify", 2400, exact=True)
    d.caption("4", "Legal name and date of birth are corrected through a request our team approves.", 600)
    button(d, "Correct my legal name or date of birth", 900)
    pick(d, "Date of birth")
    for label, value in (("Day", "18"), ("Month", "04"), ("Year", "1952")):
        d.type(d.page.get_by_label(label, exact=True), value)
    d.type(d.page.get_by_label("Why? (optional)"), "Typo when I was referred")
    button(d, "Send for review", 2400, exact=True)
    scroll(d, 1100, 1600)
    d.caption("5", "Health-record corrections go to her clinician and are marked unverified until reviewed.", 3000)
    d.caption("6", "Funding: the NDIS number stays masked until Harper chooses to show it.", 600)
    scroll(d, -3000, 600)
    seg(d, "Funding and team", 1600)
    button(d, "Show", 900, exact=True)
    button(d, "Show for 10 minutes", 2400, exact=True)
    scroll(d, 430, 1800)
    d.caption("7", "Her care team, the people who can act for her, and every consent she has given.", 3000)
    scroll(d, 520, 1800)
    d.caption("8", "Jo Marsh approves the date-of-birth correction; Harper's record updates.", 600)
    switch(d, ctx, url, tokens["intake"], "Jo Marsh|Intake Officer", "/care/patient-requests", "Jo Marsh")
    d.wait(1200)
    rows = d.page.locator("tbody tr").filter(visible=True).filter(has_text="Date of birth")
    if rows.count():
        d.click(rows.first.get_by_role("button", name="Approve"), pause_after=2600)
    seg(d, "Approved", 2400)
    d.caption("", "Patients keep their details current; staff decide what must be verified.", 3600)
    d.clear_caption()


def m20(d: Steady, ctx, url, tokens):
    d.go(APP, 400)
    app_ready(d)
    d.wait(2200)
    lift_cover(d)
    nav(d, "Visits", 1800)
    d.caption("", "Every visit in one place: upcoming, completed and cancelled, with the clinician and mode.", 3400)
    d.caption("1", "Open a telehealth visit: a checklist for the mode, a device test, and its history.", 600)
    d.click(d.page.locator("button").filter(has_text="Telehealth").first, pause_after=1400)
    for item in ("Test your camera and microphone", "Find a quiet, private space"):
        d.click(d.page.get_by_role("button", name=item), pause_after=500)
    sheet_scroll(d, 300, 1200)
    d.caption("2", "One tap confirms attendance; it's logged in the visit history.", 600)
    btn = d.page.get_by_role("button", name="I'll be there")
    if btn.count():
        d.click(btn, pause_after=2600)
    close_sheet(d)
    d.caption("3", "A change request keeps the visit booked until Scheduling replies.", 600)
    d.click(d.page.locator("button").filter(has_text="Home").filter(has_text="Booked").first, pause_after=1400)
    button(d, "Change", 800, exact=True)
    d.type(d.page.locator("[role=dialog] textarea").first, "Could we move to an afternoon? I have physio in the mornings.")
    button(d, "Send request", 2600)
    close_sheet(d)
    d.caption("4", "Requesting a new visit: where, when suits, and what it's for. School and day program visits need a site contact.", 600)
    button(d, "Request", 900, exact=True)
    pick(d, "Day Program")
    d.type(d.page.get_by_label("When suits you?"), "Wednesday mornings")
    d.type(d.page.get_by_label("Site contact"), "Priya, program coordinator, 0400 555 090")
    d.type(d.page.get_by_label("What is the visit for? (optional)"), "Practise transfers at the program")
    button(d, "Send request", 2600)
    seg(d, "My requests", 2400)
    d.caption("5", "A request is never shown as a booking until Scheduling confirms a time.", 2600)
    seg(d, "Completed", 1800)
    seg(d, "Cancelled", 1600)
    d.click(d.page.locator("button").filter(has_text="Cancelled").nth(1), pause_after=2600)
    close_sheet(d)
    d.caption("6", "Scheduling sees each request as a task in Operations.", 600)
    switch(d, ctx, url, tokens["intake"], "Jo Marsh|Intake Officer and Scheduler", "/care/operations?tab=queue", "Jo Marsh")
    box = d.page.get_by_placeholder("Task, referral or appointment number", exact=False).filter(visible=True)
    if box.count():
        d.type(box.first, "Harper")
        d.wait(1600)
    d.wait(2400)
    d.caption("", "Patients manage visits in a few taps; Scheduling stays in control of the calendar.", 3600)
    d.clear_caption()


def m21(d: Steady, ctx, url, tokens):
    d.go(APP, 400)
    app_ready(d)
    d.wait(2200)
    lift_cover(d)
    nav(d, "My care", 1800)
    d.caption("", "Harper sees only the goals and home activities her clinician shared, never draft plans or notes.", 3400)
    scroll(d, 380, 1600)
    d.caption("1", "Started, now and aim for each goal; a trend only where the measure is numeric.", 3000)
    scroll(d, 420, 1200)
    d.caption("2", "She logs today's home activity. Unable needs a reason, and her therapist reviews it.", 600)
    button(d, "Log", 900, exact=True)
    pick(d, "Partially Completed")
    d.type(d.page.locator("[role=dialog] textarea").first, "Did the recipe card steps but needed a rest halfway.")
    button(d, "Save log", 2400, exact=True)
    d.caption("3", "Reading the plan is acknowledged against its version.", 600)
    ack = d.page.get_by_role("button", name="I've read my plan")
    if ack.count():
        d.click(ack, pause_after=2400)
    d.caption("4", "A question goes to her therapist as a task; the plan only changes if they revise it.", 600)
    button(d, "Ask a question", 900)
    d.type(d.page.locator("[role=dialog] textarea").first, "Can I use the bath board instead of the shower chair?")
    button(d, "Send to", 2400)
    d.caption("5", "The weekly check-in saves as a draft; a concern raises a safety review.", 600)
    scroll(d, -2000, 400)
    seg(d, "Check-in", 1400)
    boxes = d.page.locator("textarea").filter(visible=True)
    d.type(boxes.nth(0), "3")
    d.type(boxes.nth(1), "8")
    d.click(d.page.get_by_text("Not applicable").nth(2), pause_after=400)
    d.type(boxes.nth(3), "Knee is worse after walking to the shops")
    button(d, "Submit", 2600, exact=True)
    seg(d, "Reports and goals", 2200)
    d.caption("6", "Sarah Thompson gets the safety review and the question in her task list.", 600)
    switch(d, ctx, url, tokens["therapist"], "Sarah Thompson|Occupational Therapist", "/therapist/coordination", "Sarah Thompson")
    d.wait(2600)
    d.caption("", "Patients stay engaged between visits; clinicians stay in charge of the plan.", 3600)
    d.clear_caption()


def m22(d: Steady, ctx, url, tokens):
    d.go(APP, 400)
    app_ready(d)
    d.wait(2200)
    lift_cover(d)
    nav(d, "Me")
    seg(d, "Documents", 1800)
    d.caption("", "Only what the clinician released: visit summaries, reports and signed agreements.", 3400)
    d.click(d.page.locator("button").filter(has_text="Visit summary").first, pause_after=2400)
    close_sheet(d)
    d.caption("1", "Uploads are checked for type and size, and need Harper's consent to keep.", 600)
    button(d, "Upload", 900, exact=True)
    d.page.locator("[role=dialog] input[type=file]").set_input_files(str(SAMPLE / "NDIS-plan-2026.pdf"))
    d.wait(700)
    pick(d, "NDIS Plan")
    d.click(d.page.get_by_text("I'm happy for Medisense to keep this document"), pause_after=500)
    in_sheet(d, "Upload")
    d.caption("2", "Invoices show every service line, who is billed and what is still owed.", 600)
    seg(d, "Payments", 1600)
    d.click(d.page.locator("button").filter(has_text="Due").first, pause_after=2000)
    sheet_scroll(d, 300, 1200)
    d.caption("3", "Paying is simulated; a receipt appears and the balance updates.", 600)
    pay = d.page.get_by_role("button", name="Pay $")
    if pay.count():
        d.click(pay.first, pause_after=1000)
        in_sheet(d, "Pay $", 2800)
        close_sheet(d)
    d.caption("4", "Something looks wrong? A query goes to Finance as a task.", 600)
    d.click(d.page.locator("button").filter(has_text="Paid").first, pause_after=1400)
    button(d, "Something looks wrong", 900)
    d.type(d.page.locator("[role=dialog] textarea").first, "I think the 25 October visit was charged twice.")
    button(d, "Send to Finance", 2600)
    close_sheet(d)
    d.caption("5", "Consents are listed with their version; a withdrawal is a request our team confirms.", 600)
    seg(d, "Funding and team", 1400)
    scroll(d, 1100, 1800)
    w = d.page.get_by_role("button", name="Withdraw consent")
    if w.count():
        d.click(w.first, pause_after=900)
        button(d, "Ask to withdraw", 2400)
    d.caption("6", "Messages go to her care team, never into internal staff notes.", 600)
    nav(d, "Messages", 2600)
    d.caption("", "Documents, payments and consents, all in the patient's hands.", 3600)
    d.clear_caption()


WALKS = {18: m18, 19: m19, 20: m20, 21: m21, 22: m22}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--module", type=int, required=True, choices=sorted(WALKS))
    ap.add_argument("--patient", required=True)
    ap.add_argument("--intake", required=True)
    ap.add_argument("--therapist", required=True)
    ap.add_argument("--url", default="http://localhost:3000")
    args = ap.parse_args()
    name = MODULES[args.module][0]
    tokens = {"patient": session_cookie(args.patient), "intake": session_cookie(args.intake), "therapist": session_cookie(args.therapist)}
    width, height = 1440, 900
    tmp = OUT / f".tmp-{name}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--lang=en-AU"])
        warm = browser.new_context(viewport={"width": width, "height": height}, locale="en-AU", timezone_id="Australia/Brisbane")
        for role, path in (("patient", APP), ("intake", "/care/patient-requests"), ("intake", "/care/referrals"), ("therapist", "/therapist/coordination")):
            warm.clear_cookies()
            warm.add_cookies([{"name": "medisense_session", "value": tokens[role], "url": args.url}])
            pg = warm.new_page()
            pg.goto(args.url + path, wait_until="load", timeout=240000)
            pg.wait_for_timeout(2500)
            pg.close()
        warm.close()
        print("warmed", flush=True)
        ctx = browser.new_context(viewport={"width": width, "height": height}, locale="en-AU", timezone_id="Australia/Brisbane", record_video_dir=str(tmp), record_video_size={"width": width, "height": height})
        ctx.add_cookies([{"name": "medisense_session", "value": tokens["patient"], "url": args.url}])
        ctx.add_init_script(OVERLAY)
        ctx.add_init_script(cover(args.module))
        ctx.add_init_script(ROLE_CARD)
        page = ctx.new_page()
        d = Steady(page, args.url.rstrip("/"), 1.0, True)
        started = time.time()
        ok = True
        try:
            WALKS[args.module](d, ctx, args.url, tokens)
        except Exception as error:
            ok = False
            print(f"Stopped: {error}".splitlines()[0])
            page.screenshot(path=str(OUT / f"{name}-failed.png"))
        video = page.video
        ctx.close()
        browser.close()
        if video:
            final = OUT / f"{name}{'' if ok else '-incomplete'}.webm"
            final.unlink(missing_ok=True)
            pathlib.Path(video.path()).rename(final)
            shutil.rmtree(tmp, ignore_errors=True)
            print(f"{'Saved' if ok else 'Saved partial'} {final} ({time.time() - started:.0f}s)")


if __name__ == "__main__":
    main()
