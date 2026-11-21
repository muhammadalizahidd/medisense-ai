"""
Module 18 full walkthrough: a parent refers her son without an account, intake reviews it, and a
signed-in patient asks for another service from the app.

    python scripts/demo-videos/record_module18.py --patient harper.txt --intake jo.txt [--dry]

Reset first: reset_m18full.mjs, reset_m18.mjs, harper_invite.mjs, then one GET of /api/patient/portal.
"""

import argparse
import pathlib
import re
import shutil
import time

from playwright.sync_api import sync_playwright

from record import OVERLAY
from record_module08 import Steady, session_cookie
from record_module12 import as_user
from record_patient import APP, ROLE_CARD, SAMPLE, app_ready, cover, lift_cover, nav, seg, switch

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "demo-videos"
NAME = "Module-18-Patient-Registration-and-Referral"


# ------------------------------------------------------------------ form helpers


def radio(d: Steady, group: str, option: str, scope=None, settle: float = 500):
    where = scope if scope is not None else d.page
    d.click(where.get_by_role("radiogroup", name=group).get_by_role("radio", name=option, exact=True), pause_after=settle)


def fill(d: Steady, label: str, text: str, scope=None, exact: bool = False):
    where = scope if scope is not None else d.page
    d.type(where.get_by_label(label, exact=exact), text, delay=22)


def date(d: Steady, label: str, day: str, month: str, year: str, scope=None):
    where = scope if scope is not None else d.page
    d.type(where.get_by_label(f"{label}: day"), day, delay=60)
    d.type(where.get_by_label(f"{label}: month"), month, delay=60)
    d.type(where.get_by_label(f"{label}: year"), year, delay=60)


def tick(d: Steady, text: str, scope=None, settle: float = 500):
    where = scope if scope is not None else d.page
    d.click(where.get_by_label(text), pause_after=settle)


def proceed(d: Steady, scope=None, settle: float = 1600):
    where = scope if scope is not None else d.page
    d.click(where.get_by_role("button", name=re.compile(r"^(Continue|Send referral)$")).last, pause_after=settle)


STEPS = ["About you", "Participant", "Funding", "Contacts", "Service location", "Supports", "Health and safety", "Goals and documents", "Review and send"]


def heading(d: Steady, text: str, scope=None):
    """Waits for the form to show this step; a validation error stops the run with its message."""
    where = scope if scope is not None else d.page
    n = STEPS.index(text) + 1
    target = where.get_by_text(re.compile(rf"^Step {n} of 9$", re.I)).filter(visible=True)
    for _ in range(40):
        if target.count():
            return
        d.page.wait_for_timeout(250)
    alerts = [t for t in where.locator("[role=alert], .text-over").all_inner_texts() if t.strip()]
    raise RuntimeError(f"Didn't reach {text}: {alerts[:3]}")


def group(d: Steady, title: str, scope=None):
    where = scope if scope is not None else d.page
    return where.get_by_role("group", name=title)


def support(d: Steady, name: str, scope=None):
    where = scope if scope is not None else d.page
    item = where.locator("li").filter(has=where.get_by_role("button", name=re.compile(rf"^{re.escape(name)}\b")))
    d.click(item.get_by_role("button", name=re.compile(rf"^{re.escape(name)}\b")), pause_after=700)
    return item


def switch_to_app(d: Steady, ctx, url: str, token: str, who: str):
    """Like switch(), for the patient app, which has no table to wait for."""
    d.page.evaluate(f"() => {{ try {{ sessionStorage.setItem('__role', {who!r}) }} catch (e) {{}} }}")
    as_user(ctx, url, token)
    d.page.goto(d.base + APP, wait_until="load", timeout=240000)
    app_ready(d)
    d.wait(1800)
    d.page.evaluate("""() => { try { sessionStorage.removeItem('__role') } catch (e) {}
      const c = document.getElementById('__role'); if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 600); } }""")
    d.wait(900)


def page_scroll(d: Steady, y: int, settle: float = 900):
    d.page.evaluate(f"window.scrollBy({{top: {y}, behavior: 'smooth'}})")
    d.wait(settle)


# ------------------------------------------------------------------ the walkthrough


