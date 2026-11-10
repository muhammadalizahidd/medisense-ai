import type { Answer } from "./state";

/**
 * Standard Medisense workflows, written once and shown as guides in Ask Medisense. They are fixed
 * reference text, not AI answers, so they open instantly and are labelled as guides.
 */
export type WorkflowGuide = {
  id: "patient" | "therapist" | "try";
  question: string;
  blurb: string;
  answer: Answer;
};

export const workflowGuides: WorkflowGuide[] = [
  {
    id: "patient",
    question: "What is the patient journey, from referral to discharge?",
    blurb: "Referral, intake, first visit, therapy, reports and discharge",
    answer: {
      title: "The patient journey, from referral to discharge",
      intro:
        "Every patient follows the same path. AI reads and drafts at each step, rules handle the routine, and a person approves before anything is sent or saved. Open any step to go to its screen.",
      items: [
        {
          label: "Referral arrives",
          detail:
            "An email, GP letter or coordinator form is pasted into New referral. AI reads it and pulls out the patient, funding, contacts and needs, each linked to its source line.",
          href: "/intake",
        },
        {
          label: "Missing details are requested",
          detail:
            "AI lists what's missing, such as the NDIS number, date of birth or plan dates, and drafts the request email. Admin checks it and sends it.",
          href: "/intake",
        },
        {
          label: "Duplicate check and patient created",
          detail:
            "Medisense checks for an existing profile. Admin verifies the details and creates the patient record.",
          href: "/patients",
        },
        {
          label: "Therapist assigned",
          detail:
            "A therapist is suggested by region, discipline and spare capacity. The team lead confirms the choice.",
          href: "/team-capacity",
        },
        {
          label: "First visit booked",
          detail:
            "The visit is booked at home or by telehealth. The clash rule stops double bookings and finds the next free slot.",
          href: "/schedule",
        },
        {
          label: "Family invited to the portal",
          detail:
            "The family signs in to see upcoming visits, goals and progress, and to message the team.",
          href: "/portal",
        },
        {
          label: "Assessment and goals",
          detail:
            "The therapist runs the first assessment and sets goals with the family. They're saved to the patient record.",
          href: "/patients/emily-carter",
        },
        {
          label: "Therapy sessions and notes",
          detail:
            "After each visit, AI drafts the case note from the therapist's dictation. The therapist edits and approves it.",
          href: "/sessions/oliver-grant",
        },
        {
          label: "Claim prepared",
          detail:
            "A visit can be claimed once its note is approved. Billing builds the NDIS or aged care claim for admin to submit.",
          href: "/billing",
        },
        {
          label: "Progress reports and plan review",
          detail:
            "AI drafts progress and NDIS plan review reports from the approved notes. The therapist reviews them and the supervisor signs off.",
          href: "/reports",
        },
        {
          label: "Discharge and family feedback",
          detail:
            "Once the goals are met, the therapist writes a discharge summary, the family leaves feedback and the file is closed.",
        },
      ],
      sources: ["Medisense workflow"],
    },
  },
  {
    id: "therapist",
    question: "What does a therapist's day look like in Medisense?",
    blurb: "From the morning plan through visits and notes to reports and supervision",
    answer: {
      title: "A therapist's day in Medisense",
      intro:
        "Medisense handles the admin around each visit so therapists spend their time with patients. AI prepares and drafts; the therapist checks and approves. Open any step to go to its screen.",
      items: [
        {
          label: "Start with My day",
          detail:
            "Today's visits, travel and priorities in one place, plus a short AI briefing on what needs attention first.",
          href: "/my-day",
        },
        {
          label: "Prepare before each visit",
          detail:
            "Open the patient record for a summary of the last session, current goals, risks and family notes.",
          href: "/patients/emily-carter",
        },
        {
          label: "On the road with the Staff app",
          detail:
            "The schedule, patient details, directions and quick bookings on a phone, for home visits.",
          href: "/mobile/staff",
        },
        {
          label: "Run the session",
          detail:
            "In the home or by telehealth. A telehealth visit opens from the booking with the patient's details beside the call.",
          href: "/telehealth",
        },
        {
          label: "Dictate the session note",
          detail:
            "Speak or type a few lines after the visit. AI drafts the case note in the clinic's format.",
          href: "/sessions/oliver-grant",
        },
        {
          label: "Review and approve the note",
          detail:
            "The therapist edits the draft and approves it. Only approved notes go into the record and can be billed.",
          href: "/case-notes/mia-robinson",
        },
        {
          label: "Follow-ups and tasks",
          detail:
            "Requests to the family, equipment quotes and referrals become tasks with owners and due dates. Overdue tasks escalate.",
          href: "/tasks",
        },
        {
          label: "Reports",
          detail:
            "AI drafts progress and NDIS reports from the approved notes. The therapist reviews them before they go to the supervisor.",
          href: "/reports",
        },
        {
          label: "Keep the family updated",
          detail: "Progress, upcoming visits and messages are shared through the Family Portal.",
          href: "/portal",
        },
        {
          label: "Supervision",
          detail:
            "The supervisor gets an AI brief on caseload, outstanding notes and wellbeing ahead of each supervision session.",
          href: "/supervision/sarah-thompson",
        },
      ],
      sources: ["Medisense workflow"],
    },
  },
  {
    id: "try",
    question: "How do I take a new patient through to a finished visit?",
    blurb: "Create a patient, assign a therapist, then finish the visit as that therapist",
    answer: {
      title: "New patient to a finished visit",
      intro:
        "Try the whole path yourself in a few minutes. The Therapist view is signed in as Sarah Thompson, so assign the patient to Sarah to see the visit on her side.",
      items: [
        {
          label: "Create the patient",
          detail:
            "Use + New, then Add patient (or Patients, then Add patient). Enter the full name and service, then choose Sarah Thompson as the clinician and create the patient.",
          href: "/patients",
        },
        {
          label: "Book the first visit for today",
          detail:
            "On the new patient's page, choose Book visit. The clinician fills in from the patient; keep the day as today.",
          href: "/patients",
        },
        {
          label: "Switch to the Therapist view",
          detail: "Open the workspace menu at the top of the sidebar and choose Therapist.",
        },
        {
          label: "Open the visit in My day",
          detail: "The visit appears under New bookings. Select it to open the visit.",
          href: "/my-day",
        },
        {
          label: "Mark the session complete",
          detail:
            "Choose Mark session complete. Medisense adds a Write session note task to My tasks automatically.",
          href: "/my-day",
        },
        {
          label: "Write and approve the note",
          detail:
            "Write the session note, then mark the task done. The approved note makes the visit ready to claim in Billing.",
          href: "/tasks",
        },
      ],
      sources: ["Medisense workflow"],
    },
  },
];

const workflowWords = /\b(workflow|journey|flow|process|steps?|lifecycle|day look|day in)\b/;
const patientWords = /\b(patient|client|referral|discharge)\b/;
const therapistWords = /\b(therapist|clinician|staff|ot|speech pathologist)'?s?\b/;

/** Finds the guide a question asks for: the exact card text, or a workflow question about either. */
export function matchWorkflow(question: string): WorkflowGuide | null {
  const q = question.trim().toLowerCase();
  const exact = workflowGuides.find((g) => g.question.toLowerCase() === q);
  if (exact) return exact;
  if (!workflowWords.test(q)) return null;
  if (/(new client|finish(ed)?|complete)/.test(q) && /(visit|booking|session)/.test(q))
    return workflowGuides[2] ?? null;
  if (therapistWords.test(q)) return workflowGuides[1] ?? null;
  if (patientWords.test(q)) return workflowGuides[0] ?? null;
  return null;
}
