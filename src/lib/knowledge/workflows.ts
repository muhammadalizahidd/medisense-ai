import { productTopics, type ProductTopic } from "./product";
import type { Answer } from "./state";

/**
 * Standard Medisense workflows, shown as guides in Ask Medisense. They're built from the product
 * knowledge base (`product.ts`), open instantly, and are labelled as guides, not AI answers.
 */
export type WorkflowGuide = {
  id: "patient" | "therapist" | "telehealth" | "billing" | "privacy" | "try";
  name: string;
  question: string;
  blurb: string;
  answer: Answer;
};

const topic = (id: string) => productTopics.find((t) => t.id === id) as ProductTopic;

export function fromTopic(t: ProductTopic, intro?: string): Answer {
  return {
    title: t.title,
    intro: intro ?? t.summary,
    items: [
      ...t.steps.map((s) => ({
        label: s.label,
        detail: s.detail,
        ...(s.href ? { href: s.href } : {}),
      })),
      ...t.rules.map((r) => ({ label: "Rule", detail: r })),
    ],
    sources: ["Medisense workflow", "Functional requirements"],
  };
}

export const workflowGuides: WorkflowGuide[] = [
  {
    id: "patient",
    name: "Patient lifecycle",
    question: "What is the patient journey, from referral to discharge?",
    blurb: "The 12 steps: referral, intake, triage, funding, matching, care, billing, discharge",
    answer: fromTopic(topic("lifecycle")),
  },
  {
    id: "therapist",
    name: "Therapist workflow",
    question: "What does a therapist's day look like in Medisense?",
    blurb: "Requests, assessments, plans, visits, signed notes and reviews",
    answer: {
      title: "A therapist's work in Medisense",
      intro:
        "Everything starts from My new patients. Rules and AI prepare and draft; the therapist checks, decides and signs. Only the treating therapist edits a patient's clinical record.",
      items: [
        {
          label: "Answer new requests",
          detail:
            "Each request shows the service, frequency, location, funding and any precaution from clinical triage. Accept books the series; decline gives a reason.",
          href: "/therapist",
        },
        {
          label: "Assess",
          detail:
            "Patient record → Clinical work → Start assessment. Fill each section, run the AI consistency check, ask the Clinical Lead to review if needed, then sign.",
        },
        {
          label: "Plan",
          detail:
            "A Treatment recommendation drafts the plan: add measured goals, interventions, frequency and a review date, then approve.",
        },
        {
          label: "Visit",
          detail:
            "Start visit: pre-visit summary and AI briefing, check-in with a safety check, goal measures, check-out with actual minutes.",
        },
        {
          label: "Video visits",
          detail:
            "Video room: confirm suitability, send the one-time link, admit from the waiting room, record only with consent and permission.",
          href: "/telehealth/recordings",
        },
        {
          label: "Notes",
          detail:
            "Draft the SOAP note with AI from rough notes, mark it ready, then sign. Signing shows the patient the summary and sends the visit to billing.",
        },
        {
          label: "Review and discharge",
          detail:
            "Start review on the plan, decide continue, revise, transfer or discharge, then sign the discharge summary.",
        },
        {
          label: "Stay in touch",
          detail: "Live chat with the patient and family, with read receipts.",
          href: "/messages",
        },
      ],
      sources: ["Medisense workflow", "Functional requirements"],
    },
  },
  {
    id: "telehealth",
    name: "Telehealth",
    question: "How do telehealth video visits work?",
    blurb: "Suitability, one-time link, consents, waiting room, recording rules",
    answer: fromTopic(topic("telehealth")),
  },
  {
    id: "billing",
    name: "Billing",
    question: "How does billing work?",
    blurb: "Verified services to draft invoices, review, issue and payment",
    answer: fromTopic(topic("billing")),
  },
  {
    id: "privacy",
    name: "Roles and privacy",
    question: "Who can see what in Medisense?",
    blurb: "Least privilege for clinical records, documents, recordings and invoices",
    answer: fromTopic(topic("roles")),
  },
  {
    id: "try",
    name: "Try it: one patient through every workflow",
    question: "How do I take a referral all the way to discharge?",
    blurb: "The manual test path, step by step, with the accounts to use",
    answer: {
      title: "One patient through every workflow",
      intro:
        "Use three windows: Jo Marsh (intake and finance), Neil Hensley (Clinical Lead) and the therapist, plus a private window for the referrer and patient. The full checklist with expected results is in docs/MANUAL_TEST_GUIDE.md.",
      items: [
        {
          label: "Send a referral",
          detail:
            "Public form at /refer, with an NDIS plan, FCA and OT, and Unknown risk. Keep the tracking link.",
          href: "/refer",
        },
        {
          label: "Intake (Jo)",
          detail:
            "Review with AI, request information, then the referrer answers on the tracking link.",
          href: "/care/referrals",
        },
        { label: "Triage (Neil)", detail: "Accept with a risk plan and a precaution." },
        {
          label: "Funding and accept (Jo)",
          detail: "Verify, record consent, accept. Copy the invite code.",
        },
        {
          label: "Match",
          detail:
            "An expired registration shows as unavailable; auto-allocation is refused because of the precaution; request a therapist.",
          href: "/care",
        },
        {
          label: "Therapist",
          detail:
            "Accept, assess, sign, release the report, approve the plan, run visits, sign notes, run a video visit.",
        },
        {
          label: "Billing (Jo)",
          detail: "Set item numbers, review, approve, issue and record payment.",
          href: "/care/billing",
        },
        {
          label: "Close",
          detail:
            "Plan review → Discharge, then the signed discharge. The patient app shows goals, report, invoice and advice.",
          href: "/mobile/patient",
        },
      ],
      sources: ["Manual test guide"],
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
  if (/(all the way|every workflow|test)/.test(q))
    return workflowGuides.find((g) => g.id === "try") ?? null;
  if (therapistWords.test(q)) return workflowGuides.find((g) => g.id === "therapist") ?? null;
  if (patientWords.test(q)) return workflowGuides.find((g) => g.id === "patient") ?? null;
  return null;
}
