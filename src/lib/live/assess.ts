import { z } from "zod";

/**
 * Module 12: clinical assessments and the assessment builder. Templates are documentation aids,
 * never a diagnosis or treatment algorithm. No proprietary questions, norms or cut-offs are held:
 * scores are entered by the clinician with their instrument metadata.
 */

export const purposes = [
  "Initial",
  "Reassessment",
  "Follow-up",
  "Discharge",
  "Report-only",
  "Other",
] as const;
export const modes = [
  "Home",
  "School",
  "Daycare",
  "Day Program",
  "Community",
  "Telehealth",
  "Other",
] as const;
export const respondentRoles = [
  "Participant",
  "Guardian",
  "Carer",
  "Teacher",
  "Support Worker",
  "Interpreter",
  "Other",
] as const;
export const consentStates = ["Obtained", "Declined", "Pending", "Not applicable"] as const;
export const riskReviews = ["Reviewed", "Concern", "Unknown", "Escalated"] as const;
export const statuses = [
  "Requested",
  "Ready",
  "In Progress",
  "Paused",
  "Pending Review",
  "Pending Signature",
  "Finalised",
  "Amended",
  "Cancelled",
] as const;
export type AssessStatus = (typeof statuses)[number];
export const notAssessedReasons = [
  "Not applicable",
  "Not safe",
  "Refused",
  "Fatigue",
  "Time",
  "Technical issue",
  "Other",
] as const;
export const sources = [
  "Direct observation",
  "Participant report",
  "Guardian/carer report",
  "Teacher report",
  "Prior document",
  "Validated test",
  "Other",
] as const;
export const performance = [
  "Independent",
  "Modified independent",
  "Supervision",
  "Verbal prompting",
  "Partial physical assistance",
  "Full assistance / dependent",
  "Not assessed",
] as const;
export const contexts = ["Home", "School", "Community", "Telehealth", "Other"] as const;
export const frequencies = ["Always", "Often", "Sometimes", "Rarely", "Never", "Unknown"] as const;
export const results = [
  "Completed safely",
  "Completed with difficulty",
  "Not completed",
  "Not attempted",
  "Unable to assess",
] as const;
export const evidenceQuality = [
  "Observed",
  "Self-reported",
  "Proxy-reported",
  "Documented historical",
] as const;
export const evidenceTypes = [
  "Photo",
  "PDF",
  "Sketch",
  "Measurements",
  "Form",
  "Audio with consent",
  "Other",
] as const;
export const sensitivities = ["Standard", "Sensitive", "Restricted"] as const;
export const outcomes = [
  "Report only",
  "Treatment recommendation",
  "Further assessment",
  "Referral onward",
  "No further service",
  "Pause / not suitable",
  "Discharge",
] as const;
export type Outcome = (typeof outcomes)[number];
export const releaseStates = [
  "Not released",
  "Shared",
  "Withheld",
  "Additional consent required",
] as const;

export type Domain = {
  key: string;
  title: string;
  items: string[];
  hint: string;
  essential?: boolean;
  when?: "Home" | "School" | "Telehealth";
};

/** Sections every template keeps: they can't be removed (section 8). */
export const essentialDomains: Domain[] = [
  {
    key: "identity",
    title: "Identity, purpose and attendees",
    items: ["Purpose confirmed", "Attendees and respondents recorded"],
    hint: "Who was present and in what role",
    essential: true,
  },
  {
    key: "consent",
    title: "Consent",
    items: ["Assessment consent", "Information sharing", "Photo / recording permission"],
    hint: "Obtained, declined, pending or not applicable, with who and when",
    essential: true,
  },
  {
    key: "safety",
    title: "Risk and safety review",
    items: ["Visit safety", "Reported risks", "Escalation needed"],
    hint: "A concern opens a Clinical Lead review",
    essential: true,
  },
  {
    key: "summary",
    title: "Clinical summary",
    items: ["Presenting concerns", "Priority goals", "Limitations"],
    hint: "Participant report kept apart from clinician findings",
    essential: true,
  },
];

