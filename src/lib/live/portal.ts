import { z } from "zod";

/* Modules 18–22: the patient's own view. Only clinician-approved, released content appears here. */

export const pronounOptions = [
  "She/her",
  "He/him",
  "They/them",
  "Prefer not to say",
  "Other",
] as const;
export const contactChannels = ["Email", "SMS", "Phone", "Portal"] as const;
export const contactTimes = ["Morning", "Afternoon", "Evening", "Custom"] as const;
export const accessibilityOptions = [
  "Large text",
  "Easy read",
  "Interpreter",
  "Support person",
  "Other",
] as const;
export const bookingModes = [
  "Home",
  "School",
  "Daycare",
  "Day Program",
  "Other community location",
  "Telehealth",
] as const;
export const activityStatuses = ["Completed", "Partially Completed", "Skipped", "Unable"] as const;
export const uploadTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export const docCategories = [
  "Referral",
  "NDIS Plan",
  "Previous Assessment",
  "Consent",
  "Other",
] as const;
export const MAX_UPLOAD = 10 * 1024 * 1024;

export type PortalAppointment = {
  id: string;
  ref: string;
  start: string;
  end: string;
  service: string;
  clinician: string;
  mode: string;
  status: "Upcoming" | "Completed" | "Cancelled";
  detail: string;
  confirmed: boolean;
  telehealthJoinOpen: boolean;
  prep: string[];
  changeRequest: { type: string; reason: string; status: string; at: string } | null;
  events: { at: string; actor: string; action: string; reason: string }[];
};

export type PortalPlan = {
  id: string;
  service: string;
  clinician: string;
  version: number;
  reviewDate: string;
  state: string;
  acknowledged: string | null;
  precautions: string;
  goals: {
    id: string;
    title: string;
    description: string;
    type: string;
    unit: string;
    baseline: string;
    current: string;
    target: string;
    points: { date: string; value: number }[];
  }[];
  activities: {
    id: string;
    name: string;
    instructions: string;
    frequency: string;
    dose: string;
    logs: { status: string; reason: string; at: string; review: string }[];
  }[];
};

export type PortalDto = {
  profile: {
    mrn: string;
    legalName: string;
    preferredName: string;
    pronouns: string;
    dob: string;
    email: string;
    emailVerified: boolean;
    phone: string;
    phoneVerified: boolean;
    address: string;
    postal: string;
    postalSameAsHome: boolean;
    preferredLocation: string;
    emergency: { name: string; relationship: string; phone: string } | null;
    status: string;
  };
  prefs: {
    channel: string;
    time: string;
    language: string;
    interpreter: string;
    accessibility: string[];
    reminders: boolean;
  };
  funding: {
    program: string;
    number: string;
    revealed: boolean;
    type: string;
    start: string;
    end: string;
    status: string;
    verified: boolean;
    manager: string;
  } | null;
  referrals: {
    ref: string;
    submitted: string;
    status: string;
    services: { name: string; status: string }[];
    actionNeeded: string;
    question: string;
    canWithdraw: boolean;
    timeline: { status: string; at: string; note: string }[];
  }[];
  careTeam: { service: string; clinician: string; status: string }[];
  representatives: {
    name: string;
    role: string;
    relationship: string;
    status: string;
    expires: string;
    scope: string[];
  }[];
  requests: {
    id: string;
    field: string;
    to: string;
    kind: string;
    status: string;
    reason: string;
    at: string;
  }[];
  appointments: PortalAppointment[];
  bookingRequests: {
    id: string;
    service: string;
    mode: string;
    window: string;
    purpose: string;
    status: string;
    at: string;
  }[];
  plans: PortalPlan[];
  questionnaires: {
    id: string;
    title: string;
    status: string;
    items: { q: string; answer: string; na: boolean; required: boolean }[];
    at: string | null;
  }[];
  documents: {
    id: string;
    title: string;
    kind: string;
    date: string;
    version: string;
    unread: boolean;
    href: string | null;
  }[];
  uploads: { name: string; category: string; status: string; at: string }[];
  invoices: {
    id: string;
    number: string;
    status: string;
    total: number;
    paid: number;
    due: number;
    issuedAt: string | null;
    payment: string | null;
    payer: string;
    lines: { date: string; description: string; amount: number }[];
    disputed: string | null;
  }[];
  consents: {
    key: string;
    label: string;
    help: string;
    state: string;
    at: string | null;
    version: string;
    withdrawal: string | null;
  }[];
  actions: { kind: string; title: string; detail: string; tab: string }[];
  activity: { at: string; text: string }[];
};

