"""
Records the three Medisense walkthrough videos by driving the real app in a browser.

    python scripts/demo-videos/record.py 1          # Referral to first visit
    python scripts/demo-videos/record.py 2          # A therapist's day: visit to approved note
    python scripts/demo-videos/record.py 3          # New client to a finished visit
    python scripts/demo-videos/record.py 4          # Tour of every screen in the system
    python scripts/demo-videos/record.py all        # all four, one after another

Options:
    --theme green        record in the Green palette (default: blue)
    --size 1920x1080     video size (default 1920x1080)
    --speed 1.0          higher is faster, e.g. 1.5; lower is slower, e.g. 0.8
    --no-captions        hide the caption bar
    --url http://...     app address (default http://localhost:3000)

Needs the app running (pnpm dev) and Playwright for Python:
    pip install playwright && python -m playwright install chromium

Each video starts from a clean session. Videos are saved to scripts/demo-videos/output/.
The browser window is visible too, so you can screen-record it instead if you prefer.
"""

import argparse
import pathlib
import shutil
import sys
import time

from playwright.sync_api import Page, sync_playwright

OUT = pathlib.Path(__file__).parent / "output"

# A visible cursor, click ripple and caption bar, since recordings don't show the real pointer.
OVERLAY = r"""
(() => {
  const install = () => {
    if (document.getElementById('__demo_cursor')) return;
    const css = document.createElement('style');
    css.textContent = `
      nextjs-portal { display: none !important; }
      #__demo_cursor { position: fixed; z-index: 2147483647; pointer-events: none; width: 22px; height: 22px;
        margin: -3px 0 0 -3px; transition: transform 120ms ease; left: -100px; top: -100px; }
      #__demo_cursor.down { transform: scale(0.82); }
      .__demo_ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 34px; height: 34px;
        margin: -17px 0 0 -17px; border-radius: 50%; border: 2px solid rgba(21,112,239,.85);
        animation: __demo_ripple 520ms ease-out forwards; }
      @keyframes __demo_ripple { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.6); opacity: 0 } }
      #__demo_caption { position: fixed; z-index: 2147483645; pointer-events: none; left: 50%; bottom: 28px;
        transform: translateX(-50%) translateY(16px); opacity: 0; max-width: min(1100px, 86vw);
        padding: 14px 22px; border-radius: 16px; background: rgba(12, 22, 44, .9); color: #fff;
        font: 500 19px/1.45 "Manrope", system-ui, sans-serif; box-shadow: 0 12px 40px rgba(0,0,0,.28);
        transition: opacity 260ms ease, transform 260ms ease; text-align: center; }
      #__demo_caption.on { opacity: 1; transform: translateX(-50%) translateY(0); }
      #__demo_caption b { color: #9cc4ff; font-weight: 700; margin-right: 8px; }
    `;
    document.documentElement.appendChild(css);
    const cursor = document.createElement('div');
    cursor.id = '__demo_cursor';
    cursor.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#0c162c" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cursor);
    const cap = document.createElement('div');
    cap.id = '__demo_caption';
    document.documentElement.appendChild(cap);
    const saved = sessionStorage.getItem('__demo_xy');
    if (saved) { const [x, y] = saved.split(','); cursor.style.left = x + 'px'; cursor.style.top = y + 'px'; }
    addEventListener('mousemove', e => {
      cursor.style.left = e.clientX + 'px'; cursor.style.top = e.clientY + 'px';
      try { sessionStorage.setItem('__demo_xy', e.clientX + ',' + e.clientY); } catch {}
    }, true);
    addEventListener('mousedown', e => {
      cursor.classList.add('down');
      const r = document.createElement('div'); r.className = '__demo_ripple';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.documentElement.appendChild(r); setTimeout(() => r.remove(), 600);
    }, true);
    addEventListener('mouseup', () => cursor.classList.remove('down'), true);
    const lastCaption = sessionStorage.getItem('__demo_caption');
    if (lastCaption) { cap.innerHTML = lastCaption; cap.classList.add('on'); }
  };
  window.__caption = (html) => {
    install();
    const cap = document.getElementById('__demo_caption');
    try { html ? sessionStorage.setItem('__demo_caption', html) : sessionStorage.removeItem('__demo_caption'); } catch {}
    if (!html) { cap.classList.remove('on'); return; }
    cap.classList.remove('on');
    setTimeout(() => { cap.innerHTML = html; cap.classList.add('on'); }, 180);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
"""


