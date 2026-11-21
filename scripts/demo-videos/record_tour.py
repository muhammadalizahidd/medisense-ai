"""
Medisense product tour: the admin web, the therapist web, the therapist app and the patient app,
with title cards between sections and captions on every step.

    E2E_BASE=http://localhost:3001 python scripts/demo-videos/record_tour.py [--dry]

Every screen is warmed first (unrecorded). Moving between pages, a title card covers the switch,
and the next page starts under the same card, so the video never shows a blank or loading frame.
Restore the e2e baseline before and after a take (d:/tmp/medisense/tour_take.sh does both).
"""

import argparse
import json
import pathlib
import re
import shutil
import time

from app_stage import PAGE as APP_PAGE
from app_stage import AppStage
from e2e_stage import BASE, file_token, staff_token
from record import OVERLAY
from record_module08 import Steady

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "Medisense-Product-Tour"
APP_URL = f"{BASE}/__tour_app"
OUTCOME = re.compile(r"^\s*(Answered|No authorised source|Human review|Needs clarification)\s*$")

# The next page opens under the title card the last page was showing (carried in window.name).
COVER = r"""(() => { let d = null; try { d = JSON.parse(window.name || 'null'); } catch (e) {}
  if (!d || !d.tour) return;
  const live = () => { try { const x = JSON.parse(window.name || 'null'); return Boolean(x && x.tour); } catch (e) { return false; } };
  const make = () => { if (!live()) { obs.disconnect(); return; }
    if (document.getElementById('__tc') || !document.documentElement) return;
    const c = document.createElement('div'); c.id = '__tc';
    c.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:radial-gradient(900px 600px at 50% 40%,#1d3b34,#0a1512);color:#f4f1ea;font-family:Segoe UI,system-ui,sans-serif;transition:opacity .6s';
    c.innerHTML = '<div style="font-size:13px;letter-spacing:.3em;text-transform:uppercase;opacity:.65"></div><div style="font-family:Georgia,serif;font-size:58px;margin-top:14px"></div><div style="margin-top:16px;opacity:.75;font-size:19px;max-width:880px;line-height:1.5"></div>';
    c.children[0].textContent = d.e; c.children[1].textContent = d.t; c.children[2].textContent = d.s;
    document.documentElement.appendChild(c); };
  const obs = new MutationObserver(() => make()); make(); obs.observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', make); })();"""


