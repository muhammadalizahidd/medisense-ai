import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import {
  ruleInputSchema,
  unsafeRule,
  type MatchCaseDto,
  type OpsHubDto,
  type RuleDto,
  type RuleInput,
} from "@/lib/live/operations";
import { emptyReferral, needsRiskReview, type ReferralInput } from "@/lib/live/referral";
import { autoAllocate, matchesFor, requestTherapist } from "./care-admin";
import { collections } from "./db";
import { nextRef } from "./finance";
import { UserFacingError } from "./http";
import { audit } from "./live";
import {
  approvalDto,
  canSee,
  logRun,
  messageDto,
  opsCan,
  opsChanged,
  opsSettings,
  requestApproval,
  runDto,
  staffList,
  taskDto,
} from "./operations";
import { ensureRules, lastScan, replayEvent, scanAll, simulateRule } from "./operations-engine";
import { makePdf, reviewsFor } from "./operations-review";
import { ensureVolume } from "./operations-volume";
import { referralAction, submitReferral } from "./referrals";
import { seedAdmins, staffPasswordHash } from "./seed";
import { orgSettings } from "./settings";
import type { OpsRuleDoc, UserDoc } from "./models";

/* ------------------------------------------------------------------ rules (OP-028 to OP-031) */

function ruleDto(
  r: OpsRuleDoc,
  stats: Map<string, { runs: number; created: number; errors: number; last: Date | null }>,
  pending: Set<string>,
): RuleDto {
  const s = stats.get(r.code);
  const { _id, versions, createdAt, updatedAt, ...rest } = r;
  void createdAt;
  void updatedAt;
  return {
    ...rest,
    id: _id.toHexString(),
    versions: versions.map((v) => ({
      version: v.version,
      by: v.by,
      reason: v.reason,
      at: v.at.toISOString(),
    })),
    runs: s?.runs ?? 0,
    created: s?.created ?? 0,
    errors: s?.errors ?? 0,
    lastRun: s?.last?.toISOString() ?? null,
    pendingApproval: pending.has(_id.toHexString()),
  };
}

function mustManage(u: UserDoc) {
  if (!opsCan(u).manager) {
    throw new UserFacingError(
      "Only the Director or an Operations Manager can change workflow rules.",
      409,
    );
  }
}

export async function ruleDetail(u: UserDoc, id: ObjectId) {
  const { opsRules, opsRuns, opsApprovals } = await collections();
  const r = await opsRules.findOne({ _id: id });
  if (!r) throw new UserFacingError("Rule not found.", 404);
  const runs = await opsRuns.find({ ruleCode: r.code }).sort({ at: -1 }).limit(60).toArray();
  const approvals = await opsApprovals.find({ ruleId: id }).sort({ createdAt: -1 }).toArray();
  const stats = new Map([
    [
      r.code,
      {
        runs: runs.length,
        created: runs.filter((x) => x.outcome === "Task created").length,
        errors: runs.filter((x) => x.outcome === "Error").length,
        last: runs[0]?.at ?? null,
      },
    ],
  ]);
  const pending = new Set(
    approvals.filter((a) => a.status === "Pending").map(() => id.toHexString()),
  );
  return {
    rule: ruleDto(r, stats, pending),
    snapshots: r.versions.map((v) => ({ version: v.version, snapshot: v.snapshot })),
    runs: runs.map(runDto),
    approvals: approvals.map((a) => approvalDto(a, u, opsCan(u))),
    can: opsCan(u),
  };
}

