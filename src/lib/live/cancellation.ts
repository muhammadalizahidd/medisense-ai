import { CANCELLATION_NOTICE_HOURS } from "./catalogue";

export type CancelledBy = "client" | "medisense";

export type CancellationOutcome = {
  /** Whole hours of notice, never negative. */
  noticeHours: number;
  /** A client-side cancellation with less than 48 hours' notice. */
  late: boolean;
  status: "cancelled" | "late-cancelled";
};

const HOUR = 3_600_000;

/**
 * Medisense's policy (medisense.com.au): cancelling or rescheduling needs 48 hours' notice.
 * Only the client side can cancel late; when Medisense cancels, the client is never charged.
 */
export function classifyCancellation(start: Date, now: Date, by: CancelledBy): CancellationOutcome {
  const notice = start.getTime() - now.getTime();
  const late = by === "client" && notice < CANCELLATION_NOTICE_HOURS * HOUR;
  return {
    noticeHours: Math.max(0, Math.floor(notice / HOUR)),
    late,
    status: late ? "late-cancelled" : "cancelled",
  };
}

/** Plain words for the notice, shown before anyone confirms. */
export function noticeSummary(outcome: CancellationOutcome, by: CancelledBy) {
  const hours = `${outcome.noticeHours} ${outcome.noticeHours === 1 ? "hour" : "hours"}`;
  if (by === "medisense")
    return `Cancelled by Medisense with ${hours}' notice. The client isn't charged.`;
  if (outcome.late) {
    return `Only ${hours}' notice, less than ${CANCELLATION_NOTICE_HOURS}. This is a late cancellation and may be charged.`;
  }
  return `${hours}' notice, more than ${CANCELLATION_NOTICE_HOURS}. No charge applies.`;
}
