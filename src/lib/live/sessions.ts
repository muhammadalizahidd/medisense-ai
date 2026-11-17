import { z } from "zod";

/* Module 14: Therapy Session Management. Shared by the server, the API and the screens. */

export const sessionPurposes = [
  "Initial Assessment",
  "Assessment Continuation",
  "Treatment",
  "Reassessment",
  "Review",
  "Care Coordination",
  "Other",
] as const;

export const sessionModes = [
  "Home",
  "School",
  "Daycare",
  "Day Program",
  "Other Community Location",
  "Telehealth",
] as const;
export type SessionMode = (typeof sessionModes)[number];

/** Attendance is independent from the note's record state and from any assessment state. */
export const attendanceStates = [
  "Scheduled",
  "Confirmed",
  "Arrived",
  "In Progress",
  "Completed",
  "Partially Completed",
  "Cancelled",
  "No Show",
  "Safety Stop",
] as const;
export type Attendance = (typeof attendanceStates)[number];

export const recordStates = [
  "Not Started",
  "Draft",
  "Awaiting Review",
  "Signed",
  "Amended",
] as const;
export type RecordState = (typeof recordStates)[number];

export const attendeeRoles = [
  "Participant",
  "Parent/Guardian",
  "Carer",
  "Support Worker",
  "Interpreter",
  "Educator",
  "Other",
] as const;

export const safetyStates = [
  "Clear",
  "Concern / Precaution",
  "Unsafe to Proceed",
  "Not Assessed",
] as const;
export type Safety = (typeof safetyStates)[number];

export const supportLevels = [
  "Independent",
  "Modified independent",
  "Supervision",
  "Prompting",
  "Physical assistance",
  "Dependent",
  "Unable to assess",
] as const;

export const responses = [
  "Tolerated",
  "Improved",
  "Limited",
  "Declined",
  "No Change",
  "Not Assessed",
] as const;

export const resultTypes = ["Numeric", "Ordinal", "Narrative", "Pass/Fail"] as const;
export const sources = ["Observed", "Patient-reported", "Third-party reported"] as const;
export const adverseOptions = ["No", "Yes", "Unknown"] as const;

export const dispositions = [
  "Continue",
  "Reassess",
  "Change Plan",
  "Refer",
  "Discharge Consideration",
  "Other",
] as const;

export const followUps = [
  "None",
  "New Session",
  "Further Assessment",
  "Report",
  "Care Coordination",
  "Urgent Clinical Escalation",
] as const;

export const verificationStates = ["Unverified", "Verified", "Disputed", "Not billable"] as const;
export type Verification = (typeof verificationStates)[number];

export const checkStates = ["Confirmed", "Unresolved", "Not applicable"] as const;
export type CheckState = (typeof checkStates)[number];

/** Pre-visit checklist items by delivery mode (section 6). */
export function checklistFor(mode: SessionMode): string[] {
  const common = ["Consent current", "Known risks reviewed", "Equipment ready", "Interpreter need"];
  switch (mode) {
    case "Home":
      return [
        "Address confirmed",
        "Access: stairs and entry",
        "Pets and smoking",
        "Infection precautions",
        "Manual handling",
        "Lone-worker check-in",
        ...common,
      ];
    case "School":
    case "Daycare":
    case "Day Program":
      return [
        "Site contact confirmed",
        "Guardian authority on file",
        "Site access permission",
        "Photography and privacy rules",
        "Activity window",
        ...common,
      ];
    case "Other Community Location":
      return [
        "Facility and meeting point",
        "Accessibility",
        "Private space for discussion",
        "Transport and weather",
        ...common,
      ];
    case "Telehealth":
      return [
        "Clinical suitability",
        "Device check",
        "Fallback phone number",
        "Identity check planned",
        "Video consent",
        ...common.filter((c) => c !== "Equipment ready"),
      ];
  }
}

/** Example activities by discipline (section 7); the clinician chooses, nothing is prescribed. */
export const activityCatalogue: Record<string, string[]> = {
  "Occupational Therapy": [
    "ADL task: showering",
    "ADL task: dressing",
    "Meal preparation",
    "Transfer practice",
    "Home environment review",
  ],
  Physiotherapy: ["Gait distance", "Strength exercises", "Range of motion", "Balance measure"],
  "Exercise Physiology": ["Aerobic session", "Resistance set", "Perceived exertion"],
  "Speech Pathology": ["Communication target", "Language task", "Swallowing review (in scope)"],
  Psychology: ["Session modality", "Patient-reported outcome", "Validated measure"],
  "Trauma Therapy": ["Session modality", "Patient-reported outcome", "Safety plan review"],
  Nursing: ["Continence observation", "Wound care", "Catheter care", "Vital signs"],
  Podiatry: ["Foot findings", "Nail and skin care", "Footwear review"],
  Dietetics: ["Nutrition intervention", "Reported intake", "Agreed measures"],
};