def guest_referral(d: Steady):
    d.go("/refer", 400)
    d.page.get_by_role("radiogroup", name="I am the").wait_for(timeout=120000)
    d.wait(2200)
    lift_cover(d)
    d.caption("1", "Anyone can refer without an account. Rachel Carter refers her son Leo from the Medisense website.", 3400)

    # Step 1: about you
    radio(d, "I am the", "Parent or guardian", settle=700)
    fill(d, "Your name", "Rachel Carter")
    fill(d, "Your email", "rachel.carter@example.test")
    fill(d, "Your phone", "0412 556 018")
    d.caption("2", "A parent or guardian confirms they have the authority to refer. Intake may ask for evidence.", 600)
    tick(d, "I confirm I am the participant", settle=1600)
    proceed(d)

    # Step 2: participant
    heading(d, "Participant")
    fill(d, "First name", "Leo")
    fill(d, "Last name", "Carter")
    d.caption("3", "Dates are entered in Australian order. A date of birth in the future is refused.", 400)
    date(d, "Date of birth", "02", "09", "2017")
    fill(d, "Street address", "14 Kirkland Avenue")
    fill(d, "Suburb", "Kedron")
    fill(d, "Postcode", "4031")
    d.wait(900)
    proceed(d)

    # Step 3: funding
    heading(d, "Funding")
    d.caption("4", "NDIS funding. Choosing Plan Managed reveals the plan manager's details.", 400)
    fill(d, "NDIS number", "431 829 506")
    date(d, "Plan end date", "30", "06", "2027")
    radio(d, "Plan type", "Plan Managed", settle=1100)
    fill(d, "Plan manager company", "Brisbane Plan Partners")
    fill(d, "Plan manager email", "accounts@bpp.example.test")
    d.caption("5", "Not sure about funding periods? That's fine: intake checks the plan instead of guessing.", 400)
    radio(d, "Does the plan have funding periods?", "Unsure", settle=1800)
    proceed(d)

    # Step 4: contacts
    heading(d, "Contacts")
    d.caption("6", "The support coordinator, the person who signs and the person who books can all be different.", 400)
    coord = group(d, "Support coordinator")
    fill(d, "Name", "Grace Okoro", scope=coord)
    fill(d, "Email", "grace.okoro@example.test", scope=coord)
    sign = group(d, "Who signs the service agreement?")
    radio(d, "Role", "Parent or guardian", scope=sign)
    fill(d, "Name", "Rachel Carter", scope=sign)
    fill(d, "Email", "rachel.carter@example.test", scope=sign)
    book = group(d, "Who should we call to book visits?")
    radio(d, "Role", "Parent or guardian", scope=book)
    fill(d, "Name", "Rachel Carter", scope=book)
    fill(d, "Phone", "0412 556 018", scope=book)
    fill(d, "Email", "rachel.carter@example.test", scope=book)
    radio(d, "Preferred contact method", "SMS", scope=book)
    fill(d, "Best time to contact", "Weekday mornings", scope=book)
    d.wait(800)
    proceed(d)

    # Step 5: location
    heading(d, "Service location")
    d.caption("7", "Six service locations. School asks for the school's address, contact and access notes.", 400)
    radio(d, "Preferred service location", "School", settle=900)
    same = d.page.get_by_label("Same as the participant")
    if same.count() and same.first.is_checked():
        tick(d, "Same as the participant", settle=800)
    fill(d, "Street address", "Kedron State School, 40 Park Road")
    fill(d, "Suburb", "Kedron")
    fill(d, "Postcode", "4031")
    fill(d, "Location contact name", "Alana Price, learning support")
    fill(d, "Contact phone", "07 3350 1122")
    fill(d, "Access notes", "Sign in at the office. Sessions in the library quiet room.")
    d.wait(800)
    proceed(d)

    # Step 6: supports
    heading(d, "Supports")
    d.caption("8", "All 17 supports by name. Each one asks only what it needs.", 2200)
    speech = support(d, "Speech Therapy")
    radio(d, "How often (preferred)", "Weekly", scope=speech, settle=900)
    ot = support(d, "Occupational Therapy")
    radio(d, "How often (preferred)", "Fortnightly", scope=ot, settle=900)
    d.caption("9", "Nursing asks which kind of nursing support. One referral, three services.", 400)
    nursing = support(d, "Nursing")
    radio(d, "Type of nursing support", "Continence Assessment", scope=nursing, settle=1600)
    proceed(d)

    # Step 7: health and safety
    heading(d, "Health and safety")
    fill(d, "Accepted or primary diagnosis", "Autism spectrum disorder (level 2), reported by family")
    radio(d, "Are there behaviours of concern?", "Unknown", settle=900)
    d.caption("10", "A known risk must be described, and Unknown is never treated as No. Both go to a clinician.", 400)
    radio(d, "Is there any known risk to a visiting therapist?", "Yes", settle=900)
    fill(d, "Describe the risk", "Large dog at home. Please call before arriving so it can be secured.")
    tick(d, "A specific person must be present", settle=800)
    fill(d, "Who, their relationship and phone", "Rachel Carter (mother), 0412 556 018")
    d.wait(900)
    proceed(d)

    # Step 8: goals and documents
    heading(d, "Goals and documents")
    fill(d, "NDIS goals", "Leo wants to join in class discussions and use the toilet at school on his own.")
    fill(d, "Additional comments", "Prefers short sessions with a visual schedule.")
    files = d.page.locator("input[type=file]").first
    d.caption("11", "A file type that isn't accepted is refused with a clear reason; nothing typed is lost.", 300)
    files.set_input_files(str(SAMPLE / "school-notes.txt"))
    d.wait(2600)
    files.set_input_files(str(SAMPLE / "NDIS-plan-2026.pdf"))
    d.wait(2000)
    proceed(d)

    # Step 9: review and send
    heading(d, "Review and send")
    d.caption("12", "Everything on one page to check. Any step can be reopened without losing answers.", 2600)
    page_scroll(d, 420)
    d.caption("13", "Consent here covers the referral only. Treatment, recording and AI consents are asked later.", 400)
    for t in d.page.locator("label").filter(has=d.page.locator("input[type=checkbox]")).all():
        if t.is_visible() and not t.locator("input").is_checked():
            d.click(t, pause_after=500)
    d.wait(700)
    proceed(d, settle=2400)
    d.page.get_by_role("heading", name="Referral received").wait_for(timeout=60000)
    d.caption("14", "Sent once, with a reference, Leo's MRN and a private tracking link.", 3800)

    # Tracking
    d.click(d.page.get_by_role("link", name="Track this referral"), pause_after=2400)
    d.caption("15", "The private link shows progress and initials only, never the referral's details.", 3800)
    page_scroll(d, 400, 1600)
    d.clear_caption()


