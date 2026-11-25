import type { CredentialKind, CredentialStatus, EngagementStatus } from "./staff";

/**
 * People and HR: credential alerts across every staff member. The alert windows are rules: a
 * credential is flagged 90, 60 and 30 days before it expires, and an expired or unverified
 * required credential stops new bookings (Module 04's hard stop).
 */
export const alertWindows = [30, 60, 90] as const;

export type CredentialAlertKind =
  | "Expired"
  | "Expires within 30 days"
  | "Expires within 60 days"
  | "Expires within 90 days"
  | "Awaiting review"
  | "Rejected"
  | "Not submitted";

export type CredentialRowDto = {
  /** Staff record id plus credential id: unique across the register. */
  key: string;
  staffId: string;
  staffName: string;
  photoUrl: string | null;
  discipline: string;
  region: string;
  staffStatus: EngagementStatus;
  credentialId: string;
  kind: CredentialKind;
  name: string;
  body: string;
  number: string;
  expiry: string;
  status: CredentialStatus;
  required: boolean;
  /** Days until expiry; negative once expired; null when it doesn't expire. */
  daysLeft: number | null;
  /** Set when the credential needs attention; null when it's current and verified. */
  alert: CredentialAlertKind | null;
  /** True when this credential alone stops the clinician being offered new patients. */
  blocksBookings: boolean;
  /** Booked or held visits on or after the expiry date that this credential puts at risk. */
  visitsAfterExpiry: number;
  activePatients: number;
  renewal: { requestedAt: string; byName: string } | null;
};

export type CredentialAlertsDto = {
  today: string;
  summary: {
    staff: number;
    /** Staff whose every required credential is verified and current. */
    compliant: number;
    expired: number;
    within30: number;
    within90: number;
    review: number;
    /** Staff who can't be offered new patients because of a credential. */
    blockedStaff: number;
    visitsAtRisk: number;
  };
  rows: CredentialRowDto[];
};