/** Units the session accepts; others are flagged for the clinician (AT-18). */
export const sessionUnits = [
  "",
  "m",
  "s",
  "min",
  "reps",
  "sets",
  "kg",
  "degrees",
  "%",
  "/10",
  "times",
  "mmHg",
  "bpm",
  "°C",
  "cm",
] as const;

/* ------------------------------------------------------------------ records */

export type InterventionRec = {
  id: string;
  activity: string;
  goalIds: string[];
  minutes: number | null;
  dose: { sets: string; reps: string; duration: string; resistance: string };
  resultType: (typeof resultTypes)[number];
  result: string;
  unit: string;
  method: string;
  support: string;
  response: string;
  narrative: string;
  source: (typeof sources)[number];
  adverse: (typeof adverseOptions)[number];
  adverseDetail: string;
  flags: string[];
  at: string;
  by: string;
};

export type AttendeeRec = {
  name: string;
  role: string;
  present: boolean;
  authority: string;
  recordingConsent: "Not asked" | "Given" | "Refused";
};

export type SessionFull = {
  id: string;
  ref: string;
  apt: string;
  view: "edit" | "lead" | "status" | "finance";
  participant: string;
  participantId: string;
  clientId: string;
  therapist: string;
  discipline: string;
  restricted: boolean;
  purpose: string;
  purposeOther: string;
  mode: SessionMode;
  siteDetail: string;
  address: string;
  siteContact: string;
  start: string;
  end: string;
  actualStart: string | null;
  actualEnd: string | null;
  directMinutes: number | null;
  docMinutes: number | null;
  attendance: Attendance;
  record: RecordState;
  verification: Verification;
  verificationNote: string;
  checklist: { item: string; state: CheckState | ""; note: string }[];
  identity: { identity: boolean; location: boolean; by: string; at: string } | null;
  attendees: AttendeeRec[];
  safety: { status: Safety; detail: string; action: string; escalated: boolean };
  goals: { id: string; title: string; previous: string; unit: string; context: string }[];
  planState: string;
  planId: string | null;
  interventions: InterventionRec[];
  assessments: {
    id: string;
    ref: string;
    title: string;
    status: string;
    sections: { id: string; title: string; done: boolean }[];
    performed: string[];
  }[];
  note: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    forPatient: string;
    aiDrafted: boolean;
    verified: boolean;
    status: string;
    signedAt: string | null;
    by: string;
    amendments: { reason: string; text: string; by: string; at: string }[];
  };
  noteGaps: string[];
  disposition: string;
  dispositionNote: string;
  followUps: { type: string; note: string; taskId: string | null }[];
  outcomeReason: string;
  telehealth: {
    id: string | null;
    state: string;
    recording: string;
    consent: { video: boolean; recording: boolean; transcription: boolean };
    events: { at: string; text: string }[];
  } | null;
  sync: {
    state: "Synced" | "Unsynced draft" | "Conflict";
    conflict: { field: string; mobile: string; web: string; at: string } | null;
  };
  brief: { text: string; sources: string[]; at: string } | null;
  risks: string[];
  previous: { date: string; summary: string; by: string }[];
  incident: { severity: string; detail: string; at: string; ref: string } | null;
  timeline: { at: string; by: string; action: string; reason: string }[];
  canEdit: boolean;
  canVerify: boolean;
};

export type SessionRow = {
  id: string;
  ref: string;
  apt: string;
  participant: string;
  participantId: string;
  therapist: string;
  discipline: string;
  purpose: string;
  mode: SessionMode;
  start: string;
  attendance: Attendance;
  record: RecordState;
  verification: Verification;
  safety: Safety;
  restricted: boolean;
  next: string;
  sync: "Synced" | "Unsynced draft" | "Conflict";
};

/* ------------------------------------------------------------------ actions */

const t = (n: number) => z.string().trim().max(n);

export const interventionInput = z.object({
  id: t(60).optional(),
  activity: t(160).min(2, "Name the activity"),
  goalIds: z.array(t(60)).max(12),
  minutes: z.number().int().min(1).max(480).nullable(),
  dose: z.object({ sets: t(20), reps: t(20), duration: t(40), resistance: t(60) }),
  resultType: z.enum(resultTypes),
  result: t(200),
  unit: t(20),
  method: t(200),
  support: t(60),
  response: z.enum(responses),
  narrative: t(1500),
  source: z.enum(sources),
  adverse: z.enum(adverseOptions),
  adverseDetail: t(800),
});
export type InterventionInput = z.infer<typeof interventionInput>;