/** Shown when the location calls for them (M12-010, M12-011). */
export const contextDomains: Domain[] = [
  {
    key: "home-access",
    title: "Home environment and access",
    items: ["Entrance", "Stairs", "Bathroom", "Kitchen", "Bedroom", "Doorways"],
    hint: "Access photos only with specific permission",
    when: "Home",
  },
  {
    key: "school-site",
    title: "School authorisation and sources",
    items: ["School permission", "School contact", "Teacher input", "Classroom observation"],
    hint: "Teacher and parent reports kept distinct from direct observation",
    when: "School",
  },
  {
    key: "telehealth",
    title: "Telehealth suitability and limitations",
    items: ["Clinical suitability", "Identity check", "Privacy", "Tests limited remotely"],
    hint: "Remote observations are labelled remote; impossible tests are marked Limited",
    when: "Telehealth",
  },
];

export type Template = {
  id: string;
  title: string;
  discipline: string;
  supports: string[];
  version: string;
  domains: Domain[];
  instruments: string[];
};

const d = (key: string, title: string, items: string[], hint = ""): Domain => ({
  key,
  title,
  items,
  hint,
});

export const templates: Template[] = [
  {
    id: "ot-fca",
    title: "Occupational Therapy · Functional Capacity Assessment",
    discipline: "Occupational Therapy",
    supports: ["Functional Capacity Assessment", "Occupational Therapy"],
    version: "2.1",
    instruments: ["copm", "whodas", "gas"],
    domains: [
      d(
        "ndis-domains",
        "NDIS functional domains",
        [
          "Communication",
          "Learning",
          "Mobility",
          "Self-care",
          "Self-management",
          "Social interaction",
        ],
        "Select applicable domains with an evidence source",
      ),
      d(
        "personal-care",
        "Personal care",
        ["Bathing", "Dressing", "Toileting", "Grooming", "Eating", "Oral care"],
        "Assistance level, adaptations, frequency and context",
      ),
      d("iadl", "Instrumental daily activities", [
        "Meal preparation",
        "Shopping",
        "Cleaning",
        "Laundry",
        "Money",
        "Medication routines",
        "Transport",
      ]),
      d("mobility", "Mobility and transfers", [
        "Bed",
        "Chair",
        "Toilet",
        "Shower",
        "Vehicle",
        "Stairs",
        "Indoor/outdoor mobility",
      ]),
      d(
        "cognition",
        "Cognitive functional tasks",
        ["Memory", "Planning", "Attention", "Sequencing", "Initiation", "Problem-solving"],
        "Functional examples, not diagnosis",
      ),
      d("sensory", "Sensory and environment", [
        "Vision/hearing for task",
        "Sensory responses",
        "Noise",
        "Lighting",
        "Access barriers",
      ]),
      d("participation", "Community, school and work participation", [
        "School",
        "Employment",
        "Recreation",
        "Relationships",
        "Community access",
      ]),
      d(
        "carer",
        "Carer and support needs",
        ["Caregiver tasks", "Supervision", "Assistance", "Reported hours"],
        "Estimated vs observed support kept distinct",
      ),
      d("at", "Assistive technology", [
        "Current equipment",
        "Trial",
        "Fit",
        "Safety",
        "Training",
        "Maintenance",
      ]),
    ],
  },
  {
    id: "sil",
    title: "SIL / ILO housing assessment",
    discipline: "Occupational Therapy",
    supports: ["SIL/ILO Housing Assessment"],
    version: "1.3",
    instruments: ["whodas"],
    domains: [
      d("living", "Current living arrangement", [
        "With family",
        "Shared",
        "Independent",
        "Supported",
      ]),
      d("support-pattern", "Daily support pattern", [
        "Morning",
        "Day",
        "Evening",
        "Overnight",
        "Unpredictable",
      ]),
      d("supervision", "Safety and supervision", [
        "Environmental",
        "Behaviour support",
        "Medication routines",
        "Mobility",
      ]),
      d("routines", "Household routines", [
        "Meals",
        "Cleaning",
        "Personal care",
        "Community access",
      ]),
      d("compat", "Compatibility and preferences", [
        "Shared living tolerance",
        "Preferences",
        "Communication supports",
      ]),
      d(
        "model",
        "Support model comparison",
        ["SIL", "ILO", "Other arrangements"],
        "Recommendation only; never an eligibility decision",
      ),
    ],
  },
  {
    id: "sda",
    title: "SDA housing assessment",
    discipline: "Occupational Therapy",
    supports: ["SDA Housing Assessment"],
    version: "1.2",
    instruments: [],
    domains: [
      d("existing", "Existing accommodation", ["Type", "Tenure", "Accessibility issues"]),
      d("access", "Mobility and transfer accessibility", [
        "Entrances",
        "Circulation",
        "Bathrooms",
        "Kitchens",
        "Bedrooms",
      ]),
      d("support-env", "Support and environment requirements", [
        "Assistive technology",
        "Emergency egress",
        "Carers",
      ]),
      d(
        "design",
        "Housing design feature needs",
        ["Accessible design features"],
        "No automatic SDA category",
      ),
      d("justification", "Evidence and report", [
        "Functional justification",
        "Alternatives considered",
        "Housing options",
      ]),
    ],
  },
  {
    id: "home-mod",
    title: "Home Modification Assessment",
    discipline: "Occupational Therapy",
    supports: ["Home Mod Assessment"],
    version: "1.4",
    instruments: [],
    domains: [
      d(
        "areas",
        "Areas assessed",
        ["Entrance", "Ramp", "Bathroom", "Toilet", "Kitchen", "Bedroom", "Stairs"],
        "Each area a separate item with measurements",
      ),
      d("barriers", "Observed barriers", [
        "Door width",
        "Threshold",
        "Steps",
        "Reach",
        "Slip risk",
      ]),
      d("ability", "Current functional ability", [
        "Use of space",
        "Transfer type",
        "Assistance",
        "Device",
      ]),
      d("proposal", "Modification proposal", [
        "Minor",
        "Major",
        "Temporary",
        "Alternative equipment",
        "Further specialist review",
      ]),
      d("contractor", "Contractor / professional input", [
        "Requested",
        "Received",
        "Not applicable",
      ]),
    ],
  },
  {
    id: "at",
    title: "Assistive Technology Assessment",
    discipline: "Occupational Therapy",
    supports: ["Assistive Technology Assessment"],
    version: "1.5",
    instruments: [],
    domains: [
      d("category", "Device category", [
        "Mobility",
        "Seating",
        "Transfers",
        "Communication",
        "Self-care",
      ]),
      d("current", "Current device", ["Brand/model", "Size", "Condition", "Problems"]),
      d("requirement", "Functional requirement", ["Task", "Environment", "Goal", "Safety need"]),
      d(
        "trials",
        "Trial record",
        ["Date", "Setting", "Device", "Assistance", "Duration", "Response"],
        "Several trials, each with its own outcome",
      ),
      d("fit", "Fit and safety", ["Sizing", "Tolerance", "Pressure/skin", "Training needs"]),
      d("rec", "Recommendation", [
        "Suitable",
        "Suitable with changes",
        "Not suitable",
        "Trial further",
        "Specialist referral",
      ]),
    ],
  },
  {
    id: "physio",
    title: "Physiotherapy assessment",
    discipline: "Physiotherapy",
    supports: ["Physiotherapy"],
    version: "2.0",
    instruments: ["tug", "berg"],
    domains: [
      d("concern", "Primary concern", ["Body region", "Mechanism", "Symptom course"]),
      d("pain", "Pain", ["Location", "0–10 rating", "Aggravating factors", "Easing factors"]),
      d("rom", "Range of motion", ["Joint", "Side", "Movement", "Degrees"]),
      d("strength", "Strength", ["Muscle group", "Side", "Method", "Result"]),
      d("gait", "Gait and mobility", ["Distance", "Time", "Aids", "Assistance"]),
      d("balance", "Balance and falls", ["Fall history", "Circumstances", "Selected test"]),
      d("functional", "Functional tasks", ["Transfers", "Stairs", "Sit-to-stand", "Walking"]),
      d("tolerance", "Treatment tolerance", ["Symptoms", "Fatigue", "Adverse events"]),
    ],
  },
  {
    id: "ep",
    title: "Exercise Physiology assessment",
    discipline: "Exercise Physiology",
    supports: ["Exercise Physiology"],
    version: "1.6",
    instruments: ["tug"],
    domains: [
      d("baseline", "Activity baseline", ["Type", "Frequency", "Duration", "Barriers"]),
      d("tolerance", "Exercise tolerance", ["Mode", "Time", "Symptoms", "Perceived exertion"]),
      d("dose", "Exercise dose", ["Sets", "Repetitions", "Resistance", "Recovery"]),
      d("obs", "Relevant observations", ["Heart rate", "Blood pressure"]),
      d("test", "Functional test", ["Protocol", "Result", "Conditions"]),
      d("adherence", "Adherence and response", ["Completed", "Part completed", "Not attempted"]),
    ],
  },
  {
    id: "speech",
    title: "Speech and Language assessment",
    discipline: "Speech Pathology",
    supports: ["Speech Therapy", "Speech/Language Assessment"],
    version: "2.2",
    instruments: [],
    domains: [
      d("modality", "Communication modality", ["Spoken", "AAC", "Gesture", "Sign", "Multimodal"]),
      d("production", "Speech production", [
        "Target sound",
        "Attempts",
        "Accuracy method",
        "Cue level",
      ]),
      d("receptive", "Receptive language", ["Instructions", "Vocabulary", "Context"]),
      d("expressive", "Expressive language", ["Words", "Sentences", "Narrative", "Pragmatics"]),
      d("fluency", "Fluency and voice", ["History", "Observations"]),
      d("functional-comm", "Functional communication", ["Home", "School", "Work", "Community"]),
      d("aac", "AAC assessment", [
        "Device/strategy",
        "Access",
        "Partner training",
        "Trial outcomes",
      ]),
    ],
  },
  {
    id: "swallow",
    title: "Swallowing assessment",
    discipline: "Speech Pathology",
    supports: ["Swallowing Assessment"],
    version: "1.4",
    instruments: [],
    domains: [
      d("concern", "Referral concern", ["Coughing", "Choking episodes", "Prolonged meals"]),
      d(
        "history",
        "History and risk",
        ["Medical history", "Diet texture", "Chest infections"],
        "Red flags must escalate",
      ),
      d("oral", "Oral-motor and communication context", ["Clinician-selected items"]),
      d(
        "method",
        "Observation method",
        ["Bedside clinical", "Instrumental referral", "Records review"],
        "Not assumed safe by telehealth",
      ),
      d(
        "intake",
        "Intake and safety",
        ["Clinical findings", "Signs"],
        "No automatic food or fluid texture recommendation",
      ),
      d("rec", "Clinical recommendations", ["Further evaluation", "Referral", "Management plan"]),
    ],
  },
  {
    id: "psych",
    title: "Psychological assessment",
    discipline: "Psychology",
    supports: ["Psychological Assessment", "Psychological Therapy"],
    version: "1.8",
    instruments: ["k10", "dass21"],
    domains: [
      d(
        "concerns",
        "Presenting concerns",
        ["Statement", "Onset", "Impact", "Reason for referral"],
        "Restricted to psychology",
      ),
      d(
        "mse",
        "Mental status observations",
        ["Appearance", "Behaviour", "Mood", "Cognition"],
        "No diagnosis by checkbox",
      ),
      d("risk", "Risk and safety", [
        "Self-harm concern",
        "Other safety concern",
        "Not assessed / none documented",
      ]),
      d("impact", "Functional impact", [
        "Sleep",
        "Relationships",
        "Work",
        "School",
        "Daily activity",
      ]),
      d("goals", "Psychological goals", ["Patient-defined outcomes", "Approach", "Review"]),
    ],
  },
  {
    id: "trauma",
    title: "Trauma therapy assessment",
    discipline: "Trauma Therapy",
    supports: ["Trauma Therapy"],
    version: "1.2",
    instruments: [],
    domains: [
      d(
        "participation",
        "Trauma-informed participation",
        ["Choice", "Preferred supports", "Consent", "Boundaries"],
        "No forced recounting",
      ),
      d("impact", "Current symptoms and impact", ["Function-based observations"]),
      d("stabilisation", "Safety and stabilisation", ["Risk review", "Support review"]),
      d("approach", "Therapeutic approach", ["Selected approach", "Rationale", "Goals"]),
      d("review", "Outcome and review", ["Measures where indicated", "Reported functioning"]),
    ],
  },
  {
    id: "continence",
    title: "Nursing · Continence assessment",
    discipline: "Nursing",
    supports: ["Nursing"],
    version: "1.3",
    instruments: [],
    domains: [
      d("concern", "Continence concern", ["Urinary", "Bowel", "Both"]),
      d("diary", "Symptoms and diary", ["Pattern", "Urgency", "Episodes", "Timing"]),
      d("toileting", "Functional toileting", ["Mobility", "Cognition", "Access", "Assistance"]),
      d("skin", "Skin and hygiene", ["Observed skin issues", "Hygiene supports"]),
      d("aids", "Current aids", ["Product type", "Fit", "Use", "Issues"]),
      d("plan", "Plan and recommendation", ["Education", "Referral", "Monitoring", "Supports"]),
    ],
  },
  {
    id: "wound",
    title: "Nursing · Wound / catheter supports",
    discipline: "Nursing",
    supports: ["Nursing"],
    version: "1.1",
    instruments: [],
    domains: [
      d("category", "Support category", ["Wound", "Catheter", "Both"]),
      d(
        "wound",
        "Wound observation",
        ["Site", "Type", "Dimensions", "Exudate", "Surrounding skin"],
        "No photo by default",
      ),
      d("review", "Wound review", ["Pain", "Appearance changes", "Warning signs"]),
      d("catheter", "Catheter details", ["Type", "Indication", "Care tasks", "Issues"]),
      d("intervention", "Intervention record", ["Procedure", "Materials", "Response"]),
      d("monitoring", "Monitoring and referral", ["Review interval", "Concerns", "Escalation"]),
    ],
  },
  {
    id: "nurse-at",
    title: "Nursing · AT assessment",
    discipline: "Nursing",
    supports: ["Nursing"],
    version: "1.0",
    instruments: [],
    domains: [
      d("purpose", "Nursing AT purpose", ["Continence", "Pressure care", "Other"]),
      d("needs", "Device and support needs", ["Purpose", "Existing devices", "Trial results"]),
      d("education", "Risk and education", ["Skin safety", "Infection precautions", "Training"]),
    ],
  },
  {
    id: "podiatry",
    title: "Podiatry assessment",
    discipline: "Podiatry",
    supports: ["Podiatry"],
    version: "1.2",
    instruments: [],
    domains: [
      d("concern", "Presenting foot concern", ["Pain", "Skin", "Nails", "Function", "Footwear"]),
      d("foot", "Foot assessment", ["Location", "Laterality", "Circulation", "Sensation"]),
      d("footwear", "Footwear and orthoses", ["Fit", "Wear", "Support", "Trials"]),
      d("risk", "Relevant risk", ["Diabetes-related", "Wound", "Falls"]),
      d("plan", "Management plan", ["Intervention", "Education", "Referral", "Review"]),
    ],
  },
  {
    id: "dietetics",
    title: "Dietetics assessment",
    discipline: "Dietetics",
    supports: ["Other"],
    version: "1.1",
    instruments: [],
    domains: [
      d("concerns", "Nutrition concerns", ["Intake", "Appetite", "Restrictions", "Feeding needs"]),
      d("intake", "Dietary intake", ["Recall", "Food diary"], "Reported vs verified"),
      d(
        "anthro",
        "Anthropometrics",
        ["Height cm", "Weight kg", "Changes"],
        "Measured and reported kept distinct",
      ),
      d("measures", "Nutrition-related measures", ["Clinician-selected observations"]),
      d("goals", "Goals and support", ["Food access", "Routine", "Adherence"]),
    ],
  },
  {
    id: "custom",
    title: "Other / custom assessment",
    discipline: "Other",
    supports: ["Other"],
    version: "1.0",
    instruments: [],
    domains: [d("service", "Service and assessor", ["Service", "Discipline and competence"])],
  },
];

