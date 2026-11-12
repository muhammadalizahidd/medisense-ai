# Claude Design brief: Medisense redesign

You are redesigning **Medisense**, a care-management and clinical-operations platform for an allied health provider. This brief is self-contained: it describes the product as it exists today, every screen you must design, the workflows the screens serve, the rules that must not break, and the design system (including a full theme and accent customisation system) you are to produce.

Read it all before designing. Where something is marked **[assumption]** or **[unknown]**, it was not verifiable from the code; design for it sensibly but flag it.

---

## 1. Project overview

### 1.1 The product and the business

- **Name:** Medisense (sometimes shown as "Medisense · Clinical Operations & Supervision"). Never rename it.
- **Domain:** community allied health in Brisbane, Australia. Therapists visit people **at home, at school or in the community**, or by **telehealth**.
- **Disciplines (9):** Occupational Therapy, Speech Pathology, Physiotherapy, Exercise Physiology, Psychology, Trauma Therapy, Dietetics, Podiatry, Nursing.
- **Services a referral can request (18):** Functional Capacity Assessment, SIL/ILO Housing Assessment, SDA Housing Assessment, Home Modification Assessment, Assistive Technology Assessment, Occupational Therapy, Speech Therapy, Swallowing Assessment, Speech/Language Assessment, Exercise Physiology, Physiotherapy, Psychological Assessment, Psychological Therapy, Trauma Therapy, Nursing (with a sub-type), Podiatry, Dietetics, Other.
- **Funding:** NDIS (Plan Managed, Self-Managed or Agency Managed), Workers Compensation, Aged Care, Private, Other.
- **Scale shown in the product:** 293 active patients, 20 therapists in two regions (Brisbane North, Brisbane South), 351 caseload places.

### 1.2 Two layers in one product

The application has grown in two layers that share one shell, sidebar and design system. You must design both as one product.

1. **Live care workflow (real, database-backed).** The full patient lifecycle from the client's functional requirements:
   - referral, intake, clinical triage, funding and consent;
   - therapist matching, booking, assessment, treatment plan;
   - visits, signed notes, telehealth, invoicing, review and discharge;
   - plus a patient app and live messaging.

   Everything updates in real time. These screens are under `/care/*`, `/therapist/*`, `/messages`, `/telehealth/room/*`, `/telehealth/recordings`, `/profile`, `/refer*`, `/join/*` and `/mobile/patient`.
2. **Operational intelligence modules (sample data).** Leadership, supervision and admin screens that run on a consistent synthetic dataset:
   - the organisation overview, team capacity and caseload health ("Healthy / Watch / At Risk");
   - AI insights, AI case notes, supervision briefs and reports;
   - schedule, tasks, smart forms, automations, admin operations;
   - the family portal and prototype mobile apps, ERP and hospital views.

   They tell a connected story for the director and stay in the product.

Some names overlap between the layers. Your design should make the difference clear without renaming routes:
- "Referrals & intake" (`/intake`, AI referral reading, sample) vs "Referrals and intake" (`/care/referrals`, live).
- "Billing and claims" (`/billing`, sample) vs "Billing" (`/care/billing`, live invoices).
- "Telehealth" (`/telehealth`, sample schedule of video visits) vs the live "Video room".

### 1.3 Users and roles

| User | Who | What they do |
|---|---|---|
| **Admin: Intake Officer, Scheduler, Finance** | Jo Marsh | Reviews referrals, requests missing information, records funding and consent, accepts referrals, matches therapists, runs billing |
| **Admin: Super Admin and Clinical Lead** | Neil Hensley (also the "Director" in the sample modules) | Makes clinical triage decisions, reviews assessments, reviews telehealth recordings, sees everything |
| **Therapist** | 20 named clinicians, e.g. Daniel Okafor (OT), Emma Clarke, Sarah Thompson | Accepts new patients, assesses, plans treatment, runs visits and video calls, writes and signs SOAP notes, reviews plans, discharges |
| **Patient or family** | Participants, parents and guardians, representatives | Refers themselves or is referred, follows progress with an app code, uses the patient app (visits, goals, reports, invoices, messages) |
| **Referrer (no account)** | Support coordinators, GPs, family | Sends a referral on the public form and answers questions through a private tracking link |
| **Sample-module personas** | Leadership (Neil), Admin (Jo), Supervisor (Grace Liu), Clinician (Sarah Thompson) | Used by the operational modules; the sidebar menu adapts to each |

Access is enforced before every page loads:
- Patients only ever see the patient app.
- Therapists can't open admin or leadership screens.
- Admins can't open a therapist's workspace.
- Clinical content (assessments, notes, plans) is visible only to the treating therapist, and read-only to a Clinical Lead. Other admins see statuses only. Finance sees invoices without clinical narrative.

### 1.4 The main workflows (live)

1. **Referral (no account):**
   - The public form (`/refer`, or inside the patient app) has 9 steps: About you, Participant, Funding, Contacts, Service location, Supports, Health and safety, Goals and documents, Review and send.
   - The result is a reference (MSR-XXXXXX), a private tracking link, and an **8-character app code**.
   - It appears instantly in the admin queue.
2. **Completeness and intake (rules):**
   - The completeness check flags gaps (e.g. NDIS plan document, plan manager), possible duplicates (a person decides), and risk ("Unknown" counts as needing review).
   - The admin requests information. The referrer answers and uploads documents on the tracking link.
3. **Clinical triage:** only a Clinical Lead decides (Accepted, More information, Waitlisted, Declined). A reported risk must have a management plan and a **precaution** that every therapist sees.
4. **Funding and consent:** funding verified or a documented exception, service agreement signed, consent recorded. Accepting creates **one patient record with one service request per support**.
5. **Matching:**
   - Therapists are ranked by credentials (registration and screening expiry, assessment scope), region, free capacity, caseload health and soonest slot. Ineligible clinicians show as Unavailable.
   - A low-risk rule can auto-allocate, but never when there's a risk or precaution.
   - The admin picks a time, which sends a request.
6. **Booking:** the therapist accepts and a series is booked (Weekly 8, Fortnightly 6, Monthly 4, Assessment 1). A live chat opens with the family.
7. **Assessment:**
   - Discipline templates (the OT/FCA bank has 14 sections) with consent, and each section marked applicable or not.
   - Reported and observed findings are kept apart; there are measures and functional activity records.
   - An AI consistency check, an optional Clinical Lead review, then signing (locked; amendments only).
   - A report can be released to the patient.
8. **Recommendation:** Report only completes the service; Treatment drafts a plan.
9. **Treatment plan:** goals with measure, baseline and target. The plan is approved and the patient sees the goals. Reviews decide Continue, Revise, Transfer or Discharge.
10. **Visits:**
    - A pre-visit summary and AI briefing, check-in with a safety confirmation, the session against the goals (measured values), check-out with actual minutes, or ending early as incomplete.
    - Then the SOAP note: AI draft from rough notes → Pending Signature → Final (signed; the patient sees a plain summary) → Amended.
11. **Telehealth:**
    - Clinical suitability, a one-time join link, the guest verifies with the participant's date of birth, four separate consents (video, recording, AI transcription, information sharing), device check, waiting room, admission.
    - Recording is off by default and blocked without consent and permission.
    - Recording review needs a stated purpose and is logged. A Clinical Lead can restrict or delete.
12. **Invoicing:**
    - A signed visit, late cancellation or "Did not attend" becomes a draft invoice line.
    - Finance sets support item numbers: Review → Approve → Issue → Partially Paid / Paid, plus Disputed → Adjusted, and Voided.
13. **Review and discharge:** the signed discharge (outcomes, risks, advice, handover) closes services, plans and the referral.
14. **Patient app:** activate with email plus the app code (the same code tracks the referral before acceptance). Tabs are Home, Visits, My care, Messages and Me.

### 1.5 Product objectives

- **The product's message:** "Systems supporting therapists", never "AI replacing therapists". Every AI output is visibly a **draft** that a person approves or signs.
- **Three layers, never mixed:**
  - **AI** drafts and suggests.
  - **Rules** compute, check and route; they're labelled as rules or automation.
  - **People** decide and sign.
- **Calm confidence:** pressure is explained ("why"), never shown as an alarm.
- **Density with breathing room:** data-rich pages that stay calm.

---

## 2. Existing technology and architecture (constraints for your design)

- **Framework:** Next.js 16 (App Router, `cacheComponents`, React Server Components), React 19, TypeScript strict.
- **Styling:**
  - Tailwind CSS v4 with design tokens declared as CSS custom properties in one stylesheet (`src/app/globals.css`, an `@theme` block).
  - Every colour, radius, shadow and type size is a token, e.g. `--color-surface`, `--color-ink-900`, `--color-accent`, `--color-accent-fill`, `--radius-card`, `--text-h1`, `--text-caption`.
  - Components use token utilities (`bg-surface`, `text-ink-700`, `rounded-card`), **never raw hex**.
  - **Your design system must therefore be expressible as tokens.**
- **Theme mechanics today:**
  - `<html data-theme="clear-blue">` sets the overall look, using a custom Tailwind variant `blue:`.
  - `<html data-palette="green|navy|mint">` swaps the palette; the default is blue. All values are listed in §9.0.
  - The palette is chosen from a theme menu in the top bar and stored in the browser, with a script that sets it before first paint (no flash).
  - There is **no dark mode** today.
- **Typography:** Instrument Serif (display; one weight, regular, never faux-bold), Instrument Sans (interface, 400–700, stylistic set `ss01`), JetBrains Mono (codes such as MSR-…, INV-…). Tabular figures are on by default.
- **Icons:** lucide-react (outline, 1.5–2px stroke).
- **Charts:** Recharts 3 wrapped in in-house components (`TrendChart`, `BarList`, `StackedColumns`, `DonutChart`, `Sparkline`). They're coloured from tokens: `--color-chart-*` and `--color-series-1..4`, which are validated for colour-vision separation.
- **No third-party UI kit.** All components are in-house (listed in §3.4).
- **Data and real time:**
  - MongoDB for the live workflow.
  - Server-sent events push changes, with a "Live" badge.
  - Zustand (persisted per tab) for the sample modules' state and audit trail.
