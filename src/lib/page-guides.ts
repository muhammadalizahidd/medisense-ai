/**
 * Page guides: what each screen is for, what you can do there, how to use it and what you get.
 *
 * Every route under `src/app` must have an entry here, keyed by its route pattern exactly as the
 * folder path reads (`/care/plans/[id]`). `page-guides.test.ts` fails the build when a page has no
 * guide, so adding a page means adding its guide in the same change. Routes that only redirect are
 * listed in `redirectOnly` instead.
 */

export type PageGuide = {
  title: string;
  /** What is this page, and why would someone open it? */
  purpose: string;
  /** The main things you can do here. */
  can: string[];
  /** The intended order of work. */
  steps: string[];
  /** What you have once you're done. */
  outcome: string;
};

const g = (
  title: string,
  purpose: string,
  can: string[],
  steps: string[],
  outcome: string,
): PageGuide => ({
  title,
  purpose,
  can,
  steps,
  outcome,
});

/** Pages that never show: they forward to another screen. */
export const redirectOnly = [
  "/admin-operations",
  "/automations",
  "/tasks",
  "/design-preview",
  "/design-preview/admin-queue",
  "/design-preview/my-day",
  "/design-preview/note",
  "/design-preview/overview",
  "/design-preview/phone",
  "/design-preview/prepared",
  "/design-preview/presenter",
  "/design-preview/roadmap",
  "/design-preview/supervision",
  "/design-preview/time-skip",
];