/** Saving creates a new version. A changed active rule goes back to Draft until it's approved again. */
export async function saveRule(u: UserDoc, id: ObjectId | null, input: RuleInput) {
  mustManage(u);
  const problems = unsafeRule(input);
  if (problems.length) throw new UserFacingError(problems.join(" "));
  const { opsRules } = await collections();
  const now = new Date();
  if (!id) {
    const codes = (await opsRules.find({}, { projection: { code: 1 } }).toArray()).map(
      (r) => Number(r.code.slice(4)) || 0,
    );
    const ruleCode = `AUT-${String(Math.max(17, ...codes) + 1).padStart(2, "0")}`;
    const _id = new ObjectId();
    await opsRules.insertOne({
      _id,
      ...input,
      // New rules start in Suggest Only unless they are simulation-only (section 6).
      runMode: input.runMode === "Simulation" ? "Simulation" : "Suggest Only",
      code: ruleCode,
      status: "Draft",
      version: 1,
      versions: [{ version: 1, by: u.name, reason: input.changeReason, at: now, snapshot: input }],
      check:
        input.conditions.map((c) => `${c.field} ${c.op} ${c.value}`).join(` ${input.join} `) ||
        "No extra conditions",
      proposedAction: input.action,
      defaultOwnerLabel: input.team,
      builtIn: false,
      createdAt: now,
      updatedAt: now,
    });
    await audit(u, `Operations: rule ${ruleCode} created as Draft`, null);
    await opsChanged();
    return { id: _id.toHexString() };
  }
  const r = await opsRules.findOne({ _id: id });
  if (!r) throw new UserFacingError("Rule not found.", 404);
  if (r.status === "Archived") throw new UserFacingError("An archived rule can't be edited.", 409);
  const version = r.version + 1;
  await opsRules.updateOne(
    { _id: id },
    {
      $set: {
        ...input,
        version,
        status: r.status === "Active" || r.status === "Paused" ? "Draft" : r.status,
        updatedAt: now,
      },
      $push: {
        versions: { version, by: u.name, reason: input.changeReason, at: now, snapshot: input },
      },
    },
  );
  await audit(u, `Operations: rule ${r.code} v${version} saved (${input.changeReason})`, null);
  await opsChanged();
  return { id: id.toHexString() };
}

export const ruleActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("simulate") }),
  z.object({ type: z.literal("request-activation"), note: z.string().trim().max(500).default("") }),
  z.object({
    type: z.literal("pause"),
    reason: z.string().trim().min(3, "Say why the rule is pausing").max(300),
  }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("archive"), reason: z.string().trim().min(3).max(300) }),
  z.object({ type: z.literal("rollback"), version: z.number().int().min(1) }),
  z.object({ type: z.literal("save"), rule: ruleInputSchema }),
]);

export async function ruleAction(
  u: UserDoc,
  id: ObjectId,
  action: z.infer<typeof ruleActionSchema>,
) {
  const { opsRules, opsRuns } = await collections();
  const r = await opsRules.findOne({ _id: id });
  if (!r) throw new UserFacingError("Rule not found.", 404);
  if (action.type === "simulate") {
    if (u.role !== "admin") throw new UserFacingError("Only admin staff simulate rules.", 409);
    return simulateRule(r, u.name);
  }
  mustManage(u);
  const now = new Date();
  switch (action.type) {
    case "save":
      return saveRule(u, id, action.rule);
    case "request-activation": {
      if (r.status === "Active") throw new UserFacingError("This rule is already active.", 409);
      // Activation needs a reviewed simulation of this exact version (OP-030).
      const simulated = await opsRuns.findOne({
        ruleCode: r.code,
        ruleVersion: r.version,
        outcome: "Simulated",
      });
      if (!simulated)
        throw new UserFacingError(
          `Simulate version ${r.version} before asking for activation.`,
          409,
        );
      await requestApproval({
        key: `activate:${r._id.toHexString()}:v${r.version}`,
        workflow: "Workflow rule activation",
        title: `Activate ${r.code} ${r.name} v${r.version}`,
        reason: action.note || `Simulation ${simulated.ref}: ${simulated.detail}`,
        initiator: u.name,
        related: {
          label: `${r.code} v${r.version}`,
          href: `/care/operations/rules/${r._id.toHexString()}`,
        },
        taskId: null,
        ruleId: r._id,
        restricted: false,
        slaHours: 16,
      });
      await audit(u, `Operations: activation of ${r.code} v${r.version} requested`, null);
      break;
    }
    case "pause":
      if (r.status !== "Active")
        throw new UserFacingError("Only an active rule can be paused.", 409);
      await opsRules.updateOne({ _id: id }, { $set: { status: "Paused", updatedAt: now } });
      await logRun({
        key: `pause:${r.code}:${now.getTime()}`,
        ruleCode: r.code,
        ruleName: r.name,
        ruleVersion: r.version,
        trigger: r.trigger,
        entity: "Rule",
        input: `Paused by ${u.name}`,
        actions: [],
        outcome: "Suppressed",
        detail: `Paused: ${action.reason}. Existing tasks and past runs are kept; new triggers are suppressed.`,
        mode: r.runMode,
      });
      await audit(u, `Operations: ${r.code} paused (${action.reason})`, null);
      break;
    case "resume":
      if (r.status !== "Paused") throw new UserFacingError("Only a paused rule can resume.", 409);
      await opsRules.updateOne({ _id: id }, { $set: { status: "Active", updatedAt: now } });
      await audit(u, `Operations: ${r.code} resumed`, null);
      break;
    case "archive":
      await opsRules.updateOne({ _id: id }, { $set: { status: "Archived", updatedAt: now } });
      await audit(u, `Operations: ${r.code} archived (${action.reason})`, null);
      break;
    case "rollback": {
      const target = r.versions.find((v) => v.version === action.version);
      if (!target) throw new UserFacingError("That version doesn't exist.", 404);
      return saveRule(u, id, {
        ...target.snapshot,
        changeReason: `Rolled back to version ${action.version}`,
      });
    }
  }
  await opsChanged();
  return { ok: true };
}