class Director:
    """Moves, clicks, types and narrates at a pace a viewer can follow."""

    def __init__(self, page: Page, base: str, speed: float, captions: bool):
        self.page = page
        self.base = base
        self.speed = speed
        self.captions = captions
        self.x, self.y = 960, 540

    def wait(self, ms: float):
        self.page.wait_for_timeout(ms / self.speed)

    def caption(self, step: str, text: str, hold: float = 2600):
        if self.captions:
            label = f"<b>{step}</b>" if step else ""
            self.page.evaluate("h => window.__caption && window.__caption(h)", f"{label}{text}")
        self.wait(hold)

    def clear_caption(self):
        if self.captions:
            self.page.evaluate("() => window.__caption && window.__caption('')")

    def go(self, path: str, settle: float = 2200):
        self.page.goto(self.base + path, wait_until="load", timeout=120000)
        self.wait(settle)

    @staticmethod
    def shown(locator):
        # Next keeps earlier screens mounted but hidden, so only act on what's on screen.
        return locator.filter(visible=True).first

    def move_to(self, locator, steps: int = 28):
        locator = self.shown(locator)
        locator.scroll_into_view_if_needed(timeout=30000)
        self.wait(250)
        box = locator.bounding_box()
        if not box:
            return
        tx = box["x"] + min(box["width"] / 2, 60 if box["width"] > 240 else box["width"] / 2)
        ty = box["y"] + box["height"] / 2
        self.page.mouse.move(tx, ty, steps=max(8, int(steps / self.speed)))
        self.x, self.y = tx, ty

    def click(self, locator, pause_before: float = 450, pause_after: float = 900):
        locator = self.shown(locator)
        locator.wait_for(state="visible", timeout=90000)
        self.move_to(locator)
        self.wait(pause_before)
        locator.click()
        self.wait(pause_after)

    def hover(self, locator, hold: float = 1200):
        self.move_to(locator)
        self.wait(hold)

    def type(self, locator, text: str, delay: float = 28):
        locator = self.shown(locator)
        self.click(locator, pause_after=200)
        locator.press_sequentially(text, delay=delay / self.speed)
        self.wait(500)

    def scroll(self, pixels: int, steps: int = 12):
        for _ in range(steps):
            self.page.mouse.wheel(0, pixels / steps)
            self.page.wait_for_timeout(40)
        self.wait(700)

    def dialog(self, name: str):
        return self.page.get_by_role("dialog", name=name)

    def choose(self, scope, label: str, option: str):
        """Picks an option in one of Medisense's dropdowns."""
        self.click(scope.get_by_label(label), pause_after=500)
        self.click(self.page.get_by_role("option", name=option), pause_after=600)

    def switch_role(self, label: str):
        self.click(self.page.get_by_role("button", name="Switch workspace"), pause_after=700)
        self.click(self.page.get_by_role("radio", name=label), pause_after=1800)

    def main(self):
        return self.page.locator("main").filter(visible=True).first


# ---------------------------------------------------------------- video 1