def intake(d: Steady, ctx, url: str, tokens: dict):
    d.caption("16", "Jo Marsh in intake sees the new referral at the top of her queue.", 600)
    switch(d, ctx, url, tokens["intake"], "Jo Marsh|Intake Officer", "/care/referrals", "Leo Carter")
    d.wait(1200)
    d.click(d.page.get_by_role("link", name=re.compile("Leo Carter")).first, pause_after=2600)
    d.page.get_by_text("Duplicate check").first.wait_for(timeout=60000)
    d.caption("17", "Possible duplicate: Emma Carter has the same surname and birthday. Only staff see this; Rachel never did.", 4200)
    d.caption("18", "They're twins, so Jo records that this is a different child.", 600)
    d.click(d.page.get_by_role("button", name="Not the same person"), pause_after=2400)
    d.move_to(d.page.get_by_text("Risk screening").first)
    d.caption("19", "The risk Rachel reported holds the referral for clinical triage. Nothing is booked automatically.", 3600)
    ai = d.page.get_by_role("button", name=re.compile("Review with AI"))
    if ai.count():
        d.caption("20", "AI reads the referral for anything a clinician would need. Suggestions only; Jo decides.", 400)
        d.click(ai, pause_after=600)
        d.page.get_by_text(re.compile("Nothing missing found|Ask the family")).or_(d.page.locator("#ai-review ~ ul, [aria-labelledby=ai-review] ul")).first.wait_for(timeout=90000)
        d.wait(3600)
    d.caption("21", "Jo sends it to the clinical lead for triage.", 400)
    d.click(d.page.get_by_role("button", name="Send to clinical triage").first, pause_after=2600)
    d.clear_caption()


