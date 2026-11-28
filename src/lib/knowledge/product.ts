/**
 * How the live Medisense product works, written once from the functional requirements and the
 * built screens. Ask Medisense reads it through the `product_guide` tool, and the same text backs
 * the instant workflow guides. Keep it in step with the product.
 */

export type ProductTopic = {
  id: string;
  title: string;
  /** Words that point a question at this topic. */
  keywords: RegExp;
  summary: string;
  steps: { label: string; detail: string; href?: string }[];
  /** Who does it and the rules that apply. */
  rules: string[];
};

export const productTopics: ProductTopic[] = [
  {
    id: "lifecycle",
    title: "The patient lifecycle, from referral to discharge",
    keywords:
      /lifecycle|journey|end to end|end-to-end|whole (flow|process|workflow)|referral to discharge|patient workflow|how does medisense work/,
    summary:
      "Every patient follows twelve steps from the functional requirements: referral, completeness check, intake review, clinical triage, funding and consent, matching, booking, assessment, clinical recommendation, therapy sessions, invoicing, then review and discharge. Rules and AI help at each step; a person approves every decision.",
    steps: [
      {
        label: "1. Referral",
        detail:
          "Anyone sends a referral at /refer, no account needed. They get a reference (REF-MRN-DDMMYYYY-0001), the participant's MRN to sign in to the patient app, and a private tracking link.",
        href: "/refer",
      },
      {
        label: "2. Completeness check",
        detail:
          "Runs on arrival: lists missing items such as the NDIS plan or plan manager, and flags possible duplicates. An admin verifies.",
        href: "/care/referrals",
      },
      {
        label: "3. Intake review",
        detail:
          "The Intake Officer checks gaps, requests information through the tracking link, sets the region and sends it to triage.",
        href: "/care/referrals",
      },
      {
        label: "4. Clinical triage",
        detail:
          "A Clinical Lead accepts, waitlists, declines or asks for more. A reported risk (Yes or Unknown) must be managed and given a precaution before acceptance.",
        href: "/care/referrals",
      },
      {
        label: "5. Funding and consent",
        detail:
          "Funding verified or a documented exception, agreement signed, consent recorded. Accepting creates the patient with one service request per support, each accepted, waitlisted or declined on its own, and gives the participant an MRN (MRN-DDMMYYYY-0001) that signs them in to the patient app. The detailed NDIS plan, budgets, payers and service agreement are kept in Funding and agreements.",
        href: "/care/referrals",
      },
      {
        label: "6. Matching",
        detail:
          "Clinicians are checked for registration, screening and scope, then ranked by region, capacity, caseload health and soonest time. Low-risk services can be auto-allocated.",
        href: "/care",
      },
      {
        label: "7. Booking",
        detail:
          "The therapist accepts the request; the series is booked from the preferred frequency.",
        href: "/therapist",
      },
      {
        label: "8. Assessment",
        detail:
          "Discipline template, consent, observed versus reported findings, functional activities. Safeguards must pass before signing.",
        href: "/therapist",
      },
      {
        label: "9. Recommendation",
        detail:
          "Report only completes the service; Treatment drafts a plan; other choices alert intake.",
      },
      {
        label: "10. Therapy sessions",
        detail:
          "Approved plan with measured goals. Each visit: briefing, check-in, session against goals, check-out, signed SOAP note.",
      },
      {
        label: "11. Invoicing",
        detail:
          "Verified services and chargeable cancellations become billable lines in Billing and finance. Finance checks them, prepares invoices (or NDIA claims for agency-managed supports), approves, issues, records and allocates payments, and reconciles the bank statement.",
        href: "/care/billing",
      },
      {
        label: "12. Review and closure",
        detail:
          "The plan review decides continue, revise, transfer or discharge. The signed discharge closes services, plans and the referral.",
      },
    ],
    rules: [
      "No clinician is assigned if credentials, scope, safety or location checks fail.",
      "Signed records are never edited; changes are amendments with a reason.",
      "AI output is always a draft that a person checks.",
      "Every decision, view and signature is in the audit trail with who and when.",
    ],
  },
  {
    id: "referral",
    title: "Referrals and intake",
    keywords:
      /referral|refer\b|intake|tracking link|reference|msr-|needs information|waitlist|duplicate|completeness/,
    summary:
      "Referrals arrive through the public form (/refer) or are entered by staff (Enter a referral). Each gets a reference and a private tracking link that shows progress only, never personal details. The referral moves through: Submitted → Under Admin Review → Needs Information (if asked) → Clinical Triage → Funding Review → Accepted, or Waitlisted, Declined or Withdrawn. Closed after discharge.",
    steps: [
      {
        label: "Form",
        detail:
          "Nine steps: who is referring (with authority declaration), participant, funding (NDIS plan type, plan manager), contacts, service location (home, school, telehealth, daycare, day program, community), the 17 supports plus dietetics, health and safety, goals and documents, consent.",
        href: "/refer",
      },
      {
        label: "Review with AI",
        detail:
          "On the referral page, AI suggests missing or inconsistent items; the admin chooses what to ask for.",
        href: "/care/referrals",
      },
      {
        label: "Request information",
        detail:
          "The submitter answers and uploads documents through their tracking link; the referral returns to the stage that asked.",
      },
      {
        label: "Possible duplicates",
        detail:
          "Matched on email, phone, or name and date of birth. A person decides: same patient (services added to their record) or a new person.",
      },
    ],
    rules: [
      "Only a Clinical Lead or Super Admin makes the triage decision.",
      "Unknown risk is treated as needing review: absence of information is not proof of no risk.",
      "Accepting needs triage acceptance, a funding review, consent, a region and a duplicate decision.",
    ],
  },
  {
    id: "matching",
    title: "Matching therapists and booking",
    keywords:
      /match|matching|allocat|assign|available therapist|capacity|credential|registration|screening|book(ing)?|series/,
    summary:
      "Each service request is matched separately. Hard stops come first and are never outweighed by ranking: staff status not Active, a required credential missing, unverified or expired, the service not approved for that clinician, the setting not one they work in, or the postcode outside their coverage. The rest are ranked by region, free places, caseload health (At Risk is penalised) and soonest open time, with their availability and leave. The organisation picks an assignment mode: Manual, AI Assisted (top 3 suggestions with reasons; choosing someone outside the top 3 needs a recorded reason) or Rules-Based Auto.",
    steps: [
      {
        label: "Choose a time",
        detail:
          "Pick a clinician and a first-visit time; the time is held and the clinician is notified.",
        href: "/care",
      },
      {
        label: "Auto-allocate (low-risk rule)",
        detail:
          "Only in Rules-Based Auto mode. Allocates the best eligible clinician with a time this week. Refused when the patient has a precaution or the referral reported a risk.",
      },
      {
        label: "Clinician accepts",
        detail:
          "Accepting books the series: Weekly 8, Fortnightly 6, Monthly 4, Assessment 1. Declining returns it to matching with the reason.",
      },
    ],
    rules: [
      "Requests to an ineligible clinician are refused.",
      "Visits keep a 15-minute travel buffer and respect working days and time off.",
    ],
  },
  {
    id: "assessment",
    title: "Assessments",
    keywords:
      /assessment|assess|fca|functional capacity|template|safeguard|sign(ing)? the assessment|reassess|amend/,
    summary:
      "The treating therapist starts an assessment from Clinical work on the patient record. Templates follow the requirements: the OT/FCA bank (14 sections) or the discipline's parameter bank. Statuses: Draft, In Progress, Awaiting Review, Signed, Amended, Cancelled.",
    steps: [
      {
        label: "Fill it in",
        detail:
          "Consent; each section Applicable (reported and observed kept apart, measure with unit and method) or Not applicable / Unable to assess with a reason; functional activity records; findings; recommendation.",
      },
      {
        label: "AI consistency check",
        detail: "Lists blank essentials and contradictions; it never changes the assessment.",
      },
      {
        label: "Request Clinical Lead review",
        detail: "Pauses editing until the Clinical Lead returns it with comments.",
      },
      {
        label: "Sign",
        detail:
          "Only when every safeguard passes. Then: Report only completes the service; Treatment drafts a plan.",
      },
      {
        label: "Release the report",
        detail:
          "A plain-language summary (AI can draft it) is shared to the patient app. Clinical notes and risks stay private.",
      },
    ],
    rules: [
      "Nothing is calculated: measures are entered by the clinician.",
      "Cancelled assessments keep the reason they weren't done.",
    ],
  },
  {
    id: "plans",
    title: "Treatment plans, goals and reviews",
    keywords: /plan|goal|baseline|target|progress|review date|under review|revise|transfer/,
    summary:
      "A plan is drafted from a signed assessment recommending treatment. Statuses: Draft, Active, Under Review, Revised, Completed, Discontinued.",
    steps: [
      {
        label: "Goals",
        detail:
          "Each goal has a domain, measure or tool, baseline and target. Approval needs at least one goal, interventions, frequency and a review date.",
      },
      {
        label: "Progress",
        detail:
          "Values measured at each visit update the goal's current value and history. The patient app shows approved goals.",
      },
      {
        label: "AI progress summary",
        detail:
          "A tentative narrative from recorded measures, never mixing scales; the clinician interprets.",
      },
      {
        label: "Review",
        detail:
          "Start review → decide Continue (new review date), Revise (new version), Transfer or Discharge.",
      },
    ],
    rules: ["An active plan changes only through a review."],
  },
  {
    id: "visits",
    title: "Visits: in person (section 11)",
    keywords:
      /visit|check.?in|check.?out|session|briefing|attend|did not attend|no.?show|incomplete|aborted|reschedul|cancel/,
    summary:
      "Visit statuses: Requested, Confirmed, Checked in, In progress, Completed (attended), Cancelled, Late cancellation, Did not attend, Aborted (incomplete), Rescheduled.",
    steps: [
      {
        label: "Start visit",
        detail:
          "Pre-visit summary (service, location, consent, plan, last visit, precautions) plus an AI briefing with sources.",
      },
      {
        label: "Check in",
        detail: "Who is present and a safety check. If it isn't safe, end the visit early instead.",
      },
      {
        label: "Session",
        detail:
          "Measures for each active goal, interventions, response, incidents (alerts the care team) and follow-up.",
      },
      { label: "Check out", detail: "Records the actual minutes; the note sheet opens next." },
      {
        label: "Missed or changed visits",
        detail:
          "Did not attend and late cancellations (under 48 hours, patient side) are chargeable. A rebooked visit shows Rescheduled.",
      },
    ],
    rules: ["Patients can confirm upcoming visits in the app."],
  },
  {
    id: "notes",
    title: "Session notes (SOAP)",
    keywords: /note|soap|sign the note|pending signature|draft note|amendment/,
    summary:
      "Notes are Subjective, Objective, Assessment and Plan, plus a plain summary for the patient. Statuses: Draft, Pending Signature, Final, Amended.",
    steps: [
      {
        label: "Draft with AI",
        detail:
          "The therapist's rough notes and session record become a SOAP draft; anything missing is listed. Measures are never invented.",
      },
      { label: "Ready to sign", detail: "Marks the note Pending Signature." },
      {
        label: "Sign",
        detail: "Final: the patient sees the summary, and the service is verified for invoicing.",
      },
      { label: "Amend", detail: "Signed notes change only by an amendment with a reason." },
    ],
    rules: ["Patients never see SOAP content."],
  },
  {
    id: "telehealth",
    title: "Telehealth video visits (section 12)",
    keywords:
      /telehealth|video|join link|waiting room|admit|guest|recording|record|transcri|consent to record/,
    summary:
      "Telehealth is an appointment type: a service with location Telehealth books video visits, and any booked visit can switch with Make telehealth. The video is a simulator labelled DEMO ONLY; the rules are real.",
    steps: [
      {
        label: "Clinical suitability",
        detail:
          "The clinician confirms the session can be safely delivered by video before any link exists.",
      },
      {
        label: "One-time join link",
        detail:
          "Appointment-specific, no account; a new link stops the old one. Patients can also join from the app.",
      },
      {
        label: "Guest side",
        detail:
          "Name and relationship, the participant's date of birth to verify identity, authority for representatives, four separate consents (video, recording, AI transcription, information sharing), device check, waiting room.",
      },
      {
        label: "In the call",
        detail:
          "Admit, add a support person or interpreter, screen share, recording, AI transcription (if consented), connection fallback (reconnect, phone, rebook) and safety escalation to the Clinical Lead.",
      },
      {
        label: "Recording",
        detail:
          "Off by default; blocked without the participant's consent and the clinician's permission; visible to everyone when on. Statuses: Off, Consent Pending, Ready, Recording, Paused, Processing, Available, Access Restricted, Deleted per policy.",
      },
      {
        label: "Review",
        detail:
          "Recordings page: a stated purpose is required, playback only, every view logged. A Clinical Lead can restrict access or delete per policy.",
        href: "/telehealth/recordings",
      },
    ],
    rules: [
      "Ending the call completes the visit with its actual minutes.",
      "The link stops working once the call ends.",
    ],
  },
  {
    id: "billing",
    title: "Billing and finance (Module 07)",
    keywords:
      /bill|invoice|payment|paid|dispute|adjust|void|item number|rate|charge|finance|claim|remittance|reconcil|credit note|write.?off|refund|overdue|ageing|aging|billable|queue|gst|tax|allocate|bank/,
    summary:
      "A verified visit (checked out with a signed note) or a chargeable cancellation becomes a billable line in Billing and finance → Billable queue, already carrying the funding path, payer, agreement, rate in force on the service date and tax. Rules check every line. Finance prepares Ready lines: agency-managed lines become simulated NDIA claims and everything else becomes draft invoices, grouped by participant, payer and agreement. Invoices go Draft → Pending Approval → Approved → Issued → Part-Paid → Paid (or Disputed, Voided, Credited); Overdue comes from the due date and balance. Payments are recorded and allocated, bank lines are reconciled on explicit confirmation, and credits, write-offs and refunds need a Finance Manager. No real money moves and no real NDIS claim is submitted.",
    steps: [
      {
        label: "Overview",
        detail:
          "Outstanding, overdue, claim exceptions, unbilled services, payments awaiting matching and invoiced revenue; a six-month chart, payer mix, pipeline, ageing and alerts. Each figure opens its records.",
        href: "/care/billing",
      },
      {
        label: "1. Therapist confirms delivery",
        detail:
          "Check-out and a signed note create the billable line. On My schedule → Billing confirmations the therapist confirms minutes and travel distance. They never see rates, payers or claims.",
        href: "/therapist/schedule",
      },
      {
        label: "2. To bill: checks on each line",
        detail:
          "Each line is checked for: delivery not confirmed, duplicate source (held), service after the plan ended (held for payer validation), price above the limit (Finance Manager approval), payer missing or unverified, tax review. AI review explains likely mistakes as suggestions only.",
        href: "/care/billing?tab=queue",
      },
      {
        label: "3. Correct, travel and overrides",
        detail:
          "Open a line to confirm delivery, correct minutes, quantity, tax or item number (a reason is required), add travel or non-face-to-face work where the funding rule allows it (with evidence), request a rate override (Finance Manager approves), hold, release, reject or recheck against current funding.",
      },
      {
        label: "4. Prepare",
        detail:
          "Select Ready lines and Prepare. Lines are grouped so different payers never merge; agency-managed lines go to Claims.",
      },
      {
        label: "5. Invoice: draft, approve, issue",
        detail:
          "On the invoice: check the exact arithmetic, edit bill-to, due date, terms and delivery, Save draft, Send for approval, Approve (invoices over the configured amount need a Finance Manager), then Issue. Issue is blocked with plain reasons, for example a missing bill-to email or an unverified payer. Issued facts can't be edited.",
        href: "/care/billing?tab=invoices",
      },
      {
        label: "6. Payments",
        detail:
          "Payments tab → Payments → Record payment (payer, date, method, amount, reference). Open it to allocate across invoices or claims: partial and split allocation are allowed, never more than the payment or a balance. Repeated references are flagged. Unapplied money can be refunded with Finance Manager approval (simulated).",
        href: "/care/billing?tab=payments",
      },
      {
        label: "7. Bank matching (reconciliation)",
        detail:
          "Import the mock bank statement; each line gets suggested matches by amount, reference, payer and date. Match it to a payment (or create a payment from an unknown line), then Confirm reconciliation. Nothing reconciles on its own.",
        href: "/care/billing?tab=reconciliation",
      },
      {
        label: "8. Claims (agency managed)",
        detail:
          "Invoices and claims tab → Claims → open a claim: Prepare (needs the NDIS number), Submit (simulated), record the NDIA outcome (Accepted, Rejected or Partially Paid). A rejection notifies Finance; Correct and resubmit. Record the NDIS remittance in Payments and allocate it to close the claim.",
        href: "/care/billing?tab=claims",
      },
      {
        label: "9. Disputes and credits",
        detail:
          "Record dispute on an issued invoice (put lines on hold), then Request credit note, optionally with rebill (a corrected copy goes back to the queue). An officer requests and reviews; a Finance Manager approves; then Apply. The balance drops by the credit and the invoice gets a new version.",
        href: "/care/billing?tab=adjustments",
      },
      {
        label: "10. Rates, rules and reports",
        detail:
          "Rates and rules (button at the top of Billing): charge rules per funding path (travel, non-face-to-face, report writing, cancellation notice and share, price limits, tax, terms) saved as new versions by a Finance Manager; rates come from the Funding price catalogue by service date. Reports: invoiced, collected, collection rate, outstanding, credits and unbilled by month, payer, discipline, therapist, service or location, plus ageing; CSV export.",
        href: "/care/billing?tab=reports",
      },
    ],
    rules: [
      "Finance Officers (Finance role) prepare, issue, record payments and request adjustments; Finance Managers (and Super Admin) approve credits, write-offs, refunds, rate overrides, check overrides and large invoices. Nobody approves their own request.",
      "Intake and Scheduler staff can view billing but not change it. Therapists only confirm their own delivered services.",
      "One source is charged once: a repeated import is held as a duplicate.",
      "Issued invoices are never edited or deleted; corrections are credit notes linked to the original, and every version is kept.",
      "Invoices and payer messages carry service names and dates only, never clinical notes.",
      "Price limits apply to plan- and agency-managed supports, not self-managed ones. Charge rules and item numbers are sample values for Medisense to confirm.",
      "Claims, payments, refunds and emails are simulated.",
    ],
  },
  {
    id: "coordination-m17",
    title: "Therapist tasks and care coordination (Module 17)",
    keywords:
      /\btasks?\b|follow.?up|handover|coordinat|supervis|waiting on|suggest|escalat|reassign/,
    summary:
      "Follow-ups, handovers, referrals, supervision, booking requests and admin handoffs at Live care › Tasks and coordination, each with an owner, due date, status, history and escalation path.",
    steps: [
      {
        label: "Tasks",
        detail:
          "Switch between My tasks, Team tasks, Overdue and Waiting; filter by category and status; search by task ID, title or participant. Charts show open work by status and category.",
        href: "/therapist/coordination",
      },
      {
        label: "New task",
        detail:
          "Title, category, participant and course of care, owner, priority, due date or 'no due date', reminder, visibility, instructions and checklist. The owner must have access to the record; urgent tasks need escalation detail.",
      },
      {
        label: "Take action",
        detail:
          "Only allowed next statuses are offered. Waiting states need a reason; clinical and approval tasks need an outcome to complete; completing never signs a note. Reassign only to people with access; escalate to the Clinical Lead; cancel or reopen with a reason.",
      },
      {
        label: "By category",
        detail:
          "Follow-ups record each contact attempt; booking requests go to Scheduling and show their response; handovers share only shareable documents with sharing authority and need the recipient's acknowledgement; patient messages need consent on record.",
      },
      {
        label: "AI suggestions",
        detail:
          "Suggested tasks from signed notes, plan reviews and other events wait for you to accept or reject; possible duplicates are flagged. An AI handover summary is a draft you review before sharing.",
      },
    ],
    rules: [
      "Psychology and trauma tasks are restricted; admin see status only.",
      "Only a clinical reviewer completes supervision and safety-review tasks.",
      "Notifications carry the task reference, never clinical detail.",
    ],
  },
  {
    id: "patient-app-m18-22",
    title: "Patient app (Modules 18–22)",
    keywords:
      /patient app|portal|my care|check.?in|acknowledg|home activit|booking request|ndis number|upload|pay (an )?invoice|correction/,
    summary:
      "Patients and families use the patient app (sign in with the MRN) to see what needs their attention, manage visits, read their shared plan, complete check-ins, keep their profile current, view released documents, upload their own and pay invoices.",
    steps: [
      {
        label: "Home",
        detail:
          "Tiles for upcoming visits, new documents and balance due, and a 'Needs your attention' list: referral information, plans to acknowledge, visits to confirm, invoices and check-ins.",
        href: "/mobile/patient",
      },
      {
        label: "Visits",
        detail:
          "Upcoming, completed and cancelled visits with a preparation checklist and history. Confirm attendance, ask to change or cancel (the visit stays booked until Scheduling replies), or request a new visit by service, location and preferred time.",
      },
      {
        label: "My care",
        detail:
          "Only the goals and home activities the clinician shared. Acknowledge the plan version, log each activity (Unable needs a reason), ask a question that becomes a task for the therapist, and complete the weekly check-in; concerns raise a safety review.",
      },
      {
        label: "Me",
        detail:
          "Profile and preferences change directly; a new email or mobile applies after a code; legal name, date of birth and health-record corrections go to staff as requests. Funding shows the NDIS number masked until revealed. Documents, uploads (PDF, JPG, PNG, Word up to 10 MB), invoices and referrals each have a section.",
      },
    ],
    rules: [
      "Patients never see clinical notes, risks or recordings; only released reports and shared summaries.",
      "Payments, verification codes and file storage are simulated in the demo.",
      "Identity changes need staff approval at Live care › Patient requests.",
    ],
  },
  {
    id: "progress-m16",
    title: "Progress monitoring and clinical reports (Module 16)",
    keywords:
      /progress|outcome|reassess|report|discharg|episode|baseline|not calculable|release|amend|co-?sign/,
    summary:
      "Every course of care from baseline to discharge at Live care › Progress and reports: goal progress from verified observations, reassessments over one or more visits, clinician-signed reports released to authorised recipients, and discharge with a closure checklist.",
    steps: [
      {
        label: "Progress overview",
        detail:
          "Courses of care by state, reports by status and an approval queue. Filter by state, discipline and participant; reviews and reports that are overdue are highlighted.",
        href: "/therapist/progress",
      },
      {
        label: "Goals",
        detail:
          "Each goal shows baseline, current and target from verified observations. A percentage appears only for upward numeric goals with a comparable method; otherwise it says 'Not calculable' and why. Revising a target keeps the old one and the reason.",
      },
      {
        label: "Observations",
        detail:
          "Record value, unit, method, source, setting and conditions. Drafts don't count toward progress; a value outside the expected range is flagged, never changed; a missing result needs a structured 'not assessed' reason.",
      },
      {
        label: "Reassessment",
        detail:
          "Start with a trigger and only the relevant domains, record findings across home, school or telehealth visits, save part-way, then interpret, choose the outcome and sign. Unfinished domains and the safety check block signing.",
      },
      {
        label: "Reports",
        detail:
          "Request a report, draft it with AI from verified evidence only, accept or reject each section, resolve data checks, document limitations and sign. Clinician-level NDIS and FCA reports go to a Clinical Lead to co-sign. Release needs authority and consent checks; amendments create a new version.",
      },
      {
        label: "Discharge",
        detail:
          "Record the outcome, reason and follow-up; open checklist items need completion or a documented exception. Clinical discharge and financial closure are tracked separately.",
      },
    ],
    rules: [
      "Admin see report status only; psychology and trauma reports stay restricted even for the Clinical Lead.",
      "AI never invents measurements or judges clinical significance from arithmetic change.",
      "Participants are notified only after an authorised release.",
    ],
  },
  {
    id: "documentation-m15",
    title: "AI clinical documentation (Module 15)",
    keywords:
      /documentation|\bnotes?\b|soap|\bdap\b|dictat|transcript|uncertain|co-?sign|supervis|addendum|ai draft|verified|unsupported|conflict/,
    summary:
      "Clinical notes from capture to signature at Live care › My documentation: a queue, a new-note wizard, and a workspace to capture, review the transcript, choose sources, review an AI draft section by section, resolve warnings, sign, add addenda and share approved summaries.",
    steps: [
      {
        label: "Queue",
        detail:
          "Filter by status, overdue, document type, priority, date and capture method. Figures show open, overdue, AI drafts, warnings, awaiting co-sign and signed notes.",
        href: "/therapist/documentation",
      },
      {
        label: "New note",
        detail:
          "Choose the participant and service, then the visit (it fills in mode and date), the note type and capture method, and confirm the participant and encounter. A visit belonging to someone else is refused.",
      },
      {
        label: "Capture",
        detail:
          "Type observations, or dictate with start, pause, resume and stop. Dictation is not a recording of the visit. If the microphone is blocked, type instead. Consent for AI processing, recording and sharing is recorded separately.",
      },
      {
        label: "Transcript",
        detail:
          "Uncertain words are highlighted and must be corrected or confirmed; corrections keep the original. Label each speaker and redact anything that shouldn't be kept.",
      },
      {
        label: "Sources and draft",
        detail:
          "Tick only the sources to use. The AI draft cites them, keeps observed and reported information apart and is labelled not clinically verified. Accept, edit or reject each section, or write the note yourself.",
      },
      {
        label: "Review and sign",
        detail:
          "Rules flag conflicting measures, unsupported diagnoses, uncertain words and mentioned risks; each needs a resolution. Confirm 'I reviewed and verified this note', then sign. Supervised notes go to the supervisor, who co-signs or requests changes.",
      },
      {
        label: "Addenda and sharing",
        detail:
          "Signed notes change only by addendum with a reason. Share a plain-language summary only with an authorised recipient; third parties need sharing consent.",
      },
    ],
    rules: [
      "AI never signs, diagnoses, changes measurements or shares anything.",
      "Admin and finance see documentation status only; protected psychology and trauma notes are not shown to them or to the Clinical Lead by default.",
      "If AI isn't available, the clinician's work is kept and the manual path stays open.",
    ],
  },
  {
    id: "sessions-m14",
    title: "Therapy sessions (Module 14)",
    keywords:
      /session|check.?in|pre.?visit|checklist|no.?show|did not attend|safety stop|unsafe|activity|measurement|soap|addend|edit conflict|offline|verif|handover|follow.?up/,
    summary:
      "Every visit is prepared, conducted, documented and handed over at Live care › My sessions: a list with attendance and note state, then a session workspace with prepare, check-in and safety, activities, assessment continuation, notes, telehealth, end and handover, and history.",
    steps: [
      {
        label: "My sessions",
        detail:
          "Filter by date, attendance, mode, service and participant. Figures show today, in progress, notes to sign, did not attend, unverified delivery and sync issues.",
        href: "/therapist/sessions",
      },
      {
        label: "Prepare",
        detail:
          "A checklist that changes with the mode: home (address, access, pets, infection, manual handling, lone worker), school or daycare (site contact, guardian authority, permission, photography), community (meeting point, privacy, transport) or telehealth (suitability, device, fallback phone, identity). Record attendees with their role and authority.",
      },
      {
        label: "Check-in and safety",
        detail:
          "Identity and location are confirmed before any clinical activity. Unsafe to proceed stops the session without marking it complete and gives the Clinical Lead an urgent task; a precaution raises a review task. Did not attend and cancel need a reason and never create a note.",
      },
      {
        label: "Activities",
        detail:
          "Record several activities with result type, unit, method, support level, response and source (observed, patient-reported or third-party). Values that don't fit their unit are flagged and must be fixed before signing. An adverse event opens a review task.",
      },
      {
        label: "Assessment continuation",
        detail:
          "Choose which sections of an open assessment this visit covers; completed sections persist across visits and the assessment stays open independently.",
      },
      {
        label: "Notes",
        detail:
          "Write the SOAP note yourself or draft it with AI from the recorded activities. An AI draft stays unverified until the therapist reviews it and can't be signed before then. A signed note changes only by addendum, keeping the original.",
      },
      {
        label: "End and handover",
        detail:
          "Choose the disposition, mark partial completion and pick follow-ups; each becomes a task for scheduling, clinical or operations. Times corrections need a reason. Finance verifies delivery separately; nothing issues an invoice automatically.",
      },
    ],
    rules: [
      "Admin see status only and finance see delivery facts; neither sees the clinical note. Psychology and trauma sessions stay status-only even for the Clinical Lead.",
      "Telehealth recording is off by default, needs consent, and pauses when someone joins without consent.",
      "If the same field was edited on the phone and the web, the therapist chooses which version to keep before writing the note.",
    ],
  },
  {
    id: "plans-m13",
    title: "Treatment plans and goals (Module 13)",
    keywords:
      /treatment plan|\bplans?\b|goal|smart|intervention|home program|plan review|superseded|revise|co-?sign|tp-\d/,
    summary:
      "Every course of care gets a versioned treatment plan at Live care › Treatment plans: measurable goals with baselines and targets, interventions linked to goals, progress and review, and sharing an approved subset with the participant.",
    steps: [
      {
        label: "Plan list",
        detail:
          "Active, not started, draft, co-sign review and overdue-review figures; plans by state and active plans by discipline. Courses of care without a plan show Create plan, which links the latest signed assessment.",
        href: "/therapist/plans",
      },
      {
        label: "Plan details",
        detail:
          "Plan type, care setting, clinical rationale, participant priorities, start and review dates, frequency and the informed discussion. Precautions must be acknowledged before activation.",
      },
      {
        label: "Goals",
        detail:
          "Each goal has a category, ownership, priority, time horizon, measurement type, direction, baseline, target, unit and testing context. No baseline needs a documented alternative. AI can suggest SMART wording from your notes; the clinician sets every target.",
      },
      {
        label: "Interventions",
        detail:
          "Each intervention serves one or more goals, with delivery mode, sessions per week, minutes, weeks, dosage, an optional home program, precautions and stop criteria.",
      },
      {
        label: "Sign and activate",
        detail:
          "Rules list what blocks signing. Psychology, trauma therapy and graduate clinicians need Clinical Lead co-signature first. Signing activates the plan, supersedes the previous version and sends Scheduling a task to arrange the agreed appointments.",
      },
      {
        label: "Progress and review",
        detail:
          "Measurements record source and context. Numeric, time and frequency measures show progress toward the target; other types are shown as recorded, never as a percentage. AI can summarise signed measurements with cautions. Reviews continue, revise, pause, complete or discontinue the plan.",
      },
      {
        label: "Versions and sharing",
        detail:
          "Signed versions are read-only; Revise drafts a new version while the signed one stays current. Sharing sends chosen goals and home activities to verified recipients and can be revoked; internal notes are never shared.",
      },
    ],
    rules: [
      "Only the treating clinician edits a plan; the Clinical Lead reviews and co-signs; other admin see readiness only.",
      "Achieving a goal needs evidence and the clinician's confirmation; closing a goal needs a reason.",
      "A participant can decline; the decision and next steps are recorded and the course of care closes without treatment.",
    ],
  },
  {
    id: "assessments-m12",
    title: "Clinical assessments (Module 12)",
    keywords:
      /assessment|template|instrument|copm|whodas|tug|berg|fca|functional capacity|reassessment|baseline|co-?sign|outcome|unable to assess|evidence/,
    summary:
      "Every assessment from request to signed report, at Live care › Assessments: a queue, then a workspace with plan and template, findings by section, measures and scores, evidence, visits, review, an AI report draft and approval and sharing.",
    steps: [
      {
        label: "Queue",
        detail:
          "Filter by status, discipline, location, clinician and due date; status mix and open-by-discipline charts. Therapists see their own; the Clinical Lead sees all; other admin see status only.",
        href: "/therapist/assessments",
      },
      {
        label: "Plan & template",
        detail:
          "Purpose (Initial, Reassessment, Follow-up, Discharge, Report-only, Other with explanation), a template for the discipline with its version and instrument licence, location (Home adds access, School adds authorisation and sources, Telehealth adds limitations), consent, photo permission and the safety review. Optional sections can be removed; identity, consent, safety and summary can't.",
      },
      {
        label: "Workspace",
        detail:
          "Each finding records item, source (observed vs reported), performance, context, frequency, result and evidence quality. Not attempted or not assessed needs a reason; telehealth observations must be labelled remote. A section can be marked Unable to assess with a reason.",
      },
      {
        label: "Measures & scores",
        detail:
          "Numbers need a unit and method. Scores are entered manually with instrument and version; instruments with an unknown licence are restricted for scoring. Reassessments show the earlier baseline beside comparable results only.",
      },
      {
        label: "Report and sign",
        detail:
          "AI drafts from documented findings, citing each one, and may suggest observations that the clinician must accept. Signing is blocked until consent, safety, required sections, outcome and report review are done. Psychology, trauma and graduate assessments need a Clinical Lead co-signature before release.",
      },
      {
        label: "Outcomes",
        detail:
          "Report only or No further service closes the service and raises a release and billing task; Treatment recommendation proposes a draft plan (never active automatically); Further assessment books a continuation; Referral onward opens a care-coordination task.",
      },
    ],
    rules: [
      "No diagnosis, automatic score interpretation or food and fluid texture recommendation is ever generated.",
      "Signed assessments change only by addendum; cancelled ones keep their audit and create no completed-service billing.",
      "The participant app shows only report sections released to authorised recipients.",
    ],
  },
  {
    id: "operations",
    title: "Operations and workflow automation (Module 08)",
    keywords:
      /operation|work ?queue|task|escalat|sla|approval|rule|automation|aut-\d|run log|quiet hours|notification|reminder template|bulk/,
    summary:
      "One hub at Live care › Work and approvals for every operational task, rule, approval and message. Rules route the work, AI only suggests, people decide. Every send is simulated.",
    steps: [
      {
        label: "Overview",
        detail:
          "On-time rate, open, due today, overdue, at-risk, escalated and awaiting-approval figures with 14-day trends, throughput, automation outcomes and SLA by team.",
        href: "/care/operations",
      },
      {
        label: "Work queue",
        detail:
          "Tabs All, Mine, Unassigned, Due Today, Overdue, Awaiting Patient, Escalated, Completed; ten filters, search, sorting, saved views and safe bulk actions (clinical and restricted tasks are always skipped).",
        href: "/care/operations?tab=work",
      },
      {
        label: "Task",
        detail:
          "Owner, priority, due and SLA, checklist (required items block completion), notes with edit history, attachments, status history. Two editors get a visible conflict, never a silent overwrite.",
      },
      {
        label: "AI referral review",
        detail:
          "The completeness check runs first; AI then cross-checks the form against attached documents with quoted evidence and a confidence. Accept, correct, reject, request information, route to the Clinical Lead or defer. The submitted value is never overwritten.",
        href: "/care/operations?tab=needs&type=review",
      },
      {
        label: "Therapist matching",
        detail:
          "Hard eligibility gates, then a ranked shortlist with reasons. Nothing is assigned until a scheduler approves; auto assignment stops at any risk or precaution.",
        href: "/care/operations?tab=needs&type=matching",
      },
      {
        label: "Rules and run log",
        detail:
          "The AUT-01 to AUT-17 catalogue with versions, run mode and approval. New rules start in Suggest Only, must be simulated before activation and are approved by someone else. Every run is logged; a repeated event is skipped as a duplicate.",
        href: "/care/operations?tab=automation&section=rules",
      },
    ],
    rules: [
      "Clinical Restricted tasks are visible only to the Clinical Lead and the assignee.",
      "Messages respect contact authority, consent, quiet hours (20:00 to 07:30) and a daily cap.",
      "The Director or an Operations Manager changes settings and rules; nobody approves their own request.",
      "Demo accounts: Helen Brooks (Clinical Lead), Marco Silva (Operations Manager).",
    ],
  },
  {
    id: "clinical-records",
    title: "Clinical records (Module 11)",
    keywords:
      /clinical record|record|history|allerg|medication|medicine|condition|diagnos|risk|safety plan|timeline|addendum|entry|care team|consent register|reconcil|access log|restricted|psycholog/,
    summary:
      "A permission-aware clinical record for each participant: history, conditions, allergies and medicines, risks and safety plans, clinical entries, a full timeline, documents, consent, care team, reconciliation and an access log.",
    steps: [
      {
        label: "Where",
        detail:
          "Therapists: Live care › Clinical records (their assigned participants). Admin and the Clinical Lead: Live care › Clinical records, shown at the level their role allows.",
        href: "/therapist/records",
      },
      {
        label: "History",
        detail:
          "Each section is Recorded, Not reported, Unknown, Not assessed or Not applicable. A blank is never treated as no. 'Mark history reviewed' records who, when and which sources.",
      },
      {
        label: "Entries",
        detail:
          "Drafts can list items still to complete and can't be signed until they're done. Signed entries change only by a dated addendum; voiding keeps the entry in history. Teacher and carer reports stay separate from clinician observation.",
      },
      {
        label: "Risks",
        detail:
          "Severity is set by a qualified clinician, never AI. A new high or critical risk opens a review task for the Clinical Lead in Operations and flags the next visit.",
      },
      {
        label: "AI",
        detail:
          "Case summary, history gaps and handover draft cite a source for every point, mark uncertain points, use only what the viewer may see, and need approval.",
      },
    ],
    rules: [
      "Only the treating clinician sees the full record; an unassigned therapist must request access (time-limited, approved by the Clinical Lead).",
      "Psychology and trauma notes stay with that discipline; other clinicians see only that an entry exists.",
      "A Clinical Lead records a purpose before opening a record; every view is logged with its purpose.",
      "Intake sees identity, referral and documents; Scheduling sees visit precautions only; Finance sees no clinical content.",
      "Sharing a document needs information-sharing consent and a verified, authorised recipient; revoking stops new access.",
    ],
  },
  {
    id: "discharge",
    title: "Discharge and closure",
    keywords: /discharge|closure|close|finish(ed)? care|handover|outcome/,
    summary:
      "The clinician or an admin signs the discharge summary: reason, outcomes, outstanding risks, advice for the participant and referrals or handover.",
    steps: [
      {
        label: "Effects",
        detail:
          "Future visits are cancelled by Medisense without charge, pending requests withdrawn, services and plans completed, the referral Closed, caseloads reduced, everyone told.",
      },
      {
        label: "Patient app",
        detail: "The advice appears under My care; history, reports and invoices stay.",
      },
    ],
    rules: ["Outcomes and a signature are required."],
  },
  {
    id: "patient-app",
    title: "The patient app",
    keywords: /patient app|mobile|family|\bmrn\b|sign in|activate|my care|participant app/,
    summary:
      "Patients and families sign in at /mobile/patient with the participant's MRN (format MRN-DDMMYYYY-0001), issued when the referral is accepted; MRN access lasts 365 days and staff can reissue it. Tabs: Home (next visit, care team, visits to rate), Visits (confirm, join video, cancel or change with the 48-hour rule), My care (approved goals, released reports, discharge advice, invoices), Messages (live chat with therapists) and Me (contact and emergency details).",
    steps: [],
    rules: ["Patients see plain summaries only: no SOAP notes, risks, assessments or recordings."],
  },
  {
    id: "participants",
    title: "Patient and contact management (participant record)",
    keywords:
      /participant record|patient profile|profile tab|contact|guardian|coordinator|nominee|carer|consent|patient status|prospective|on hold|deceased|archiv|close service|history tab|completeness|\bmrn\b/,
    summary:
      "Each accepted referral becomes one participant record with an MRN. The profile holds identity, preferred name, address (with history), language and interpreter, accessibility, requested therapies, and where each value came from. Status is Prospective, Active, On Hold, Discharged, Archived or Deceased: it follows the services unless staff set it by hand with a reason. A completeness ring shows what is still missing.",
    steps: [
      {
        label: "Contacts",
        detail:
          "Add guardians, nominees, coordinators and carers with their responsibilities. A contact is Unverified until staff verify them; revoking keeps the history.",
      },
      {
        label: "Appointments link (AT-24)",
        detail:
          "Only a verified contact with appointment responsibility can be sent a secure link that shows the participant's appointments, with no account and no clinical detail.",
      },
      {
        label: "Consent",
        detail:
          "Each consent item (general care, telehealth, recordings, sharing with the coordinator and others) is Given, Refused, Withdrawn or Not asked, with version, respondent and history.",
      },
      {
        label: "History tab",
        detail: "The referral details and a timeline of every change to the participant.",
      },
      {
        label: "Close a service",
        detail: "Ends one service with a reason while other services continue.",
      },
    ],
    rules: [
      "Consent is recorded by a person; it is never inferred.",
      "Status changes, contact verification and consent changes are audited.",
    ],
  },
  {
    id: "staff",
    title: "Staff and therapist management (Module 04)",
    keywords:
      /staff|clinician record|therapist record|credential|registration|ahpra|screening|indemnity|insurance|expir|verif|approved service|competenc|service eligibility|stf-|engagement|pending verification|suspend|coverage|postcode|capacity|supervis|my credentials|upload/,
    summary:
      "Every clinician has a staff record with an STF number, engagement status (Invited, Pending Verification, Active, On Leave, Suspended, Inactive, Archived), a credential register, approved services, working settings, coverage postcodes and travel willingness, and a capacity view for the next 7 days. A new clinician starts Pending Verification with credentials Awaiting Review and services Pending.",
    steps: [
      {
        label: "Add clinician",
        detail: "Admin adds them from Therapists; they get an STF number and a sign-in.",
        href: "/care/therapists",
      },
      {
        label: "Credentials",
        detail:
          "The clinician adds evidence from My profile → Credentials (type, number, issuer, expiry, evidence file name), or an admin adds it. It shows Awaiting Review until a Clinical Lead marks it Verified, Under Review or Rejected with a note. Verified items past their expiry show Expired.",
        href: "/profile?tab=credentials",
      },
      {
        label: "Service eligibility",
        detail:
          "A Clinical Lead approves each service the clinician may deliver, optionally with supervision.",
      },
      {
        label: "Availability and leave",
        detail:
          "The clinician sets working days, hours and time off in My profile → Availability; scheduling can also add leave. Visits that clash are listed.",
        href: "/profile?tab=availability",
      },
      {
        label: "Capacity",
        detail:
          "Contracted hours minus booked visits, travel and leave give available hours, with each formula line shown; over-committed clinicians are flagged.",
      },
      {
        label: "Export",
        detail: "Admins can export the staff list as CSV; the export is audited.",
      },
    ],
    rules: [
      "Only a Clinical Lead can verify credentials or approve services; clinicians can't verify their own.",
      "Any required credential that is missing, unverified or expired blocks new patients (a hard stop).",
      "Verification is a recorded human decision; nothing is checked against a live external register.",
      "In the demo the evidence file is named, not uploaded.",
    ],
  },
  {
    id: "scheduling",
    title: "Scheduling and appointments (Module 05)",
    keywords:
      /schedul|appointment|booking wizard|calendar|reschedul|move (a |the )?visit|drag|reminder|exception|change request|apt-|hold|offer|confirm(ed)? by participant|secure link|no.?show|leave|resource|my schedule|offline|draft visit|timezone|aest/,
    summary:
      "Accepted services land in 'To book' on the scheduling board (/care/schedule) with risk and funding flags. The booking wizard pre-fills participant, service, location and contact, shows only eligible clinicians ranked with the top 3 as suggestions, checks the whole series against the clinician's calendar and leave, then holds the time and offers it. Nothing is confirmed until the clinician accepts. Each appointment gets an APT reference. All times are AEST (Brisbane).",
    steps: [
      {
        label: "Board",
        detail:
          "Day, week and month calendar; Resources and leave; Reminders; Exceptions and audit tabs.",
        href: "/care/schedule",
      },
      {
        label: "Book",
        detail:
          "Visit → Clinician → Series (weekly, fortnightly, monthly or a custom interval) → Confirm; hold time and offer.",
      },
      {
        label: "Clinician accepts",
        detail:
          "From the Requests tab on their home page; the visits then appear in My schedule with the preparation checklist and risk alert.",
        href: "/therapist/schedule",
      },
      {
        label: "Participant confirms",
        detail:
          "Staff send a secure appointment link; the participant confirms or asks for a change with no account. The board shows Confirmed by participant, Awaiting participant or Change requested.",
      },
      {
        label: "Reminders",
        detail:
          "48 h, 24 h and 2 h before, with delivery states and resend. Content is safe: day, time and clinician first name, no diagnosis. Delivery is simulated in the demo.",
      },
      {
        label: "Reschedule",
        detail:
          "Drag a visit or use Move: working hours, leave and travel are checked, a reason is required, both sides are notified and the original stays in history. A stale move (someone changed it first) is refused.",
      },
      {
        label: "Change requests and exceptions",
        detail:
          "Clinicians ask for a change from My schedule; it appears in Exceptions with conflicts, leave clashes and failed reminders, and is resolved there. Every action is in the scheduling audit.",
      },
      {
        label: "Cancel and no-show",
        detail: "Recorded with a reason; no-shows record contact attempts and any welfare concern.",
      },
      {
        label: "Offline visit drafts",
        detail:
          "If the connection drops during a visit, the clinician's note is kept on the device and synced when back online; a conflict asks which version to keep.",
      },
    ],
    rules: [
      "Finance-only staff see the board without site, safety or clinical detail.",
      "Clinicians see only their own visits.",
      "Ranking never overrides a hard stop.",
    ],
  },
  {
    id: "funding",
    title: "NDIS funding and service agreements (Module 06)",
    keywords:
      /ndis plan|plan managed|self.managed|agency managed|plan manager|payer|budget|funding period|verified snapshot|evidence|service agreement|agreement|amendment|sign(ed|ing)? (the )?agreement|price limit|pricing|support item|booking readiness|readiness|funding alert|plan expir|pln-|sa-0/,
    summary:
      "Each participant has one or more NDIS plans (PLN numbers) under Funding and agreements. Every value starts participant-reported from the referral and is shown beside the recorded value until a Funding or Finance officer verifies it against evidence. Budgets can be managed differently (plan-managed, self-managed, agency-managed) within one plan, each with its own payer. Remaining funds are local estimates (last verified snapshot minus commitments), never a live NDIS balance. Service agreements (SA numbers) are pre-filled from the service requests, priced from the catalogue with the pricing edition, reviewed, issued by secure link and accepted by the verified signatory. Claims and e-signatures are simulated.",
    steps: [
      {
        label: "Funding workspace",
        detail:
          "Participants, alerts, agreements, payer directory, price catalogue and policy settings.",
        href: "/care/funding",
      },
      {
        label: "Plans and evidence",
        detail:
          "Edit plan dates, NDIS number (masked), management, funding periods (overlaps flagged) and geography. Upload evidence (PDF, JPG, PNG); reject with a reason and replace: every version is kept. Verify each field with its source.",
      },
      {
        label: "Budgets and payers",
        detail:
          "Add support budgets with management per budget and a payer from the directory. Record a verified snapshot, confirm service eligibility with a rationale, and see the invoice routing preview per line.",
      },
      {
        label: "Service agreement",
        detail:
          "New agreement pre-fills service lines (with separate travel lines when the budget allows it). Lines above a price limit, totals over the review amount, or price amendments need a second person's internal review. Verify the signatory's authority, then issue a secure link.",
      },
      {
        label: "Participant answers",
        detail:
          "The signatory reads the agreement and accepts (typed name, role, confirmations), asks for a change, or declines. Declining a non-mandatory agreement follows Medisense's policy setting.",
      },
      {
        label: "Amend or renew",
        detail:
          "Signed terms never change in place. Amend makes the next version; the signed version stays in force until the new one is signed.",
      },
      {
        label: "Booking readiness",
        detail:
          "Six independent gates per service: clinical acceptance, plan evidence, service budget, payer route, agreement and consent, each with an owner and next action. Booking is Ready, Conditional or Blocked, and shows on the scheduling board's To book list.",
      },
      {
        label: "Alerts",
        detail:
          "Plan expiry at the configured reminder days, funding periods ending, missing plan-manager email, duplicate NDIS numbers, possible over-commitment (local estimate), price limits, agreements not accepted, expired agreements, and visits booked after the plan ends.",
      },
    ],
    rules: [
      "Only Funding or Finance officers (Finance or Super Admin) verify evidence, budgets, payers and eligibility; Intake can draft, upload and request information.",
      "Price limits apply to plan- and agency-managed supports, not self-managed ones.",
      "Written agreements are compulsory for SDA accommodation providers only; an SDA housing assessment is not SDA accommodation.",
      "Unverified payers block invoice issue; invoices keep the payer route they were made with when a plan manager changes.",
      "Therapists see agreed service limits only: never payer, budget or price details.",
      "A funding record never decides clinical care; consent and clinical suitability stay separate.",
    ],
  },
  {
    id: "roles",
    title: "Roles, demo accounts and privacy",
    keywords:
      /role|privacy|permission|access|who can|clinical lead|intake officer|finance|super admin|audit|demo account|sign in|log ?in|morgan|sam|jo marsh|neil/,
    summary:
      "Demo accounts (one click on the login page under Demo accounts): Neil Hensley is Super Admin and Clinical Lead (approves clinical triage, credentials and anything a manager can). Jo Marsh is Intake Officer, Scheduler and Finance Officer (verifies funding evidence, prepares and issues invoices). Morgan Blake is Finance Manager (approves credits, write-offs, refunds and rate overrides). Sam Rivera is Intake Officer and Scheduler only (records and uploads, but can't verify funding or change billing). Therapists such as Emma Clarke and Daniel Okafor see only their own patients. Patients sign in to the patient app with their MRN.",
    steps: [],
    rules: [
      "Therapists see and edit only their own patients' clinical records; a Clinical Lead reads them; other admins see statuses only.",
      "Only Finance (or Super Admin) verifies funding evidence, budgets and payers; therapists never see payer, budget or price details.",
      "Documents open only for permitted staff; funding evidence stays with intake and Finance; each view is audited.",
      "Recordings are visible to the treating clinician and Clinical Leads only.",
      "Every state change, signature, document view, payment and approval is in the audit trail.",
    ],
  },
  {
    id: "navigation",
    title: "Where everything is",
    keywords:
      /where (is|are|do|can)|which (page|screen|tab)|how do i (find|get|open)|menu|sidebar|navigate|page for/,
    summary:
      "Live care in the sidebar holds the working system. Referrals and intake (/care/referrals); Patient onboarding (/care, then a participant record /care/[id] with tabs for services, visits, profile, contacts, consent, clinical progress, documents and history); Therapists (/care/therapists, staff records with credentials, eligibility, capacity); Scheduling (/care/schedule: calendar, resources and leave, reminders, exceptions); Funding and agreements (/care/funding: participants, alerts, agreements, payer directory, price catalogue, policy; a participant's funding at /care/funding/[id]); Billing and finance (/care/billing: overview, billable queue, invoices, claims, payments, reconciliation, credits and adjustments, rates and rules, reports); Recordings; My profile. Therapists have My schedule (/therapist/schedule), My new patients (/therapist) and Messages. Patients use the patient app (/mobile/patient). Public links: referral form (/refer), referral tracking, appointment confirmation (/appointment/…), contact view (/contact/…), agreement signing (/agreement/…), document upload (/upload/…).",
    steps: [
      {
        label: "Referrals and intake",
        detail: "New and in-progress referrals, triage and funding review.",
        href: "/care/referrals",
      },
      { label: "Patients", detail: "All participants and their records.", href: "/care" },
      {
        label: "Therapists",
        detail: "Staff records, credentials and capacity.",
        href: "/care/therapists",
      },
      {
        label: "Scheduling",
        detail: "Bookings, calendar, reminders and exceptions.",
        href: "/care/schedule",
      },
      {
        label: "Funding and agreements",
        detail: "Plans, budgets, payers, agreements and readiness.",
        href: "/care/funding",
      },
      {
        label: "Billing and finance",
        detail: "Queue, invoices, claims, payments and reports.",
        href: "/care/billing",
      },
      {
        label: "My schedule (therapists)",
        detail: "Agenda, visit start, change requests and billing confirmations.",
        href: "/therapist/schedule",
      },
      { label: "Patient app", detail: "Sign in with the MRN.", href: "/mobile/patient" },
    ],
    rules: ["Sections marked Sample in the sidebar show demonstration screens, not live records."],
  },
  {
    id: "ai",
    title: "What AI does in Medisense",
    keywords: /\bai\b|artificial|automat|draft|summar/,
    summary:
      "AI drafts and suggests; people decide. It never diagnoses, prescribes, clears risk, infers consent, signs, records secretly or invents measurements.",
    steps: [
      {
        label: "Referral completeness review",
        detail: "Missing-information checklist; admin verifies.",
      },
      { label: "Pre-visit briefing", detail: "Source-linked points; the therapist checks." },
      {
        label: "Assessment consistency check",
        detail: "Gaps and contradictions; the clinician resolves.",
      },
      {
        label: "Report draft",
        detail: "Plain-language summary of a signed assessment; the clinician releases it.",
      },
      {
        label: "SOAP note draft",
        detail: "From rough notes or a consented transcript; the clinician signs.",
      },
      {
        label: "Progress summary",
        detail: "From recorded goal measures; the clinician interprets.",
      },
      {
        label: "Rules, not AI",
        detail:
          "Completeness check, duplicate detection, matching eligibility and ranking, auto-allocation, billing verification.",
      },
    ],
    rules: [],
  },
];