def referral_to_first_visit(d: Director):
    """Admin receives a referral, AI reads it, the team verifies, creates the client and books."""
    d.go("/")
    d.caption("", "Medisense: from a referral email to a booked first visit, in about two minutes.", 3200)
    d.caption("1", "A new referral arrives by email. Admin opens AI referrals.")
    d.click(d.page.get_by_role("link", name="AI referrals").first, pause_after=2200)

    d.caption("2", "Paste the referral exactly as it arrived.", 1800)
    d.click(d.main().get_by_role("button", name="New referral"))
    sheet = d.dialog("New referral")
    d.choose(sheet, "Where it came from", "Email")
    d.click(sheet.get_by_role("button", name="Use sample referral"), pause_after=1600)
    d.hover(sheet.get_by_label("Referral text"), 1800)

    d.caption("3", "AI reads it and pulls out the client, funding, contacts and needs.", 1200)
    d.click(sheet.get_by_role("button", name="Read referral with AI"), pause_after=400)
    sheet.wait_for(state="detached", timeout=120000)
    d.wait(1800)

    d.caption("4", "Every detail points back to the line it came from. Nothing is guessed.", 1000)
    fields = d.main().locator("dl > div.grid")
    for i in range(min(fields.count(), 4)):
        d.hover(fields.nth(i), 1100)

    draft = d.main().get_by_role("button", name="Draft request for missing information")
    if draft.count() and draft.first.is_visible():
        d.caption("5", "AI spots what's missing, such as the NDIS number, and drafts the request.", 800)
        d.click(draft.first, pause_after=1500)
        d.hover(d.main().get_by_label("Request email"), 2200)
        d.caption("5", "A person reviews the email, then sends it. It's logged to the audit trail.", 800)
        d.click(d.main().get_by_role("button", name="Send request", exact=True), pause_after=1800)

    d.caption("6", "Admin checks the details AI filled in, then creates the client.", 800)
    d.click(d.main().get_by_role("button", name="Verify & create client profile"), pause_after=1400)
    form = d.dialog("Check details and create client")
    d.hover(form.get_by_label("Clinician"), 1600)
    d.click(form.get_by_role("button", name="Create client", exact=True), pause_after=2200)

    d.caption("7", "Book the first visit. The clinician comes from the client, and double bookings are blocked.", 800)
    d.click(d.main().get_by_role("button", name="Book first visit"), pause_after=1200)
    book = d.dialog("Book visit")
    d.hover(book.get_by_label("Day"), 1000)
    d.click(book.get_by_role("button", name="Book visit", exact=True), pause_after=2000)

    d.caption("8", "The client record is ready, with the first visit in the diary.", 600)
    d.click(d.main().get_by_role("link", name="Open client").first, pause_after=2600)
    d.scroll(500)
    d.caption("", "Referral in, client created, first visit booked. AI drafted; people approved every step.", 4200)


# ---------------------------------------------------------------- video 2

