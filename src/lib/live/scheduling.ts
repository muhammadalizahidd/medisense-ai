import { z } from "zod";
import { serviceLocations } from "./catalogue";

/**
 * Module 05: scheduling and resource management. Booking, attendance, clinical and billing states
 * stay separate: this file only describes the booking side.
 */

/** Booking status as shown to staff (section 5), mapped from the stored visit state. */
export const bookingStatuses = [
  "Held",
  "Confirmed",
  "In Progress",
  "Completed",
  "Unable to Complete",
  "Cancelled",
  "No-show",
  "Rescheduled",
] as const;
export type BookingStatus = (typeof bookingStatuses)[number];

export const appointmentPurposes = [
  "Initial Assessment",
  "Assessment Continuation",
  "Treatment Session",
  "Review",
  "Telehealth Consultation",
] as const;
export type AppointmentPurpose = (typeof appointmentPurposes)[number];

export const assignmentModes = ["Manual", "AI Assisted", "Rules-Based Auto"] as const;
export type AssignmentMode = (typeof assignmentModes)[number];

export const reminderTriggers = [
  "Booking confirmed",
  "48 hours before",
  "24 hours before",
  "2 hours before",
] as const;
export type ReminderStatus = "Queued" | "Sent" | "Delivered" | "Failed" | "Suppressed";

/** All times are Brisbane time: Queensland has no daylight saving (AT-29). */
export const TIMEZONE_LABEL = "AEST · Brisbane";

const text = (max = 200) => z.string().trim().max(max);

/** What the booking needs to know about where the visit happens (section 6). */
export const siteSchema = z.object({
  location: z.enum(serviceLocations),
  /** Required when the visit isn't where the referral asked for (AT-28). */
  locationChangeReason: text(300),
  address: text(200),
  accessNotes: text(300),
  parking: text(120),
  pets: text(120),
  supportPerson: text(160),
  siteName: text(120),
  siteContact: text(120),
  sitePhone: text(30),
  room: text(80),
  permission: z.boolean(),
  deviceCheck: z.boolean(),
  consentPlan: z.boolean(),
  attendees: text(200),
});
export type SiteInput = z.infer<typeof siteSchema>;

/** Why a booking can't go ahead with these site details; empty when it can. */
export function siteGaps(s: SiteInput, preferred: string): string[] {
  const out: string[] = [];
  if (s.location !== preferred && !s.locationChangeReason) {
    out.push(
      `Say why the visit is at ${s.location.toLowerCase()} instead of ${preferred.toLowerCase()}`,
    );
  }
  switch (s.location) {
    case "Home":
      if (!s.address) out.push("Service address");
      if (!s.accessNotes) out.push("Access notes (entry, stairs, safety)");
      break;
    case "School":
    case "Daycare":
    case "Day Program":
      if (!s.siteName) out.push(`${s.location} name`);
      if (!s.siteContact) out.push("Authorised site contact");
      if (!s.permission) out.push("Site permission confirmed");
      break;
    case "Other community location":
      if (!s.siteName) out.push("Venue name");
      if (!s.address) out.push("Venue address");
      break;
    case "Telehealth":
      if (!s.deviceCheck) out.push("Device and connection check planned");
      if (!s.consentPlan) out.push("Identity and consent plan (recording stays off)");
      break;
  }
  return out;
}

export type ScheduleEventDto = {
  id: string;
  ref: string;
  start: string;
  end: string;
  status: BookingStatus;
  rawStatus: string;
  confirmation: "Confirmed by participant" | "Awaiting participant" | "Change requested";
  purpose: AppointmentPurpose;
  clientId: string;
  patient: string;
  therapistId: string;
  therapist: string;
  discipline: string;
  support: string;
  location: string;
  modality: "In person" | "Telehealth";
  series: { index: number; total: number } | null;
  flags: {
    kind: "conflict" | "leave" | "blocked" | "risk" | "funding" | "change";
    label: string;
  }[];
  site: SiteInput | null;
  history: { at: string; label: string; by: string }[];
  reminders: {
    trigger: string;
    channel: string;
    due: string;
    status: ReminderStatus;
    note: string;
  }[];
  noShow: { attempts: string; concern: boolean } | null;
  changeRequests: { at: string; note: string; resolved: boolean }[];
};

export type ScheduleBoardDto = {
  from: string;
  to: string;
  events: ScheduleEventDto[];
  unscheduled: {
    clientId: string;
    needId: string;
    patient: string;
    support: string;
    discipline: string;
    location: string;
    frequency: string;
    since: string;
    risk: boolean;
    funding: "Verified" | "Exception" | "Not reviewed";
  }[];
  pending: {
    clientId: string;
    patient: string;
    support: string;
    therapist: string;
    since: string;
  }[];
  therapists: { id: string; name: string; discipline: string; region: string }[];
  counts: {
    today: number;
    week: number;
    unscheduled: number;
    pending: number;
    exceptions: number;
    cancelledWeek: number;
    remindersFailed: number;
  };
  mode: AssignmentMode;
  /** True when site, safety and clinical detail is hidden for this viewer. */
  restricted?: boolean;
};