export const sessionActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("details"),
    purpose: z.enum(sessionPurposes),
    purposeOther: t(300),
    siteDetail: t(300),
  }),
  z.object({
    type: z.literal("checklist"),
    item: t(80),
    state: z.enum(checkStates),
    note: t(300),
  }),
  z.object({
    type: z.literal("attendee"),
    attendee: z.object({
      name: t(120).min(2, "Name the attendee"),
      role: z.enum(attendeeRoles),
      present: z.boolean(),
      authority: t(160),
      recordingConsent: z.enum(["Not asked", "Given", "Refused"]),
    }),
  }),
  z.object({
    type: z.literal("check-in"),
    identity: z.boolean(),
    location: z.boolean(),
    safety: z.enum(safetyStates),
    safetyDetail: t(800),
    notes: t(800),
  }),
  z.object({
    type: z.literal("safety"),
    status: z.enum(safetyStates),
    detail: t(800),
    action: t(800),
  }),
  z.object({ type: z.literal("intervention"), intervention: interventionInput }),
  z.object({ type: z.literal("remove-intervention"), id: t(60) }),
  z.object({
    type: z.literal("assessment-sections"),
    assessmentId: t(40),
    sections: z.array(t(60)).max(40),
  }),
  z.object({
    type: z.literal("note"),
    subjective: t(3000),
    objective: t(3000),
    assessment: t(3000),
    plan: t(3000),
    forPatient: t(800),
    sign: z.boolean(),
  }),
  z.object({ type: z.literal("verify-ai") }),
  z.object({ type: z.literal("addendum"), reason: t(300).min(5), text: t(3000).min(5) }),
  z.object({
    type: z.literal("end"),
    disposition: z.enum(dispositions),
    note: t(800),
    partial: z.boolean(),
    remaining: t(800),
    followUps: z.array(z.object({ type: z.enum(followUps), note: t(300) })).max(6),
    docMinutes: z.number().int().min(0).max(240),
  }),
  z.object({ type: z.literal("no-show"), reason: t(500).min(3, "Say what happened") }),
  z.object({ type: z.literal("cancel"), reason: t(500).min(3, "Say why") }),
  z.object({ type: z.literal("abort"), reason: t(800).min(3), remaining: t(800) }),
  z.object({
    type: z.literal("times"),
    actualStart: z.iso.datetime(),
    actualEnd: z.iso.datetime(),
    reason: t(300),
  }),
  z.object({
    type: z.literal("verify"),
    state: z.enum(verificationStates),
    note: t(400),
  }),
  z.object({
    type: z.literal("resolve-conflict"),
    keep: z.enum(["mobile", "web"]),
  }),
  z.object({ type: z.literal("ai-brief") }),
  z.object({ type: z.literal("ai-note") }),
]);
export type SessionAction = z.infer<typeof sessionActionSchema>;

export const attendanceTone: Record<
  Attendance,
  "healthy" | "watch" | "over" | "available" | "outline"
> = {
  Scheduled: "outline",
  Confirmed: "available",
  Arrived: "available",
  "In Progress": "available",
  Completed: "healthy",
  "Partially Completed": "watch",
  Cancelled: "outline",
  "No Show": "over",
  "Safety Stop": "over",
};

export const recordTone: Record<
  RecordState,
  "healthy" | "watch" | "over" | "available" | "outline"
> = {
  "Not Started": "outline",
  Draft: "watch",
  "Awaiting Review": "watch",
  Signed: "healthy",
  Amended: "healthy",
};

/** Flags a measurement whose value doesn't fit its type or unit (AT-18). */
export function measurementFlags(i: {
  resultType: string;
  result: string;
  unit: string;
  method: string;
}): string[] {
  const out: string[] = [];
  if (i.resultType === "Numeric") {
    if (i.result && !/^-?\d+(\.\d+)?$/.test(i.result)) out.push("Value isn't a number");
    if (i.result && !i.unit) out.push("Add a unit");
    if (i.unit && !(sessionUnits as readonly string[]).includes(i.unit))
      out.push(`Unusual unit "${i.unit}"`);
    if (i.unit === "/10" && Number(i.result) > 10) out.push("A score out of 10 can't exceed 10");
    if (i.unit === "%" && Number(i.result) > 100) out.push("A percentage can't exceed 100");
    if (i.result && !i.method) out.push("Name the method so results compare");
  }
  return out;
}