class Tour:
    def __init__(self, page, ctx, slow: float):
        self.page = page
        self.ctx = ctx
        self.slow = slow
        self.t0 = time.time()
        self.waits: list[list[float]] = []
        self.d = Steady(page, BASE, 1 / slow, True)
        self.app: AppStage | None = None

    def wait(self, ms: float):
        self.page.wait_for_timeout(ms * self.slow)

    def settle(self, loc, timeout: float = 150000):
        t = time.time()
        loc.wait_for(timeout=timeout)
        if time.time() - t > 2.2:
            self.waits.append([t - self.t0 + 0.6, time.time() - self.t0 - 0.2])

    def as_user(self, token: str):
        self.ctx.add_cookies([{"name": "medisense_session", "value": token, "url": BASE}])

    def card(self, eyebrow: str, title: str, sub: str, hold: float = 1600):
        """Shows a title card on the current page and remembers it for the next page."""
        self.page.evaluate("() => { try { sessionStorage.removeItem('__demo_caption'); } catch (e) {} window.__caption && window.__caption(''); }")
        self.page.evaluate(
            """([e, t, s]) => { window.name = JSON.stringify({ tour: 1, e, t, s });
                 const old = document.getElementById('__tc'); if (old) old.remove();
                 const c = document.createElement('div'); c.id = '__tc';
                 c.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:radial-gradient(900px 600px at 50% 40%,#1d3b34,#0a1512);color:#f4f1ea;font-family:Segoe UI,system-ui,sans-serif;opacity:0;transition:opacity .6s';
                 c.innerHTML = '<div style="font-size:13px;letter-spacing:.3em;text-transform:uppercase;opacity:.65"></div><div style="font-family:Georgia,serif;font-size:58px;margin-top:14px"></div><div style="margin-top:16px;opacity:.75;font-size:19px;max-width:880px;line-height:1.5"></div>';
                 c.children[0].textContent = e; c.children[1].textContent = t; c.children[2].textContent = s;
                 document.documentElement.appendChild(c); requestAnimationFrame(() => { c.style.opacity = '1'; }); }""",
            [eyebrow, title, sub],
        )
        self.wait(700 + hold)

    def lift(self, after: float = 700):
        self.page.evaluate(
            """() => { window.name = ''; const c = document.getElementById('__tc');
                 if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 650); }
                 const s = document.getElementById('cover'); if (s) s.classList.add('off'); }"""
        )
        self.wait(after)

    def web(self, path: str, ready):
        """Opens a web page under the current card and waits until it is fully drawn."""
        self.page.goto(BASE + path, wait_until="domcontentloaded", timeout=180000)
        self.settle(ready(self.page))
        self.wait(1400)

    def phone(self, title: str, who: str, chapters: list[str], url: str, ready_text: str):
        self.page.goto(APP_URL, wait_until="domcontentloaded")
        self.app = AppStage(self.page, self.slow, self.t0)
        self.app.waits = self.waits
        self.page.evaluate("document.getElementById('cover').classList.add('off')")
        self.app.setup(title, who, chapters, url)
        self.settle(self.app.L.get_by_text(ready_text).first)
        self.wait(1800)

    def say(self, n: str, text: str, hold: float = 2200):
        self.d.caption(n, text, hold)

    def scroll(self, px: int, steps: int = 12):
        self.d.scroll(px, steps)


# ------------------------------------------------------------------ admin web