export const guides: Record<string, PageGuide> = {
  /* ------------------------------------------------------------------ leadership story */
  "/": g(
    "Dashboard",
    "The leadership view of the whole practice: caseload health, capacity, documentation and patients who need attention, on one screen.",
    [
      "See the six headline figures and how they moved over twelve weeks",
      "Filter by team, region and discipline; every chart follows the filter",
      "Open a clinician flagged At Risk to see why",
      "Jump to the attention queue, supervision brief or capacity suggestion",
    ],
    [
      "Scan the headline band for anything in Watch or At Risk.",
      "Click a clinician or figure to drill into the detail behind it.",
      "Use the filters to compare teams or disciplines.",
      "Follow a suggested action; nothing is changed until a person approves it.",
    ],
    "A clear picture of where the practice needs attention today, and the screen to act on it.",
  ),
  "/caseloads/sarah-thompson": g(
    "Clinician caseload",
    "Why a clinician's caseload health score is where it is, broken into its six weighted factors.",
    [
      "Read the score and each contributing factor",
      "See the patients behind the load",
      "Compare the twelve-week trend",
    ],
    [
      "Start with the score and its status.",
      "Read the factors from largest to smallest.",
      "Open a patient or the capacity suggestion to act.",
    ],
    "You know what is driving the workload and what would reduce it.",
  ),
  "/my-day": g(
    "My day",
    "A clinician's day at a glance: visits, notes to write, tasks and messages.",
    [
      "See today's visits in order with travel time",
      "Open a visit to prepare or write the note",
      "Clear tasks and read family messages",
    ],
    [
      "Check the first visit and its preparation.",
      "After each visit, open the note from the list.",
      "Finish the day by clearing outstanding notes and tasks.",
    ],
    "Every visit prepared and documented, with nothing left for tomorrow.",
  ),
  "/sessions/oliver-grant": g(
    "AI session note",
    "Write a session note quickly: type or dictate, and let AI draft it for you to review and approve.",
    [
      "Type or dictate what happened",
      "Ask AI for a SOAP draft",
      "Accept, edit or regenerate each part",
      "Check missing information before approving",
    ],
    [
      "Capture your observations.",
      "Generate the AI draft.",
      "Review every section; edit anything that isn't right.",
      "Approve the note with your name.",
    ],
    "An approved session note in minutes, with an audit entry for every AI and human step.",
  ),
  "/sessions/oliver-grant/prepared": g(
    "What AI prepared",
    "Everything AI prepared after the session: the note draft, follow-ups and tasks, for you to approve.",
    ["Review each prepared item", "Approve, edit or dismiss it", "See which items still need you"],
    [
      "Read each prepared item.",
      "Approve what's right and edit the rest.",
      "Dismiss anything you don't want.",
    ],
    "Follow-up work created only where you approved it.",
  ),
  "/admin-queue": g(
    "Work queue",
    "The admin team's list of service gaps and tasks that need someone to act.",
    [
      "Sort by priority: High, Medium or Review",
      "Assign an item to a person",
      "Open the patient or visit behind it",
    ],
    [
      "Start with High priority items.",
      "Assign or complete each one.",
      "Check Review items at the end of the day.",
    ],
    "Service gaps closed and every item owned by a named person.",
  ),
  "/since-yesterday": g(
    "Since yesterday",
    "What changed overnight across caseloads, notes and the queue, so the day starts informed.",
    [
      "Read the changes since your last visit",
      "Open any changed item",
      "See what is newly At Risk",
    ],
    [
      "Skim the summary.",
      "Open anything that needs your decision.",
      "Move on to the supervision brief or overview.",
    ],
    "You start the day knowing exactly what moved.",
  ),
  "/supervision/sarah-thompson": g(
    "Supervision brief",
    "An AI-prepared brief for a supervision meeting, drawn from the clinician's caseload, notes and wellbeing indicators.",
    [
      "Read the brief and its sources",
      "See what changed since it was prepared",
      "Approve or edit talking points",
    ],
    [
      "Read the brief before the meeting.",
      "Check the sources behind each point.",
      "Approve the brief or adjust it.",
    ],
    "A focused supervision conversation backed by evidence, not memory.",
  ),
  "/team-capacity": g(
    "Team capacity",
    "Who can take more patients, and suggested rebalancing that protects continuity of care.",
    [
      "See capacity by clinician, weighted by complexity",
      "Review a rebalancing suggestion",
      "Approve or decline it; nothing moves automatically",
    ],
    [
      "Find clinicians near or over capacity.",
      "Open the suggestion and its reasoning.",
      "Approve it to create the handover tasks, or decline.",
    ],
    "Workload spread fairly without breaking a patient's continuity.",
  ),
  "/patients-requiring-attention": g(
    "Patients to review",
    "Patients flagged by configured operational indicators, such as missed visits or overdue reviews.",
    ["Filter by reason and priority", "Open a patient to see the indicators", "Assign a follow-up"],
    [
      "Sort by priority.",
      "Open each patient and read why they were flagged.",
      "Assign or record the follow-up.",
    ],
    "Every flagged patient reviewed by a person. Flags are operational, never a diagnosis.",
  ),
  "/before-after": g(
    "Before and after",
    "A side-by-side of the clinician's day before and with Medisense, as a projection for the pitch.",
    ["Compare time spent on admin and documentation", "See the projected hours returned to care"],
    [
      "Read the before column.",
      "Compare with the after column.",
      "Note the projection label: these are not pilot results.",
    ],
    "A clear picture of the expected benefit.",
  ),
  "/roadmap": g(
    "Platform roadmap",
    "Every module, what is built and what connects to live systems next.",
    ["See each module's status", "Open a module's working screen"],
    ["Scan the modules by phase.", "Open any built module to try it."],
    "You know what is ready to demonstrate and what comes next.",
  ),

  /* ------------------------------------------------------------------ sample admin, clinical and business */
  "/intake": g(
    "Referrals and intake (sample)",
    "The sample referral inbox where AI reads incoming referrals and suggests the details for intake.",
    [
      "Open a referral and its AI-extracted details",
      "Correct anything AI got wrong",
      "Accept the referral into intake",
    ],
    [
      "Open the newest referral.",
      "Check every extracted field against the source.",
      "Accept or request more information.",
    ],
    "Referrals entered accurately without retyping.",
  ),
  "/forms": g(
    "Smart forms (sample)",
    "Forms that AI pre-fills from the record, for staff to check and send.",
    ["Choose a form", "Review the pre-filled answers", "Send it for signature"],
    ["Pick the form you need.", "Check each pre-filled field.", "Send or save it."],
    "Forms completed in a fraction of the time, checked by a person.",
  ),
  "/patients": g(
    "Patients (sample)",
    "The sample patient list with status, funding and clinician for each patient.",
    ["Search and filter patients", "Open a patient profile"],
    ["Search or filter the list.", "Open a patient to see their record."],
    "Quick access to any patient's sample record.",
  ),
  "/patients/[clientId]": g(
    "Patient profile (sample)",
    "One patient's sample profile: visits, notes, goals, funding and family messages.",
    ["Read the summary and recent activity", "Open notes, reports and messages"],
    ["Start with the summary.", "Open the tab you need."],
    "Everything about the patient in one place.",
  ),
  "/schedule": g(
    "Schedule (sample)",
    "The sample team schedule with home visits and travel time.",
    ["See visits by clinician and day", "Spot gaps and clashes"],
    ["Choose the day or week.", "Scan for clashes or long travel.", "Open a visit to change it."],
    "A clear view of the team's week.",
  ),
  "/reports": g(
    "AI reports (sample)",
    "AI-drafted progress reports for clinicians to review and approve.",
    ["Open a report draft", "Review each section against the evidence", "Approve with your name"],
    ["Open the report.", "Check every section.", "Approve or send it back."],
    "Reports finished faster, approved by the clinician.",
  ),
  "/progress-reports/emily-carter": g(
    "Progress report (sample)",
    "An AI-drafted progress report for one patient, with its evidence.",
    ["Read each section and its sources", "Edit or regenerate a section", "Approve the report"],
    ["Read from the top.", "Check each claim against its source.", "Approve when it's right."],
    "An accurate, approved progress report.",
  ),
  "/case-notes/[caseId]": g(
    "Case notes (sample)",
    "The sample case-note queue with an AI draft for the selected case.",
    ["Choose a case from the queue", "Review the AI draft", "Approve or edit the note"],
    ["Pick the next case.", "Review the draft.", "Approve it."],
    "Case notes cleared with a person approving each one.",
  ),
  "/analytics": g(
    "Analytics (sample)",
    "Trends across referrals, utilisation, documentation and outcomes.",
    ["Filter by period, team and discipline", "Compare trends"],
    ["Set the period and filters.", "Read each chart.", "Drill into an outlier."],
    "Evidence for planning and reporting.",
  ),
  "/admin-insights": g(
    "Admin insights (sample)",
    "Where clinicians' non-clinical time goes: travel, documentation, reports and internal admin.",
    ["See time by category", "Compare six and twelve weeks"],
    ["Read the category split.", "Check the trend.", "Pick the category to reduce first."],
    "A target for giving time back to patient care.",
  ),
  "/billing": g(
    "Billing and claims (sample)",
    "The sample billing view of invoices and claims.",
    ["See invoices and claim status", "Open an invoice"],
    ["Filter by status.", "Open the item to act on it."],
    "A view of what is billed and owed.",
  ),
  "/erp": g(
    "ERP (sample)",
    "Revenue, costs, margin and money owed across six months.",
    ["Read revenue and costs", "See money owed by age"],
    ["Check the headline figures.", "Read the six-month trend.", "Open money owed to follow up."],
    "A financial overview for the director.",
  ),
  "/hospital": g(
    "Hospital operations (sample)",
    "A hospital-style view of referrals, wards, theatre and discharge readiness.",
    [
      "Review the referral board",
      "See ward and theatre lists",
      "Find patients ready for discharge",
    ],
    ["Start with new referrals.", "Check wards and theatre.", "Plan discharges."],
    "Patient flow visible across the hospital.",
  ),
  "/portal": g(
    "Family portal preview (sample)",
    "What a parent sees: visit times, shared summaries and messages to the team.",
    ["See upcoming visits", "Read shared summaries", "Send a message or change request"],
    ["Check the next visit.", "Read what the clinician shared.", "Message the team if needed."],
    "Families informed; messages and requests become tasks for the team.",
  ),
  "/family": g(
    "Family portal (sample)",
    "The family-facing portal in its own layout.",
    ["See visits and shared documents", "Message the care team"],
    ["Check upcoming visits.", "Read shared documents.", "Send a message."],
    "Families stay informed without phone calls.",
  ),
  "/settings": g(
    "Security and integrations (sample)",
    "Permissions, AI guardrails, integrations and staff access.",
    ["Review the permission matrix", "See locked AI safety settings", "Check integration status"],
    ["Review permissions by role.", "Check AI guardrails.", "Review staff access."],
    "Confidence that access and AI use are controlled.",
  ),
  "/telehealth": g(
    "Telehealth (sample)",
    "The sample telehealth hub for video visits.",
    ["See today's video visits", "Open a visit room"],
    ["Find the visit.", "Open the room at the visit time."],
    "Video visits run from one place.",
  ),

  /* ------------------------------------------------------------------ live care: intake and patients */
  "/care": g(
    "Patients",
    "Every patient in one place: referrals coming in, patients waiting for or seeing a therapist, and corrections they asked for in their app.",
    [
      "Patients: find a therapist, follow onboarding, book a visit",
      "Referrals: triage, check eligibility, accept or decline",
      "Patient requests: approve or reject changes from the app",
    ],
    [
      "Start with the oldest patients in each stage.",
      "Open a patient and complete what's missing.",
      "Move them on when the stage is done.",
    ],
    "Patients onboarded and ready to book.",
  ),
  "/care/new": g(
    "Enter a referral",
    "Record a referral received by phone, email or fax.",
    [
      "Enter the participant, referrer and requested services",
      "Attach documents",
      "Submit to the intake queue",
    ],
    [
      "Enter who the referral is for and who sent it.",
      "Add each requested service.",
      "Submit; intake triages it next.",
    ],
    "A complete referral in the intake queue.",
  ),
  "/care/[clientId]": g(
    "Patient record",
    "One patient's live record: details, contacts, consents, services, visits and history.",
    [
      "Update details, contacts and consents",
      "See each requested service and its status",
      "Open visits, plans and documents",
    ],
    ["Check the summary and alerts.", "Open the tab you need.", "Save changes; each is audited."],
    "An accurate, current patient record.",
  ),
  "/care/referrals": g(
    "Referrals and intake",
    "The live referral queue: triage, check eligibility and accept or decline each referral.",
    [
      "Filter by status, urgency and service",
      "Open a referral to triage it",
      "See duplicates and missing information",
    ],
    [
      "Start with urgent referrals.",
      "Open each one and complete triage.",
      "Accept, decline or request information.",
    ],
    "Every referral triaged with a recorded decision.",
  ),
  "/care/referrals/[id]": g(
    "Referral",
    "One referral: details, documents, triage, eligibility and decision.",
    [
      "Check details and documents",
      "Record triage and risk",
      "Accept, decline or request more information",
    ],
    [
      "Review the referral and documents.",
      "Complete triage; risks need a plan.",
      "Record the decision.",
    ],
    "A decided referral; accepted ones move to onboarding.",
  ),
  "/therapist": g(
    "My new patients",
    "Patients newly assigned to you, waiting to be contacted and booked.",
    [
      "See each new patient and their requested service",
      "Open the patient",
      "Start the first contact",
    ],
    [
      "Open the newest assignment.",
      "Read the referral.",
      "Contact the patient and book the first visit.",
    ],
    "New patients contacted promptly.",
  ),
  "/therapist/patients/[id]": g(
    "My patient",
    "A patient assigned to you: referral, consents, visits, plans and notes.",
    ["Read the referral and history", "Book or open visits", "Open assessments, plans and notes"],
    [
      "Check the summary and precautions.",
      "Open the work you need to do.",
      "Record outcomes as you go.",
    ],
    "Everything about your patient in one place.",
  ),

  /* ------------------------------------------------------------------ live care: people, schedule, money */
  "/care/therapists": g(
    "Therapists",
    "The clinician directory with disciplines, credentials, availability and caseload.",
    ["Search and filter clinicians", "See credentials and expiry", "Open a clinician's profile"],
    [
      "Filter by discipline or region.",
      "Check credentials and capacity.",
      "Open a profile to update it.",
    ],
    "The right clinician found, with current credentials.",
  ),
  "/care/therapists/[id]": g(
    "Therapist profile",
    "One clinician's credentials, availability, caseload and settings.",
    ["Update credentials and availability", "See current caseload", "Review history"],
    ["Check credentials first.", "Update availability.", "Save; changes are audited."],
    "An accurate clinician profile for matching and scheduling.",
  ),
  "/care/hr": g(
    "Credentials and compliance",
    "Every clinician's registrations, worker screening, insurance and training, with expired and expiring ones first.",
    [
      "See who is fully compliant",
      "Act on expired and expiring credentials",
      "Request a renewal from the clinician",
      "Search the full credential register",
    ],
    [
      "Start with Needs action: expired and required items are at the top.",
      "Request the renewal; the clinician uploads it from My profile.",
      "Verify the new evidence on their staff record.",
    ],
    "No clinician is booked on an expired credential, and renewals are chased before they lapse.",
  ),
  "/care/hr/leave": g(
    "Leave and absence",
    "Leave requests from clinicians with what each one means for patients and the team, who's away, and every balance.",
    [
      "Approve or decline leave requests",
      "See booked visits, team cover, notice and balance for each request",
      "See who's away over the next three weeks",
      "Check annual and personal leave balances",
    ],
    [
      "Open Requests: each card shows the rule checks next to the dates.",
      "Approve, or decline with a reason the clinician sees.",
      "Approved leave stops new bookings; booked visits are flagged on the schedule to move.",
    ],
    "Leave is decided quickly, with patients' visits and team cover in view.",
  ),
  "/care/hr/timesheets": g(
    "Timesheets",
    "Each clinician's week, filled in from their roster, visits and approved leave, for approval and payroll.",
    [
      "Approve or send back submitted timesheets",
      "See hours worked, overtime, leave and time with patients for the team",
      "Remind clinicians whose timesheet is missing",
      "Download the payroll file of approved hours",
    ],
    [
      "Open To approve: each sheet shows what the rules flagged next to the hours.",
      "Approve, or send it back with what needs fixing.",
      "Once the week is approved, download the payroll file from Payroll.",
    ],
    "Hours are approved from what actually happened, with nothing typed in twice.",
  ),
  "/care/messages": g(
    "Messages",
    "Chat with anyone in the practice: office staff, clinicians and patients.",
    [
      "Start a chat with any colleague, clinician or patient",
      "Filter chats by staff, clinicians or patients",
      "Search names and the text of every message",
      "See when your message has been read",
    ],
    [
      "Choose New message, pick a person and write.",
      "They see it straight away in their own Messages, on the web or in their app.",
      "Unread chats are counted in the sidebar and the bell.",
    ],
    "Everyone is one message away, without leaving the system.",
  ),
  "/care/schedule": g(
    "Scheduling",
    "Book, reschedule and confirm visits across the team.",
    [
      "See the schedule by clinician and day",
      "Book or move a visit",
      "Handle exceptions and reminders",
    ],
    [
      "Find the slot.",
      "Book or move the visit; site details are checked.",
      "Confirm with the participant.",
    ],
    "Visits booked without clashes, with reminders sent.",
  ),
  "/therapist/schedule": g(
    "My schedule",
    "Your visits for the week, with sites, travel and preparation.",
    ["See your week", "Open a visit", "Request a change"],
    ["Check today's visits.", "Prepare each visit.", "Request changes early."],
    "A clear week with every visit prepared.",
  ),
  "/care/funding": g(
    "Funding and agreements",
    "Participants' NDIS plans, budgets, service agreements and readiness to book.",
    [
      "Filter by management type, evidence and readiness",
      "Open alerts",
      "Manage agreements, payers and prices",
    ],
    [
      "Clear open alerts first.",
      "Check participants whose booking is blocked.",
      "Send agreements for signature.",
    ],
    "Every participant funded and ready to book.",
  ),
  "/care/funding/[clientId]": g(
    "Participant funding",
    "One participant's plan, budgets, evidence and agreements.",
    ["Record plan details and evidence", "Track budgets", "Create a service agreement"],
    ["Check the plan and evidence.", "Review budgets.", "Create or update the agreement."],
    "Funding verified for this participant.",
  ),
  "/care/funding/agreements/[id]": g(
    "Service agreement",
    "Build, send and track one service agreement.",
    ["Add supports and prices", "Send for signature", "Track status and versions"],
    ["Add each support.", "Check totals against the budget.", "Send it for signature."],
    "A signed agreement that allows booking.",
  ),
  "/care/billing": g(
    "Billing and finance",
    "Billable services, invoices, claims, payments and adjustments.",
    ["Review the billable queue", "Create and approve invoices", "Track claims and payments"],
    ["Clear the billable queue.", "Approve and issue invoices.", "Reconcile payments."],
    "Services billed once and payments reconciled.",
  ),
  "/care/billing/[id]": g(
    "Invoice",
    "One invoice: lines, approval, claim and payments.",
    ["Check lines and totals", "Approve or void", "Record payment or credit"],
    ["Check each line.", "Approve and issue.", "Record payment when it arrives."],
    "An issued invoice with a full history.",
  ),

  /* ------------------------------------------------------------------ live care: operations and reports */
  "/care/operations": g(
    "Work and approvals",
    "Everything to work on and approve in one place: the work queue, approvals, rules, notifications and run log.",
    ["Work the queue by team and priority", "Decide approvals", "Review rules and what they did"],
    [
      "Start with overdue and escalated tasks.",
      "Decide waiting approvals.",
      "Check the run log for failures.",
    ],
    "Work routed and owned; rules run with people deciding.",
  ),
  "/care/operations/tasks/[id]": g(
    "Task",
    "One operations task: details, checklist, notes and history.",
    ["Work the checklist", "Reassign or escalate", "Resolve with a reason"],
    ["Read the task and its source.", "Complete the checklist.", "Resolve it."],
    "A completed task with a recorded outcome.",
  ),
  "/care/operations/rules/[id]": g(
    "Automation rule",
    "One automation rule: trigger, conditions, actions and run history.",
    ["Read and adjust the rule", "Pause or resume it", "See every run"],
    ["Read what triggers it.", "Adjust conditions if needed.", "Check recent runs."],
    "A rule you understand and trust.",
  ),
  "/care/reports": g(
    "Reports and analytics",
    "Live reports across referrals, scheduling, funding, finance and clinical work.",
    ["Choose a report", "Filter and compare periods", "Save views and schedule exports"],
    ["Pick the report.", "Set filters.", "Save, schedule or export it."],
    "The figures you need, on demand or on a schedule.",
  ),
  "/care/reports/therapists": g(
    "Therapist reports",
    "Choose a therapist to see their caseload, sessions, notes and progress.",
    ["Search by name, discipline or region", "Open one therapist's reports"],
    ["Find the therapist.", "Open their reports.", "Use the tabs as you would for your own."],
    "The right therapist's figures, with every opening recorded.",
  ),
  "/care/reports/therapists/[id]": g(
    "One therapist's reports",
    "The same reports the therapist sees: caseload, sessions, clinical work and time.",
    ["Read the overview", "Open any patient's summary", "Filter by period or patient"],
    ["Start on Overview.", "Open a tab for detail.", "Open a patient for their summary."],
    "A clear view of one therapist's work. Opening it is recorded.",
  ),
  "/therapist/reports": g(
    "My reports",
    "Your own figures: visits, documentation timeliness and outcomes.",
    ["See your trends", "Filter by period"],
    ["Pick the period.", "Read each chart."],
    "A clear view of your own practice.",
  ),
  "/therapist/patients": g(
    "Patients",
    "Everyone on your caseload, ordered by when you next see them.",
    [
      "See who you're seeing this week and who has no visit booked",
      "Spot patients with a note, task or assessment still open",
      "Open a patient to see everything about their care in one place",
    ],
    [
      "Use the filters to find who needs something.",
      "Open a patient from their row.",
      "Message them straight from the list.",
    ],
    "Every patient seen on time, with nothing left open.",
  ),
  "/therapist/today": g(
    "Today",
    "Where your day starts: the next visit, today's visits and one list of what needs doing.",
    [
      "Start or join your next visit in one click",
      "See all of today's visits",
      "Work through notes, tasks and alerts, most urgent first",
    ],
    [
      "Start the next visit from the Up next card.",
      "After each visit, finish its note from the To do list.",
      "Clear the rest of the list, top to bottom.",
    ],
    "Your day done with nothing left on the list.",
  ),
  "/therapist/workspace": g(
    "My workspace",
    "Your working day: today's visits, notes to sign, tasks, messages and AI help.",
    ["Start today's visits", "Sign outstanding notes", "Clear tasks and read messages"],
    ["Check the next visit.", "After visits, sign notes.", "Clear tasks before you finish."],
    "Your day done with nothing outstanding.",
  ),
  "/therapist/tasks": g(
    "My tasks",
    "Tasks routed to you by rules and colleagues: documentation, follow-ups, reviews and care coordination.",
    [
      "See your open, due-today and overdue tasks",
      "Filter by category and priority",
      "Open a task to work it",
    ],
    [
      "Start with overdue and urgent tasks.",
      "Open each task and complete its checklist.",
      "Resolve it with an outcome.",
    ],
    "Your task list clear, with every outcome recorded.",
  ),
  "/therapist/tasks/[id]": g(
    "My task",
    "One task assigned to you, with its checklist and history.",
    ["Work the checklist", "Add a note", "Complete it"],
    ["Read the task.", "Do the checklist.", "Mark it complete."],
    "A finished task with its outcome recorded.",
  ),

  /* ------------------------------------------------------------------ live care: clinical (modules 11 to 15) */
  "/care/records": g(
    "Clinical records",
    "Every participant's clinical record, shown at the level your role allows.",
    [
      "Filter by discipline and course of care status",
      "Open a record",
      "Request access to a locked record",
    ],
    [
      "Search for the participant.",
      "Open the record.",
      "Request access with a purpose if it's locked.",
    ],
    "The record you're allowed to see, with every view audited.",
  ),
  "/care/records/[id]": g(
    "Clinical record",
    "One participant's clinical record: courses of care, history, conditions, medicines, risks and consents.",
    [
      "Review history and conditions",
      "Check risks and the safe-visit plan",
      "Flag items for Clinical Lead review",
    ],
    ["Read alerts first.", "Review the section you need.", "Flag anything that needs review."],
    "A reviewed, current clinical record.",
  ),
  "/therapist/records": g(
    "My patients' records",
    "Clinical records for patients you treat.",
    ["Find a patient's record", "See drafts to sign and items to review"],
    ["Open the patient.", "Review and update the record."],
    "Your patients' records kept current.",
  ),
  "/therapist/records/[id]": g(
    "Clinical record",
    "Your patient's clinical record: history, conditions, medicines, risks, consents and entries.",
    [
      "Add and sign entries",
      "Record conditions and medicines with their source",
      "Add addenda to signed entries",
    ],
    ["Check alerts.", "Add or update entries.", "Sign; signed entries change only by addendum."],
    "An accurate record with reported and confirmed information kept apart.",
  ),
  "/care/assessments": g(
    "Assessments",
    "Every assessment from request to signed report.",
    [
      "Filter by status, discipline, location and clinician",
      "See status mix and open work",
      "Open an assessment",
    ],
    ["Check co-sign and overdue items.", "Open the assessment.", "Review or co-sign."],
    "Assessments moving to signed reports on time.",
  ),
  "/care/assessments/[id]": g(
    "Assessment",
    "One assessment: plan, findings, measures, evidence, report, approval and history.",
    [
      "Review findings and scores",
      "Co-sign psychology and supervised work",
      "See what blocks signing",
    ],
    ["Read the overview.", "Check the report.", "Co-sign or return it."],
    "A reviewed assessment, co-signed where policy requires.",
  ),
  "/therapist/assessments": g(
    "My assessments",
    "Your assessments from request to signed report.",
    ["Filter and open assessments", "See what's due this week"],
    ["Open the next assessment.", "Record findings.", "Sign the report."],
    "Your assessments completed and signed.",
  ),
  "/therapist/assessments/[id]": g(
    "Assessment workspace",
    "Document an assessment: template, findings, measures, evidence, AI report draft and sign-off.",
    [
      "Record findings by section",
      "Enter measures and licensed scores",
      "Draft the report with AI and review it",
      "Sign and choose the outcome",
    ],
    [
      "Set the purpose and template.",
      "Record findings section by section.",
      "Draft and review the report.",
      "Sign; rules show what blocks signing.",
    ],
    "A signed assessment and a clear next step for the patient.",
  ),
  "/care/plans": g(
    "Treatment plans",
    "Every treatment plan and course of care still waiting for one.",
    ["Filter by state and discipline", "See reviews due and co-sign work", "Open a plan"],
    ["Check co-sign and overdue reviews.", "Open the plan.", "Co-sign or review."],
    "Plans active, reviewed and co-signed on time.",
  ),
  "/care/plans/[id]": g(
    "Treatment plan",
    "One treatment plan: goals, interventions, progress, sharing and versions.",
    [
      "Review goals and progress",
      "Co-sign psychology and graduate plans",
      "See readiness for booking",
    ],
    ["Read the overview.", "Check goals.", "Co-sign or return it."],
    "A safe plan, ready for delivery.",
  ),
  "/therapist/plans": g(
    "My treatment plans",
    "Your treatment plans, and courses of care waiting for a plan.",
    ["Create a plan for a course of care", "See next reviews", "Open a plan"],
    ["Create plans for new courses of care.", "Open plans with reviews due.", "Record the review."],
    "Every course of care has a current, reviewed plan.",
  ),
  "/therapist/plans/[id]": g(
    "Treatment plan workspace",
    "Build and run a plan: measurable goals, interventions, progress, reviews and sharing.",
    [
      "Write goals with baseline and target; AI can suggest wording",
      "Add interventions linked to goals",
      "Record measurements and reviews",
      "Share an approved subset with the participant",
    ],
    [
      "Fill in plan details.",
      "Add goals and interventions.",
      "Validate and sign to activate.",
      "Record progress and review on the review date.",
    ],
    "An active, measurable plan the participant understands.",
  ),
  "/care/sessions": g(
    "Sessions and notes",
    "Every therapy session across the team, and the clinical note that comes out of each one.",
    [
      "Sessions: attendance, mode, service and delivery verification",
      "Notes: what is late, drafted by AI, flagged or waiting for co-sign",
      "Open a session or a note at your access level",
    ],
    [
      "Check in-progress and missed sessions.",
      "Open sessions needing verification.",
      "Verify delivery (Finance).",
    ],
    "Delivery verified without exposing clinical notes.",
  ),
  "/care/sessions/[id]": g(
    "Session",
    "One session at your role's level: delivery facts, verification and history.",
    ["See times, attendance and follow-ups", "Verify delivery (Finance)", "Read the history"],
    ["Check the delivery facts.", "Record the verification.", "Save; billing reviews it next."],
    "A verified service, ready for the billing review.",
  ),
  "/therapist/sessions": g(
    "My sessions",
    "Your sessions from preparation to signed note.",
    ["Filter by date, attendance and mode", "See notes to sign and sync issues", "Open a session"],
    [
      "Open today's next session.",
      "Work through prepare, check-in and activities.",
      "End it and sign the note.",
    ],
    "Every session delivered and documented.",
  ),
  "/therapist/sessions/[id]": g(
    "Session workspace",
    "Run a visit end to end: prepare, check in safely, record activities, write the note and hand over.",
    [
      "Confirm the pre-visit checklist and attendees",
      "Check in with identity and location",
      "Record activities with units and source",
      "Draft the note with AI, verify and sign",
    ],
    [
      "Prepare: confirm the checklist.",
      "Check in; stop if unsafe.",
      "Record activities.",
      "End the session, then write and sign the note.",
    ],
    "A safe, documented visit with follow-up tasks created.",
  ),
  "/care/documentation": g(
    "Documentation",
    "Documentation status across the team: drafts, reviews, co-sign and overdue notes. Content stays with authorised clinicians.",
    [
      "Filter by status, type, discipline and priority",
      "See overdue and co-sign work",
      "Open a note at your access level",
    ],
    [
      "Check overdue and escalated notes.",
      "Open notes awaiting your co-sign.",
      "Approve or request changes.",
    ],
    "Documentation complete and supervised on time.",
  ),
  "/care/documentation/[id]": g(
    "Clinical note",
    "One clinical note at your role's level: status, timeline and, for supervisors, the content to co-sign.",
    ["Review the note and its sources", "Approve or request changes", "See the audit timeline"],
    [
      "Read the note.",
      "Check its sources and warnings.",
      "Approve, or request changes with a reason.",
    ],
    "A co-signed note, or a clear correction task for the author.",
  ),
  "/therapist/documentation": g(
    "Notes",
    "Your notes from capture to signature, with AI help that you verify.",
    [
      "See which notes are late and which are waiting to be finished",
      "Start a new note from a visit",
      "Open a note to check the AI draft, finish it and sign",
    ],
    [
      "Start a note from the visit you just finished.",
      "Capture, then draft with AI or write it yourself.",
      "Review, verify and sign.",
    ],
    "Notes signed on time with nothing unverified.",
  ),
  "/therapist/documentation/[id]": g(
    "Note workspace",
    "Capture, draft, verify and sign one clinical note.",
    [
      "Type or dictate; correct the transcript",
      "Choose sources and generate an AI draft",
      "Accept, edit or reject each section",
      "Resolve warnings, confirm review and sign",
    ],
    [
      "Capture what happened.",
      "Choose sources and generate the draft.",
      "Review every section and resolve warnings.",
      "Confirm you verified it, then sign.",
    ],
    "A signed, traceable note; supervised notes go to the supervisor.",
  ),

  "/therapist/ai": g(
    "AI assistants",
    "AI help for your caseload: home coach, pre-visit check-ins, concerns, insights, care-team coordination and a clinical copilot.",
    [
      "Review concerns, check-ins and home-coach reports from patients and caregivers",
      "Draft coach guidance from a published home activity, then approve and publish it",
      "See documented goal trends, record your interpretation and share a summary",
    ],
    [
      "Open the inbox and work the safety concerns first.",
      "Pick a patient and use Coach, Insights, Care team or Copilot.",
      "Approve, edit or reject every AI draft before anything reaches the patient.",
    ],
    "Patient-reported updates reviewed, with every AI output checked by you.",
  ),
  "/therapist/progress": g(
    "Progress and reports",
    "Your caseload, sessions, notes and progress at a glance, with your clinical reports one tap away.",
    [
      "See which goals are improving and which reviews are due",
      "Open a course of care to record outcomes or reassess",
      "Work your report centre and see what's with a reviewer",
    ],
    [
      "Start with overdue reviews and reports.",
      "Open the course of care and record today's measure.",
      "Draft, check and sign the report, then release it.",
    ],
    "Every course of care measured and reported on time.",
  ),
  "/therapist/progress/[episode]": g(
    "Course of care progress",
    "One course of care: goals against baseline and target, observations, reassessments, reports and discharge.",
    [
      "Record an observation with method, unit, source and setting",
      "Reassess over one or more visits and sign the outcome",
      "Revise a goal target with a reason",
      "Request a report or discharge the course of care",
    ],
    [
      "Check each goal's trend; 'Not calculable' explains why.",
      "Record new measures; drafts don't count toward progress.",
      "Start a reassessment when a review is due and finalise it.",
      "Request the report or sign the discharge.",
    ],
    "Progress you can trust, and a clear next step for the participant.",
  ),
  "/therapist/progress/reports/[id]": g(
    "Report composer",
    "Write a clinical report from verified evidence, check it, sign it and release it to authorised recipients.",
    [
      "Draft with AI from verified evidence only",
      "Accept, edit or reject each section",
      "Resolve data-quality checks and document limitations",
      "Sign, then release with authority and consent checks",
    ],
    [
      "Draft or write each section.",
      "Resolve every data check.",
      "Confirm the review checklist and sign.",
      "Release the signed version to the right person.",
    ],
    "A signed, traceable report in the right hands; amendments become a new version.",
  ),
  "/care/progress": g(
    "Progress and reports",
    "Team-wide course of care progress, report deadlines and the clinical approval queue.",
    [
      "See overdue reviews and reports by owner",
      "Open the approval queue to co-sign",
      "Track releases without seeing restricted content",
    ],
    ["Check reports due and overdue.", "Open the approval queue.", "Co-sign or request changes."],
    "Reports delivered on time with governance applied.",
  ),
  "/care/progress/[episode]": g(
    "Course of care progress (care team)",
    "One course of care's progress at your access level: goals, reports and discharge status.",
    ["Review goal progress and observations (clinical leads)", "See report and discharge status"],
    [
      "Check goal progress.",
      "Open the latest report.",
      "Follow up on discharge or overdue reviews.",
    ],
    "A clear view of where the course of care stands.",
  ),
  "/care/progress/reports/[id]": g(
    "Clinical report",
    "Review a clinical report: co-sign it, return it for changes, or track its release.",
    [
      "Read the report and its evidence",
      "Approve and co-sign, or request changes",
      "See releases and the audit",
    ],
    [
      "Read the sections against the evidence.",
      "Check the data-quality findings.",
      "Co-sign or return it with a reason.",
    ],
    "A governed report, ready to release.",
  ),
  "/therapist/coordination": g(
    "Tasks",
    "Every follow-up, handover, referral, supervision request and booking request you own, with a due date and an owner.",
    [
      "See your tasks, team tasks, overdue and waiting work",
      "Accept or reject AI-suggested tasks",
      "See the care team for each participant",
      "Create a task for someone with access to the record",
    ],
    [
      "Start with overdue and urgent tasks.",
      "Open a task and use Take action for the next step.",
      "Accept or reject AI suggestions.",
      "Before you finish, hand over or defer anything open.",
    ],
    "Nothing falls through the cracks: every task has an owner and an outcome.",
  ),
  "/therapist/coordination/[id]": g(
    "Task",
    "One task: instructions, the steps for its category, checklist, comments and full history.",
    [
      "Record contact attempts, send booking requests or hand over",
      "Move it through allowed statuses",
      "Reassign only to people with access",
      "Escalate to the Clinical Lead or cancel with a reason",
    ],
    [
      "Read the instructions and source.",
      "Do the category steps (contact, handover, booking).",
      "Record the outcome and complete it.",
    ],
    "A finished task with its outcome recorded; completing it never signs a clinical note.",
  ),
  "/care/coordination": g(
    "Care coordination",
    "Team-wide tasks for supervisors and admin: overdue and waiting work, reviews and requests.",
    [
      "Find overdue or unassigned work",
      "Decide supervision reviews",
      "Answer booking and admin requests",
    ],
    [
      "Check overdue and waiting tasks.",
      "Open the supervision tab and decide reviews.",
      "Respond to admin and booking requests.",
    ],
    "Work flowing between clinicians and admin with nothing left waiting.",
  ),
  "/care/coordination/[id]": g(
    "Task (care team)",
    "A task at your access level: approve reviews, respond to requests, or see its status.",
    [
      "Approve or return a supervision review",
      "Respond to a booking request",
      "See status without restricted detail",
    ],
    ["Read the task.", "Take the decision or response.", "Check the history."],
    "Decisions recorded and the owner notified.",
  ),
  /* ------------------------------------------------------------------ live care: communication and self */
  "/messages": g(
    "Messages",
    "Secure conversations with patients, families and the care team.",
    ["Read and reply to conversations", "Start a new conversation"],
    ["Open unread conversations first.", "Reply or hand over to the right person."],
    "Nobody left waiting for a reply.",
  ),
  "/profile": g(
    "My profile",
    "Your account details, credentials and preferences.",
    ["Update your details", "Check credentials", "Change preferences"],
    ["Review your details.", "Update what's changed.", "Save."],
    "An up-to-date profile.",
  ),
  "/telehealth/recordings": g(
    "Recordings",
    "Telehealth recordings you are authorised to see, with consent and access logs.",
    [
      "Find a recording by participant or date",
      "Play with a recorded purpose",
      "See the access log",
    ],
    ["Find the recording.", "State your purpose to play it.", "Close it; access is logged."],
    "Authorised review of recordings with every access logged.",
  ),
  "/telehealth/room/[visitId]": g(
    "Video room",
    "The secure video visit: waiting room, consent, recording controls and call events.",
    [
      "Admit the participant after identity checks",
      "Record only with consent",
      "End the call and go to the note",
    ],
    [
      "Check suitability and consent.",
      "Admit the participant.",
      "Start recording only if consented.",
      "End the call.",
    ],
    "A completed video visit with its consent and events recorded.",
  ),

  /* ------------------------------------------------------------------ standalone pages */
  "/login": g(
    "Sign in",
    "Sign in to Medisense with your work account, or as a patient with your MRN.",
    ["Sign in as staff", "Sign in as a patient with your MRN"],
    ["Enter your email or MRN.", "Enter your password.", "Sign in."],
    "You land on your own home screen.",
  ),
  "/refer": g(
    "Make a referral",
    "A public form for referrers and families to refer someone to Medisense.",
    ["Enter who you are referring and why", "Attach documents", "Track the referral afterwards"],
    ["Fill in each step.", "Attach what you have.", "Submit and keep the tracking link."],
    "A referral received by the intake team.",
  ),
  "/refer/app": g(
    "Referral form",
    "The step-by-step referral form.",
    ["Enter participant, referrer and services", "Upload documents"],
    ["Complete each step.", "Review and submit."],
    "A submitted referral and a tracking link.",
  ),
  "/refer/track/[token]": g(
    "Track a referral",
    "See where a referral you made is up to.",
    ["See the referral's status", "Upload anything requested"],
    ["Open your tracking link.", "Check the status.", "Provide anything asked for."],
    "You know what happens next with the referral.",
  ),
  "/checkin/[token]": g(
    "Pre-visit check-in by link",
    "A secure, visit-specific link for answering the pre-visit check-in without an app account.",
    [
      "Confirm the participant's date of birth before anything shows",
      "Answer the core and template questions for the visit",
    ],
    ["Enter the date of birth.", "Answer the questions and send them to the care team."],
    "The therapist gets the answers before the visit.",
  ),
  "/care/ai-agent": g(
    "Operations agent",
    "The admin AI operations agent: a daily briefing, 32 features across intake, allocation, scheduling, funding, billing and operations, with every change shown as a proposal a person confirms.",
    [
      "Read today's briefing in the order the operations SOP sets",
      "Ask a question or pick one of the 32 features",
      "Confirm or cancel each proposed task, message or assignment",
      "Check the run history for what was proposed, done, declined, failed or already done",
    ],
    [
      "Start with safety escalations and overdue tasks.",
      "Check the sources and facts before confirming a proposal.",
    ],
    "Admin work found and queued in minutes, with people approving every change.",
  ),
  "/care/ai-oversight": g(
    "AI oversight",
    "Counts-only oversight of the AI assistants for admins: usage, flags, consent and escalations without clinical text.",
    [
      "See check-in, coach, concern and insight counts by status",
      "Track flagged AI answers and patients who turned AI off",
      "Watch safety escalations and who reviewed them",
    ],
    [
      "Check flagged answers and open escalations first.",
      "Follow up with the clinical lead where reviews are late.",
    ],
    "Assurance that AI is used safely, without exposing private content.",
  ),
  "/care/users": g(
    "User control",
    "Every staff login in one place, for Super Admins: office staff and therapists. Create users, decide what each person is responsible for, reset passwords and deactivate people who leave. Patients sign in with their MRN and are managed from their record.",
    [
      "Create a user with a temporary password shown once",
      "Choose responsibilities and preview the exact menu they'll see",
      "Reset a password, or deactivate and reactivate an account",
      "See who has never signed in or still has to set a password",
    ],
    [
      "Pass the temporary password on in person or by phone; they choose their own at first sign-in.",
      "Deactivate leavers straight away: they're signed out on every device.",
    ],
    "The right people get in with the right access, and nobody keeps access after they leave.",
  ),
  "/join/[token]": g(
    "Join a video visit",
    "Join a telehealth visit from a secure link without an account.",
    ["Check your camera and microphone", "Confirm who you are", "Wait to be admitted"],
    [
      "Allow camera and microphone.",
      "Confirm your identity.",
      "Wait for the clinician to admit you.",
    ],
    "You're in the video visit.",
  ),
  "/appointment/[token]": g(
    "Your appointment",
    "Confirm an appointment or ask for a change, from a secure link.",
    ["Confirm you'll attend", "Ask for a different time"],
    ["Check the date and time.", "Confirm or request a change."],
    "The team knows whether you'll be there.",
  ),
  "/agreement/[token]": g(
    "Service agreement",
    "Read and sign a service agreement from a secure link.",
    ["Read the supports and costs", "Sign or ask a question"],
    ["Read the agreement.", "Sign it if it's right, or ask a question."],
    "A signed agreement so services can start.",
  ),
  "/upload/[token]": g(
    "Upload documents",
    "Send documents the team asked for, from a secure link.",
    ["Upload files", "Add a note"],
    ["Choose the files.", "Upload them."],
    "The team has the documents they need.",
  ),
  "/contact/[token]": g(
    "Update contact details",
    "Confirm or update contact details from a secure link.",
    ["Check your details", "Update anything that's changed"],
    ["Review your details.", "Save changes."],
    "The team can reach you.",
  ),
  "/mobile/therapist": g(
    "Therapist app",
    "The clinician's own app for the road: today's visits, briefings, check-in and check-out, notes drafted from dictation, new patient requests, tasks and messages.",
    [
      "See today's visits with precautions, goals and the last visit",
      "Check in and out; the actual times are recorded",
      "Dictate rough notes, review the AI draft, add your assessment and sign",
      "Accept or decline new patients",
      "Work through tasks and message patients",
    ],
    [
      "Sign in with your work email.",
      "Open the next visit from Today and check in when you arrive.",
      "After checking out, write and sign the note from Notes to write.",
    ],
    "Everything a visit needs, on the phone, and the note is signed before you reach the car.",
  ),
  "/mobile/patient": g(
    "Patient app",
    "The patient's own app: what needs attention, visits, the shared plan, check-ins, profile, funding, documents, payments and referrals.",
    [
      "See what needs your attention on Home",
      "Confirm, change or request visits, with a checklist before each",
      "Read and acknowledge your plan, log home activities and complete check-ins",
      "Update your profile, verify new contact details and request corrections",
      "View documents your clinician released, upload your own and pay invoices",
    ],
    [
      "Sign in with your MRN.",
      "Work through the items on Home.",
      "Use Visits, My care and Me for everything else; changes that need staff go to them as requests.",
    ],
    "You manage your own care in a few taps, and staff see exactly what you asked for.",
  ),
  "/care/patient-requests": g(
    "Patient requests",
    "Identity and health-record corrections patients asked for in their app, waiting for a decision.",
    [
      "Approve a legal name or date-of-birth change",
      "Reject with a reason the patient sees",
      "Review past decisions",
    ],
    [
      "Open Waiting for review.",
      "Check the change against ID or the record.",
      "Approve, or reject with a reason.",
    ],
    "Patient records stay accurate, and every change has a named decision.",
  ),
  "/assistant": g(
    "Ask Medisense AI",
    "The whole assistant on its own page: questions about your records and the booking agent.",
    [
      "Ask about patients, the team or the schedule",
      "Book with the booking agent",
      "Book someone new",
    ],
    [
      "Ask a question in your own words, or pick a guide.",
      "Open Booking agent; choose Existing patient or New to Medisense.",
      "Check the proposal or the time, then confirm.",
    ],
    "Answers from your own records, and bookings made only after a person confirms.",
  ),
  "/mobile/staff": g(
    "Admin app",
    "The practice in your pocket: today's briefing, the team's schedule, quick bookings and the AI agents.",
    ["Read today's briefing", "Book someone new", "Ask AI or the booking agent"],
    [
      "Check the briefing and your tasks.",
      "Book a caller with a name and phone.",
      "Ask a question or let the booking agent propose a booking you confirm.",
    ],
    "The practice runs from anywhere, with the same records and access as the portal.",
  ),
  "/mobile/family": g(
    "Family app",
    "The family's phone app: visits, shared summaries and messages.",
    ["See upcoming visits", "Read shared summaries", "Message the team"],
    ["Check the next visit.", "Read updates.", "Message if you need to."],
    "Families informed and involved.",
  ),
};

/** The guide for a URL path: exact match first, then the route pattern with dynamic segments. */
export function guideFor(pathname: string): PageGuide | null {
  const path = pathname.split("?")[0]?.replace(/\/$/, "") || "/";
  if (guides[path]) return guides[path];
  const parts = path.split("/");
  for (const [pattern, guide] of Object.entries(guides)) {
    const p = pattern.split("/");
    if (p.length !== parts.length) continue;
    if (p.every((seg, i) => seg === parts[i] || (seg.startsWith("[") && seg.endsWith("]"))))
      return guide;
  }
  return null;
}
