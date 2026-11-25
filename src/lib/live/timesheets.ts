import { z } from "zod";

/**
 * People and HR, timesheets. Each clinician's week is built from what the system already knows:
 * rostered hours, approved leave and the visits they delivered (time with the patient and travel).
 * The clinician corrects any day with a reason and submits; a person approves it or sends it back.
 * The figures and the checks are rules; the approval is always a person's.
 */
export const timesheetStatuses = ["Not submitted", "Submitted", "Approved", "Returned"] as const;
export type TimesheetStatus = (typeof timesheetStatuses)[number];

export const timesheetRules = {
  /** A week runs Monday to Sunday and is due by the end of the following Monday. */
  dueDaysAfterWeek: 1,
  /** How many past weeks are shown besides the current one. */
  weeksShown: 4,
  /** The longest day that can be recorded, in minutes. */
  maxDayMinutes: 14 * 60,
} as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

export const timesheetAdjustSchema = z
  .object({
    week: day,
    date: day,
    /** Minutes worked that day; null puts the day back to what the system worked out. */
    minutes: z.number().int().min(0).max(timesheetRules.maxDayMinutes).nullable(),
    reason: z.string().trim().max(200),
  })
  .refine((v) => v.minutes === null || v.reason.length >= 3, {
    message: "Say why the hours are different",
    path: ["reason"],
  });
export type TimesheetAdjustInput = z.infer<typeof timesheetAdjustSchema>;

export const timesheetSubmitSchema = z.object({
  week: day,
  comment: z.string().trim().max(400),
});

export const timesheetWeekSchema = z.object({ week: day });

export const timesheetDecisionSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(60),
    decision: z.enum(["Approve", "Return"]),
    note: z.string().trim().max(400),
  })
  .refine((v) => v.decision === "Approve" || v.note.length > 0, {
    message: "Say what needs fixing",
    path: ["note"],
  });
export type TimesheetDecisionInput = z.infer<typeof timesheetDecisionSchema>;

export const timesheetRemindSchema = z.object({
  staffIds: z.array(z.string().min(1)).min(1).max(60),
  week: day,
});

export type TimesheetVisitStatus = "Completed" | "Incomplete" | "Did not attend" | "Not closed off";

export interface TimesheetVisitDto {
  id: string;
  ref: string | null;
  start: string;
  end: string;
  patient: string;
  status: TimesheetVisitStatus;
  modality: "In person" | "Telehealth";
  clinicalMinutes: number;
  travelMinutes: number;
  /** True once the note is signed; null where no note is expected. */
  noteSigned: boolean | null;
}

export interface TimesheetDayDto {
  date: string;
  /** Rostered start and end, minutes after midnight; null on a day they don't work. */
  roster: { start: number; end: number } | null;
  rosteredMinutes: number;
  /** Approved leave that day (its type), counted instead of work. */
  leave: string | null;
  leaveMinutes: number;
  visits: TimesheetVisitDto[];
  clinicalMinutes: number;
  travelMinutes: number;
  /** What the system worked out before any correction. */
  suggestedMinutes: number;
  workedMinutes: number;
  adjustment: { minutes: number; reason: string } | null;
  outsideRoster: boolean;
}

export interface TimesheetTotalsDto {
  rostered: number;
  worked: number;
  leave: number;
  overtime: number;
  clinical: number;
  travel: number;
  /** Worked time that isn't with a patient or travelling: notes, meetings, admin. */
  other: number;
  visits: number;
}

export type TimesheetCheckKind =
  "unclosed" | "unsigned" | "overtime" | "adjusted" | "outside" | "leave-visit";

export interface TimesheetCheckDto {
  kind: TimesheetCheckKind;
  tone: "watch" | "over";
  text: string;
}

export interface TimesheetDto {
  /** Null until the clinician corrects, submits or is reminded about the week. */
  id: string | null;
  ref: string | null;
  staffId: string;
  staffName: string;
  photoUrl: string | null;
  discipline: string;
  region: string;
  employment: string;
  week: string;
  weekEnd: string;
  due: string;
  /** False for the current week until its last rostered day. */
  open: boolean;
  opensOn: string;
  status: TimesheetStatus;
  overdue: boolean;
  comment: string;
  submittedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
  remindedAt: string | null;
  days: TimesheetDayDto[];
  totals: TimesheetTotalsDto;
  checks: TimesheetCheckDto[];
  history: { action: string; byName: string; at: string; note: string }[];
}

export interface TimesheetWeekDto {
  week: string;
  label: string;
  current: boolean;
}

export interface TimesheetBoardDto {
  today: string;
  week: string;
  weeks: TimesheetWeekDto[];
  summary: {
    toApprove: number;
    notSubmitted: number;
    overdue: number;
    returned: number;
    approved: number;
    workedHours: number;
    overtimeHours: number;
    visits: number;
    clinicalHours: number;
  };
  /** Every clinician's sheet for the chosen week. */
  rows: TimesheetDto[];
  /** Submitted sheets from every week shown, oldest first. */
  queue: TimesheetDto[];
  /** Hours by week for the weeks shown, for the trend. */
  trend: {
    week: string;
    label: string;
    ordinary: number;
    overtime: number;
    leave: number;
  }[];
  history: {
    id: string;
    ref: string;
    staffName: string;
    photoUrl: string | null;
    week: string;
    status: TimesheetStatus;
    byName: string;
    at: string;
    note: string;
    workedMinutes: number;
  }[];
}

export interface MyTimesheetDto {
  today: string;
  week: string;
  weeks: (TimesheetWeekDto & { status: TimesheetStatus; overdue: boolean })[];
  sheet: TimesheetDto;
}

export const TIMESHEET_TONE: Record<TimesheetStatus, "neutral" | "watch" | "healthy" | "over"> = {
  "Not submitted": "neutral",
  Submitted: "watch",
  Approved: "healthy",
  Returned: "over",
};

/** "7 h 30 min", "45 min", "8 h". */
export function hoursLabel(minutes: number) {
  const m = Math.round(minutes);
  const h = Math.floor(Math.abs(m) / 60);
  const r = Math.abs(m) % 60;
  const sign = m < 0 ? "−" : "";
  if (!h) return `${sign}${r} min`;
  return r ? `${sign}${h} h ${r} min` : `${sign}${h} h`;
}

/** Decimal hours for payroll files and tables: 7.5. */
export const decimalHours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