- **AI:** an internal engine (Groq today) used for drafts. The UI must never show provider or model names to end users, except on a hidden presenter panel.
- **Access:** a request proxy checks the role before each page. Signed-in pages stream inside Suspense with a skeleton placeholder.
- **Implementation considerations for your design:**
  - Everything must map to tokens and shared components. Avoid one-off styles.
  - Server pages render a light skeleton first, so design loading skeletons for every page.
  - The patient app is shown on desktop inside a **phone frame** (a device mock-up with a status bar, an in-app header, a bottom tab bar and a home indicator). It must work full-screen on a real phone.
  - Dates are Australian (en-AU): "Tue, 10 Nov", "10:30 am". Currency is AUD.
  - The target desktop size is 1440×900; the product must also work down to mobile.

---

## 3. Complete application inventory

### 3.1 Application shell (every staff page)

- **Sidebar** (desktop; hidden on mobile):
  - The Medisense logo and name, with the subtitle "Clinical Operations & Supervision".
  - Grouped navigation with section labels, icons, active state and count badges (unread messages, items waiting, e.g. "Patients to review 14", "AI referrals 7", "AI notes 5").
  - The menu differs by role (§3.2). There's also a floating "Insight" pill at the bottom left.
- **Top bar:**
  - A breadcrumb (section › page).
  - The **Ask Medisense AI** search-style input with an "Ask" button.
  - A **+ New** quick-add menu.
  - The notifications bell with an unread badge (pinging).
  - An audit trail button (opens the Audit drawer).
  - The theme / palette menu.
  - The workspace / account menu: avatar, name, role title, My profile, Sign out, and role sync.
- **Mobile tab bar** (bottom) for staff on small screens.
- **Ask Medisense panel:** a slide-over assistant with workflow guide cards (Patient lifecycle, Therapist workflow, Telehealth, Billing, Roles and privacy, Try it), suggested questions per role, and answers. Each answer has a title, intro, linked items and sources, and the engine is labelled as AI, a guide or records.
- **Audit drawer:** a chronological trail of actions (who, what, when) and "Reset demo" for the sample modules.
- **Presenter panel:** hidden (Ctrl+Shift+.). It holds the role switcher, advance day, AI status and reset. Design it minimally; it's a tool, not a product screen.
- **Page header:** most pages open with a large dark-blue "hero" banner containing:
  - an eyebrow and a serif title;
  - a description;
  - actions on the right (Live badge, status tags, buttons).
- **Metric band:** a row of tinted stat cards (label, large serif figure, caption).

### 3.2 Navigation by role (sidebar groups as built)

- **Leadership (Director):**
  - **Organisation:** Overview, Since yesterday, Before and after, Team capacity, AI insights, Patients to review.
  - **Live care:** Referrals and intake, Patient onboarding, Therapists, Billing, Recordings, My profile.
  - **Intake & Admin:** Work queue, AI referrals, AI forms, Tasks, Admin Operations, Automations.
  - **Clinical:** Patients, Schedule, Telehealth, Hospital operations, ERP.
  - **AI workspace:** AI notes, AI reports.
  - **Supervision:** Caseloads, Supervision.
  - **Platform:** Family Portal, Security & Integrations, Roadmap.
  - **Mobile apps:** Staff app, Family app, Patient app.
  - **Business:** Billing and claims, Admin insights.
- **Admin:** Live care (Referrals and intake, Patient onboarding, Therapists, Billing, Recordings, My profile); Admin (Work queue, AI referrals, AI forms, Tasks, Admin Operations); Clinical (Patients to review, Patients, Schedule); AI workspace (Reports); Business (Billing and claims).
- **Supervisor:** Organisation and supervision items (Team capacity, AI insights, Patients to review, Caseloads, Supervision, Reports, Tasks).
- **Clinician (therapist):** Live care (My new patients, Messages, Recordings, My profile); My work (My day, AI session note, Tasks); AI workspace (AI notes, AI reports); Clinical (Patients, Schedule, Telehealth); Platform (Family Portal); Mobile apps (Staff app, Family app, Patient app).

### 3.3 Every screen (route → purpose → contents)

**Public and sign-in (no sidebar)**

| Route | Purpose | Contents |
|---|---|---|
| `/login` | One sign-in for staff and patients | Split layout: photo side with promises (Care at home, One care team, Always in touch, opening hours), and a form card with "Sign in" / "I have a code" segmented control, email, code, password (show/hide, Caps Lock warning), recovery note, and a local-only test account list |
| `/refer` | Public referral form | Brand header with "Staff and patient sign in" link. The 9-step form: a left step list (number, title, caption, done and error states) and a right card with the step heading, fields, Back and Continue. Draft saved on device; Fill sample data button; success screen with reference, app code, tracking link |
| `/refer/app` | The same form inside the patient app | Phone-first: sticky stepper (Step n of 9, serif step name, caption, 9-segment progress bar, Fill sample data), single column, sticky Back + Continue bar, success screen with "Back to the app" |
| `/refer/track/[token]` | Referrer's private tracking page | Reference, plain status sentence, vertical progress (Received → Intake review → Clinical review → Funding and agreement → Accepted), "We need more information" card (requested items, message, answer box, file upload), Withdraw referral, privacy note (no personal details shown) |
| `/join/[token]` | Guest video-visit join | Steps: Your details (name, relationship, participant DOB, authority), Your choices (4 consents), Device check (camera preview, mic, connection), Waiting room (clinician name, minutes waiting), the call (DEMO ONLY simulated video tiles, self-view, mic/camera/leave, red "Recording" badge when on), "Having trouble connecting?" (try again, phone call, rebook) |

**Live care: admin**

| Route | Purpose | Contents |
|---|---|---|
| `/care/referrals` | **Referrals and intake** queue | Hero with Live badge, Copy public form link, Public form, Enter a referral. Metric band (Intake review, Needs information, Clinical triage, Funding review, Waitlisted, Accepted). Segmented filter (Open, Intake review, Needs information, Clinical triage, Funding, Waitlist, Closed) + search. Table: referral (name, MSR ref, suburb, who referred), supports, funding, checks (Risk review, Possible duplicate, "n to confirm"), owner, updated, status tag |
| `/care/new` | Staff enter a referral by phone or email | The 9-step form in staff mode |
| `/care/referrals/[id]` | One referral's workspace | Hero: name, ref, age, suburb, funding, who sent it; Take ownership, Waitlist, Decline, Withdraw. A 5-stage strip (Received → Intake review → Clinical triage → Funding and consent → Ready for matching). **Tabs:** Next step · Referral as submitted · Documents and requests · History and audit. The Next step tab varies by status: Intake review (AI completeness review with suggestions, rules completeness list, possible duplicates with "same person / not the same", region selector, risk warning, Request information with tick list + message, Send to clinical triage); Clinical triage (reported diagnosis, behaviours and risk highlighted, decision pills, notes, risk management and precaution; read-only "waiting for a Clinical Lead" for others); Funding review (triage decision summary with precaution, funding summary, Verified/Exception, agreement Signed/Sent/Not required, consent tick, region, "Accept and create service requests" with blocker list); Accepted (app-code note or one-time invite code, Match therapists); Declined/Withdrawn outcome. Reason sheet for waitlist/decline/withdraw |
| `/care` | **Patient onboarding** board | Hero + New referral. Live banner "n new referrals waiting for intake · latest …". Metric band (Needs a therapist, Waiting for therapist, Active, Added this week, All patients). Filter + search. Table: patient, services (tags coloured by status with therapist), funding, added, stage |
| `/care/[clientId]` | Admin patient record | Hero: name, age, suburb, region, funding, stage, Discharge. Discharged notice with outcomes and handover. Red **precautions** banner. **Tabs:** Services and matching (one panel per service request: support · frequency, discipline · location · details, status tag, past declines, and the **match picker**: auto-allocate button, ranked therapist cards with avatar, Best match / Unavailable, seniority, caseload, session length, profile link, working pattern, time away, reason chips (good / neutral / warn), caseload tag, first-visit time chips, sticky "Send request" bar; then waiting / accepted states with Withdraw) · Visits (visit list) · Clinical progress (per-service assessment and plan statuses, read-only) · Details and documents (details list, notes, patient app access with reset / new code, documents with download, source referral link) · Activity (audit list) |
| `/care/therapists` | **Therapists** directory | Hero + Add therapist. Discipline select + search. Table: therapist (name, discipline, region, Inactive tag), working pattern, time off, caseload tag + numbers, rating stars |
| `/care/therapists/[id]` | Therapist record (admin view) | Hero with Reset password (temporary password shown once), Deactivate/Reactivate. Record: profile (bio, qualifications, languages), weekly hours, time off, stats, patients, feedback, history |
| (sheet) | **Add therapist** | Full name, work email, phone, discipline, region, seniority pills, caseload capacity, session length, working-day toggles, credentials (registration number and expiry, screening expiry, assessment scope ticks). Success state shows email + one-time temporary password with Copy |
| `/care/billing` | **Billing** (live invoices, Finance) | Hero. Metric band (Draft value, To review, Outstanding, Disputed, Paid). Filter (All, Draft, Review, Outstanding, Disputed, Closed) + search. Table: invoice number (mono), patient, payer + funding, lines, total, owing, checks ("n to resolve"), updated, status |
| `/care/billing/[id]` | One invoice | Exceptions panel ("To resolve before issuing"). Lines table: date, service, support item number (editable before approval), rate/h, amount, cancellation / adjustment tags; total, paid, owing; PROPOSED-rates note. Next step panel (Send for review, Approve, Issue to payer, Back to draft, Record payment amount + reference, Dispute / Void with reason, Add adjustment, Reissue). History list |
| `/telehealth/recordings` | **Recordings** (clinicians, Clinical Lead) | Retention note (90 days, PROPOSED). Per recording: patient · time, status tag (Processing, Available, Access Restricted, Deleted per policy), duration, "review for deletion" date; "Purpose of this review" + Review recording → DEMO ONLY playback (download disabled); access log; Clinical Lead: Restrict / Restore access, reason + Delete per policy |
| `/profile` | **My profile** (all staff) | Account details, change password; therapists: profile (bio, qualifications, languages), availability editor (working days and hours, time off), "Your record" (rating, stats) |

