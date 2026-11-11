import type { VisitStatus } from "./types";

/** Telehealth definitions (functional requirements, section 12). */

export const recordingStatuses = [
  "Off",
  "Consent Pending",
  "Ready",
  "Recording",
  "Paused",
  "Processing",
  "Available",
  "Access Restricted",
  "Deleted per policy",
] as const;
export type RecordingStatus = (typeof recordingStatuses)[number];

/**
 * PROPOSED: how long a recording is kept before deletion review. The requirements ask for a
 * clinically and legally approved policy, not a universal duration: Medisense confirms this.
 */
export const RECORDING_RETENTION_DAYS = 90;

export type CallState = "Not started" | "Waiting" | "In call" | "Ended";

export type Consent = { given: boolean; by: string; at: string } | null;

export type TelehealthDto = {
  visitId: string;
  clientId: string;
  patient: string;
  therapist: string;
  start: string;
  end: string;
  visitStatus: VisitStatus;
  state: CallState;
  linkSent: boolean;
  suitability: { ok: boolean; notes: string; byName: string } | null;
  guest: { name: string; relationship: string; verified: boolean } | null;
  consents: { video: Consent; recording: Consent; transcription: Consent; sharing: Consent };
  device: { camera: boolean; microphone: boolean; network: "good" | "poor" } | null;
  waitingSince: string | null;
  admittedAt: string | null;
  participants: { name: string; role: string; joinedAt: string }[];
  screenShare: boolean;
  recordingAllowed: boolean;
  recording: { status: RecordingStatus; durationSec: number; retentionUntil: string | null };
  transcript: { at: string; speaker: string; text: string }[];
  events: { at: string; text: string }[];
};

export type RecordingDto = {
  id: string;
  visitId: string;
  patient: string;
  therapist: string;
  at: string;
  status: RecordingStatus;
  durationSec: number;
  retentionUntil: string | null;
  deleted: { reason: string; byName: string; at: string } | null;
  accessLog: { byName: string; purpose: string; action: string; at: string }[];
  canManage: boolean;
};