/** Called when a rule-activation approval is decided. */
export async function onRuleDecision(
  u: UserDoc,
  ruleId: ObjectId,
  approved: boolean,
  note: string,
) {
  const { opsRules } = await collections();
  const r = await opsRules.findOne({ _id: ruleId });
  if (!r || !approved) return;
  await opsRules.updateOne({ _id: ruleId }, { $set: { status: "Active", updatedAt: new Date() } });
  await audit(
    u,
    `Operations: ${r.code} v${r.version} activated by ${u.name}${note ? ` (${note})` : ""}`,
    null,
  );
}

/* ------------------------------------------------------------------ matching queue (section 9) */

async function matchingCases(): Promise<MatchCaseDto[]> {
  const { clients, referrals, opsTasks } = await collections();
  const waiting = await clients
    .find({ "needs.status": "needs-therapist", discharged: { $in: [null] } })
    .toArray();
  const out: MatchCaseDto[] = [];
  for (const c of waiting) {
    for (const n of c.needs.filter((x) => x.status === "needs-therapist")) {
      const ref = n.referralId
        ? await referrals.findOne({ _id: n.referralId }, { projection: { data: 1, triage: 1 } })
        : null;
      const risk = Boolean(ref && needsRiskReview(ref.data));
      const blockers = [
        ...(risk ? ["Reported risk: a person chooses"] : []),
        ...(c.precautions ? ["Clinical precaution on file"] : []),
        ...(risk && !ref?.triage ? ["Clinical review not complete"] : []),
      ];
      const task = await opsTasks.findOne(
        { idemKey: `AUT-06:CaseReadyToAssign:${c._id.toHexString()}:${n.id}` },
        { projection: { _id: 1 } },
      );
      out.push({
        taskId: task?._id.toHexString() ?? null,
        clientId: c._id.toHexString(),
        needId: n.id,
        participant: c.name,
        support: n.support,
        discipline: n.discipline,
        location: n.location ?? "Home",
        region: c.region,
        waitingDays: Math.max(0, Math.floor((Date.now() - c.createdAt.getTime()) / 86_400_000)),
        risk,
        precaution: Boolean(c.precautions),
        blockers,
        autoEligible: blockers.length === 0,
        href: `/care/${c._id.toHexString()}`,
      });
    }
  }
  return out.sort((a, b) => b.waitingDays - a.waitingDays);
}

export async function caseMatches(u: UserDoc, clientId: ObjectId, needId: string) {
  if (!opsCan(u).scheduler && !opsCan(u).manager)
    throw new UserFacingError("Matching is for Scheduling.", 409);
  return { matches: await matchesFor(clientId, needId) };
}

export const assignSchema = z.object({
  clientId: z.string().max(40),
  needId: z.string().max(80),
  mode: z.enum(["approve", "auto"]),
  therapistId: z.string().max(40).optional(),
  start: z.iso.datetime().optional(),
  reason: z.string().trim().max(400).default(""),
});

