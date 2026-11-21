import { z } from "zod";

/*
 * Unified AI agents (v2.0 spec): one contract for every assistant. RAG answers from approved
 * sources with citations; tools read live records or propose changes; a person confirms each
 * change; every run is recorded with its outcome.
 */

export type Audience = "Admin" | "Therapist" | "Patient" | "Caregiver";

/** An approved source document the assistants may cite. */
export type SourceDoc = {
  id: string;
  title: string;
  version: string;
  status: "Approved" | "Draft" | "Superseded";
  approved: string;
  module: string;
  audience: Audience[];
  snippet: string;
};

export type RunStatus = "Proposed" | "Completed" | "Declined" | "Failed" | "Duplicate";

/** A state-changing action shown for confirmation before it runs. */
export type Proposal = {
  runId: string;
  tool: string;
  title: string;
  record: { label: string; href: string | null };
  before: string;
  after: string;
  preconditions: { label: string; ok: boolean }[];
  approver: string;
  status: RunStatus;
};

export type RunDto = Proposal & {
  requestedBy: string;
  role: string;
  at: string;
  decidedAt: string | null;
  decidedBy: string | null;
  result: string;
  feature: string;
};

export type AgentReply = {
  feature: { no: string; title: string } | null;
  outcome: "Answered" | "Need more information" | "No authorised source" | "Failed";
  answer: string;
  facts: string[];
  records: { label: string; href: string }[];
  sources: SourceDoc[];
  proposals: Proposal[];
  ai: boolean;
};

export type AgentFeature = { no: string; title: string; module: string; group: string };

export type AdminAgentDto = {
  features: AgentFeature[];
  briefing: { label: string; value: number; href: string; tone: "over" | "watch" | "neutral" }[];
  briefingText: string[];
  runs: RunDto[];
};

const t = (n: number) => z.string().trim().max(n);
export const agentActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ask"),
    text: t(800),
    feature: t(10).optional(),
    scope: z.enum(["My tasks", "This patient", "This record", "Organisation"]).optional(),
  }),
  z.object({ type: z.literal("confirm"), runId: t(40) }),
  z.object({ type: z.literal("decline"), runId: t(40), reason: t(300) }),
  z.object({ type: z.literal("retry"), runId: t(40) }),
]);
export type AgentAction = z.infer<typeof agentActionSchema>;