def admin(t: Tour):
    d, P = t.d, t.page
    t.card("Medisense · Product tour", "Clinical operations, connected",
           "One platform for intake, scheduling, therapists, patients and finance, with AI that drafts and people who decide.", 2400)
    t.card("Part 1 · Operations on the web", "Jo Marsh, intake and operations",
           "The operations agent, the booking agent, referrals, billing and reporting.", 1200)
    t.as_user(staff_token("jo.marsh@medisense.test"))
    t.web("/care/ai-agent", lambda p: p.locator("section[aria-label='Daily operations briefing'] a").first)
    t.lift()
    t.say("1", "The operations agent starts the day with a briefing counted from live records.", 2600)
    d.hover(P.locator("section[aria-label='Daily operations briefing'] a").nth(1), 1000)
    t.say("2", "Ask in plain English. The agent drafts the action as a proposal; nothing happens until Jo confirms.", 300)
    box = P.locator("#agent-q")
    d.type(box, "Request the missing documents for Casey Morgan's referral", delay=18)
    d.click(P.locator("main").get_by_role("button", name="Ask", exact=True), pause_after=400)
    card = P.locator("div.rounded-card").filter(has_text="Request missing items").filter(
        has=P.get_by_role("button", name="Confirm", exact=True)).last
    t.settle(card)
    card.scroll_into_view_if_needed()
    t.wait(1400)
    t.say("3", "Every proposal shows the record, before and after, its checks and who approves. Sources open in one click.", 2200)
    d.click(card.get_by_role("button", name="Confirm", exact=True), pause_after=400)
    t.settle(P.locator("div.rounded-card").filter(has_text="Request missing items").get_by_text("Completed", exact=True).first)
    t.wait(1200)

    t.say("4", "The booking agent lives in Ask Medisense AI: fixed tasks, real free times, confirmed by a person.", 300)
    P.locator("html").evaluate("e => { e.scrollTop = 0; document.body.scrollTop = 0; }")
    top = P.locator("form").filter(has=P.get_by_label("Ask Medisense", exact=True))
    d.click(top.get_by_role("button", name="Ask"), pause_after=900)
    d.click(P.get_by_role("tab", name="Booking agent"), pause_after=1000)
    d.click(P.get_by_role("button", name=re.compile("Assign and book a waiting patient")), pause_after=900)
    d.click(P.get_by_role("button", name="Lucas Ferreira", exact=True), pause_after=400)
    t.settle(P.get_by_text(re.compile("top eligible therapists")).first)
    t.say("5", "Only eligible therapists are offered, with a score and the reasons: registration, scope, region, capacity.", 2000)
    d.click(P.get_by_role("button", name=re.compile("^Best match")), pause_after=900)
    panel = P.get_by_role("dialog")
    d.click(panel.get_by_role("button", name=re.compile(r"^(Mon|Tue|Wed|Thu|Fri), \d+ \w+, ")).first, pause_after=400)
    t.settle(panel.get_by_text("Needs your confirmation").first)
    panel.get_by_text("Needs your confirmation").first.scroll_into_view_if_needed()
    t.wait(1000)
    d.click(panel.get_by_role("button", name="Confirm", exact=True).last, pause_after=400)
    t.settle(panel.get_by_text(re.compile(r"^Done\.")).first)
    t.say("6", "Confirmed: the first visit is held and the therapist is asked to accept.", 1800)

    t.card("Operations", "Referrals, billing and reporting", "Everything the office runs, in one place.", 900)
    t.web("/care/referrals", lambda p: p.locator("main table tbody tr").first)
    t.lift()
    t.say("7", "Referrals and intake: every stage with its count, the checks that need a person, and who owns it.", 2600)
    t.scroll(420)
    t.card("Operations", "Billing and finance", "Only verified services become billable.", 700)
    t.web("/care/billing?tab=queue", lambda p: p.locator("main table tbody tr").first)
    t.lift()
    t.say("8", "Billing: verified visits arrive as lines with payer and agreement checks, ready to invoice.", 2600)
    t.scroll(380)
    t.card("Operations", "Therapists and capacity", "Credentials, caseload and ratings for the whole team.", 700)
    t.web("/care/therapists", lambda p: p.locator("main table tbody tr").first)
    t.lift()
    t.say("9", "The team: status, working days, approved services, credentials, caseload and patient ratings.", 2600)
    t.scroll(400)


# ------------------------------------------------------------------ therapist web


def therapist_web(t: Tour):
    d, P = t.d, t.page
    t.card("Part 2 · Therapist on the web", "Sarah Thompson, occupational therapist",
           "Her schedule, patient files, recordings and messages.", 1200)
    t.as_user(staff_token("sarah.thompson@medisense.test"))
    t.web("/therapist/workspace?tab=schedule", lambda p: p.get_by_text("How the day is spent").first)
    t.lift()
    t.say("10", "Her day as a timeline: visits, video calls, travel and protected notes time, with the time now.", 2600)
    d.click(P.get_by_role("radio", name="Week").or_(P.get_by_role("button", name="Week", exact=True)).first, pause_after=1200)
    t.say("11", "The week view shows load per day and every visit at a glance.", 2200)

    t.card("Patients", "Mason Fernando's file", "Visits, ratings, services and contacts.", 700)
    t.web("/therapist/patients/6af8ba54e62e775d1beca0d1", lambda p: p.get_by_text("Visit mix").first)
    t.lift()
    t.say("12", "A patient file: upcoming and attended visits, rating, services and emergency contact.", 2600)
    t.scroll(450)

    t.card("Telehealth", "Recordings with consent", "Reviewed only with a stated purpose; every view is logged.", 700)
    t.web("/telehealth/recordings", lambda p: p.get_by_role("button", name="Review recording").first)
    t.lift()
    t.say("13", "Recordings play only after Sarah states why. Video, audio and the consented transcript.", 300)
    d.type(P.get_by_label(re.compile("^Purpose of this review")).first, "Checking goal measures for the progress report", delay=14)
    d.click(P.get_by_role("button", name="Review recording").first, pause_after=600)
    vid = P.locator("video").first
    t.settle(vid)
    vid.evaluate("v => { v.muted = true; v.play(); }")
    t.wait(5200)
    vid.evaluate("v => v.pause()")

    t.card("Messages", "Talking with families", "Documents, photos, video clips and voice notes.", 700)
    t.web("/messages", lambda p: p.get_by_text(re.compile("See you both")).last)
    t.lift()
    t.say("14", "Messages stay inside Medisense, with documents, photos, video clips and voice notes.", 2400)
    t.scroll(-900)
    t.wait(1400)