def therapist_day(d: Director):
    """A therapist's day: My day, a finished visit, a dictated note, approval and what AI prepares."""
    d.go("/")
    d.caption("", "A therapist's day in Medisense: from the morning plan to an approved note.", 3000)
    d.caption("1", "Sarah, an occupational therapist, signs in to her own view.", 600)
    d.switch_role("Therapist")
    d.go("/my-day", 2600)

    d.caption("2", "My day: visits, driving, notes to write and an AI summary of what to do first.", 3200)
    d.caption("3", "Each visit opens with the client, open tasks and the latest note.", 600)
    d.click(d.main().get_by_role("button", name="Open visit details for Isla Murphy"), pause_after=1800)
    d.scroll(400)
    d.wait(1400)
    d.page.keyboard.press("Escape")
    d.wait(900)

    d.caption("4", "Oliver's visit just finished. Sarah writes the note with AI.", 600)
    d.click(d.main().get_by_role("link", name="Write note with AI").first, pause_after=2400)

    d.caption("5", "She dictates a few lines about the visit, in her own words.", 600)
    d.click(d.main().get_by_role("button", name="Use sample dictation"), pause_after=400)
    finish = d.main().get_by_role("button", name="Finish dictating")
    finish.wait_for(state="visible", timeout=30000)
    d.page.wait_for_function(
        "() => [...document.querySelectorAll('main button')].some(b => b.textContent.includes('Finish dictating') && !b.disabled)",
        timeout=60000,
    )
    d.wait(1200)
    d.click(finish, pause_after=1600)

    d.caption("6", "AI turns the dictation into a structured case note.", 600)
    d.click(d.main().get_by_role("button", name="Write note with AI"), pause_after=600)
    approve = d.main().get_by_role("button", name="Approve note")
    approve.wait_for(state="visible", timeout=120000)
    d.wait(3000)

    d.caption("7", "AI flags anything to check before approving. Sarah decides each one.", 800)
    for _ in range(4):
        skip = d.main().get_by_role("button", name="Not needed")
        if not skip.count():
            break
        d.click(skip.first, pause_after=900)
    d.scroll(-300)
    d.caption("8", "Nothing goes on the record until Sarah approves the note.", 600)
    d.click(approve, pause_after=2600)

    d.page.get_by_role("heading", name="What AI prepared from Oliver's note").wait_for(timeout=120000)
    d.caption("9", "One approved note. AI prepares the report, a form and follow-ups. Nothing is sent.", 3400)
    d.caption("10", "Each item links back to the exact sentences in the note.", 600)
    d.click(d.main().get_by_role("button", name="Show where the form came from in the note"), pause_after=2200)
    d.click(d.main().get_by_role("button", name="Show where the report came from in the note"), pause_after=2200)

    d.caption("11", "Sarah reviews the progress report and writes the next steps herself.", 600)
    d.click(d.main().get_by_role("button", name="Review report"), pause_after=1400)
    steps = d.main().get_by_placeholder("AI leaves this to you.")
    d.type(steps, "Continue weekly sessions focusing on square shapes and table endurance. Review the paediatrician's recommendation with the family.")
    d.click(d.main().get_by_role("button", name="Approve report"), pause_after=1800)

    d.caption("12", "Follow-ups AI found become tasks only when she confirms them.", 600)
    confirm = d.main().get_by_role("button", name="Confirm task")
    if confirm.count():
        d.click(confirm.first, pause_after=1600)
    d.scroll(900)
    d.caption("", "Steps Sarah didn't have to repeat. Less admin, more time with clients.", 3800)


# ---------------------------------------------------------------- video 3

def client_to_finished_visit(d: Director):
    """Create a client, assign a therapist, book, then finish the visit as that therapist."""
    d.go("/clients")
    d.caption("", "New client to a finished visit: the team sets it up, the therapist completes it.", 3000)

    d.caption("1", "Admin adds the client and assigns a therapist.", 600)
    d.click(d.page.get_by_role("button", name="New", exact=True), pause_after=900)
    d.click(d.page.get_by_role("button", name="Create a new client record"), pause_after=1200)
    form = d.dialog("Add client")
    d.type(form.get_by_label("Full name"), "Hamza Ali")
    d.type(form.get_by_label("Age"), "7")
    d.type(form.get_by_label("Service"), "Occupational Therapy")
    d.type(form.get_by_label("Suburb"), "Kedron")
    d.caption("2", "Medisense shows each therapist's capacity. Admin chooses Sarah Thompson.", 600)
    d.choose(form, "Clinician", "Sarah Thompson")
    d.type(form.get_by_label("Main contact"), "Ayesha Ali")
    d.click(form.get_by_role("button", name="Create client", exact=True), pause_after=2600)

    d.caption("3", "Book the first visit for today. The clinician fills in from the client.", 600)
    d.click(d.main().get_by_role("button", name="Book visit").first, pause_after=1400)
    book = d.dialog("Book visit")
    d.hover(book.get_by_label("Clinician"), 1400)
    d.click(book.get_by_role("button", name="Book visit", exact=True), pause_after=2200)

    d.caption("4", "Now switch to the therapist's view.", 600)
    d.switch_role("Therapist")
    d.go("/my-day", 2600)

    d.caption("5", "The new visit is in Sarah's day, under New bookings.", 600)
    card = d.main().locator("[aria-labelledby=new-bookings]")
    d.hover(card, 1600)
    d.click(card.get_by_text("Hamza Ali"), pause_after=1600)

    d.caption("6", "After the visit, Sarah marks the session complete.", 600)
    sheet = d.dialog("Hamza Ali")
    d.click(sheet.get_by_role("button", name="Mark session complete"), pause_after=2200)
    d.page.keyboard.press("Escape")
    d.wait(1200)

    d.caption("7", "Medisense adds a task to write the session note automatically.", 600)
    tasks = d.main().locator("[aria-labelledby=my-tasks]")
    d.scroll(400)
    row = tasks.get_by_role("button", name="Write session note").first
    d.click(row, pause_after=2400)
    d.caption("8", "Every task shows the client, owner, due date and where it came from.", 2600)
    d.click(d.dialog("Write session note").get_by_role("button", name="Mark done"), pause_after=2000)
    d.caption("", "Client created, therapist assigned, visit completed, follow-up handled.", 4000)