**Live care: therapist**

| Route | Purpose | Contents |
|---|---|---|
| `/therapist` | **My new patients** (therapist home) | Hero "Hello, {first name}", discipline · region, caseload "n of m", Live + caseload tag. **Tabs:** Today (all-caught-up note, new-request shortcut, Visits to record, Notes to write or sign, Coming up) · Requests (request cards: patient, age, support + frequency + details, funding, location, first visit, **precaution** in red, referral notes, Accept patient / Decline with reason) · My patients (rows: avatar, name, suburb · discipline · frequency, Open record, Message, Discharge / Discharged) · Recent visits |
| `/therapist/patients/[id]` | Therapist's patient record | Hero with Message and Discharge. Discharged notice, precautions banner. Metric band (Upcoming, Attended, Did not attend, Cancelled with late count, Their rating with stars). **Tabs:** Visits (Coming up, Visit history) · Clinical work (per service: assessment status with Start / Resume / Open / Reassess, plan status with goals achieved and review date, Create / Finish / Open plan) · Details and documents · History (timeline) |
| `/therapist/assessments/[id]` | **Assessment editor** | Hero: template title (e.g. "Functional Capacity Assessment (OT/FCA)"), kind, therapist, started, "Draft saved" autosave, status. Consent panel. One panel per section (prompt text, Applicability pills, Reported / Observed side by side, Measure field with "nothing is calculated for you", or Reason). Functional activities (repeatable cards: activity, how assessed, assistance level, frequency, safety, environment, observation, reported view). Clinical synthesis (findings, limitations, recommendation pills, notes). Sticky right rail "Before signing" (live checklist of safeguards → "Every safeguard is met", Sign assessment, Request Clinical Lead review, AI consistency check results, Cancel with reason). After signing: record (signed by, recommendation, amendments), Clinical Lead review / comments, Report for the participant (Draft with AI, plain-language summary, Release), Add amendment |
| `/therapist/plans/[id]` | **Treatment plan** editor | Hero: support + version + approval, autosave, status. Plan panel (clinical indication, interventions, frequency, duration, review date, precautions). Goals (editable cards: goal, domain, measure, baseline, target, status, rationale; read view shows baseline / current / target and history chips by date). Approve plan. Active: Start review → review panel (goal statuses, Decision pills Continue / Revise / Transfer / Discharge, next review date, interpretation, Record review). AI progress summary (AI draft tag, Draft again). Reviews history |
| `/telehealth/room/[visitId]` | **Video room** (clinician hosts) | Hero with Live, red Recording badge, call state. Dark call stage "DEMO ONLY · simulated video": participant tile, self-view (real camera), screen-share tile, participant list; controls (mute, video, share, record / pause / resume / stop, End call). Right rail: 1. Clinical suitability, 2. Join link (create, copy), 3. Waiting room (guest, relationship, verified, four consent tags, device, Admit), Recording (status, "I permit recording"), Participants (add support person or interpreter), Connection or safety problem (Reconnect, Switch to phone, Can't connect: rebook, Escalate to Clinical Lead), Call log. AI transcription panel (consented only; lines, "Participant said / I said", Add sample line). Wrap-up → note sheet |
| `/messages` | **Messages** (therapists) | Compact one-line header (icon, "Messages", count, unread, Live). Full-height split panel: left (search names and message text with highlight, Group by Recent / A–Z segmented, Unread filter; groups with sticky headings Unread / Today / This week / Earlier; conversation rows with avatar, name, last message, time, unread badge; "In messages" search hits); right (conversation header, live chat thread: day separators, grouped bubbles, sent / seen ticks, "Seen", typing indicator with animated dots, optimistic sending, failed + retry, composer with auto-grow textarea and round send button) |

**Live care: sheets and dialogs (shared)**

- **Visit sheet**, which runs a visit end to end:
  - Arrive / Session / Check out stepper.
  - Pre-visit summary and **AI briefing** (source-tagged points), precautions.
  - "Who is present", the safety tick, and the actual time if recorded late; Check in.
  - Goals addressed: measured today plus a note per goal, then interventions, response, incidents and follow-up.
  - Save progress, Save and check out, End visit early (reason plus what remains).
- **Session note sheet (SOAP):**
  - "Draft with AI" box (rough notes → Draft SOAP note), "AI draft" tag, and a list of what's missing.
  - Subjective, Objective, Assessment and Plan, plus the Summary for the patient.
  - Save draft / Ready to sign / Sign note.
  - Signed view: locked fields, amendments, Add amendment with reason.
- **Discharge sheet:** reason select, outcomes (required), outstanding risks, advice for the participant, referrals and handover, consequences list, sign tick, "Sign and discharge".
- **Cancel or change visit:** reason, who cancelled, the 48-hour notice rule with "may be charged", then new times to rebook.
- **Reason sheet** (waitlist, decline or withdraw a referral).
- **Visit list rows**, used everywhere:
  - Time and date, then the patient or discipline and therapist.
  - Series position or cancellation explanation, minutes and attendees, a draft-note or note preview, and the feedback stars.
  - Tags: Telehealth, Patient confirmed, a status label (Requested, Confirmed, Checked in, In progress, Completed (attended), Cancelled, Late cancellation, Did not attend, Aborted (incomplete), Rescheduled), Invoiced.
  - Actions: Start visit / Continue visit, Video room, Make telehealth / Make in person, Cancel or change, Did not attend, Write / Finish / Sign / View note.

**Patient app** (`/mobile/patient`, phone frame on desktop)

| Area | Contents |
|---|---|
| Welcome (signed out) | "New to Medisense? Make a referral" call-to-action → in-app referral overlay; sent card (reference, app code, Copy, Follow my referral); sign-in card ("I have a code" / "Sign in"; email + code, password optional to check progress); pending referral progress card (vertical steps, status sentence, Check again) |
| Home | Greeting with live dot avatar; next visit card (date block, countdown "Tomorrow / In n days", time, discipline · at home · visit n of m, therapist, Message, Change); "How was your visit?" rating prompts; Your care team (avatar, role, unread); matching progress for services still being matched; "n more visits booked" |
| Visits | Coming up (date · time, discipline + therapist, visit note, Cancel or change, Confirm I'll be there / You confirmed, Video visit tag, Join video visit), 48-hour notice note, Earlier and changed (status tag, patient summary, your rating / Rate this visit) |
| My care | Advice from your therapist (after discharge), plan goals (started → now → aim with Achieved), released reports, invoices (number, payer, date, total, status) |
| Messages | Conversation list → full-screen chat overlay (back, avatar with live dot, "typing…" / "connected live", chat thread) |
| Me | Signed in as, contact details and emergency contact editor, Need another service? (Request another service), Sign out |
| Overlays | Message banner sliding in from the top, rating sheet (stars + comment), cancel / change sheet, referral overlay |

**Operational intelligence modules (sample data)**

| Route | Purpose and contents |
|---|---|
| `/` **Overview** | Director dashboard. Greeting card ("Good morning, Neil Hensley", date, location; stethoscope photo variant in some palettes). KPI cards with sparklines: Active patients 293, Today's appointments 72, Notes due 17, Team capacity 83% with meter. Quick actions (New patient, Book appointment, Add clinical note, Create care plan, Log session, Generate report). Panels: Today's schedule, Patient status, Caseload overview / Caseload health (Healthy / Watch / At Risk), Notes overdue plus AI drafts awaiting approval, Team status, Recent AI notes, Patients to review; Live care panel (missed visits 30 days) |
| `/since-yesterday` | What changed overnight: reminders and escalations that fired (empty state text exists) |
| `/before-after` | Before vs after Medisense comparison for the story |
| `/team-capacity` | Utilisation by clinician (horizontal bars against configured capacity, dashed 100% line, colour by within / above / available), site and discipline filters, counts by status, **Suggestion: Rebalancing for review** card (Sarah 27/25 → Emma 18/24, never auto-acts), free capacity complexity-weighted |
| `/analytics` (AI insights) | Sessions delivered per week with cancellations, patient goals by status (428), billable hours, and more trend charts |
| `/patients-requiring-attention` | Attention queue: by operational reason (clickable bars filter the queue), by clinician (clay marks high priority), days since last contact, queue table |
| `/admin-insights` | Admin time by category, hours outside sessions per week, documentation hours against target |
| `/admin-queue` | Work queue for admin: tasks generated by the story (approvals, follow-ups) |
| `/intake` (AI referrals) | Sample AI referral intake: referral pipeline (received → first home visit), sources, referral queue, AI reading a pasted referral with source-linked extraction |
| `/forms` (AI forms) | Smart forms: form drafts pre-filled from verified patient data, template library |
| `/tasks` | Tasks & follow-ups with owners, due dates, overdue escalation |
| `/admin-operations` | Expiries ahead (plans, agreements, consents, staff checks), admin requests handled per week, staff compliance |
| `/automations` | Rules: runs per week by category, hours returned by rule, rule list with on/off (labelled automation, not AI) |
| `/my-day` | Clinician day (Sarah): greeting, today's visits with travel, patient panel, open tasks, latest case note, "from the approved note", My week, My tasks, family message alert |
| `/sessions/oliver-grant` (AI session note) | AI case-note workflow: dictate / type rough notes → AI draft (empty, generating, draft, edit, approved states) with SOAP sections, missing-info flags, versions, Accept / Edit / Regenerate, follow-ups |
| `/sessions/oliver-grant/prepared` | "What AI prepared" from the approved note (tasks, letters), out-of-date state when the note is reopened |
| `/case-notes/[caseId]` (AI notes) | Case note detail: Session Summary, Interventions, Progress / Observations, Next Actions, SOAP view, provenance marks |
| `/patients`, `/patients/[clientId]` | Sample patient directory and profiles (Emily Carter, Ruth Hallam, Mia Robinson, James Thompson): goals with progress (baseline → target, last six months), Add / Edit patient, visits, notes |
| `/schedule` | Sessions by day (home visits, telehealth, open slots), driving hours per clinician, Book visit |
| `/telehealth` | All video visits today (sample) |
| `/caseloads/sarah-thompson` | Caseload: complexity mix (patients and weighted units), funding streams, continuity of care, pressure breakdown ("why At Risk") |
| `/supervision/sarah-thompson` | AI supervision brief: protected supervision time, suggested agenda, flagged cases, previous actions, "Since the brief was prepared" live panel |
| `/reports`, `/progress-reports/emily-carter` | Reports library: by status (donut, click to filter), due ahead, turnaround; progress report document (current goals, interventions delivered, observed progress, barriers, recommended next steps) with draft / approve |
| `/portal`, `/family` | Family portal preview: next visit, practice at home, documents, messages, "What families can see" (clinic-set visibility toggles with live preview) |
| `/mobile/staff`, `/mobile/family` | Prototype phone apps (staff day on the road; family: next visit, practice at home, visits, request a change) |
| `/settings` | Security & Integrations: roles & permissions matrix (click cell; locked safety rows), AI guardrails, generic integrations, staff access |
| `/billing` | Billing and claims (sample): sessions by day by funding, value by funding, claim lines |
| `/hospital` | Hospital operations: today's theatre list with allied health review |
| `/erp` | Revenue and costs (6 months), where costs go, revenue by service, money owed |
| `/roadmap` | Product roadmap (phases) |

`/design-preview/*` are retired mock-ups that redirect to the real screens. **Do not design them.**

### 3.4 Shared components (one design each, used everywhere)

**Navigation and layout**
- **App shell:** Sidebar (groups, items, icons, badges, active), TopBar (breadcrumb, assistant input, quick-add, bell, audit, theme menu, account menu), mobile TabBar.
- **PageHeader / page hero:** eyebrow, title, description, actions, leading slot. Also **PageLoading**, the skeleton shown while the session loads.
- **Tabs:** sticky under the top bar, with counts (an alert style for waiting items), arrow-key navigation, and the selected tab kept in the URL.
- **Segmented control:** filter groups.
- **FilterChips.**
- **Stepper:** desktop vertical step list, phone segmented progress bar, small horizontal stage strip.

**Data display**
- **Panel / Card:** title, optional action, body. Plus CardTitle and Caption.
- **MetricBand:** stat cards (label, serif figure, caption, tone over / monitor, flagged).
- **Table:** header and rows, sortable look, hover, compact density, row links. Plus StatRow.
- **Tag:** tones healthy, monitor, over, available, neutral, outline, live. Plus StatusTag, PriorityTag, StageTag, CaseloadTag ("Healthy / Watch / At Risk", the platform's one status scale: Healthy below 60, Watch 60–79, At Risk from 80) and LevelDot / Complexity.
- **Avatar** (initials), **Ring** (progress ring), **CapacityMeter**, **Stars** (display and input).
- **LiveBadge:** a pulsing dot with Live / Reconnecting / Offline.
- **Charts:** TrendChart, BarList, StackedColumns, DonutChart, Sparkline, with tooltips and legends.
- **AI marks / Provenance:** AI draft labels and source links.
- **DocumentList** (file rows) and the **audit timeline** (dot-and-line history).

**Forms and inputs**
- **Button / ButtonLink:** primary, secondary and ghost, each in md and sm.
- **Select:** a custom listbox; never a native select.
- **SearchField.**
- **Field + input:** label, hint, error, and "(optional)" suffix.
- **Choice pills:** a radiogroup of selectable pills.
- **Tick:** a checkbox card for declarations and consents.
- **Switch** and **TextArea**.

**Feedback and overlays**
- **Sheet:** a right-side drawer with title, description, body and sticky footer, focus-trapped, closed with Escape.
- **Toast / banner:** the live message banner and the new-referrals banner.
- **EmptyNote** (dashed card), **ErrorNote** (with retry), **Skeleton**.

**Patient app**
- PhoneFrame, AppHeader, AppCard and AppSheet (bottom sheet).
- Chat: ChatThread, Bubble, TypingIndicator, ChatOverlay.

---

## 4. UX assessment of the current interface (problems to solve)

Be specific in solving these; they were observed in the product.

1. **The page hero takes too much height.** Every page opens with a tall dark-blue gradient banner. On working pages (records, editors, queues) it pushes content below the fold. The Messages header has already been made compact for this reason. Design a compact page header for working screens and keep a larger hero only for landing dashboards.
2. **The design language is inconsistent.**
   - The original design guidelines banned gradients, glow, sparkle icons and shadows on resting cards.
   - The current blue theme uses a gradient hero, tinted gradient stat cards, glow on primary buttons, and sparkle / wand icons for AI.
   - Decide one coherent direction and apply it everywhere.
3. **Duplicate-looking modules** (sample vs live, see §1.2): Referrals & intake vs Referrals and intake; Billing and claims vs Billing; Telehealth vs Video room. The sidebar has 9 groups and over 40 items for Leadership. Restructure the information architecture visually (grouping, collapsible groups, "Live care" prominence) without removing routes.
4. **Long single-page forms and records.** Referral detail, patient records and the therapist home were cluttered until tabs were added. The tab pattern now exists but needs a refined, consistent design.
5. **Tables overflow on smaller screens** (min-widths of 800–960px force horizontal scroll). Design responsive table behaviour: priority columns and stacked rows on mobile.
6. **Status vocabulary is rich but visually noisy.** Many tag tones sit side by side (status, checks, telehealth, confirmed, invoiced). Define a clear hierarchy: primary status vs secondary meta.
7. **Many different selection patterns:** pills, segmented controls, selects, ticks and toggle buttons. Standardise when to use each.
8. **AI vs rules vs people are labelled inconsistently** across screens (some AI outputs are tagged "AI draft", others only by a sparkle icon). Create one visual language for the three layers.
9. **Feedback is thin in places.** Some actions only change text ("Saving…", "Draft saved"); errors appear as plain red text. Design toasts, inline success, optimistic states and consistent error placement.
10. **The patient app inside the phone frame** had overflow and scroll issues; the in-app referral form needed its own phone layout. Design the patient app as a first-class mobile product.
11. **Dark mode and accessibility for long sessions are absent.** Therapists document for hours, so provide dark and low-glare themes (see §8).
12. **The serif display font is used at small sizes in places,** where it looks weak. It must be limited to large sizes.

---

## 5. Design direction

**North star:** *A calm, precise clinical instrument with editorial confidence.* It should feel premium, quiet and trustworthy, like professional medical and financial software, not a template admin panel. The quality bar is Linear, Stripe, Vercel, Raycast and Supabase; do not copy them. The identity must be appropriate to healthcare: humane, warm and legible, never cold or "AI-futuristic".

- **Visual identity:**
  - Mostly neutral surfaces, with colour used for meaning: the primary action, status and selection.
  - AI provenance gets one restrained mark.
  - No decorative illustrations or stock imagery inside working screens. The sign-in page and the director's greeting may use one calm photograph.
- **Typography** (keep the existing families):
  - **Instrument Serif** for page titles, large figures and hero greetings (≥ 24px, regular weight, tight leading 1.0–1.1).
  - **Instrument Sans** for everything else (14px base; semibold for small headings, panel titles and labels).
  - **JetBrains Mono** for references, codes, item numbers and keyboard hints.
  - Uppercase tracked labels (11px, 600, 0.08em) for eyebrows and column headers.
  - Tabular figures for all numbers.
- **Spacing:** a 4px grid. Generous page margins (desktop 40px), panels padded 20–24px, dense tables (36–44px rows). Content max width for reading-heavy screens; full width for queues and tables.
- **Colour:**
  - Neutral scales per theme, one accent (customisable), and fixed semantic colours: success / "Healthy", warning / "Watch", critical / "At Risk" or over, and info / "available". Each has text, tinted background and dot variants.
  - A live / real-time colour.
  - A chart palette that is colour-vision safe.
- **Borders and depth:**
  - Hairline borders (1px, low-alpha ink) as the main separation.
  - Subtle elevation only for overlays (menus, sheets, popovers) and for lift on hover.
  - Radius scale: tag 6, control 10–12, card 16–20, sheet 24–28. Pick and document the values.
- **Layout principles:** a left sidebar, a top bar, then the content column. Records use a main column with a right rail for actions and status. Editors use a sticky right rail ("Before signing", "Next step"). Queues have filters at the top, a table and inline status.
- **Component philosophy:** one component per pattern, token-driven, every state designed (default, hover, focus, active, selected, disabled, loading, error, empty), and keyboard-first.

---

## 6. Global application layout

- **Sidebar:**
  - 248–264px wide, collapsible to an icon rail (64px) with tooltips.
  - Group labels with optional collapse; "Live care" pinned at the top for operational roles.
  - Active item shown clearly (filled pill or accent bar); count badges (unread, waiting) in a consistent style.
  - Logo block at the top; a role / account block or help link at the bottom. The floating "Insight" pill should become part of the design or be redesigned.
- **Top bar:**
  - 56–64px tall: breadcrumb, a centred **Ask Medisense** command field (⌘K, opens the assistant), "+ New" quick-add, notifications (unread badge), audit trail, appearance, and the account menu (avatar, name, role title).
  - Stays sticky on scroll. Tabs pin directly beneath it.
- **Page header:** two variants.
  - *Landing hero* for dashboards (Overview, My new patients greeting).
  - *Compact header* for working pages: a breadcrumb or back link, a serif title, a one-line meta row (age · suburb · funding, reference in mono), status tags and actions on the right.
  - The Live badge always sits in the header.
- **Main content:** 12-column grid; panel spacing 24px; sticky tab bar; right rails sticky inside the scroll.
- **Search:** the assistant field doubles as global search for patients, referrals, invoices and screens. **[assumption: global record search is not built; design it as part of the command field and mark it for implementation.]**
- **User controls:** account menu (My profile, Appearance, Sign out); role shown under the name.
- **Responsive navigation:**
  - ≥1280: full sidebar.
  - 1024–1279: collapsed rail.
  - <1024: sidebar becomes a drawer and the bottom tab bar appears for the key destinations.
  - Public pages and the patient app have no sidebar.

---

## 7. Screen-by-screen redesign instructions

For every screen: keep all existing content and actions (§3.3). Apply the compact header unless stated, and design loading, empty and error states.

### 7.1 Sign-in (`/login`)
- Elegant split screen, with the brand side (photograph, three promises, hours) and a form card.
- Polish the "Sign in / I have a code" switch.
- "I have a code" explains that the code comes from the referral or the care team, and that the password is optional to check progress.
- Show/hide password, Caps Lock warning, recovery guidance and a local-only test-accounts disclosure.
- Mobile: the form only, with the brand mark on top.

### 7.2 Public referral form (`/refer`) and in-app form (`/refer/app`)
- **Desktop:** a left vertical stepper (numbers, titles, captions, done ticks, error state), a right form card, and a sticky footer with Back and Continue (Send referral on the last step).
- **Phone:** a sticky top stepper (Step n of 9, serif step name, caption, 9-segment bar, tap to go back), one column, and a sticky bottom bar with Back and full-width Continue.
- Design every step's fields, using the Choice pills for options:
  - **Funding:** a conditional NDIS block (number, plan end, plan type, funding periods, plan manager).
  - **Contacts:** coordinator, signatory and booking contact, each with role pills.
  - **Location:** pills for Home / School / Telehealth / Daycare / Day Program / Other community, an address and a location contact.
  - **Supports:** a card grid grouped into Assessments and Therapy, with frequency pills, nursing type and "Other" details.
  - **Safety:** Yes / No / Unknown, with conditional details.
  - **Documents:** a drag-and-drop upload with per-file type selects.
  - **Review:** a summary list plus two consent ticks.
- **Fill sample data** is a subtle secondary control.
- **Success screen:** large reference, a prominent **app code** card with Copy and instructions, the tracking link with Copy, and next steps.

### 7.3 Referral tracking (`/refer/track/[token]`)
- Calm status page: the reference in mono, a plain status sentence and a vertical progress tracker.
- An "information needed" card with the list, the message, an answer box and uploads.
- Withdraw with confirmation, and a privacy note. No personal data shown.

### 7.4 Referrals and intake (`/care/referrals`)
- A queue optimised for triage speed: status filter with counts, search, and the table.
- Make the **checks** column scannable: Risk review, Possible duplicate and "n to confirm" as small icon tags.
- Row hover reveals the owner and a quick open. Consider a preview drawer on row click. **[optional]**

### 7.5 Referral workspace (`/care/referrals/[id]`)
- A compact header with the stage strip (5 stages), and the tabs below.
- The "Next step" tab is the hero: one clear primary action per status.
- **Intake view:** an AI suggestions card (labelled AI, "suggestions only"), a rules checklist, a duplicate-decision card, and a region selector.
- **Triage view:** the clinical summary with risk highlighted, then the decision.
- **Funding view:** two columns (summary vs decisions), and a blocker list before **Accept**.
- **Accepted:** a success state with the app-code note or a one-time code card.
- The "Referral as submitted" tab is a read-only document layout. History and audit is a timeline.

### 7.6 Patient onboarding (`/care`)
- A live board: the new-referrals banner and a metric band.
- A table of patients with service tags (status colour plus therapist).
- Consider a Kanban alternative view: Needs a therapist / Waiting / Active. **[optional]**

### 7.7 Admin patient record (`/care/[clientId]`)
- Precautions are always visible under the header.
- **Services and matching:** each service request is a card.
  - The **match picker** is a key screen: a ranked list with clear eligibility (Unavailable greyed with a reason), reason chips, working pattern, time off, and time-slot chips.
  - A sticky confirmation bar.
  - Auto-allocate is a secondary action with an explanation when it's refused.
- **Visits:** the shared visit list.
- **Clinical progress:** statuses only, read-only.
- **Details and documents:** a two-column layout. The app-access card has reset and new-code actions.
- **Activity:** a timeline.

### 7.8 Therapists (`/care/therapists`, `/care/therapists/[id]`, Add therapist)
- **Directory:** filters and a table with availability, time off, caseload tag and rating, plus an Inactive state.
- **Record:** a profile header (avatar, discipline, region, status), availability, credentials (expiry warnings), patients, feedback and history.
- **Add therapist:** a sheet with sections (Profile, Work pattern, Credentials). The success state shows the temporary password once, with Copy.
- **Reset password:** a confirmation, then a one-time password.
- **Deactivate:** an inline confirmation.

### 7.9 Billing (`/care/billing`, `/care/billing/[id]`)
- **List:** a finance-grade table with amounts right-aligned, owing emphasised, and status tags matching the invoice states.
- **Invoice:** a document-like layout.
  - The exceptions banner at the top, and the lines table with inline-editable item numbers (mono).
  - A totals block, and the action panel with the status-appropriate primary action.
  - Payment entry, dispute / void reason, an adjustment form and the history timeline.
  - The PROPOSED-rates note stays.

### 7.10 Recordings (`/telehealth/recordings`)
- One card per recording with a status tag.
- A purpose field gates the review, then the DEMO ONLY player (download disabled).
- The access log as a compact table.
- Clinical Lead controls (restrict, delete with reason) separated as a danger zone.

### 7.11 My profile (`/profile`)
- Sections: Account, Password, Professional profile (therapists), Availability (a weekly hours editor plus a time-off list), Your record (stats and rating).
- **Add an Appearance section here** (§9).

### 7.12 Therapist home (`/therapist`)
- A greeting header (it may keep the hero), with caseload and status.
- **Tabs:**
  - **Today:** an action-first list, with the "all caught up" state, the new-requests shortcut, then Visits to record, Notes to sign and Coming up.
  - **Requests:** rich request cards, with the precaution as a high-contrast callout and Accept / Decline.
  - **My patients** and **Recent visits.**

### 7.13 Therapist patient record (`/therapist/patients/[id]`)
- Header actions (Message, Discharge), the precautions banner and the metric band.
- **Tabs:** Visits, Clinical work (service cards with assessment and plan status and next actions), Details and documents, History.

### 7.14 Assessment editor (`/therapist/assessments/[id]`)
- A long-form clinical editor:
  - Section navigation (a mini table of contents with completion state).
  - Sticky "Before signing" rail with a live safeguards checklist.
  - An autosave indicator.
  - Applicability pills, and side-by-side **Reported** vs **Observed**.
  - Measure fields with an explicit "entered by clinician" affordance, and repeatable activity cards.
- Signing locks the editor, which shows a signed state, amendments and the report-release card with AI draft labelling.
- The Clinical Lead review state appears when Awaiting Review.

### 7.15 Treatment plan (`/therapist/plans/[id]`)
- Goal cards with baseline → current → target as a compact progress visual, without combining scales into a percentage.
- A history of readings by date.
- Approve, then active, then the review flow with decision pills.
- An AI progress summary card labelled as an AI draft.

### 7.16 Visit sheet, SOAP note sheet, discharge sheet, cancel sheet
- Consistent sheet anatomy: header, a progress stepper where multi-step, scrollable body and a sticky footer.
- The visit sheet's Arrive → Session → Check out flow must be very clear on a tablet in a client's home (large tap targets).
- **SOAP sheet:** an AI drafting area visually separated and labelled, four SOAP fields, the patient summary, and three footer actions (Save draft, Ready to sign, Sign note). The signed state is locked, with amendments.
- **Discharge sheet:** a serious, deliberate design, with the consequences list and the signature tick.

### 7.17 Video room (`/telehealth/room/[visitId]`) and guest join (`/join/[token]`)
- **Room:** a dark call stage (always dark, whatever the theme) with a DEMO ONLY label.
  - Participant tiles, self-view, screen share, and a recording indicator visible to all.
  - A control dock: mute, video, share, record / pause / stop, and End call in red.
  - The right rail is a numbered checklist (Suitability → Link → Waiting room) plus Recording, Participants, Problems and Call log.
  - AI transcription appears only with consent.
- **Guest join:** a calm, reassuring multi-step flow on a public page, mobile-first. Separate consent cards, a device-check preview and a waiting-room state, with trouble options always reachable.

### 7.18 Messages (`/messages`)
- Keep the compact header and the full-height split view.
- Polish the conversation list: grouping headers, search highlighting, unread emphasis.
- The chat follows modern messaging conventions: bubbles, grouping, day separators, ticks and typing dots.
- Mobile: list → conversation navigation.

### 7.19 Patient app (`/mobile/patient`)
- Design as a native-quality mobile app (iOS / Android sensibility), shown in the phone frame on desktop.
- A welcome / onboarding screen with "Make a referral" as the primary CTA and the code sign-in.
- Home: next-visit hero card, ratings, care team and matching progress.
- Visits: confirm, join video, cancel or change, history with summaries and ratings.
- My care: goals with progress visuals, reports and invoices.
- Messages: list + chat. Me: profile, request another service, sign out.
- Bottom tab bar with badges, bottom sheets and in-app banners.
- Respect safe areas, with no scrollbars visible.

### 7.20 Overview (`/`)
- The director's landing dashboard: greeting hero (date, location) and KPI cards with sparklines.
- Quick actions as a refined action row, not giant tiles.
- Today's schedule, patient status, caseload health (Healthy / Watch / At Risk), notes overdue and AI drafts awaiting approval, team status, recent AI notes, patients to review, and the live care panel.
- Dense but calm; every figure consistent.

### 7.21 Team capacity, AI insights, Admin insights, Patients requiring attention, Caseloads
- **Chart-led analytical pages:** filter bar (site, discipline, period), metric band, a primary chart and secondary charts. Interactive charts (click to filter) need visible affordance.
- **Team capacity:** the utilisation bars with the 100% line and the "Rebalancing for review" suggestion card (clearly a suggestion that never auto-acts; it shows from → to with numbers).
- **Caseloads:** "why At Risk" pressure breakdown, complexity mix, funding, continuity.
- **Attention queue:** reason chart + table filters.

### 7.22 Supervision brief (`/supervision/sarah-thompson`)
- A document-like AI brief: agenda, flagged cases, previous actions, protected time, and a live "Since the brief was prepared" panel.
- Clearly marked as an AI draft for the supervisor to confirm.

### 7.23 AI session note, What AI prepared, AI notes (`/sessions/*`, `/case-notes/*`)
- The flagship "AI drafts, clinician approves" experience. Design every mode: empty, dictating, generating (progress), draft (sections with provenance and missing-info flags), editing, approved (locked) and versions.
- Accept / Edit / Regenerate are clear.
- "What AI prepared" lists the follow-on drafts with approve and dismiss, plus an out-of-date state.

### 7.24 Work queue, Tasks, AI referrals, AI forms, Admin operations, Automations
- **Work queue / Tasks:** a list with owner, due, priority and overdue escalation; inline complete and assign; filters.
- **AI referrals (`/intake`):** the pipeline funnel, sources, queue and AI extraction with source lines.
- **AI forms:** drafts pre-filled from patient data (show the provenance of each field), plus a template library.
- **Admin operations:** an expiry calendar / list, request volume chart and staff compliance table.
- **Automations:** a rule list with on/off switches, runs and hours-returned charts, and clear "Automation" (not AI) labelling.

### 7.25 Schedule and Telehealth (sample)
- **Schedule:** a week view by clinician and day (home visits, telehealth, open slots, travel), driving hours, Book visit sheet.
- **Telehealth (sample):** today's video visits list linking to the experience.

### 7.26 Sample patients, Reports, Progress report
- **Patients:** directory and profile with goal progress charts, visits, notes, Add / Edit patient.
- **Reports:** a library with status donut filter, due-ahead list and turnaround; the progress report as a printable document with draft / approve.

### 7.27 Family portal, Staff app, Family app
- **Family portal:** a preview of what families see, with clinic-set visibility toggles and a live preview.
- **Staff and family apps:** the same mobile design language as the patient app.

### 7.28 Security & Integrations, Billing and claims (sample), Hospital, ERP, Roadmap, Since yesterday, Before and after
- **Security & Integrations:** a permission matrix (role × permission, with locked safety rows visibly locked), AI guardrails, generic integrations (no vendor names) and staff access.
- **Billing and claims:** financial charts and a claim-lines table.
- **Hospital:** the theatre list table with allied health review status.
- **ERP:** finance charts.
- **Roadmap:** a phase timeline.
- **Since yesterday:** a change feed with an empty state.
- **Before and after:** a side-by-side comparison layout.

---

## 8. Complete design system (deliverable)

Define and document the following as tokens and components.

1. **Typography scale** (name, size, line height, weight, family, use):
   - display 54/1.02 serif; h1 32–40/1.05 serif; h2 24/1.15 serif; section 16 sans semibold; body 14/1.5; small 13; caption 12; eyebrow / label-caps 11 uppercase 0.08em; mono 12–13.
   - Serif only ≥ 24px.
2. **Spacing scale:** 4px base (2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64). Panel padding, page gutters and table row heights.
3. **Radius, borders and elevation:** radius tokens; border tokens (hairline, strong, focus); shadow tokens (none at rest; overlay; lift on hover).
4. **Colour tokens per theme:** page, canvas, surface, raised, sunken, border, border-strong, grid, ink 900 / 700 / 500 / 400, sidebar set (background, ink, muted, hover, active, active-ink, border), topbar, accent set (accent, hover, tint, fill, fill-hover, fill-pressed, on-accent), semantic sets (healthy, monitor, over, available, live; each text / bg / dot), draft (AI) surface and rule, chart and series palettes, focus ring.
5. **Component library**, with every state:
   - **Buttons:** primary, secondary, ghost, danger; md, sm and icon. Plus loading.
   - **Inputs:** text, textarea (auto-grow), select listbox, search, date / time, file upload (drag and drop), Choice pills, ticks / checkbox cards, switch, segmented, stepper fields.
   - **Tables:** dense / comfortable, sortable headers, sticky header, row actions, selection, responsive stacking, numeric alignment, empty / loading rows.
   - **Forms:** field anatomy (label, optional, hint, error, character count), sectioning, multi-step layout.
   - **Dialogs and drawers:** sheet (right), bottom sheet (mobile), confirmation dialog, destructive confirmation.
   - **Notifications:** bell dropdown list, toasts (success, info, warning, error), in-page banners, the live message banner.
   - **Status indicators:** tags (status vs meta), dots, LiveBadge, stage strips, progress (bar, ring, segmented), Stars, CapacityMeter, caseload status.
   - **Navigation:** sidebar item, group, badge, tabs (with counts), breadcrumb, pagination **[assumption: not built; design for long lists]**.
   - **Cards and panels:** panel, metric card, record header, timeline item, document row, chat bubble.
   - **AI language:** one consistent "AI draft" marker (label + subtle draft surface), "Suggestions only" note, provenance / source chips, and a separate "Rule" / "Automation" marker. People's approvals are shown as signatures (name + time + lock).
   - **Skeletons, empty states and error states:** a consistent pattern with a short message and one action.
6. **Iconography:** lucide outline icons, 16 / 20 / 24 sizes and a stroke rule. Define icons for each module and status. Replace the generic sparkle / wand for AI with a restrained, consistent AI mark.
7. **Charts:** axis, grid and tooltip styles, colour order, interactive states, and theme-aware palettes.

---

## 9. Advanced theme system (critical)

Today: one look with 4 selectable palettes (Blue default, Green, Navy rail, Mint), light only, chosen in the top bar and stored in the browser. Design a complete theme system that replaces it **and keeps every current palette** (§9.0).

### 9.0 Current palettes (exact values from the code; carry all of them forward)

These are the palettes in the product today, plus two from its history. **Every one must exist in the new system as a named theme,** refined but recognisable: same hues, same character, same role for each colour.

| # | Palette | Status today | Character |
|---|---|---|---|
| 1 | **Clinical Blue** | Selectable, the default | White page, pale-blue canvas and sidebar, a solid blue active nav item, a midnight-to-blue hero |
| 2 | **Green** | Selectable | White page, pale-green canvas and sidebar, success-green accent, a deep forest-green hero |
| 3 | **Navy rail** | Selectable (colour spec option 01) | A dark navy-charcoal sidebar, a low-glare grey-green canvas and an evergreen accent |
| 4 | **Mint** | Selectable (colour spec option 02) | A white sidebar with pale-mint hover, a mint-tinted canvas and an evergreen accent |
| 5 | **Olive Green** | Retired; from the original "Warm Clinical Editorial" system (`docs/design-system.md`) | Warm paper surfaces, a warm-beige sidebar and a muted evergreen / olive accent with sage. **Bring it back as a theme.** |
| 6 | **Warm Editorial (bronze)** | The code's fallback values, not selectable | Ivory page, an obsidian sidebar with ivory text, a bronze text accent and champagne fills |

Fonts, radius and type scale are shared by palettes 1–4: tag 6px, control 12px, card 20px, sheet 28px, nav item 12px. Palettes 5–6 used tighter radii: tag 4px, control 6px, card 10px, sheet 14px.

#### Surfaces, ink and sidebar

| Token | Clinical Blue | Green | Navy rail | Mint | Olive Green | Warm Editorial |
|---|---|---|---|---|---|---|
| page | `#ffffff` | `#ffffff` | `#f7faf9` | `#f8fbfa` | `#f5f1ea` | `#f5f3ee` |
| canvas | `#f4f8fe` | `#f2faf5` | `#eef5f2` | `#eef7f2` | `#f5f1ea` | `#f5f3ee` |
| surface (cards) | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` | `#fcfaf6` | `#ffffff` |
| surface-raised | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` |
| surface-sunken | `#f6f9fe` | `#f5fbf7` | `#f3f8f6` | `#f4faf7` | `#eee9e0` | `#faf8f3` |
| border | `rgb(16 40 80 / .09)` | `rgb(8 60 35 / .10)` | `rgb(23 43 54 / .10)` | `rgb(32 52 72 / .10)` | `#e2dbcf` | `rgb(23 21 15 / .08)` |
| border-strong | `rgb(16 40 80 / .18)` | `rgb(8 60 35 / .20)` | `rgb(23 43 54 / .20)` | `rgb(32 52 72 / .20)` | `#cfc6b7` | `rgb(23 21 15 / .16)` |
| grid (charts) | `rgb(16 40 80 / .07)` | `rgb(8 60 35 / .07)` | `rgb(23 43 54 / .07)` | `rgb(32 52 72 / .07)` | `rgb(23 21 15 / .06)` | `rgb(23 21 15 / .06)` |
| ink-900 (primary text) | `#0b1533` | `#0a2015` | `#1f2937` | `#203448` | `#1e1c19` | `#17150f` |
| ink-700 (secondary) | `#475467` | `#3f5249` | `#4b5563` | `#47586a` | `#4a453e` | `#5e5b54` |
| ink-500 (labels) | `#566379` | `#4f6359` | `#525d6b` | `#506173` | `#7a7368` | `#6b6860` |
| ink-400 (faint) | `#5f6b80` | `#58695f` | `#5a6573` | `#58687a` | `#a39c90` ⚠ | `#716e66` |
| sidebar | `#f4f8fe` | `#f2faf5` | `#172b36` (dark) | `#ffffff` | `#efeae1` | `#0a0b0d` (dark) |
| sidebar-ink | `#101c35` | `#0a2015` | `#f3f7f5` | `#203448` | `#1e1c19` | `#f5f3ee` |
| sidebar-muted | `#475467` | `#3f5249` | `rgb(243 247 245 / .74)` | `#47586a` | `#4a453e` | `rgb(245 243 238 / .62)` |
| sidebar-hover | `#e4eefd` | `#e1f5e9` | `rgb(243 247 245 / .08)` | `#e8f7f0` | `#e3ece6` | `rgb(245 243 238 / .06)` |
| nav-active (fill) | `#1570ef` | `#08844a` | `#0d7a43` | `#0d7a43` | `#e3ece6` (tint) | `rgb(245 243 238 / .06)` + 2px `#c9a96a` rule |
| nav-active-ink | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` | `#2e5a4c` | `#c9a96a` |
| topbar | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` | **[unknown]** canvas assumed | `#f5f3ee` |

⚠ Olive Green's `ink-400` (`#a39c90`) is below 4.5:1, so it was for placeholders and disabled text only. Fix it in the redesign.

#### Accent

| Token | Clinical Blue | Green | Navy rail | Mint | Olive Green | Warm Editorial |
|---|---|---|---|---|---|---|
| accent (text, links) | `#175cd3` | `#067a42` | `#0d7a43` | `#0d7a43` | `#2e5a4c` | `#8a6a2b` (bronze) |
| accent-hover | `#1849a9` | `#05602f` | `#0a6337` | `#0a6337` | `#244a3e` | `#6f5521` |
| accent-tint | `rgb(21 112 239 / .10)` | `rgb(8 132 74 / .10)` | `#dff4e8` | `#dff4e8` | `#e3ece6` | `rgb(201 169 106 / .16)` |
| accent-fill (primary button) | `#1570ef` | `#08844a` | `#0d7a43` | `#0d7a43` | `#2e5a4c` | `#c9a96a` (champagne) |
| fill-hover | `#175cd3` | `#067a42` | `#0b6a3a` | `#0b6a3a` | `#244a3e` | `#d6b97e` |
| fill-pressed | `#1849a9` | `#05602f` | `#095a31` | `#095a31` | `#1c3b31` | `#b39454` |
| on-accent | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` | `#ffffff` | `#14110a` |
| secondary accent | `#0e9f8e` (teal) | `#12b76a` | `#18a05e` (fills, dots, charts only, never text) | `#18a05e` (same rule) | `#8fae9c` (sage) | `#4a8a84` (teal) |
| primary sheen (button gradient) | `#2f84f5 → #1257d6` | `#0d9a57 → #067a42` | `#18a05e → #0d7a43` | `#18a05e → #0d7a43` | none (flat) | none (flat) |
| focus ring | 2px surface + 2px `#1849a9` | 2px + `#05602f` | 2px + `#0a6337` | 2px + `#0a6337` | 2px + `#244a3e` | 2px + `#6f5521` |

On the Navy rail sidebar, accent text uses mint `#6cc592`, because the evergreen is too dark to read there.

#### Semantic, AI draft and charts

| Token | Clinical Blue | Green | Navy rail / Mint | Olive Green | Warm Editorial |
|---|---|---|---|---|---|
| healthy text / bg / dot | `#067a55` / `rgb(18 183 106 / .12)` / `#12b76a` | `#05693b` / `rgb(18 183 106 / .13)` / `#12b76a` | `#0a6b3c` / `rgb(24 160 94 / .13)` / `#18a05e` | `#3d6e4f` / `#e5efe6` / `#5a8f6a` | `#22704e` / `rgb(46 139 99 / .10)` / `#2e8b63` |
| monitor ("Watch") | `#a8480a` / `rgb(247 144 9 / .13)` / `#f79009` | same as Blue | same as Blue | `#8a5a12` / `#f5e9d2` / `#c08a2e` | `#875208` / `rgb(168 104 15 / .10)` / `#a8680f` |
| over ("At Risk") | `#c0271c` / `rgb(240 68 56 / .10)` / `#d92d20` | same as Blue | same as Blue | `#9c3b26` / `#f4e0d8` / `#c0563c` | `#ad3724` / `rgb(196 67 47 / .10)` / `#c4432f` |
| available (info) | `#175cd3` / `rgb(21 112 239 / .10)` / `#2e90fa` | `#0b6b80` / `rgb(14 116 144 / .10)` / `#0e8fa8` | same as Green | `#3e5670` / `#e3e9ef` / `#6e8296` | `#28609f` / `rgb(47 109 181 / .10)` / `#2f6db5` |
| AI draft surface / rule | `#f5f9ff` / `#84adff` | `#f5fbf7` / `#6ce0a0` | `#f3faf6` / `#6cc592` | `#f8f3e6` / `#c9b98f` (AI label `#9c8452`) | `#fbf7ee` / `#c9a96a` |
| AI card border gradient | `#1570ef → #7a5af8 → #0e9f8e` | `#08844a → #0e9fc4 → #12b76a` | `#0d7a43 → #0e9fc4 → #18a05e` | none (2px left rule) | none (2px left rule) |
| series 1–4 | `#1570ef` `#0e9f8e` `#7a5af8` `#c4679b` | `#0a9150` `#7a5af8` `#0e9fc4` `#c4679b` | `#0d7a43` `#7a5af8` `#0e9fc4` `#c4679b` | `#2e5a4c` `#8fae9c` `#cdbf9f` `#6e8296` | `#4a8a84` `#b8934a` `#5a7094` `#8c8478` |
| chart extras | sand `#b2ccff`, stone `#98a2b3`, clay `#d92d20` | sand `#a6e4c1` | sand `#a7dfc0` | stone `#a39c90`, clay `#c0563c` (threshold breach only) | sand `#d8c7a0`, stone `#8c8478`, clay `#c4432f` |

#### Hero, stat cards and video room

| Item | Clinical Blue | Green | Navy rail | Mint |
|---|---|---|---|---|
| page-hero gradient (120°) | `#070f2b → #0d2a6e → #1257c9 → #0f8fa3` | `#04210f → #0a4d2c → #0a7446 → #0b7d55` | `#0e1c24 → #172b36 → #10503a → #0d7a43` | `#13222f → #203448 → #0d6b40 → #18a05e` |
| hero accent text | `#bfe0ff` | `#b4f0cd` | `#b4f0cd` | `#b4f0cd` |
| hero glow | white + teal `rgb(46 213 197 / .26)` | green `rgb(108 224 160 / .28)` | `rgb(24 160 94 / .30)` | `rgb(24 160 94 / .30)` |
| stat-card corner tints (cycle of 5) | blue, teal, violet, amber, red | green, cyan, then as Blue | green, cyan, then as Blue | green, cyan, then as Blue |
| video room deep / glow | `#0a1a3f` / `#17408f` | `#04210f` / `#0c5a35` | `#0e1c24` / `#10503a` | `#13222f` / `#0d6b40` |

Palettes 5–6 had no hero gradient: a flat page header. The video room fallback is `#0a1a3f` / `#17408f`.

#### What to do with them

- Keep the names: **Clinical Blue, Green, Navy rail, Mint, Olive Green**. Warm Editorial is optional; keep it if it earns its place.
- Each must become a full theme (every token in §9.2), refined to the new direction, with contrast checked.
- **Green and Olive Green each need a dark counterpart:** Green Dark (deep forest surfaces) and Olive Dark (warm charcoal with olive accents). Navy rail's dark sidebar can inform Midnight.
- Their accents (Blue `#1570ef`, Green `#08844a`, Evergreen `#0d7a43`, Olive `#2e5a4c`) also become accent presets (§10.1), so a person can pair, say, Premium Dark with Olive.
- The current default stays **Clinical Blue** until the client approves a change.

### 9.1 Themes to design (each a complete, cohesive identity across every component)

**Current palettes (from §9.0), refined:**
1. **Clinical Blue:** the current default, with cool white surfaces and a blue-tinted canvas.
2. **Green:** fresh success-green on white.
3. **Navy rail:** a dark sidebar with a light, low-glare workspace and an evergreen accent.
4. **Mint:** a white sidebar, mint canvas and an evergreen accent.
5. **Olive Green:** warm paper with a muted olive / evergreen accent and sage; the calm, editorial option.

**New themes:**
6. **Premium Light:** warm-neutral paper surfaces, soft ink and hairline borders.
7. **Premium Dark:** deep neutral greys (not pure black), lighter elevated surfaces and reduced-glare text.
8. **Midnight:** dark navy surfaces with cool ink; calm for evening documentation.
9. **Slate:** a mid-tone cool grey UI with a dark sidebar and light content (the Navy rail idea, generalised).
10. **OLED Dark:** a true-black background with minimal borders, for phones and tablets.
11. **Green Dark** and **Olive Dark:** dark counterparts of 2 and 5.
12. **Optional extras if they earn their place:** Sand (warm, low contrast, for long reading) and High Contrast (accessibility).

Group them on the Appearance screen as **Light** (1–6) and **Dark** (7–11).

### 9.2 Each theme must define

- Backgrounds, sidebar, header, content canvas, cards, tables (header, row, hover, selected), forms and inputs (rest, hover, focus, disabled, error), dropdowns and listboxes, modals and sheets, borders, typography colours, icons, hover / active / selected states, focus ring, charts (series and grid), notifications and toasts, tags and semantic colours, AI draft surface, the patient app (status bar, tab bar, sheets) and the video room (always dark).
- **Semantic colours stay distinguishable in every theme** (success / warning / critical / info / live), with adjusted values for dark themes and a WCAG AA contrast check on their backgrounds.
- **The hero / header treatment per theme,** if a landing hero is kept.

### 9.3 Behaviour

- Applied app-wide as token sets: today `data-theme`, `data-palette`. Propose `data-theme` (theme) + `data-accent` (accent) on `<html>`.
- Saved per user, with a device fallback; applied before first paint (no flash).
- **"Match system"** follows the operating system's light/dark preference, with a chosen light and dark theme pair.
- The patient app and public pages follow the user's choice, or the system setting when signed out.
- Smooth theme transitions (respecting reduced motion).

---

## 10. Advanced colour customisation (critical)

### 10.1 Accent presets

Blue, Indigo, Violet, Purple, Emerald, Green, Teal, Cyan, Rose, Red, Orange, Amber, plus the brand accents carried over from §9.0: **Evergreen** (`#0d7a43`) and **Olive** (`#2e5a4c`, with sage `#8fae9c`). Blue must match Clinical Blue's `#1570ef` and Green must match `#08844a`. Each preset defines the full accent set:
- the accent text colour;
- hover;
- the tint background;
- the fill for primary buttons;
- fill hover and pressed;
- the on-accent text colour, automatically black or white for contrast.

Each set needs values per theme family (light and dark).

### 10.2 Custom colour

- A colour picker (hue/saturation area plus hex input).
- Automatic generation of the accent set, with contrast checks.
- A warning when the colour is too close to a semantic colour (red / amber / green), or fails contrast on the chosen theme.

### 10.3 Appearance settings experience

Design a dedicated **Appearance** page in My profile, plus a quick menu in the top bar. It contains:
- **Theme cards** with true mini-previews: sidebar, header, card and button in that theme. Selected state with a check; separate Light and Dark groups and "Match system".
- **Accent swatches** with names, a selected ring and a "Custom" tile that opens the picker.
- **A live preview pane** showing a realistic slice of Medisense in the current selection: a sidebar item, a metric card, a table row with status tags, a primary button, an input with focus, a chart and an AI draft card.
- **Density** (Comfortable / Compact) and **text size** options. **[optional: recommended for clinicians]**
- **Reset to defaults.**
- **Rules:** theme and accent combine harmoniously. Semantic colours never take the accent. Charts adapt. The video room stays dark. Selection persists.

**Important:** deliver a cohesive, token-driven design system that supports these customisations on every screen, not isolated light and dark screenshots. Show at least the key screens in several theme × accent combinations.

---

## 11. Interaction and micro-interactions

- **Transitions:** 120–200ms ease-out for hover and press; 200–280ms for sheets, menus and tabs. Reduced-motion alternatives everywhere.
- **Hover:** subtle surface change or lift on interactive cards. Rows highlight; icons and buttons change tone.
- **Focus:** a visible 2px focus ring (accent-based, contrast-checked) on every interactive element.
- **Press:** a slight scale (0.98) on buttons and mobile tap targets.
- **Real time:** the Live badge pulses gently; new rows and messages slide in; counts animate; a toast confirms an incoming event; the typing dots pulse.
- **Feedback:**
  - Optimistic sending (chat).
  - Inline "Saved", "Draft saved" and "Signing…" states, with success toasts after decisions.
  - Inline errors next to the field plus a summary.
  - Blocked actions explain why (as the accept-blocker list does).
- **AI generating:** a calm progress state (shimmer on the draft surface). Never a chatbot-style typing effect for clinical drafts.
- **Destructive actions** (Discharge, Decline, Void, Delete recording, Deactivate) need deliberate confirmation.

---

## 12. Responsive design

- **Desktop (≥1280):** full sidebar, multi-column records, right rails.
- **Laptop (1024–1279):** collapsed rail; right rails stack under the content when needed.
- **Tablet (768–1023):** this is the therapist in a client's home. The visit sheet, notes, assessment and video room must be comfortable: tap targets ≥ 44px, sheets full-height, one column.
- **Mobile (<768):** drawer navigation plus a bottom tab bar; tables become stacked cards with priority fields; tabs scroll horizontally; sheets become bottom sheets. The patient app, referral form, tracking and guest join are mobile-first.
- **Long content:** sticky headers, sticky tab bars and sticky action bars on long forms.

---

## 13. Accessibility

- WCAG 2.2 AA for every theme and accent: text contrast 4.5:1 (3:1 for large text and UI boundaries). Validate the semantic tints in dark themes.
- Never rely on colour alone. Status always has a text label (the product already pairs every colour with a label), and charts use patterns or labels as well as colour.
- Full keyboard support: tab order, arrow keys in tabs, listboxes, pills and segmented controls; Escape closes sheets; focus is trapped in dialogs and returned on close.
- Semantic structure: landmarks, heading order, table semantics, `aria-live` for live updates (chat log, Live status, toasts), `role="status"` for progress.
- Visible focus everywhere. Respect reduced motion. Minimum 44px touch targets on mobile and tablet.
- Plain language (the product uses Australian English and plain words); form errors say how to fix them.

---

## 14. Product consistency

- One shell, one header pattern (two variants), one panel, one table, one tag system, one form anatomy, one sheet, one stepper, one tabs component, one AI language. Every module (live and sample) uses them.
- Consistent vocabulary:
  - **Statuses:** caseload status is "Healthy / Watch / At Risk" (never "Monitor" in the UI). The visit and referral statuses are exactly as in §3.3. Invoices use Draft, Ready for Review, Approved, Issued, Partially Paid, Paid, Disputed, Adjusted, Voided. Notes use Draft, Pending Signature, Final, Amended.
  - **Terms:** "patient" (never "client") in visible text; "Did not attend" (not "no-show").
- The same visual weight for the same importance across modules: primary actions, danger, and AI vs rule vs human signature.
- The patient app, public pages and staff app share the same tokens and themes.

---

## 15. Technical constraints (preserve)

- **Do not change functionality, workflows, routes or business rules.** Every action listed in §3.3 must remain, with the same meaning. Key rules include:
  - Only a Clinical Lead decides triage; a risk needs a plan and a precaution.
  - No therapist assignment if credentials, scope or risk checks fail.
  - Signed records change only by amendment.
  - Patients never see clinical notes, risks or recordings.
  - Recording is off by default and needs consent plus permission.
  - Invoices carry no clinical narrative; only Finance changes them.
  - The 48-hour cancellation rule.
  - Discharge requires outcomes and a signature.
- **Tokens and Tailwind v4:** the design must translate to CSS custom properties and utility classes. No hard-coded colours in components. Theme and accent switch by attributes on `<html>`.
- **Fonts:** keep Instrument Serif / Instrument Sans / JetBrains Mono, or propose a replacement with reasons. Serif only at large sizes.
- **Icons:** lucide-react.
- **Charts:** Recharts (style through tokens).
- **No third-party UI kit** is required; design for in-house components.
- **Real time:** screens update live, so design for content that changes under the user (badges, new rows, banners) without layout jumps.
- **Server rendering:** pages show a skeleton first (session check inside Suspense). Design skeletons that match each layout.
- **The AI provider and model names never appear in the product UI.** AI outputs are always labelled as drafts.
- **Sample modules** must keep their synthetic figures consistent (e.g. 293 active patients, 351 places, 83%, Sarah 27/25, Emma 18/24).
- **Phone frame:** the patient app must render inside the desktop device frame and full-screen on phones.
- **[unknown]** Print styles for reports and invoices are not built. Propose print layouts for the progress report and invoice.

---

## 16. Final design deliverables

Produce:

1. **Design direction:** a one-page vision, mood and principles, with rationale.
2. **Design tokens:** full token tables (colour per theme and accent, typography, spacing, radius, borders, shadows, motion), ready to map to CSS custom properties.
3. **Theme system:** all themes in §9 (including the five carried-over palettes, each with a before / after comparison against its §9.0 values), each shown on the shell + a dashboard + a record + a form + a table + a sheet + the patient app; plus "Match system" behaviour.
4. **Accent system:** the 14 presets (12 + Evergreen, Olive) × light and dark, the custom colour generation rules and contrast rules.
5. **Appearance settings:** the full page and the top-bar quick menu, with the live preview, in several states.
6. **Component library:** every component in §3.4 and §8 with all states, light and dark.
7. **Application shell:** sidebar (expanded, collapsed, mobile drawer, each role's menu), top bar (with assistant command field, notifications dropdown, account menu), tabs, page header variants.
8. **Screen designs:** every screen in §7, at desktop, with tablet and mobile for the key live screens:
   - Therapist home, visit sheet, SOAP sheet, assessment, video room.
   - Messages, referral form, tracking, guest join.
   - The patient app (all tabs), the referral workspace, the patient record with match picker, and billing.
9. **States:** loading skeletons, empty, error, blocked / permission-denied, offline / "Reconnecting", success toasts, for representative screens.
10. **Interaction specs:** micro-interactions, transitions and real-time behaviours.
11. **Accessibility notes:** contrast results per theme and accent, focus order, keyboard patterns.
12. **Handoff notes:** component-to-token mapping and any new components the developers must build (e.g. command field, toast system, colour picker, density setting).

Work in this order: tokens and themes → components → shell → live care screens → patient app and public flows → sample modules → appearance settings → states and specs.