def tap_load(s: AppStage, loc, ready, pause: float = 300, then=None):
    """Taps something that loads a new screen without showing the load: the phone holds a still
    of the current screen, the new one loads underneath, then fades in when it is ready."""
    import base64

    shot = base64.b64encode(s.page.locator("#L").screenshot()).decode()
    s.page.evaluate(
        """(src) => { const p = document.querySelector('.phone'); const i = document.createElement('img');
             i.id = '__freeze'; i.src = 'data:image/png;base64,' + src;
             i.style.cssText = 'position:absolute;left:12px;top:12px;width:380px;height:818px;border-radius:46px;pointer-events:none;z-index:5;transition:opacity .28s';
             p.appendChild(i); }""",
        shot,
    )
    s.click(loc, 150)
    s.settle(ready)
    if then:
        then_loc, then_ready = then
        then_loc.first.click()
        s.settle(then_ready)
    s.wait(pause)
    s.page.evaluate("() => { const i = document.getElementById('__freeze'); if (i) { i.style.opacity = '0'; setTimeout(() => i.remove(), 320); } }")
    s.wait(420)


# ------------------------------------------------------------------ therapist app


T_CHAPTERS = ["Today", "Notes with AI", "Assessment: visits, report, sign"]


def therapist_app(t: Tour):
    t.card("Part 3 · Therapist app", "The same work, on her phone",
           "Briefings, AI notes and assessments, wherever she is.", 1200)
    t.phone("Therapist app", "Sarah Thompson · OT", T_CHAPTERS, f"{BASE}/mobile/therapist", "Today's schedule")
    s = t.app
    assert s
    L = s.L
    sheet = lambda: L.locator("[role=dialog]").last  # noqa: E731
    t.lift()
    s.chapter(0)
    s.say("Today", "Her next visit, notes and tasks due, and the booking agent, on one screen.", 2400)

    s.chapter(1)
    notes = L.get_by_role("region", name="Notes to write")
    s.settle(notes)
    notes.scroll_into_view_if_needed()
    s.wait(900)
    s.click(notes.get_by_role("button").first, 1200)
    s.type(sheet().get_by_label("Your rough notes"),
           "Made tea at the bench with the rollator, two rests. Knee pain 4/10 after. Daughter present. Trial a perching stool.", delay=8)
    s.say("Notes with AI", "Rough notes become a SOAP draft. AI never writes the clinical assessment.", 300)
    s.click(sheet().get_by_role("button", name=re.compile("Draft the note with AI")), 400)
    s.settle(sheet().get_by_text("AI draft, needs your approval").first)
    s.wait(1600)
    s.type(sheet().get_by_label("Assessment (your clinical judgement)"),
           "Standing tolerance improving with rests; a perching stool should help.", delay=8)
    for label, text in (("Subjective", "Daughter reports tea made three times this week."),
                        ("Objective", "Bench standing with rollator, two rests; knee pain 4/10."),
                        ("Plan", "Weekly visits; trial perching stool."),
                        ("Summary the patient sees", "Great work in the kitchen; we'll try a stool next time.")):
        box = sheet().get_by_label(label, exact=True)
        if box.count() and len(box.input_value().strip()) < 5:
            box.fill(text)
    sign = sheet().get_by_role("button", name=re.compile("Sign note as"))
    sign.scroll_into_view_if_needed()
    s.click(sign, 400)
    s.settle(L.get_by_text("Note signed").first)
    s.say("Notes with AI", "Signed. The family only ever sees the plain-language summary.", 1600)

    s.chapter(2)
    s.click(L.get_by_role("navigation", name="App sections").get_by_role("button", name="Patients", exact=True), 900)
    tap_load(s, L.get_by_role("button", name="Open Isabella Kowalski"), L.get_by_role("tab", name="Assess", exact=True).first,
             then=(L.get_by_role("tab", name="Assess", exact=True), L.get_by_role("button", name="Visits, report and signing").first))
    tap_load(s, L.get_by_role("button", name="Visits, report and signing"), sheet().get_by_text("Visit 1").first)
    s.say("Assessment", "Assessments run natively: each visit with its place, author and what's outstanding.", 1800)
    s.click(sheet().get_by_role("tab", name="Report"), 1200)
    s.say("Assessment", "The report is drafted from documented findings, each section citing its evidence.", 2000)
    s.click(sheet().get_by_role("tab", name="Sign"), 1000)
    s.say("Assessment", "Signing stays blocked until nothing is missing. Rules list exactly what's left.", 2000)
    s.chapter(len(T_CHAPTERS))