/** OP-024 to OP-026: a person approves the suggestion; auto mode runs only when every gate passes. */
export async function assignFromQueue(u: UserDoc, input: z.infer<typeof assignSchema>) {
  const can = opsCan(u);
  if (!can.scheduler && !can.manager)
    throw new UserFacingError("Only Scheduling assigns therapists.", 409);
  const clientId = new ObjectId(input.clientId);
  const { opsRules } = await collections();
  const rule = await opsRules.findOne({ code: input.mode === "auto" ? "AUT-07" : "AUT-06" });
  const base = {
    ruleCode: rule?.code ?? "AUT-06",
    ruleName: rule?.name ?? "",
    ruleVersion: rule?.version ?? 1,
    trigger: "CaseReadyToAssign" as const,
    mode: rule?.runMode ?? ("Suggest Only" as const),
  };
  if (input.mode === "auto") {
    if (!rule || rule.status !== "Active")
      throw new UserFacingError("Auto assignment (AUT-07) isn't active.", 409);
    try {
      const res = await autoAllocate(u, clientId, input.needId);
      await logRun({
        ...base,
        key: `auto:${input.clientId}:${input.needId}`,
        entity: `Service ${input.needId.slice(0, 8)}`,
        input: `Auto mode, requested by ${u.name}`,
        actions: ["Auto-Assign Eligible Therapist"],
        outcome: "Task created",
        detail: `Asked ${res.therapist} (rule ${base.ruleCode} v${base.ruleVersion}); the therapist accepts or declines.`,
      });
      await opsChanged();
      return { ok: true, therapist: res.therapist };
    } catch (e) {
      const why = e instanceof Error ? e.message : "Blocked";
      await logRun({
        ...base,
        key: `auto-blocked:${input.clientId}:${input.needId}:${Date.now()}`,
        entity: `Service ${input.needId.slice(0, 8)}`,
        input: `Auto mode, requested by ${u.name}`,
        actions: ["Auto-Assign Eligible Therapist"],
        outcome: "Blocked",
        detail: why,
      });
      throw e;
    }
  }
  if (!input.therapistId || !input.start)
    throw new UserFacingError("Choose a therapist and a time.");
  await requestTherapist(u, clientId, {
    needId: input.needId,
    therapistId: input.therapistId,
    start: input.start,
    overrideReason: input.reason || undefined,
  });
  await logRun({
    ...base,
    key: `approve:${input.clientId}:${input.needId}:${Date.now()}`,
    entity: `Service ${input.needId.slice(0, 8)}`,
    input: `Suggestion approved by ${u.name}`,
    actions: ["Suggest Therapist", "Human approval"],
    outcome: "Updated existing",
    detail: `${u.name} approved the request${input.reason ? `: ${input.reason}` : ""}. Nothing was assigned before this approval.`,
  });
  await opsChanged();
  return { ok: true };
}

/* ------------------------------------------------------------------ hub */

export async function opsHub(u: UserDoc): Promise<OpsHubDto> {
  await ensureScenarios();
  await ensureVolume();
  await scanAll();
  const can = opsCan(u);
  const { opsTasks, opsRules, opsRuns, opsApprovals, opsMessages } = await collections();
  const [tasks, rules, runs, approvals, messages, settings, mode, staff] = await Promise.all([
    opsTasks
      .find({
        $or: [
          { status: { $nin: ["Completed", "Cancelled"] } },
          { updatedAt: { $gte: new Date(Date.now() - 45 * 86_400_000) } },
        ],
      })
      .sort({ dueAt: 1 })
      .limit(800)
      .toArray(),
    opsRules.find({}).sort({ code: 1 }).toArray(),
    opsRuns.find({}).sort({ at: -1 }).limit(900).toArray(),
    opsApprovals.find({}).sort({ createdAt: -1 }).limit(200).toArray(),
    opsMessages.find({}).sort({ createdAt: -1 }).limit(500).toArray(),
    opsSettings(),
    orgSettings(),
    staffList(),
  ]);
  const visible = tasks.filter((t) => canSee(u, can, t));
  const stats = new Map<
    string,
    { runs: number; created: number; errors: number; last: Date | null }
  >();
  for (const r of runs) {
    const s = stats.get(r.ruleCode) ?? { runs: 0, created: 0, errors: 0, last: null };
    s.runs += 1;
    if (r.outcome === "Task created") s.created += 1;
    if (r.outcome === "Error") s.errors += 1;
    if (!s.last || r.at > s.last) s.last = r.at;
    stats.set(r.ruleCode, s);
  }
  const pending = new Set(
    approvals
      .filter((a) => a.status === "Pending" && a.ruleId)
      .map((a) => a.ruleId?.toHexString() ?? ""),
  );
  const now = new Date();
  return {
    today: new Date(now.getTime() + 10 * 3_600_000).toISOString().slice(0, 10),
    now: now.toISOString(),
    can,
    me: { id: u._id.toHexString(), name: u.name },
    tasks: visible.map((t) => taskDto(t, u, can, now)),
    rules: rules.map((r) => ruleDto(r, stats, pending)),
    runs: runs.map(runDto),
    approvals: approvals
      .filter((a) => !a.restricted || can.clinical || u.role === "admin")
      .map((a) => approvalDto(a, u, can)),
    messages: u.role === "admin" ? messages.map(messageDto) : [],
    reviews: u.role === "admin" ? await reviewsFor(u) : [],
    matching: can.scheduler || can.manager ? await matchingCases() : [],
    settings,
    assignmentMode: mode.assignmentMode,
    staff,
    hiddenRestricted: tasks.length - visible.length,
    lastScan: lastScan(),
  };
}

