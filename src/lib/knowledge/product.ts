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
          "Funding verified or a documented exception, agreement signed, consent recorded. Accepting creates the patient with one service request per support and an app invite code.",
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
          "Verified services and chargeable cancellations become draft invoice lines; Finance reviews, issues and records payment.",
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
      "Each service request is matched separately. Rules first rule out clinicians with lapsed registration or screening, or without the scope for an assessment-only service (shown as Unavailable). The rest are ranked by region, free places, caseload health (At Risk is penalised) and soonest open time, with their availability and time off.",
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
          "Allocates the best eligible clinician with a time this week. Refused when the patient has a precaution or the referral reported a risk.",
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
    title: "Billing and invoices (step 11)",
    keywords: /bill|invoice|payment|paid|dispute|adjust|void|item number|rate|charge|finance|claim/,
    summary:
      "A visit is billed once verified: checked out with a signed note. Late cancellations and non-attendance add charge lines. Lines go to the patient's open draft invoice, addressed to the payer from the referral (plan manager, NDIA, self-managed participant or other payer). Statuses: Draft, Ready for Review, Approved, Issued, Partially Paid, Paid, Disputed, Adjusted, Voided.",
    steps: [
      {
        label: "Review",
        detail: "Finance sets support item numbers, sends for review and approves.",
        href: "/care/billing",
      },
      {
        label: "Issue",
        detail:
          "Blocked while exceptions remain: item numbers to confirm, payer to confirm, expired NDIS plan, missing attendance.",
      },
      {
        label: "Payments",
        detail: "Part payments make it Partially Paid; the balance makes it Paid.",
      },
      {
        label: "Disputes",
        detail:
          "Mark disputed, add an adjustment, reissue. Voiding frees its visits to be billed again.",
      },
    ],
    rules: [
      "Only Finance or a Super Admin changes invoices.",
      "Invoices carry no clinical narrative.",
      "Hourly rates and item numbers are PROPOSED until Medisense confirms its price list.",
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
    keywords: /patient app|mobile|family|invite code|activate|my care|participant app/,
    summary:
      "Patients and families activate with the invite code from acceptance at /mobile/patient. Tabs: Home (next visit, care team, visits to rate), Visits (confirm, join video, cancel or change with the 48-hour rule), My care (approved goals, released reports, discharge advice, invoices), Messages (live chat with therapists) and Me (contact and emergency details).",
    steps: [],
    rules: ["Patients see plain summaries only: no SOAP notes, risks, assessments or recordings."],
  },
  {
    id: "roles",
    title: "Roles and privacy",
    keywords:
      /role|privacy|permission|access|who can|clinical lead|intake officer|finance|super admin|audit/,
    summary:
      "Jo Marsh is Intake Officer, Scheduler and Finance. Neil Hensley is Super Admin and Clinical Lead. Therapists see and edit only their own patients' clinical records; a Clinical Lead reads them; other admins see statuses only. Finance excludes therapy narratives and recordings.",
    steps: [],
    rules: [
      "Documents open only for admins and therapists who accepted the patient; each view is audited.",
      "Recordings are visible to the treating clinician and Clinical Leads only.",
      "Every state change, signature, document view and recording access is in the audit trail.",
    ],
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
  /needs? my attention|my work|to do list|referral|intake|triage|funding review|service request|assessment|treatment plan|goal|visit|telehealth|video|recording|invoice|billing|bill|discharge|consent|precaution|waitlist|clinical lead|check.?in|soap|note|patient app|invite|match|allocat|lifecycle|workflow|how (do|does|can)|what happens|who can/i;
