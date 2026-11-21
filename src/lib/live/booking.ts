import { z } from "zod";
import type { Proposal } from "./agent";

/*
 * The booking agent: a guided assistant with a fixed set of tasks per role. Every step reads
 * live records (patients, assigned clinicians, real open slots) and the booking itself is a
 * proposal the person confirms.
 */

export const bookingTasks = ["book", "assign", "reschedule", "cancel"] as const;
export type BookingTask = (typeof bookingTasks)[number];

export type AgentTaskDto = { id: BookingTask; title: string; detail: string };

export type AgentPatientDto = {
  id: string;
  name: string;
  mrn: string;
  needs: { id: string; support: string; status: string; therapist: string | null }[];
};

export type AgentVisitDto = {
  id: string;
  ref: string;
  start: string;
  patient: string;
  clientId: string;
  therapist: string;
  service: string;
  modality: string;
};

export type BookingAgentDto = {
  role: "admin" | "therapist" | "client";
  name: string;
  tasks: AgentTaskDto[];
  patients: AgentPatientDto[];
  visits: AgentVisitDto[];
};

export type ClinicianOptionDto = {
  therapistId: string;
  name: string;
  discipline: string;
  region: string;
  score: number | null;
  reasons: string[];
  slots: string[];
};

export type ParsedRequest = {
  task: BookingTask | null;
  patientId: string | null;
  day: string | null;
  part: "morning" | "afternoon" | null;
  telehealth: boolean;
  ai: boolean;
};

const id = z.string().trim().max(40);
export const bookingActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("parse"), text: z.string().trim().min(1).max(400) }),
  z.object({
    type: z.literal("options"),
    task: z.enum(bookingTasks),
    clientId: id,
    needId: id.optional(),
    appointmentId: id.optional(),
  }),
  z.object({
    type: z.literal("propose"),
    task: z.enum(bookingTasks),
    clientId: id,
    needId: id.optional(),
    therapistId: id.optional(),
    appointmentId: id.optional(),
    start: z.iso.datetime().optional(),
    telehealth: z.boolean(),
    reason: z.string().trim().max(300).optional(),
  }),
]);
export type BookingAction = z.infer<typeof bookingActionSchema>;

export type ProposeResult = { proposal: Proposal; summary: string };