/** The therapist's own tasks, for their workspace. */
export async function myTasks(u: UserDoc) {
  await scanAll();
  const can = opsCan(u);
  const { opsTasks } = await collections();
  const rows = await opsTasks.find({ assigneeId: u._id }).sort({ dueAt: 1 }).limit(200).toArray();
  return { tasks: rows.map((t) => taskDto(t, u, can)), can };
}

export async function runNow(u: UserDoc) {
  if (u.role !== "admin") throw new UserFacingError("Only admin staff can run the rules.", 409);
  const changes = await scanAll(true);
  return { changes };
}

export async function replay(u: UserDoc, taskId: ObjectId) {
  if (u.role !== "admin") throw new UserFacingError("Only admin staff can replay events.", 409);
  const task = await (await collections()).opsTasks.findOne({ _id: taskId });
  if (!task?.idemKey)
    throw new UserFacingError("Only a rule-created task has an event to replay.", 404);
  const run = await replayEvent(task.idemKey, u.name);
  if (!run) throw new UserFacingError("No task carries that event key yet.", 404);
  await opsChanged();
  return { outcome: run.outcome, detail: run.detail };
}

export async function retryRun(u: UserDoc, id: ObjectId, skip: boolean) {
  if (!opsCan(u).manager && u.role !== "admin")
    throw new UserFacingError("Only admin staff handle run errors.", 409);
  const { opsRuns } = await collections();
  const r = await opsRuns.findOne({ _id: id });
  if (!r) throw new UserFacingError("Run not found.", 404);
  if (r.outcome !== "Error" || r.resolved)
    throw new UserFacingError("Only an unresolved error can be retried or skipped.", 409);
  if (skip) {
    await opsRuns.updateOne(
      { _id: id },
      { $set: { resolved: true, detail: `${r.detail} · Skipped by ${u.name}` } },
    );
  } else {
    if (r.retries >= 3)
      throw new UserFacingError(
        "Retry limit reached (3). Skip it and fix the record instead.",
        409,
      );
    await opsRuns.updateOne({ _id: id }, { $set: { resolved: true }, $inc: { retries: 1 } });
    // The next scan re-plans the same key; the idempotency key stops any duplicate.
    await scanAll(true);
  }
  await audit(u, `Operations: run ${r.ref} ${skip ? "skipped" : "retried"}`, null);
  await opsChanged();
  return { ok: true };
}

/* ------------------------------------------------------------------ seeded scenarios (section 16) */

const nextYear = () => new Date().getFullYear() + 1;