/** The instrument registry: metadata only, never questions, norms or cut-offs (section 10). */
export type Instrument = {
  id: string;
  name: string;
  edition: string;
  licence: "Licensed" | "Free to use" | "Unknown";
  scale: string;
  direction: "Higher is better" | "Lower is better" | "Clinician-defined";
  disciplines: string[];
  note: string;
};
export const instruments: Instrument[] = [
  {
    id: "copm",
    name: "COPM",
    edition: "5th ed.",
    licence: "Licensed",
    scale: "Performance and satisfaction 1–10",
    direction: "Higher is better",
    disciplines: ["Occupational Therapy"],
    note: "Manual entry; no significance calculation",
  },
  {
    id: "whodas",
    name: "WHODAS 2.0",
    edition: "12-item",
    licence: "Free to use",
    scale: "Clinician-entered summary score",
    direction: "Lower is better",
    disciplines: ["Occupational Therapy"],
    note: "Never infers disability eligibility",
  },
  {
    id: "gas",
    name: "Goal Attainment Scaling",
    edition: "Individual",
    licence: "Free to use",
    scale: "−2 to +2 per goal",
    direction: "Higher is better",
    disciplines: ["Occupational Therapy", "Speech Pathology", "Physiotherapy"],
    note: "No automatic T-scores",
  },
  {
    id: "tug",
    name: "Timed Up and Go",
    edition: "Standard",
    licence: "Free to use",
    scale: "Seconds",
    direction: "Lower is better",
    disciplines: ["Physiotherapy", "Exercise Physiology"],
    note: "No falls diagnosis from one result",
  },
  {
    id: "berg",
    name: "Berg Balance Scale",
    edition: "Total score",
    licence: "Licensed",
    scale: "Total entered by clinician",
    direction: "Higher is better",
    disciplines: ["Physiotherapy"],
    note: "No item reproduction or cut-off",
  },
  {
    id: "k10",
    name: "K10",
    edition: "Standard",
    licence: "Free to use",
    scale: "Clinician-entered total",
    direction: "Lower is better",
    disciplines: ["Psychology"],
    note: "No automatic diagnosis",
  },
  {
    id: "dass21",
    name: "DASS-21",
    edition: "21-item",
    licence: "Unknown",
    scale: "Subscale totals",
    direction: "Lower is better",
    disciplines: ["Psychology"],
    note: "Licence unconfirmed: restricted for scoring",
  },
];