/* ------------------------------------------------------------------ actions */

const t = (n: number) => z.string().trim().max(n);

export const portalActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("profile"),
    preferredName: t(60),
    pronouns: z.union([z.literal(""), z.enum(pronounOptions)]),
    postal: t(200),
    postalSameAsHome: z.boolean(),
    preferredLocation: t(60),
  }),
  z.object({
    type: z.literal("identity"),
    field: z.enum(["Legal first name", "Legal last name", "Date of birth"]),
    to: t(120),
    reason: t(300),
  }),
  z.object({
    type: z.literal("contact"),
    field: z.enum(["Email", "Mobile phone"]),
    to: t(120).min(3),
  }),
  z.object({ type: z.literal("verify"), field: z.enum(["Email", "Mobile phone"]), code: t(6) }),
  z.object({ type: z.literal("medical"), text: t(1000).min(5, "Describe what should change") }),
  z.object({ type: z.literal("withdraw"), id: t(60) }),
  z.object({
    type: z.literal("prefs"),
    channel: z.enum(contactChannels),
    time: z.enum(contactTimes),
    language: t(60),
    interpreter: z.enum(["Yes", "No", "Unsure"]),
    accessibility: z.array(z.enum(accessibilityOptions)).max(5),
    reminders: z.boolean(),
  }),
  z.object({ type: z.literal("reveal"), confirm: z.literal(true) }),
  z.object({
    type: z.literal("booking"),
    service: t(80).min(2),
    mode: z.enum(bookingModes),
    window: t(120).min(2, "Say when suits you"),
    purpose: t(300),
    address: t(200),
    siteContact: t(160),
    otherLocation: t(200),
    device: t(120),
  }),
  z.object({ type: z.literal("confirm"), appointmentId: t(40) }),
  z.object({
    type: z.literal("change"),
    appointmentId: t(40),
    kind: z.enum(["Change", "Cancel"]),
    reason: t(400).min(3, "Tell us why"),
    acknowledge: z.boolean(),
  }),
  z.object({ type: z.literal("acknowledge"), planId: t(40), version: z.number().int().min(1) }),
  z.object({
    type: z.literal("activity"),
    planId: t(40),
    activityId: t(60),
    status: z.enum(activityStatuses),
    reason: t(400),
  }),
  z.object({
    type: z.literal("questionnaire"),
    id: t(60),
    answers: z.array(z.object({ answer: t(300), na: z.boolean() })).max(20),
    submit: z.boolean(),
  }),
  z.object({
    type: z.literal("clarify"),
    planId: t(40),
    text: t(800).min(5, "Write your question"),
  }),
  z.object({
    type: z.literal("upload"),
    name: t(160).min(1),
    mime: t(120),
    size: z.number().int().min(1),
    category: z.enum(docCategories),
    consent: z.boolean(),
  }),
  z.object({ type: z.literal("pay"), invoiceId: t(40), method: z.enum(["Card", "Bank transfer"]) }),
  z.object({ type: z.literal("read"), id: t(80) }),
  z.object({
    type: z.literal("dispute"),
    invoiceId: t(40),
    reason: t(500).min(5, "Tell us what looks wrong"),
  }),
  z.object({
    type: z.literal("consent-withdraw"),
    key: t(40),
    reason: t(300),
  }),
  z.object({
    type: z.literal("referral-answer"),
    ref: t(60),
    text: t(3000),
    file: t(160),
  }),
  z.object({
    type: z.literal("referral-withdraw"),
    ref: t(60),
    reason: t(300).min(3, "Tell us why"),
  }),
]);
export type PortalAction = z.infer<typeof portalActionSchema>;

export const requestDecisionSchema = z.object({
  id: t(60),
  decision: z.enum(["Approve", "Reject"]),
  reason: t(300),
});
