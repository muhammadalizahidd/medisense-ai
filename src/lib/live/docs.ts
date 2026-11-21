import { z } from "zod";

/* Module 15: AI Clinical Documentation. Shared by the server, the API and the screens. */

export const docStatuses = [
  "Capturing",
  "AI Draft",
  "Editing",
  "Needs Review",
  "Awaiting Co-sign",
  "Signed",
  "Addendum",
] as const;
export type DocStatus = (typeof docStatuses)[number];

export const noteTypes = [
  "SOAP",
  "DAP",
  "Therapy session note",
  "Initial assessment summary",
  "FCA observation summary",
  "Telehealth consultation",
  "Incident-related note",
  "Discharge summary draft",
] as const;
export type NoteType = (typeof noteTypes)[number];

export const captureMethods = [
  "Typed",
  "Dictated",
  "Transcript import",
  "Approved source compilation",
] as const;

export const docModes = [
  "Home",
  "School",
  "Daycare",
  "Day Program",
  "Community",
  "Telehealth",
  "Other",
] as const;
export const speakers = ["Clinician", "Participant", "Carer", "Unknown"] as const;
export const consentStates = [
  "Granted",
  "Declined",
  "Withdrawn",
  "Pending",
  "Not required",
] as const;
export const amendReasons = ["Correction", "Addition", "Late entry", "Other"] as const;
export const shareRecipients = [
  "Participant",
  "Authorised representative",
  "General practitioner",
  "Support coordinator",
] as const;

/** Sections per note type (section 4). Required sections block signing while empty. */
export const templates: Record<NoteType, { key: string; title: string; required: boolean }[]> = {
  SOAP: [
    { key: "s", title: "Subjective", required: true },
    { key: "o", title: "Objective", required: true },
    { key: "a", title: "Assessment", required: true },
    { key: "p", title: "Plan", required: true },
  ],
  DAP: [
    { key: "d", title: "Data", required: true },
    { key: "a", title: "Assessment", required: true },
    { key: "p", title: "Plan", required: true },
  ],
  "Therapy session note": [
    { key: "attendance", title: "Attendance and location", required: true },
    { key: "interventions", title: "Interventions and dose", required: true },
    { key: "measures", title: "Measures and response", required: true },
    { key: "deviations", title: "Deviations", required: false },
    { key: "followup", title: "Follow-up", required: true },
  ],
  "Initial assessment summary": [
    { key: "reason", title: "Reason for referral", required: true },
    { key: "history", title: "History", required: true },
    { key: "consent", title: "Consent", required: true },
    { key: "observations", title: "Tests and observations", required: true },
    { key: "synthesis", title: "Clinical synthesis", required: true },
    { key: "recs", title: "Recommendations", required: true },
  ],
  "FCA observation summary": [
    { key: "domains", title: "Assessed functional domains", required: true },
    { key: "evidence", title: "Evidence and assistance", required: true },
    { key: "limits", title: "Limitations", required: true },
    { key: "recs", title: "Recommendations", required: true },
  ],
  "Telehealth consultation": [
    { key: "identity", title: "Identity, attendees and consent", required: true },
    { key: "issues", title: "Presenting issues", required: true },
    { key: "assessment", title: "Assessment", required: true },
    { key: "interventions", title: "Interventions", required: false },
    { key: "followup", title: "Follow-up", required: true },
  ],
  "Incident-related note": [
    { key: "observations", title: "Clinical observations", required: true },
    { key: "response", title: "Immediate response", required: true },
    { key: "escalation", title: "Escalation", required: true },
    { key: "followup", title: "Follow-up", required: true },
  ],
  "Discharge summary draft": [
    { key: "dates", title: "Episode dates", required: true },
    { key: "goals", title: "Goals and outcomes", required: true },
    { key: "referrals", title: "Referrals", required: false },
    { key: "followup", title: "Follow-up", required: true },
  ],
};

export type SectionState = "pending" | "accepted" | "edited" | "rejected" | "clinician";

export type DocSection = {
  key: string;
  title: string;
  required: boolean;
  text: string;
  origin: "clinician" | "ai";
  state: SectionState;
  cites: string[];
};

export type TranscriptSeg = {
  id: string;
  speaker: (typeof speakers)[number];
  at: number;
  text: string;
  original: string;
  uncertain: boolean;
  corrected: boolean;
};

export type SourceItem = {
  id: string;
  kind: "Observation" | "Transcript" | "Session activity" | "Signed note" | "Assessment value";
  label: string;
  text: string;
  date: string;
  reported: "Observed" | "Participant-reported" | "Carer or teacher-reported" | "Recorded";
};

export type Warning = {
  id: string;
  kind: "Conflict" | "Unsupported" | "Uncertain" | "Mismatch" | "Risk";
  text: string;
  resolved: boolean;
  resolution: string;
};