# ------------------------------------------------------------------ patient app


P_CHAPTERS = ["Home", "Ask Medisense", "Book a visit with AI", "Messages and files", "Payments"]


def patient_app(t: Tour):
    t.card("Part 4 · Patient app", "Harper Nguyen, 74",
           "Her visits, her plan, an assistant that answers from her own records, and her therapist a message away.", 1200)
    t.as_user(file_token("harper.txt"))
    t.phone("Patient app", "Harper Nguyen · Aspley", P_CHAPTERS, f"{BASE}/mobile/patient", "Needs your attention")
    s = t.app
    assert s
    L = s.L
    t.lift()
    s.chapter(0)
    s.say("Home", "What needs her attention first: visits to confirm, her plan to read, invoices and feedback.", 2400)

    s.chapter(1)
    s.click(L.get_by_role("button", name=re.compile("Ask Medisense")).first, 1000)
    s.type(L.get_by_label("Message", exact=True), "What activities should I do today?", delay=16)
    s.click(L.get_by_role("button", name="Send"), 300)
    s.settle(L.get_by_text(OUTCOME).first)
    src = L.get_by_role("button", name=re.compile("plan · v")).last
    s.say("Ask Medisense", "Answers come only from her approved plan, and the source opens with its version.", 300)
    if src.count():
        s.click(src, 300)
        L.get_by_text("Only approved, current versions are used", exact=False).last.scroll_into_view_if_needed()
        s.wait(2400)

    s.chapter(2)
    s.click(L.get_by_role("tab", name="Booking agent"), 900)
    s.click(L.get_by_role("button", name="Book a video visit on Tuesday morning").first, 400)
    slot = L.get_by_role("button", name=re.compile(r"^(Mon|Tue|Wed|Thu|Fri), \d+ \w+, ")).first
    s.settle(slot)
    slot.scroll_into_view_if_needed()
    s.say("Book a visit with AI", "AI understands the request and offers only real free times with her own therapist.", 300)
    s.click(slot, 400)
    s.settle(L.get_by_text("Needs your confirmation").first)
    L.get_by_text("Needs your confirmation").first.scroll_into_view_if_needed()
    s.wait(900)
    s.click(L.get_by_role("button", name="Confirm", exact=True).last, 400)
    s.settle(L.get_by_text(re.compile(r"^Done\.")).first)
    s.wait(1400)
    s.click(L.get_by_role("button", name="Close").last, 700)

    s.chapter(3)
    nav = L.get_by_role("navigation", name="App sections")
    tap_load(s, nav.get_by_role("button", name=re.compile("Messages")), L.get_by_role("button", name=re.compile("Sarah Thompson")).first)
    tap_load(s, L.get_by_role("button", name=re.compile("Sarah Thompson")).first, L.get_by_text(re.compile("here is your home program")).first)
    s.say("Messages and files", "Her home program, photos, a video clip and voice notes from Sarah.", 300)
    vid = L.locator("video").last
    if vid.count():
        vid.scroll_into_view_if_needed()
        vid.evaluate("v => { v.muted = true; v.play(); }")
        s.wait(3600)
        vid.evaluate("v => v.pause()")
    back = L.get_by_role("button", name=re.compile("^Back$"))
    if back.count():
        s.click(back.first, 700)

    s.chapter(4)
    tap_load(s, nav.get_by_role("button", name="Me", exact=True), L.get_by_text("MRN-04092026-0001").first)
    s.click(L.get_by_role("tab", name=re.compile("^Payments")), 1600)
    s.say("Payments", "Issued invoices with status and who pays. Clinical notes never appear here.", 2200)
    s.chapter(len(P_CHAPTERS))
    t.card("Medisense", "Systems supporting therapists",
           "AI drafts and suggests. Rules check. People decide and sign.", 3000)