export function templatesFor(discipline: string, support?: string) {
  const list = templates.filter((t) => t.discipline === discipline);
  return support
    ? [
        ...list.filter((t) => t.supports.includes(support)),
        ...list.filter((t) => !t.supports.includes(support)),
      ]
    : list;
}
export const templateById = (id: string) => templates.find((t) => t.id === id) ?? null;

/* ------------------------------------------------------------------ DTOs */

export type ObservationDto = {
  id: string;
  domain: string;
  item: string;
  source: string;
  performance: string;
  context: string;
  frequency: string;
  result: string;
  quality: string;
  notes: string;
  reason: string;
  date: string;
  author: string;
  visitId: string | null;
  aiSuggested: boolean;
  accepted: boolean;
};
export type MeasurementDto = {
  id: string;
  parameter: string;
  value: string;
  unit: string;
  method: string;
  side: string;
  device: string;
  conditions: string;
  date: string;
  author: string;
  reported: boolean;
};
export type ScoreDto = {
  id: string;
  instrument: string;
  version: string;
  score: string;
  domain: string;
  assessor: string;
  date: string;
  notes: string;
  restricted: boolean;
};
export type EvidenceDto = {
  id: string;
  type: string;
  caption: string;
  date: string;
  sensitivity: string;
  sharing: string;
  consent: string;
  author: string;
  domain: string;
};
export type VisitDto = {
  id: string;
  date: string;
  location: string;
  author: string;
  summary: string;
  paused: string;
  outstanding: string[];
};
export type ReportDto = {
  text: string;
  sections: { heading: string; body: string; cites: string[] }[];
  at: string;
  aiDrafted: boolean;
  reviewedBy: string | null;
  aiDisclosure: boolean;
};