export type DocFull = {
  id: string;
  ref: string;
  view: "edit" | "supervisor" | "status";
  participant: string;
  participantId: string;
  discipline: string;
  clinician: string;
  noteType: NoteType;
  capture: string;
  mode: string;
  encounterAt: string;
  appointment: { id: string; ref: string; when: string } | null;
  unlinkedReason: string;
  status: DocStatus;
  overdue: boolean;
  restricted: boolean;
  observations: string;
  dictation: { seconds: number; language: string };
  transcript: TranscriptSeg[];
  consents: { recording: string; ai: string; sharing: string };
  sources: SourceItem[];
  selected: string[];
  sections: DocSection[];
  warnings: Warning[];
  reviewedAck: boolean;
  signed: { by: string; at: string } | null;
  coSign: {
    required: boolean;
    supervisor: string;
    status: string;
    note: string;
    at: string | null;
  };
  addenda: { reason: string; text: string; by: string; at: string }[];
  shares: { recipient: string; summary: string; by: string; at: string }[];
  offline: {
    state: "Synced" | "Unsynced draft" | "Conflict";
    conflict: { section: string; mobile: string; web: string } | null;
  };
  aiAt: string | null;
  blockers: string[];
  timeline: { at: string; by: string; action: string; reason: string }[];
  canEdit: boolean;
  canSupervise: boolean;
};

export type DocRow = {
  id: string;
  ref: string;
  participant: string;
  participantId: string;
  discipline: string;
  clinician: string;
  noteType: NoteType;
  capture: string;
  mode: string;
  status: DocStatus;
  encounterAt: string;
  overdue: boolean;
  priority: "Routine" | "Due Soon" | "Overdue" | "Escalated";
  restricted: boolean;
  warnings: number;
  aiUsed: boolean;
  supervised: boolean;
};

export type DocOption = {
  clientId: string;
  participant: string;
  participantId: string;
  needId: string;
  discipline: string;
  appointments: { id: string; ref: string; when: string; mode: string }[];
};

/* ------------------------------------------------------------------ actions */

const t = (n: number) => z.string().trim().max(n);

export const createDocSchema = z.object({
  clientId: t(40).min(1),
  needId: t(60).min(1),
  appointmentId: t(40),
  unlinkedReason: t(300),
  noteType: z.enum(noteTypes),
  capture: z.enum(captureMethods),
  confirmIdentity: z.literal(true, { message: "Confirm the participant and encounter" }),
});

export const docActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("observations"), text: t(6000) }),
  z.object({
    type: z.literal("dictation"),
    seconds: z.number().int().min(1).max(3600),
    language: t(40),
  }),
  z.object({
    type: z.literal("segment"),
    id: t(60),
    text: t(1000),
    speaker: z.enum(speakers),
    confirm: z.boolean(),
  }),
  z.object({ type: z.literal("redact"), id: t(60) }),
  z.object({ type: z.literal("sources"), selected: z.array(t(80)).max(60) }),
  z.object({ type: z.literal("generate") }),
  z.object({
    type: z.literal("section"),
    key: t(40),
    text: t(4000),
    state: z.enum(["accepted", "edited", "rejected", "clinician"]),
  }),
  z.object({
    type: z.literal("resolve"),
    id: t(60),
    resolution: t(400).min(3, "Say how it was resolved"),
  }),
  z.object({
    type: z.literal("consent"),
    which: z.enum(["recording", "ai", "sharing"]),
    state: z.enum(consentStates),
  }),
  z.object({ type: z.literal("review"), ack: z.boolean() }),
  z.object({ type: z.literal("submit") }),
  z.object({ type: z.literal("sign") }),
  z.object({
    type: z.literal("co-sign"),
    decision: z.enum(["Approve", "Request changes"]),
    note: t(600),
  }),
  z.object({ type: z.literal("addendum"), reason: z.enum(amendReasons), text: t(3000).min(5) }),
  z.object({
    type: z.literal("share"),
    recipient: z.enum(shareRecipients),
    authorityChecked: z.boolean(),
    summary: t(1500).min(10, "Write the summary to share"),
  }),
  z.object({ type: z.literal("resolve-sync"), keep: z.enum(["mobile", "web"]) }),
]);
export type DocAction = z.infer<typeof docActionSchema>;

export const statusTone: Record<DocStatus, "healthy" | "watch" | "over" | "available" | "outline"> =
  {
    Capturing: "outline",
    "AI Draft": "watch",
    Editing: "available",
    "Needs Review": "watch",
    "Awaiting Co-sign": "watch",
    Signed: "healthy",
    Addendum: "healthy",
  };

/**
 * Numbers with units, read from source text, so contradictory measures can be flagged before
 * signing (AT-18). A rule, not AI: it compares like units only and never chooses a winner.
 */
export function measuresIn(text: string): { value: number; unit: string; raw: string }[] {
  const out: { value: number; unit: string; raw: string }[] = [];
  const re = /(\d+(?:\.\d+)?)\s?(m|metres|meters|cm|kg|degrees|°|reps|seconds|s|minutes|min)\b/gi;
  for (const m of text.matchAll(re)) {
    const unit = (m[2] ?? "")
      .toLowerCase()
      .replace(/^metres$|^meters$/, "m")
      .replace(/^seconds$/, "s")
      .replace(/^minutes$/, "min")
      .replace("°", "degrees");
    out.push({ value: Number(m[1]), unit, raw: m[0] });
  }
  return out;
}
