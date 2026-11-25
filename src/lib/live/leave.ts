import { z } from "zod";

/**
 * People and HR, leave: clinicians request leave, a person approves or declines it, and approved
 * leave becomes time off (no new visits offered, booked visits flagged for reassignment). The
 * balances and the flags on a request are rules; the decision is always a person's.
 */
export const leaveTypes = [
  "Annual leave",
  "Personal leave",
  "Training",
  "Unpaid leave",
  "Other",
] as const;
export type LeaveType = (typeof leaveTypes)[number];

export const leaveStatuses = ["Pending", "Approved", "Declined", "Cancelled"] as const;
export type LeaveStatus = (typeof leaveStatuses)[number];

/** Yearly entitlement for a full five-day week, pro-rata to the days someone works. */
export const leaveRules = {
  annualDays: 20,
  personalDays: 10,
  /** Annual leave asked for with less notice than this is flagged as short notice. */
  noticeDays: 14,
  /** Personal leave can be recorded for days just gone, up to this many back. */
  backdateDays: 14,
} as const;

/** Which yearly balance a reason counts against; older time-off reasons map in too. */
export function balanceOf(reason: string): "annual" | "personal" | null {
  if (reason === "Annual leave") return "annual";
  if (reason === "Personal leave" || reason === "Sick leave" || reason === "Carer's leave") {
    return "personal";
  }
  return null;
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

export const leaveRequestSchema = z
  .object({
    from: day,
    to: day,
    type: z.enum(leaveTypes),
    note: z.string().trim().max(400),
  })
  .refine((v) => v.from <= v.to, { message: "The leave must end after it starts", path: ["to"] });
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

export const leaveDecisionSchema = z
  .object({
    id: z.string().min(1),
    decision: z.enum(["Approve", "Decline"]),
    note: z.string().trim().max(400),
  })
  .refine((v) => v.decision === "Approve" || v.note.length > 0, {
    message: "Say why the leave is declined",
    path: ["note"],
  });

export const leaveCancelSchema = z.object({ id: z.string().min(1) });

export type LeaveBalanceDto = {
  entitlement: number;
  /** Days already taken this calendar year. */
  taken: number;
  /** Approved days still to come this year. */
  booked: number;
  /** Days in requests waiting for a decision. */
  pending: number;
  remaining: number;
};

export type LeaveImpactDto = {
  workingDays: number;
  hours: number;
  /** Booked or held visits on those days, which need another clinician or a new time. */
  visits: { id: string; when: string; patient: string }[];
  /** Regular caseload visits from the practice system on those days. */
  caseloadVisits: number;
  /** Colleagues in the same discipline and region away on any of the same days. */
  teamAway: { name: string; from: string; to: string; status: "Approved" | "Pending" }[];
  shortNotice: boolean;
  /** Balance left if this request is approved; null when the type has no balance. */
  balanceAfter: number | null;
};

export type LeaveRequestDto = {
  id: string;
  ref: string;
  staffId: string;
  staffName: string;
  photoUrl: string | null;
  discipline: string;
  region: string;
  type: LeaveType;
  from: string;
  to: string;
  note: string;
  status: LeaveStatus;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
  impact: LeaveImpactDto;
};

export type AwayDto = {
  key: string;
  staffId: string;
  staffName: string;
  photoUrl: string | null;
  discipline: string;
  region: string;
  from: string;
  to: string;
  reason: string;
  status: "Approved" | "Pending";
};

export type StaffBalanceDto = {
  staffId: string;
  staffName: string;
  photoUrl: string | null;
  discipline: string;
  region: string;
  daysPerWeek: number;
  annual: LeaveBalanceDto;
  personal: LeaveBalanceDto;
};

export type LeaveBoardDto = {
  today: string;
  /** The working days shown on the Who's away calendar. */
  days: string[];
  summary: {
    pending: number;
    awayToday: number;
    awayNext14: number;
    visitsToCover: number;
    approvedDaysThisYear: number;
    /** Average hours from request to decision over the last 90 days; null with none decided. */
    avgDecisionHours: number | null;
  };
  pending: LeaveRequestDto[];
  history: LeaveRequestDto[];
  away: AwayDto[];
  balances: StaffBalanceDto[];
};

export type MyLeaveDto = {
  today: string;
  annual: LeaveBalanceDto;
  personal: LeaveBalanceDto;
  daysPerWeek: number;
  requests: LeaveRequestDto[];
};