# ---------------------------------------------------------------- video 4

# Every screen in the sidebar, in sidebar order, with one line on what it's for.
TOUR = [
    ("Organisation", [
        ("/", "Overview: the whole service at a glance, with AI highlights on what needs attention."),
        ("/since-yesterday", "Since yesterday: everything that changed overnight, in one list."),
        ("/before-after", "Before and after: the time and admin Medisense saves, measured."),
        ("/team-capacity", "Team capacity: each therapist's load, so new clients go to the right person."),
        ("/analytics", "AI insights: trends across clients, visits, notes and outcomes."),
        ("/clients-requiring-attention", "Clients to review: clients flagged at risk, with the reason for each flag."),
    ]),
    ("Intake & Admin", [
        ("/admin-queue", "Work queue: the admin team's jobs for today, in priority order."),
        ("/intake", "AI referrals: AI reads incoming referrals and drafts the client profile."),
        ("/forms", "AI forms: forms AI fills in from approved notes, ready for a person to check."),
        ("/tasks", "Tasks: every follow-up with an owner and a due date. Overdue work escalates."),
        ("/admin-operations", "Admin Operations: compliance, documents and day-to-day running of the service."),
        ("/automations", "Automations: the rules that handle routine work, each one clearly labelled."),
    ]),
    ("Clinical", [
        ("/clients", "Clients: every client record, with funding, clinician and plan review dates."),
        ("/schedule", "Schedule: all visits across the team. Double bookings are blocked."),
        ("/telehealth", "Telehealth: video sessions with the client's details beside the call."),
        ("/caseloads/sarah-thompson", "Caseloads: each therapist's clients, visits and outstanding notes."),
        ("/supervision/sarah-thompson", "AI briefs: a supervision brief AI prepares before each session."),
    ]),
    ("AI workspace", [
        ("/case-notes/mia-robinson", "AI notes: case notes drafted by AI and approved by the therapist."),
        ("/reports", "AI reports: progress and NDIS reports drafted from approved notes."),
        ("/admin-insights", "Admin insights: where admin time goes, and what AI took off the team."),
    ]),
    ("Platform", [
        ("/portal", "Family Portal: families see visits, goals and progress, and message the team."),
        ("/settings", "Security & Integrations: access, audit trail and connected systems."),
        ("/roadmap", "Roadmap: what's live now and what comes next."),
    ]),
    ("Mobile apps", [
        ("/mobile/staff", "Staff app: the schedule, client details and directions on a therapist's phone."),
        ("/mobile/family", "Family app: the family's view of visits and progress on their phone."),
    ]),
    ("Business", [
        ("/billing", "Billing and claims: NDIS and aged care claims built from approved visits."),
        ("/hospital", "Hospital operations: wards, beds and patient flow."),
        ("/erp", "ERP: finance, payroll and purchasing in the same system."),
    ]),
]

THERAPIST_TOUR = [
    ("/my-day", "My day: the therapist's visits, travel, tasks and an AI summary of what to do first."),
    ("/sessions/oliver-grant", "AI session note: dictate after a visit and AI drafts the case note."),
]