const clean = (s: string) => s.toLowerCase();

/** The topics a question is about, best match first. */
export function findTopics(question: string, limit = 3): ProductTopic[] {
  const q = clean(question);
  const scored = productTopics
    .map((t) => ({ t, score: (q.match(new RegExp(t.keywords.source, "g")) ?? []).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.t);
}

/** Words that mean the question is about the live product rather than the sample screens. */
export const liveWords =
  /needs? my attention|my work|to do list|referral|intake|triage|funding review|service request|assessment|treatment plan|goal|session|visit|telehealth|video|recording|invoice|billing|bill|discharge|consent|precaution|waitlist|clinical lead|check.?in|soap|note|patient app|invite|\bmrn\b|staff|credential|clinician|schedul|appointment|reminder|reschedul|exception|contact|ndis plan|plan manager|payer|budget|service agreement|agreement|funding|readiness|to book|unbooked|booked|booking|take new patients|match|allocat|lifecycle|workflow|finance|claim|remittance|payment|overdue|ageing|reconcil|credit note|write.?off|refund|unbilled|revenue|evidence|assessment|template|instrument|reassess|co-?sign|operations|work queue|escalat|approval|automation|clinical record|allerg|medication|history|addendum|demo account|(need|needs|waiting|without|awaiting)\b.{0,30}\b(therapist|clinician)|unassigned|to be assigned|where (is|are|do|can)|which (page|screen|tab)|how (do|does|can)|what happens|who can/i;