function scenarioReferral(over: {
  first: string;
  last: string;
  dob: string;
  supports: ReferralInput["supports"];
  location?: Partial<ReferralInput["location"]>;
  clinical?: Partial<ReferralInput["clinical"]>;
  diagnosis: string;
  goals: string;
  suburb: string;
  postcode: string;
  ndis: string;
  /** Distinct per scenario, so the duplicate check doesn't match the scenarios to each other. */
  phone: string;
}): ReferralInput {
  const base = emptyReferral();
  const parent = `${over.first === "Jordan" ? "Alex" : "Sam"} ${over.last}`;
  const email = `${over.first.toLowerCase()}.${over.last.toLowerCase()}@example.test`;
  return {
    ...base,
    submitter: {
      role: "Support coordinator",
      name: "Riley Coordinator",
      organisation: "Northside Support Coordination",
      email: "riley.coordinator@example.test",
      phone: "0400 555 010",
      authorityConfirmed: true,
    },
    participant: {
      firstName: over.first,
      lastName: over.last,
      dateOfBirth: over.dob,
      email,
      phone: over.phone,
      address: {
        street: "8 Example Street",
        suburb: over.suburb,
        state: "QLD",
        postcode: over.postcode,
      },
    },
    funding: {
      ...base.funding,
      source: "NDIS",
      ndisNumber: over.ndis,
      planEndDate: `${nextYear()}-03-31`,
      planType: "Plan Managed",
      fundingPeriods: "No",
      planManagerCompany: "Example Plan Partners",
      planManagerEmail: "invoices@example.test",
    },
    supportCoordinator: {
      name: "Riley Coordinator",
      email: "riley.coordinator@example.test",
      phone: "0400 555 010",
    },
    signatory: {
      role: "Parent or guardian",
      name: parent,
      email: `family.${over.last.toLowerCase()}@example.test`,
      phone: over.phone.replace(/\d$/, "9"),
    },
    booking: {
      role: "Parent or guardian",
      name: parent,
      email: `family.${over.last.toLowerCase()}@example.test`,
      phone: over.phone.replace(/\d$/, "9"),
      method: "Phone",
      preferredTime: "Weekday mornings",
    },
    location: { ...base.location, type: "Home", sameAsHome: true, ...over.location },
    clinical: {
      ...base.clinical,
      diagnosis: over.diagnosis,
      behaviours: "No",
      knownRisk: "No",
      personPresent: true,
      personPresentDetails: `${parent} (parent)`,
      ...over.clinical,
    },
    supports: over.supports,
    goals: over.goals,
    comments: "",
    consent: { privacy: true, shareWithClinicians: true },
  };
}

const support = (
  s: ReferralInput["supports"][number]["support"],
  frequency: ReferralInput["supports"][number]["frequency"],
) => ({ support: s, frequency, frequencyOther: "", nursingType: "" as const, details: "" });

type FlagDoc = { _id: string; at: Date; notes: string[] };
const g = globalThis as unknown as { __opsSeed?: Promise<void> };

/** The ten scenarios from section 16, created once through the real intake flow. */
export async function ensureScenarios() {
  g.__opsSeed ??= seedScenarios().catch((e: unknown) => {
    g.__opsSeed = undefined;
    throw e;
  });
  return g.__opsSeed;
}

/**
 * Indexes and the Module 08 demo accounts, made here as well as at server start so a running
 * server picks them up without a restart.
 */
async function ensureSetup() {
  const { db, users } = await collections();
  await Promise.all([
    db
      .collection("opsTasks")
      .createIndex(
        { idemKey: 1 },
        { unique: true, partialFilterExpression: { idemKey: { $type: "string" } } },
      ),
    db.collection("opsTasks").createIndex({ status: 1, dueAt: 1 }),
    db.collection("opsRules").createIndex({ code: 1 }, { unique: true }),
    db.collection("opsRuns").createIndex({ at: -1 }),
    db.collection("opsRuns").createIndex({ key: 1 }),
    db.collection("opsApprovals").createIndex({ key: 1 }),
    db.collection("opsMessages").createIndex({ key: 1 }),
    db.collection("opsReviews").createIndex({ referralId: 1 }, { unique: true }),
  ]);
  for (const admin of seedAdmins) {
    if (await users.findOne({ email: admin.email }, { projection: { _id: 1 } })) continue;
    const passwordHash = await staffPasswordHash();
    if (!passwordHash) continue;
    await users.insertOne({
      _id: new ObjectId(),
      ...admin,
      role: "admin",
      passwordHash,
      invite: null,
      therapistId: null,
      clientId: null,
      createdAt: new Date(),
    });
  }
}