def show_page(d: Director, href: str, text: str, step: str):
    link = d.page.locator(f'nav[aria-label="Primary"] a[href="{href}"]').filter(visible=True)
    try:
        if link.count():
            d.click(link.first, pause_before=300, pause_after=300)
        else:
            d.go(href, 600)
        d.page.wait_for_load_state("load", timeout=60000)
    except Exception:
        d.go(href, 600)
    d.wait(1600)
    d.caption(step, text, 2200)
    # Pointer over the content so the wheel scrolls the page, not the sidebar.
    d.page.mouse.move(1150, 560, steps=max(6, int(14 / d.speed)))
    for _ in range(3):
        d.scroll(520, steps=14)
        d.wait(500)
    d.scroll(-2400, steps=10)
    d.wait(600)


def system_tour(d: Director):
    """A walk through every screen in Medisense, using the sidebar like a user would."""
    d.go("/", 2600)
    d.caption("", "A tour of Medisense: every screen, in the order it appears in the menu.", 3200)
    n = 0
    for group, pages in TOUR:
        d.caption("", f"{group}", 1400)
        for href, text in pages:
            n += 1
            show_page(d, href, text, str(n))

    d.caption("", "Each role sees its own menu. Here is the therapist's view.", 1200)
    d.switch_role("Therapist")
    for href, text in THERAPIST_TOUR:
        n += 1
        show_page(d, href, text, str(n))

    d.caption("", "One system for referrals, clinical work, families and the business. AI drafts; people approve.", 4200)


VIDEOS = {
    "1": ("1-referral-to-first-visit", referral_to_first_visit),
    "2": ("2-therapist-day", therapist_day),
    "3": ("3-new-client-to-finished-visit", client_to_finished_visit),
    "4": ("4-system-tour", system_tour),
}


def record(key: str, args) -> pathlib.Path | None:
    name, scene = VIDEOS[key]
    width, height = (int(n) for n in args.size.lower().split("x"))
    tmp = OUT / f".tmp-{name}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=args.headless, args=[f"--window-size={width},{height + 120}"])
        context = browser.new_context(
            viewport={"width": width, "height": height},
            record_video_dir=str(tmp),
            record_video_size={"width": width, "height": height},
        )
        theme = "green" if args.theme == "green" else "blue"
        context.add_init_script(f"try{{localStorage.setItem('medisense-theme','{theme}')}}catch(e){{}}")
        context.add_init_script(OVERLAY)
        page = context.new_page()
        d = Director(page, args.url.rstrip("/"), args.speed, not args.no_captions)
        started = time.time()
        ok = True
        try:
            scene(d)
            d.wait(1200)
        except Exception as error:  # keep the partial video so the failing step can be seen
            ok = False
            print(f"  Stopped at a step that didn't work: {error}".splitlines()[0])
            page.screenshot(path=str(OUT / f"{name}-failed.png"))
        video = page.video
        context.close()
        browser.close()
        if not video:
            return None
        final = OUT / f"{name}{'' if ok else '-incomplete'}.webm"
        final.unlink(missing_ok=True)
        pathlib.Path(video.path()).rename(final)
        shutil.rmtree(tmp, ignore_errors=True)
        print(f"  {'Saved' if ok else 'Saved partial'} {final}  ({time.time() - started:.0f}s)")
        return final


def main():
    parser = argparse.ArgumentParser(description="Record Medisense walkthrough videos.")
    parser.add_argument("video", choices=["1", "2", "3", "4", "all"])
    parser.add_argument("--theme", choices=["blue", "green"], default="blue")
    parser.add_argument("--size", default="1920x1080")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--no-captions", action="store_true")
    parser.add_argument("--url", default="http://localhost:3000")
    parser.add_argument("--headless", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    keys = list(VIDEOS) if args.video == "all" else [args.video]
    for key in keys:
        print(f"Recording video {key}: {VIDEOS[key][0]}")
        record(key, args)


if __name__ == "__main__":
    sys.exit(main())