def walkthrough(t: Tour):
    admin(t)
    therapist_web(t)
    therapist_app(t)
    patient_app(t)


def warm(page, ctx):
    """Compiles and loads every screen once so nothing loads for the first time on camera."""
    jo, sarah, harper = staff_token("jo.marsh@medisense.test"), staff_token("sarah.thompson@medisense.test"), file_token("harper.txt")
    for tok, paths in ((jo, ["/care/ai-agent", "/care/referrals", "/care/billing?tab=queue", "/care/therapists"]),
                       (sarah, ["/therapist/workspace?tab=schedule", "/therapist/patients/6af8ba54e62e775d1beca0d1",
                                "/telehealth/recordings", "/messages", "/mobile/therapist"]),
                       (harper, ["/mobile/patient"])):
        ctx.add_cookies([{"name": "medisense_session", "value": tok, "url": BASE}])
        for p in paths:
            try:
                page.goto(BASE + p, timeout=180000)
                page.wait_for_timeout(6000)
            except Exception as error:
                print("warm-up note:", p, str(error).splitlines()[0][:100])


def main():
    from playwright.sync_api import sync_playwright

    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    tmp = OUT / f".tmp-{NAME}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
                                                          "--autoplay-policy=no-user-gesture-required", "--lang=en-AU"])
        opts = dict(viewport={"width": 1440, "height": 900}, locale="en-AU", timezone_id="Australia/Brisbane")

        def context(record: bool):
            extra = {"record_video_dir": str(tmp), "record_video_size": {"width": 1440, "height": 900}} if record else {}
            ctx = browser.new_context(**opts, **extra)
            ctx.add_init_script(OVERLAY)
            ctx.add_init_script(COVER)
            ctx.route(APP_URL, lambda route: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=APP_PAGE))
            return ctx

        wctx = context(False)
        wpage = wctx.new_page()
        warm(wpage, wctx)
        wctx.close()

        ctx = context(not a.dry)
        page = ctx.new_page()
        page.set_default_timeout(150000)
        # Start on a dark card, not a white page.
        page.goto(APP_URL)
        t = Tour(page, ctx, 0.3 if a.dry else 1.0)
        ok = True
        started = time.time()
        try:
            walkthrough(t)
        except Exception as error:
            ok = False
            print(f"Stopped: {error}".splitlines()[0])
            page.screenshot(path=str(OUT / f"{NAME}-failed.png"))
        video = page.video
        ctx.close()
        browser.close()
        if video and not a.dry:
            final = OUT / f"{NAME}{'' if ok else '-incomplete'}.webm"
            final.unlink(missing_ok=True)
            pathlib.Path(video.path()).rename(final)
            (OUT / f".{NAME}.waits.json").write_text(json.dumps(t.waits))
            shutil.rmtree(tmp, ignore_errors=True)
            print(f"{'Saved' if ok else 'Saved partial'} {final} ({time.time() - started:.0f}s)")
        else:
            print("dry run", "ok" if ok else "stopped", f"{time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