async function seedScenarios() {
  await ensureSetup();
  const { db, users, opsTasks } = await collections();
  const flags = db.collection<FlagDoc>("settings");
  if (await flags.findOne({ _id: "opsScenarios" })) return;
  await ensureRules();
  const jo = await users.findOne({ email: "jo.marsh@medisense.test" });
  const neil = await users.findOne({ email: "neil.hensley@medisense.test" });
  if (!jo || !neil) return;
  const notes: string[] = [];
  const step = async (label: string, run: () => Promise<unknown>) => {
    try {
      await run();
      notes.push(`${label}: ok`);
    } catch (e) {
      notes.push(`${label}: ${e instanceof Error ? e.message : "failed"}`);
    }
  };
  const pdf = (name: string, lines: string[]) => ({
    kind: "Referral letter" as const,
    name,
    type: "application/pdf",
    bytes: makePdf(lines),
  });
  const plan = (name: string) => ({
    kind: "NDIS plan" as const,
    name,
    type: "application/pdf",
    bytes: makePdf([
      "NDIS plan (sample)",
      "Plan management: Plan Managed",
      `Plan end: 31 March ${nextYear()}`,
    ]),
  });

  // REF-1001 Casey Morgan: OT + FCA, plan document missing → finding, secure request, waiting.
  let casey: { id: string; reference: string } | null = null;
  await step("Casey Morgan", async () => {
    casey = await submitReferral(
      scenarioReferral({
        first: "Casey",
        last: "Morgan",
        dob: "2014-08-12",
        supports: [
          support("Functional Capacity Assessment", "Assessment"),
          support("Occupational Therapy", "Weekly"),
        ],
        diagnosis: "Autism spectrum disorder, level 2 (reported)",
        goals: "Build independence with morning routines and handwriting for school.",
        suburb: "Chermside",
        postcode: "4032",
        ndis: "430112233",
        phone: "0400 555 101",
      }),
      [
        pdf("Casey Morgan referral letter.pdf", [
          "Referral letter: Casey Morgan",
          "Date of birth: 12 August 2014",
          "Requested: Functional Capacity Assessment and weekly occupational therapy",
          "NDIS plan: to follow; plan manager Example Plan Partners",
          "Preferred visit days: Tuesday or Thursday mornings",
          "School: Chermside State School, contact Ms J Rowe 07 3000 1111",
        ]),
      ],
      null,
    );
  });
  // REF-1002 Jordan Lee: physiotherapy, complete, simple → accepted, shortlist ready.
  await step("Jordan Lee", async () => {
    const r = await submitReferral(
      scenarioReferral({
        first: "Jordan",
        last: "Lee",
        dob: "1988-02-03",
        supports: [support("Physiotherapy", "Weekly")],
        diagnosis: "Lower back pain after a workplace injury (reported)",
        goals: "Return to walking 30 minutes a day and lifting at work.",
        suburb: "Carindale",
        postcode: "4152",
        ndis: "430223344",
        phone: "0400 555 202",
      }),
      [plan("Jordan Lee NDIS plan.pdf")],
      null,
    );
    const id = new ObjectId(r.id);
    await referralAction(jo, id, { type: "take-ownership" });
    await referralAction(jo, id, {
      type: "to-triage",
      note: "Complete referral, no reported risk.",
    });
    await referralAction(neil, id, {
      type: "triage",
      decision: "Accepted",
      notes: "Suitable for community physiotherapy. No risk reported.",
      riskAction: "",
      precaution: "",
    });
    await referralAction(jo, id, {
      type: "funding",
      verification: "Verified",
      exceptionReason: "",
      agreement: "Not required",
      consentRecorded: true,
      notes: "Plan verified against the uploaded plan.",
    });
    await referralAction(jo, id, { type: "accept", otherDisciplines: {}, services: {} });
  });
  // REF-1003 Avery Chen: psychology, sensitive risk → restricted clinical review, no auto assign.
  await step("Avery Chen", async () => {
    await submitReferral(
      scenarioReferral({
        first: "Avery",
        last: "Chen",
        dob: "2003-11-21",
        supports: [support("Psychological Therapy", "Fortnightly")],
        diagnosis: "Anxiety and low mood (reported)",
        goals: "Manage anxiety at university and keep up with study.",
        suburb: "Toowong",
        postcode: "4066",
        ndis: "430334455",
        phone: "0400 555 303",
        location: { type: "Telehealth", sameAsHome: true },
        clinical: {
          knownRisk: "Yes",
          riskDetails:
            "Referrer reports recent thoughts of self-harm; currently linked with a GP. Prefers female clinician.",
          personPresent: false,
          personPresentDetails: "",
        },
      }),
      [plan("Avery Chen NDIS plan.pdf")],
      null,
    );
  });
  // REF-1004 Taylor Singh: speech therapy at school → access-prep task; letter disagrees with the form.
  await step("Taylor Singh", async () => {
    const r = await submitReferral(
      scenarioReferral({
        first: "Taylor",
        last: "Singh",
        dob: "2017-04-09",
        supports: [support("Speech Therapy", "Weekly")],
        diagnosis: "Speech sound disorder (reported)",
        goals: "Be understood by teachers and classmates.",
        suburb: "Stafford",
        postcode: "4053",
        ndis: "430445566",
        phone: "0400 555 404",
        location: {
          type: "School",
          sameAsHome: false,
          address: {
            street: "Stafford State School, 1 School Road",
            suburb: "Stafford",
            state: "QLD",
            postcode: "4053",
          },
          contactName: "Mr D Okoro (learning support)",
          contactEmail: "learning.support@example.test",
          contactPhone: "07 3000 2222",
          contactNotes: "Sign in at the office.",
        },
      }),
      [
        plan("Taylor Singh NDIS plan.pdf"),
        pdf("Taylor Singh school letter.pdf", [
          "Letter from Stafford State School",
          "Student: Taylor Singh, date of birth 9 April 2016",
          "Learning support contact: Mr D Okoro, 07 3000 2299",
          "Therapy room: Library meeting room 2, Wednesdays",
          "Visitors must hold a current working with children check",
        ]),
      ],
      null,
    );
    const id = new ObjectId(r.id);
    await opsTasks.insertOne({
      _id: new ObjectId(),
      ref: await nextRef(db, "opsTask", "TASK", 6),
      title: `School visit access preparation: Taylor Singh (${r.reference})`,
      category: "Visit",
      status: "New",
      priority: "Normal",
      urgentReason: "",
      team: "Scheduling",
      assigneeId: null,
      assigneeName: null,
      related: {
        kind: "Referral",
        ref: r.reference,
        label: "Taylor Singh",
        href: `/care/referrals/${r.id}`,
      },
      clientId: null,
      referralId: id,
      appointmentId: null,
      participant: "Taylor Singh",
      service: "Speech Therapy",
      discipline: "Speech Pathology",
      locationType: "School",
      dueAt: new Date(Date.now() + 2 * 86_400_000),
      sla: "Standard",
      visibility: "Internal",
      source: "Rule",
      ruleCode: "AUT-09",
      ruleVersion: 1,
      idemKey: `AUT-09:SchoolAccess:${r.id}`,
      checklist: [
        "Confirm school permission and the therapy room",
        "Confirm the learning support contact and phone",
        "Check the visitor requirements (working with children check)",
      ].map((label) => ({
        id: new ObjectId().toHexString(),
        label,
        required: true,
        done: false,
        by: null,
        at: null,
      })),
      notes: [],
      attachments: [],
      history: [
        {
          at: new Date(),
          by: "Automation",
          action: "Created by AUT-09 v1: school location on the referral",
        },
      ],
      resolution: null,
      holdReason: "",
      escalation: null,
      acknowledged: null,
      tags: [],
      restrictedNote: null,
      recordingHref: null,
      suggestion: false,
      scenario: "REF-1004",
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });
  await scanAll(true);
  // Casey: the secure document request puts the intake task into Waiting for Patient.
  await step("Casey info request", async () => {
    const c = casey as { id: string; reference: string } | null;
    if (!c) return;
    await referralAction(jo, new ObjectId(c.id), {
      type: "request-info",
      items: [
        { field: "document:NDIS plan", label: "NDIS plan document (or the relevant plan pages)" },
      ],
      message: "Please upload Casey's current NDIS plan through the secure link.",
    });
    await scanAll(true);
    // RULE-001: the same submission event arrives twice: one task only, the repeat is skipped.
    const key = `AUT-01:ReferralSubmitted:${c.id}`;
    await replayEvent(key, "Integration (simulated duplicate event)");
  });
  await flags.updateOne(
    { _id: "opsScenarios" },
    { $set: { at: new Date(), notes } },
    { upsert: true },
  );
}

export type { OpsHubDto };