export type AssessDto = {
  id: string;
  ref: string;
  clientId: string;
  participant: string;
  participantId: string;
  support: string;
  discipline: string;
  clinician: string;
  status: AssessStatus;
  legacyStatus: string;
  purpose: string;
  purposeOther: string;
  templateId: string;
  templateTitle: string;
  templateVersion: string;
  mode: string;
  modeOther: string;
  respondents: { id: string; name: string; role: string; permission: string }[];
  consent: string;
  photoConsent: string;
  risk: string;
  riskNote: string;
  domains: (Domain & {
    included: boolean;
    state: "Complete" | "Partial" | "Not started" | "Unable to assess";
    reason: string;
  })[];
  custom: {
    id: string;
    title: string;
    fields: { label: string; type: string; unit: string; options: string[]; value: string }[];
  }[];
  observations: ObservationDto[];
  measurements: MeasurementDto[];
  scores: ScoreDto[];
  evidence: EvidenceDto[];
  visits: VisitDto[];
  report: ReportDto | null;
  outcome: Outcome | "";
  outcomeNote: string;
  coSign: { required: boolean; by: string | null; at: string | null };
  release: {
    state: (typeof releaseStates)[number];
    recipients: string[];
    scope: string[];
    by: string | null;
    at: string | null;
  };
  signed: { by: string; at: string } | null;
  amendments: { reason: string; text: string; by: string; at: string }[];
  history: { at: string; by: string; action: string; reason: string }[];
  blockers: string[];
  baseline: {
    ref: string;
    date: string;
    measurements: MeasurementDto[];
    scores: ScoreDto[];
  } | null;
  restricted: boolean;
  canEdit: boolean;
  canCoSign: boolean;
  view: "clinical" | "status";
  nextVisit: string | null;
  contacts: string[];
  createdAt: string;
  updatedAt: string;
};