def signed_in_patient(d: Steady, ctx, url: str, tokens: dict):
    d.caption("22", "Harper Nguyen already has the app. Her referrals live under Me.", 600)
    switch_to_app(d, ctx, url, tokens["patient"], "Harper Nguyen|Patient")
    nav(d, "Me")
    seg(d, "Referrals", 1800)
    d.caption("23", "Each requested service has its own status, with a timeline of where the referral is.", 3600)
    nav(d, "Me")
    seg(d, "Profile", 900)
    more = d.page.get_by_role("button", name="Request another service")
    d.caption("24", "She asks for physiotherapy. The form starts from her verified record, and every field stays editable.", 400)
    d.click(more, pause_after=2600)
    frame = d.page.frame_locator("iframe[title='Referral form']")
    frame.get_by_text("Filled in from your Medisense record").first.wait_for(timeout=60000)
    d.wait(2600)
    tick(d, "I confirm I am the participant", scope=frame)
    proceed(d, scope=frame)
    heading(d, "Participant", scope=frame)
    d.caption("25", "Only what her record doesn't have is left to fill in: her street and postcode.", 400)
    fill(d, "Street address", "27 Robinson Road", scope=frame)
    fill(d, "Postcode", "4034", scope=frame)
    d.wait(900)
    for step in STEPS[2:5]:
        proceed(d, scope=frame, settle=1000)
        heading(d, step, scope=frame)
    proceed(d, scope=frame, settle=1200)
    heading(d, "Supports", scope=frame)
    physio = support(d, "Physiotherapy", scope=frame)
    radio(d, "How often (preferred)", "Weekly", scope=physio, settle=1200)
    for step in STEPS[6:]:
        proceed(d, scope=frame, settle=1000)
        heading(d, step, scope=frame)
    for t in frame.locator("label").filter(has=frame.locator("input[type=checkbox]")).all():
        if t.is_visible() and not t.locator("input").is_checked():
            d.click(t, pause_after=400)
    proceed(d, scope=frame, settle=2400)
    d.page.get_by_text(re.compile(r"Referral REF-MRN-04092026-0001-\d+ sent")).first.wait_for(timeout=60000)
    d.move_to(d.page.get_by_text(re.compile(r"Referral REF-MRN-04092026-0001-\d+ sent")).first)
    d.caption("26", "It joins her own record under her MRN. No second account, no duplicate patient.", 3600)
    d.page.reload(wait_until="load")
    app_ready(d)
    nav(d, "Me")
    seg(d, "Referrals", 2200)
    d.caption("27", "The new request is already listed, waiting for intake.", 3000)
    d.caption("28", "Plans change: withdrawing asks for a reason, and the history is kept.", 400)
    d.click(d.page.get_by_role("button", name="Withdraw this referral").first, pause_after=1400)
    d.type(d.page.locator("[role=dialog] textarea, [role=dialog] input[type=text], [role=dialog] input:not([type])").first, "Booked physiotherapy closer to home for now.")
    d.click(d.page.locator("[role=dialog]").get_by_role("button", name="Withdraw referral").last, pause_after=2600)
    d.caption("", "One referral, many services, every status visible to the family, every decision made by a person.", 4200)
    d.clear_caption()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--patient", required=True)
    ap.add_argument("--intake", required=True)
    ap.add_argument("--url", default="http://localhost:3000")
    ap.add_argument("--dry", action="store_true", help="Run quickly without recording, to check every step.")
    ap.add_argument("--only", choices=["guest", "intake", "patient"], help="Dry runs: one part only.")
    args = ap.parse_args()
    tokens = {"patient": session_cookie(args.patient), "intake": session_cookie(args.intake)}
    tmp = OUT / f".tmp-{NAME}"
    shutil.rmtree(tmp, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--lang=en-AU"])
        if not args.dry:
            warm = browser.new_context(viewport={"width": 1440, "height": 900}, locale="en-AU", timezone_id="Australia/Brisbane")
            for role, path in ((None, "/refer"), ("intake", "/care/referrals"), ("patient", APP), (None, "/refer/app")):
                warm.clear_cookies()
                if role:
                    warm.add_cookies([{"name": "medisense_session", "value": tokens[role], "url": args.url}])
                pg = warm.new_page()
                pg.goto(args.url + path, wait_until="load", timeout=240000)
                pg.wait_for_timeout(2000)
                pg.close()
            warm.close()
        extra = {} if args.dry else {"record_video_dir": str(tmp), "record_video_size": {"width": 1440, "height": 900}}
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="en-AU", timezone_id="Australia/Brisbane", **extra)
        # The referral form inside the app is an iframe; captions and the title card stay on the page.
        ctx.add_init_script("if (window.top === window) {\n" + OVERLAY + "\n}")
        ctx.add_init_script("if (window.top === window) {\n" + cover(18) + "\n}")
        ctx.add_init_script(ROLE_CARD)
        page = ctx.new_page()
        d = Steady(page, args.url.rstrip("/"), 4.0 if args.dry else 1.0, True)
        started = time.time()
        ok = True
        try:
            if args.only in (None, "guest"):
                guest_referral(d)
                print("guest done", round(time.time() - started), flush=True)
            if args.only in (None, "intake"):
                intake(d, ctx, args.url, tokens)
                print("intake done", round(time.time() - started), flush=True)
            if args.only in (None, "patient"):
                if args.only:
                    d.go("/refer", 300)
                    lift_cover(d)
                signed_in_patient(d, ctx, args.url, tokens)
        except Exception as error:
            ok = False
            print(f"Stopped: {error}".splitlines()[0])
            page.evaluate("() => document.getElementById('__role')?.remove()")
            page.screenshot(path=str(OUT / f"{NAME}-failed.png"))
        video = page.video
        ctx.close()
        browser.close()
        if video and not args.dry:
            final = OUT / f"{NAME}{'' if ok else '-incomplete'}.webm"
            final.unlink(missing_ok=True)
            pathlib.Path(video.path()).rename(final)
            shutil.rmtree(tmp, ignore_errors=True)
            print(f"{'Saved' if ok else 'Saved partial'} {final} ({time.time() - started:.0f}s)")
        else:
            print("dry run", "ok" if ok else "stopped", f"{time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