export type AssessRow = {
  id: string;
  ref: string;
  participant: string;
  participantId: string;
  clientId: string;
  support: string;
  discipline: string;
  clinician: string;
  status: AssessStatus;
  purpose: string;
  mode: string;
  risk: string;
  due: string | null;
  progress: number;
  visits: number;
  outcome: string;
  restricted: boolean;
  updatedAt: string;
};

/* ------------------------------------------------------------------ actions */

const t = (n: number) => z.string().trim().max(n);
export const assessActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("configure"),
    purpose: z.enum(purposes),
    purposeOther: t(200),
    templateId: t(40),
    mode: z.enum(modes),
    modeOther: t(200),
    consent: z.enum(consentStates),
    photoConsent: z.enum(consentStates),
    risk: z.enum(riskReviews),
    riskNote: t(800),
  }),
  z.object({
    type: z.literal("respondent"),
    name: t(120).min(2),
    role: z.enum(respondentRoles),
    permission: t(200),
  }),
  z.object({ type: z.literal("domain"), key: t(60), included: z.boolean() }),
  z.object({
    type: z.literal("unable"),
    key: t(60),
    reason: z.enum(notAssessedReasons),
    note: t(400),
  }),
  z.object({
    type: z.literal("custom"),
    title: t(120).min(2),
    fields: z
      .array(
        z.object({
          label: t(120).min(1),
          type: z.enum([
            "Short text",
            "Long text",
            "Single choice",
            "Multi-choice",
            "Number/unit",
            "Date",
          ]),
          unit: t(30),
          options: z.array(t(60)).max(12),
        }),
      )
      .min(1)
      .max(12),
  }),
  z.object({
    type: z.literal("observe"),
    domain: t(60),
    item: t(120).min(1),
    source: z.enum(sources),
    performance: z.enum(performance),
    context: z.enum(contexts),
    frequency: z.enum(frequencies),
    result: z.enum(results),
    quality: z.enum(evidenceQuality),
    notes: t(2000),
    reason: t(300),
  }),
  z.object({
    type: z.literal("measure"),
    parameter: t(120).min(2),
    value: t(40).min(1),
    unit: t(30),
    method: t(200),
    side: t(30),
    device: t(120),
    conditions: t(300),
    reported: z.boolean(),
  }),
  z.object({
    type: z.literal("score"),
    instrument: t(40),
    version: t(60),
    score: t(60).min(1),
    domain: t(120),
    notes: t(400),
  }),
  z.object({
    type: z.literal("evidence"),
    evidenceType: z.enum(evidenceTypes),
    caption: t(300).min(3),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sensitivity: z.enum(sensitivities),
    sharing: z.enum(["Care team only", "Shareable with consent", "Not shareable"]),
    domain: t(60),
  }),
  z.object({
    type: z.literal("visit"),
    location: z.enum(modes),
    summary: t(1500).min(3),
    paused: t(300),
    outstanding: z.array(t(120)).max(12),
  }),
  z.object({ type: z.literal("ai-report") }),
  z.object({ type: z.literal("review-report"), text: t(12000).min(20) }),
  z.object({ type: z.literal("accept-observation"), id: t(60) }),
  z.object({ type: z.literal("discard-observation"), id: t(60) }),
  z.object({
    type: z.literal("outcome"),
    outcome: z.enum(outcomes),
    note: t(1500).min(5, "Explain the outcome"),
  }),
  z.object({ type: z.literal("submit") }),
  z.object({ type: z.literal("sign") }),
  z.object({ type: z.literal("co-sign"), note: t(600) }),
  z.object({
    type: z.literal("release"),
    state: z.enum(releaseStates),
    recipients: z.array(t(120)).max(10),
    scope: z.array(t(80)).max(8),
  }),
  z.object({ type: z.literal("amend"), reason: t(400).min(5), text: t(4000).min(5) }),
  z.object({ type: z.literal("cancel"), reason: t(400).min(5) }),
]);
export type AssessAction = z.infer<typeof assessActionSchema>;

export const statusTone: Record<
  AssessStatus,
  "healthy" | "watch" | "over" | "available" | "neutral"
> = {
  Requested: "neutral",
  Ready: "available",
  "In Progress": "available",
  Paused: "watch",
  "Pending Review": "watch",
  "Pending Signature": "watch",
  Finalised: "healthy",
  Amended: "healthy",
  Cancelled: "neutral",
};
