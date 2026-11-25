import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import {
  approvalCriteria,
  approverFor,
  bulkExcludedCategories,
  canMoveTask,
  entityKinds,
  hasSensitiveText,
  isClosed,
  isPaused,
  priorities,
  renderTemplate,
  resolutionCodes,
  slaHours,
  taskStatuses,
  teams,
  templates,
  type ApprovalDto,
  type ApprovalWorkflow,
  type Channel,
  type MessageDto,
  type OpsCan,
  type OpsSettings,
  type RecipientType,
  type RunDto,
  type RunMode,
  type TaskDto,
  type TaskInput,
  type Team,
} from "@/lib/live/operations";
import { isSuperAdmin } from "@/lib/permissions/can";
import { collections } from "./db";
import { nextRef } from "./finance";
import { UserFacingError } from "./http";
import { audit, notify, publish } from "./live";
import { can as hasPermission } from "./permissions";
import type { OpsApprovalDoc, OpsMessageDoc, OpsRunDoc, OpsTaskDoc, UserDoc } from "./models";

/* ------------------------------------------------------------------ roles (section 2) */

const has = (u: UserDoc, ...roles: string[]) =>
  Boolean(u.staffRoles?.some((r) => roles.includes(r)));

/** Which operational teams a person works in. Therapists belong to the clinical team. */
export function teamsOf(u: Pick<UserDoc, "role" | "staffRoles">): Team[] {
  if (u.role === "therapist") return ["Clinical"];
  if (u.role !== "admin") return [];
  const out = new Set<Team>();
  const r = u.staffRoles ?? [];
  if (r.includes("Super Admin")) teams.forEach((t) => out.add(t));
  if (r.includes("Intake Officer")) out.add("Intake");
  if (r.includes("Scheduler")) out.add("Scheduling");
  if (r.includes("Clinical Lead")) out.add("Clinical");
  if (r.includes("Finance") || r.includes("Finance Manager")) out.add("Finance");
  if (r.includes("Operations Manager")) out.add("Operations");
  return [...out];
}

/**
 * Which operational teams the signed-in person works in, from their team-queue permissions. This
 * is the actor's view. Routing to other people still uses teamsOf, which reads their role names.
 */
export function teamsFor(u: UserDoc): Team[] {
  if (u.role === "therapist") return ["Clinical"];
  if (u.role !== "admin") return [];
  const out: Team[] = [];
  if (hasPermission(u, "operations.team.intake")) out.push("Intake");
  if (hasPermission(u, "operations.team.scheduling")) out.push("Scheduling");
  if (hasPermission(u, "operations.team.clinical")) out.push("Clinical");
  if (hasPermission(u, "operations.team.finance")) out.push("Finance");
  if (hasPermission(u, "operations.team.operations")) out.push("Operations");
  return out;
}

export function opsCan(u: UserDoc): OpsCan {
  const admin = u.role === "admin";
  const superAdmin = admin && has(u, "Super Admin");
  const manager = admin && hasPermission(u, "operations.manage");
  const clinical = admin && hasPermission(u, "operations.clinical");
  const intake = admin && hasPermission(u, "operations.team.intake");
  const scheduler = admin && hasPermission(u, "operations.team.scheduling");
  const finance = admin && hasPermission(u, "operations.team.finance");
  const roleLabel =
    u.role === "therapist"
      ? "Therapist"
      : superAdmin
        ? "Director"
        : has(u, "Operations Manager")
          ? "Operations Manager"
          : has(u, "Clinical Lead")
            ? "Clinical Lead"
            : has(u, "Finance Manager")
              ? "Finance Manager"
              : has(u, "Finance")
                ? intake
                  ? "Intake, Scheduling and Finance"
                  : "Finance Officer"
                : intake && scheduler
                  ? "Intake and Scheduling"
                  : intake
                    ? "Intake Admin"
                    : scheduler
                      ? "Scheduler"
                      : "Staff";
  return {
    manager,
    clinical,
    intake,
    scheduler,
    finance,
    recordings: clinical,
    roleLabel,
    teams: teamsFor(u),
  };
}

/** Restricted tasks never appear in an unauthorised feed (section 4, OP-018, OP-047). */
export function canSee(
  u: UserDoc,
  can: OpsCan,
  t: Pick<OpsTaskDoc, "visibility" | "team" | "assigneeId">,
) {
  const mine = Boolean(t.assigneeId?.equals(u._id));
  if (u.role === "therapist") return mine;
  if (t.visibility === "Clinical Restricted") return can.clinical || mine;
  if (t.visibility === "Team Only") return can.manager || can.teams.includes(t.team) || mine;
  return u.role === "admin";
}

function canWork(u: UserDoc, can: OpsCan, t: OpsTaskDoc) {
  if (t.assigneeId?.equals(u._id)) return true;
  if (u.role !== "admin") return false;
  return can.manager || can.teams.includes(t.team);
}

/* ------------------------------------------------------------------ settings and time */

const SETTINGS_ID = "operations";
type SettingsDoc = Omit<OpsSettings, "updatedAt"> & { _id: string; updatedAt: Date | null };

export const defaultSettings: OpsSettings = {
  workdayStart: "08:30",
  workdayEnd: "17:00",
  timezone: "Australia/Brisbane",
  planWarningDays: 30,
  noteThresholdHours: 24,
  noteEscalateHours: 72,
  assessmentOverdueDays: 14,
  reminderCapPerDay: 2,
  quietStart: "20:00",
  quietEnd: "07:30",
  retentionDays: 2555,
  aiReviewEnabled: true,
  updatedBy: null,
  updatedAt: null,
};

export async function opsSettings(): Promise<OpsSettings> {
  const { db } = await collections();
  const doc = await db.collection<SettingsDoc>("settings").findOne({ _id: SETTINGS_ID });
  if (!doc) return defaultSettings;
  const { _id, updatedAt, ...rest } = doc;
  void _id;
  return { ...defaultSettings, ...rest, updatedAt: updatedAt?.toISOString() ?? null };
}

export async function saveSettings(
  u: UserDoc,
  input: Omit<OpsSettings, "timezone" | "updatedBy" | "updatedAt">,
) {
  if (!opsCan(u).manager) {
    throw new UserFacingError(
      "Only the Director or an Operations Manager can change these settings.",
      409,
    );
  }
  const { db } = await collections();
  await db.collection<SettingsDoc>("settings").updateOne(
    { _id: SETTINGS_ID },
    {
      $set: {
        ...input,
        timezone: "Australia/Brisbane",
        updatedBy: u.name,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
  await audit(u, "Operations settings changed", null);
  await opsChanged();
}

/** Brisbane has no daylight saving, so a fixed offset is exact. */
const OFFSET = 10 * 3_600_000;
export const brisbaneKey = (d: Date) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Adds working hours, skipping nights and weekends (the SLA's business-hours logic). */
export function addBusinessHours(
  from: Date,
  hours: number,
  s: Pick<OpsSettings, "workdayStart" | "workdayEnd">,
) {
  const start = minutesOf(s.workdayStart);
  const end = minutesOf(s.workdayEnd);
  let t = from.getTime() + OFFSET;
  let remaining = hours * 60;
  const dayAt = (ms: number, mins: number) => {
    const d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + mins * 60_000;
  };
  for (let guard = 0; guard < 400 && remaining > 0; guard += 1) {
    const day = new Date(t).getUTCDay();
    const open = dayAt(t, start);
    const close = dayAt(t, end);
    if (day === 0 || day === 6 || t >= close) {
      t = dayAt(t, start) + 86_400_000;
      continue;
    }
    if (t < open) t = open;
    const available = (close - t) / 60_000;
    if (available >= remaining) {
      t += remaining * 60_000;
      remaining = 0;
    } else {
      remaining -= available;
      t = dayAt(t, start) + 86_400_000;
    }
  }
  return new Date(t - OFFSET);
}

export function inQuietHours(now: Date, s: Pick<OpsSettings, "quietStart" | "quietEnd">) {
  const local = new Date(now.getTime() + OFFSET);
  const m = local.getUTCHours() * 60 + local.getUTCMinutes();
  const a = minutesOf(s.quietStart);
  const b = minutesOf(s.quietEnd);
  return a > b ? m >= a || m < b : m >= a && m < b;
}

/* ------------------------------------------------------------------ change events */

export async function opsChanged() {
  const { users } = await collections();
  const ids = (
    await users
      .find({ role: { $in: ["admin", "therapist"] } }, { projection: { _id: 1 } })
      .toArray()
  ).map((u) => u._id);
  await publish(ids, "care", { operations: true });
}

const ev = (by: UserDoc | string, action: string) => ({
  at: new Date(),
  by: typeof by === "string" ? by : by.name,
  action,
});

/* ------------------------------------------------------------------ run log (OP-033) */

export async function logRun(
  run: Omit<OpsRunDoc, "_id" | "ref" | "at" | "retries" | "resolved"> & { once?: boolean },
) {
  const { opsRuns, db } = await collections();
  const { once, ...rest } = run;
  if (
    once &&
    (await opsRuns.findOne(
      {
        key: run.key,
        outcome: run.outcome,
        ...(run.outcome === "Error" ? { resolved: false } : {}),
      },
      { projection: { _id: 1 } },
    ))
  ) {
    return null;
  }
  const doc: OpsRunDoc = {
    _id: new ObjectId(),
    ref: await nextRef(db, "opsRun", "RUN", 6),
    ...rest,
    retries: 0,
    resolved: run.outcome !== "Error",
    at: new Date(),
  };
  await opsRuns.insertOne(doc);
  return doc;
}

export function runDto(r: OpsRunDoc): RunDto {
  return {
    id: r._id.toHexString(),
    ref: r.ref,
    ruleCode: r.ruleCode,
    ruleName: r.ruleName,
    ruleVersion: r.ruleVersion,
    trigger: r.trigger,
    entity: r.entity,
    input: r.input,
    actions: r.actions,
    outcome: r.outcome,
    detail: r.detail,
    mode: r.mode,
    retries: r.retries,
    resolved: r.resolved,
    at: r.at.toISOString(),
  };
}

/* ------------------------------------------------------------------ tasks */

type NewTask = Omit<
  OpsTaskDoc,
  | "_id"
  | "ref"
  | "history"
  | "notes"
  | "attachments"
  | "resolution"
  | "holdReason"
  | "escalation"
  | "acknowledged"
  | "tags"
  | "version"
  | "createdAt"
  | "updatedAt"
  | "checklist"
> & {
  checklist?: { label: string; required?: boolean }[];
  note?: string;
  tags?: string[];
  createdAt?: Date;
  historyNote?: string;
};

export async function insertTask(by: UserDoc | string, t: NewTask) {
  const { opsTasks, db } = await collections();
  const now = t.createdAt ?? new Date();
  const byName = typeof by === "string" ? by : by.name;
  const doc: OpsTaskDoc = {
    _id: new ObjectId(),
    ref: await nextRef(db, "opsTask", "TASK", 6),
    title: t.title,
    category: t.category,
    status: t.status,
    priority: t.priority,
    urgentReason: t.urgentReason,
    team: t.team,
    assigneeId: t.assigneeId,
    assigneeName: t.assigneeName,
    related: t.related,
    clientId: t.clientId,
    referralId: t.referralId,
    appointmentId: t.appointmentId,
    participant: t.participant,
    service: t.service,
    discipline: t.discipline,
    locationType: t.locationType,
    dueAt: t.dueAt,
    sla: t.sla,
    visibility: t.visibility,
    source: t.source,
    ruleCode: t.ruleCode,
    ruleVersion: t.ruleVersion,
    idemKey: t.idemKey,
    checklist: (t.checklist ?? []).map((c) => ({
      id: randomUUID(),
      label: c.label,
      required: c.required ?? true,
      done: false,
      by: null,
      at: null,
    })),
    notes: t.note ? [{ id: randomUUID(), text: t.note, by: byName, at: now, edits: [] }] : [],
    attachments: [],
    history: [
      {
        at: now,
        by: byName,
        action:
          t.historyNote ??
          (t.source === "Rule" ? `Created by ${t.ruleCode} v${t.ruleVersion}` : "Created"),
      },
      ...(t.assigneeName ? [{ at: now, by: byName, action: `Assigned to ${t.assigneeName}` }] : []),
    ],
    resolution: null,
    holdReason: "",
    escalation: null,
    acknowledged: null,
    tags: t.tags ?? [],
    restrictedNote: t.restrictedNote,
    recordingHref: t.recordingHref,
    suggestion: t.suggestion,
    scenario: t.scenario,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await opsTasks.insertOne(doc);
  } catch (error) {
    if ((error as { code?: number }).code === 11000 && t.idemKey) {
      return { task: await opsTasks.findOne({ idemKey: t.idemKey }), created: false };
    }
    throw error;
  }
  if (doc.assigneeId) {
    await notify([doc.assigneeId], {
      title: `Task ${doc.ref} assigned to you`,
      body: doc.title,
      href: `/care/operations/tasks/${doc._id.toHexString()}`,
    });
  }
  return { task: doc, created: true };
}

export function taskDto(t: OpsTaskDoc, viewer: UserDoc, can: OpsCan, now = new Date()): TaskDto {
  const mine = Boolean(t.assigneeId?.equals(viewer._id));
  const restrictedOk = can.clinical || mine;
  const recordingOk = can.recordings || (mine && viewer.role === "therapist");
  const open = !isClosed(t.status);
  return {
    id: t._id.toHexString(),
    ref: t.ref,
    title: t.title,
    category: t.category,
    status: t.status,
    priority: t.priority,
    urgentReason: t.urgentReason,
    team: t.team,
    assigneeId: t.assigneeId?.toHexString() ?? null,
    assigneeName: t.assigneeName,
    related: t.related,
    participant: t.participant,
    service: t.service,
    discipline: t.discipline,
    locationType: t.locationType,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    dueAt: t.dueAt.toISOString(),
    sla: t.sla,
    visibility: t.visibility,
    source: t.source,
    ruleCode: t.ruleCode,
    ruleVersion: t.ruleVersion,
    checklist: t.checklist.map((c) => ({ ...c, at: c.at?.toISOString() ?? null })),
    notes: t.notes.map((n) => ({
      id: n.id,
      text: n.text,
      by: n.by,
      at: n.at.toISOString(),
      edited: n.edits.length > 0,
    })),
    attachments: t.attachments.filter((a) => !a.restricted || restrictedOk),
    history: t.history.map((h) => ({ at: h.at.toISOString(), by: h.by, action: h.action })),
    resolution: t.resolution ? { ...t.resolution, at: t.resolution.at.toISOString() } : null,
    holdReason: t.holdReason,
    escalation: t.escalation ? { ...t.escalation, at: t.escalation.at.toISOString() } : null,
    acknowledged: t.acknowledged
      ? { ...t.acknowledged, at: t.acknowledged.at.toISOString() }
      : null,
    tags: t.tags,
    version: t.version,
    overdue: open && !isPaused(t.status) && t.dueAt.getTime() < now.getTime(),
    dueToday: brisbaneKey(t.dueAt) === brisbaneKey(now),
    restrictedNote: restrictedOk ? t.restrictedNote : null,
    restrictedHidden: Boolean(t.restrictedNote) && !restrictedOk,
    recordingHref: recordingOk ? t.recordingHref : null,
    recordingHidden: Boolean(t.recordingHref) && !recordingOk,
    suggestion: t.suggestion,
    scenario: t.scenario,
  };
}

async function loadTask(id: ObjectId) {
  const { opsTasks } = await collections();
  const t = await opsTasks.findOne({ _id: id });
  if (!t) throw new UserFacingError("Task not found.", 404);
  return t;
}

export async function taskDetail(u: UserDoc, id: ObjectId) {
  const can = opsCan(u);
  const t = await loadTask(id);
  if (!canSee(u, can, t)) throw new UserFacingError("Task not found.", 404);
  const { opsMessages, opsApprovals } = await collections();
  const [messages, approvals] = await Promise.all([
    opsMessages.find({ taskId: id }).sort({ createdAt: -1 }).toArray(),
    opsApprovals.find({ taskId: id }).sort({ createdAt: -1 }).toArray(),
  ]);
  return {
    task: taskDto(t, u, can),
    can,
    canWork: canWork(u, can, t),
    staff: await staffList(),
    messages: messages.map(messageDto),
    approvals: approvals.map((a) => approvalDto(a, u, can)),
  };
}

export async function staffList() {
  const { users } = await collections();
  const rows = await users
    .find(
      { role: { $in: ["admin", "therapist"] }, disabled: { $ne: true } },
      { projection: { name: 1, role: 1, staffRoles: 1 } },
    )
    .sort({ name: 1 })
    .toArray();
  return rows.map((r) => ({ id: r._id.toHexString(), name: r.name, teams: teamsOf(r) }));
}

async function relatedFor(kind: TaskInput["relatedKind"], ref: string) {
  const { referrals, clients, appointments, invoices, fundingPlans } = await collections();
  const q = ref.trim();
  if (kind === "Referral") {
    const r = await referrals.findOne({ reference: q.toUpperCase() });
    if (!r) throw new UserFacingError(`No referral ${q}. Use its REF- number.`);
    return {
      related: {
        kind,
        ref: r.reference,
        label: `${r.data.participant.firstName} ${r.data.participant.lastName}`,
        href: `/care/referrals/${r._id.toHexString()}`,
      },
      referralId: r._id,
      clientId: r.clientId,
      participant: `${r.data.participant.firstName} ${r.data.participant.lastName}`,
    };
  }
  if (kind === "Participant" || kind === "Service Request") {
    const c = await clients.findOne({
      $or: [
        { mrn: q.toUpperCase() },
        { name: { $regex: `^${q.replace(/[^\w ]/g, "")}$`, $options: "i" } },
      ],
    });
    if (!c) throw new UserFacingError(`No patient ${q}. Use their MRN or full name.`);
    return {
      related: { kind, ref: c.mrn ?? c.name, label: c.name, href: `/care/${c._id.toHexString()}` },
      referralId: null,
      clientId: c._id,
      participant: c.name,
    };
  }
  if (kind === "Appointment" || kind === "Session") {
    const a = await appointments.findOne({ ref: q.toUpperCase() });
    if (!a) throw new UserFacingError(`No appointment ${q}. Use its APT- number.`);
    const c = await clients.findOne({ _id: a.clientId }, { projection: { name: 1 } });
    return {
      related: {
        kind,
        ref: a.ref ?? q,
        label: c?.name ?? "Appointment",
        href: `/care/schedule?visit=${a._id.toHexString()}`,
      },
      referralId: null,
      clientId: a.clientId,
      participant: c?.name ?? null,
    };
  }
  if (kind === "Invoice") {
    const i = await invoices.findOne({ number: q.toUpperCase() });
    if (!i) throw new UserFacingError(`No invoice ${q}.`);
    const c = await clients.findOne({ _id: i.clientId }, { projection: { name: 1 } });
    return {
      related: {
        kind,
        ref: i.number,
        label: c?.name ?? "Invoice",
        href: `/care/billing/${i._id.toHexString()}`,
      },
      referralId: null,
      clientId: i.clientId,
      participant: c?.name ?? null,
    };
  }
  if (kind === "Funding Plan") {
    const p = await fundingPlans.findOne({ ref: q.toUpperCase() });
    if (!p) throw new UserFacingError(`No funding plan ${q}.`);
    return {
      related: {
        kind,
        ref: p.ref,
        label: p.participant,
        href: p.clientId ? `/care/funding/${p.clientId.toHexString()}` : null,
      },
      referralId: p.referralId,
      clientId: p.clientId,
      participant: p.participant,
    };
  }
  return {
    related: { kind, ref: q, label: q, href: null },
    referralId: null,
    clientId: null,
    participant: null,
  };
}

async function assigneeFor(id: string | null, team: Team) {
  if (!id) return { assigneeId: null, assigneeName: null };
  if (!ObjectId.isValid(id)) throw new UserFacingError("Choose someone from the list.");
  const { users } = await collections();
  const a = await users.findOne({ _id: new ObjectId(id) });
  if (!a || a.disabled) throw new UserFacingError("That person can't take tasks.");
  if (!teamsOf(a).includes(team)) {
    throw new UserFacingError(
      `${a.name} isn't in the ${team} team. Choose someone who is, or change the team.`,
    );
  }
  return { assigneeId: a._id, assigneeName: a.name };
}

/** OP-002, OP-005: a manual administrative task with every mandatory field checked. */
export async function createTask(u: UserDoc, input: TaskInput) {
  const can = opsCan(u);
  if (u.role !== "admin") throw new UserFacingError("Ask an admin to create this task.", 409);
  const due = new Date(input.dueAt);
  if (due.getTime() < Date.now() - 60_000 && !input.allowPastDue) {
    throw new UserFacingError("The due date is in the past. Tick the override if that's intended.");
  }
  if (input.visibility === "Clinical Restricted" && !can.clinical && input.team !== "Clinical") {
    throw new UserFacingError("Clinical Restricted tasks go to the Clinical team.");
  }
  if (
    input.priority === "Urgent" &&
    input.category === "Clinical Review" &&
    input.team !== "Clinical"
  ) {
    throw new UserFacingError(
      "Clinical urgency needs a qualified reviewer: set the team to Clinical.",
    );
  }
  const rel = await relatedFor(input.relatedKind, input.relatedRef);
  const who = await assigneeFor(input.assigneeId, input.team);
  const { task } = await insertTask(u, {
    title: input.title,
    category: input.category,
    status: who.assigneeId ? "Assigned" : "New",
    priority: input.priority,
    urgentReason: input.urgentReason,
    team: input.team,
    ...who,
    ...rel,
    appointmentId: null,
    service: null,
    discipline: null,
    locationType: null,
    dueAt: due,
    sla: input.sla,
    visibility: input.visibility,
    source: "Manual",
    ruleCode: null,
    ruleVersion: null,
    idemKey: null,
    restrictedNote: null,
    recordingHref: null,
    suggestion: false,
    scenario: null,
    checklist: input.checklist.map((label) => ({ label })),
    note: input.note,
    historyNote:
      input.priority === "Urgent" ? `Created as Urgent: ${input.urgentReason}` : "Created",
  });
  if (input.priority === "Urgent" && task) {
    await escalationApproval(u, task, `Urgent: ${input.urgentReason}`);
  }
  await audit(u, `Operations: created ${task?.ref} ${input.title}`, rel.clientId);
  await opsChanged();
  return { id: task?._id.toHexString() };
}

export const taskActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("move"),
    to: z.enum(taskStatuses),
    note: z.string().trim().max(2000).default(""),
    code: z.enum(resolutionCodes).optional(),
  }),
  z.object({
    type: z.literal("assign"),
    team: z.enum(teams),
    assigneeId: z.string().max(40).nullable(),
    reason: z.string().trim().max(400).default(""),
  }),
  z.object({ type: z.literal("acknowledge") }),
  z.object({ type: z.literal("check"), itemId: z.string().max(60), done: z.boolean() }),
  z.object({ type: z.literal("note"), text: z.string().trim().min(1).max(10_000) }),
  z.object({
    type: z.literal("edit-note"),
    noteId: z.string().max(60),
    text: z.string().trim().min(1).max(10_000),
  }),
  z.object({
    type: z.literal("attach"),
    name: z.string().trim().min(1).max(160),
    size: z.number().int().min(1),
    mime: z.string().max(80),
    restricted: z.boolean(),
  }),
  z.object({
    type: z.literal("priority"),
    priority: z.enum(priorities),
    reason: z.string().trim().max(400).default(""),
  }),
  z.object({ type: z.literal("tag"), tag: z.string().trim().min(1).max(40) }),
  z.object({
    type: z.literal("reopen"),
    reason: z.string().trim().min(5, "Say why the task is reopening").max(400),
  }),
  z.object({ type: z.literal("confirm") }),
]);
export type TaskAction = z.infer<typeof taskActionSchema>;

const allowedFiles =
  /^(application\/pdf|image\/(png|jpe?g|heic)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/msword|text\/plain)$/;

/** Every change checks the version the person saw, so two editors never overwrite silently (OP-009). */
export async function taskAction(u: UserDoc, id: ObjectId, version: number, action: TaskAction) {
  const can = opsCan(u);
  const t = await loadTask(id);
  if (!canSee(u, can, t)) throw new UserFacingError("Task not found.", 404);
  if (t.version !== version) {
    const last = t.history[t.history.length - 1];
    throw new UserFacingError(
      `${last?.by ?? "Someone"} changed this task at ${new Date(last?.at ?? t.updatedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" })} (${last?.action ?? "updated"}). Reload to see their change before saving yours.`,
      409,
    );
  }
  if (isClosed(t.status) && action.type !== "reopen") {
    throw new UserFacingError("This task is closed. Reopen it to make changes.", 409);
  }
  if (action.type !== "reopen" && !canWork(u, can, t)) {
    throw new UserFacingError(`Only the ${t.team} team or the assignee can change this task.`, 409);
  }
  const set: Partial<OpsTaskDoc> = {};
  const events: OpsTaskDoc["history"] = [];
  const now = new Date();
  let resumedMessage = false;

  switch (action.type) {
    case "move": {
      const to = action.to;
      if (!canMoveTask(t.status, to)) {
        throw new UserFacingError(`A ${t.status} task can't move to ${to}.`, 409);
      }
      if (to === "In Progress" && !t.assigneeId) {
        throw new UserFacingError("Assign the task to someone before starting it.");
      }
      if (to === "On Hold" && action.note.length < 3)
        throw new UserFacingError("Give the hold reason.");
      if (to === "Escalated" && action.note.length < 3)
        throw new UserFacingError("Say why it's escalating.");
      if (to === "Completed") {
        const open = t.checklist.filter((c) => c.required && !c.done);
        if (open.length) {
          throw new UserFacingError(
            `Finish the checklist first: ${open.map((c) => c.label).join("; ")}.`,
            409,
          );
        }
        if (t.category === "Clinical Review" && !can.clinical) {
          throw new UserFacingError("Only a Clinical Lead can complete a clinical review.", 409);
        }
        if (action.code && action.code !== "Completed" && action.note.length < 3) {
          throw new UserFacingError("Explain the outcome for a non-standard resolution.");
        }
      }
      if (
        t.status === "Escalated" &&
        (to === "Completed" || to === "Cancelled") &&
        action.note.length < 3
      ) {
        throw new UserFacingError("Record the escalation outcome before closing.");
      }
      if (to === "Cancelled" && !action.code)
        throw new UserFacingError("Choose a resolution code.");
      set.status = to;
      if (to === "On Hold") set.holdReason = action.note;
      if (to === "Escalated") {
        set.escalation = {
          owner: escalationOwner(t.team),
          reason: action.note,
          at: now,
          outcome: "",
        };
        await escalationApproval(u, t, action.note);
      }
      if (t.status === "Escalated" && t.escalation && to !== "Escalated") {
        set.escalation = { ...t.escalation, outcome: action.note || `Moved to ${to}` };
      }
      if (to === "Completed" || to === "Cancelled") {
        set.resolution = {
          code: action.code ?? "Completed",
          note: action.note,
          by: u.name,
          at: now,
        };
      }
      events.push(ev(u, `${t.status} → ${to}${action.note ? `: ${action.note}` : ""}`));
      break;
    }
    case "assign": {
      const who = await assigneeFor(action.assigneeId, action.team);
      if (
        t.assigneeId &&
        who.assigneeId &&
        !t.assigneeId.equals(who.assigneeId) &&
        action.reason.length < 3
      ) {
        throw new UserFacingError("Give the reason for reassigning (OP-027).");
      }
      if (t.visibility === "Clinical Restricted" && action.team !== "Clinical") {
        throw new UserFacingError(
          "A clinically restricted task stays with the Clinical team.",
          409,
        );
      }
      Object.assign(set, who, { team: action.team, acknowledged: null });
      if (who.assigneeId && t.status === "New") set.status = "Assigned";
      events.push(
        ev(
          u,
          who.assigneeName
            ? `Assigned to ${who.assigneeName} (${action.team})${action.reason ? `: ${action.reason}` : ""}`
            : `Unassigned, sent to ${action.team}`,
        ),
      );
      const tell = [who.assigneeId, t.assigneeId].filter((x): x is ObjectId => Boolean(x));
      if (tell.length) {
        await notify(tell, {
          title: `${t.ref} ${who.assigneeName ? `assigned to ${who.assigneeName}` : "unassigned"}`,
          body: action.reason || t.title,
          href: `/care/operations/tasks/${t._id.toHexString()}`,
        });
      }
      break;
    }
    case "acknowledge": {
      if (!t.assigneeId?.equals(u._id))
        throw new UserFacingError("Only the assignee acknowledges a task.", 409);
      set.acknowledged = { by: u.name, at: now };
      events.push(ev(u, "Acknowledged"));
      break;
    }
    case "check": {
      const item = t.checklist.find((c) => c.id === action.itemId);
      if (!item) throw new UserFacingError("Checklist item not found.", 404);
      set.checklist = t.checklist.map((c) =>
        c.id === action.itemId
          ? {
              ...c,
              done: action.done,
              by: action.done ? u.name : null,
              at: action.done ? now : null,
            }
          : c,
      );
      events.push(ev(u, `${action.done ? "Ticked" : "Unticked"}: ${item.label}`));
      break;
    }
    case "note": {
      set.notes = [
        ...t.notes,
        { id: randomUUID(), text: action.text, by: u.name, at: now, edits: [] },
      ];
      events.push(ev(u, "Added a note"));
      break;
    }
    case "edit-note": {
      const n = t.notes.find((x) => x.id === action.noteId);
      if (!n) throw new UserFacingError("Note not found.", 404);
      if (n.by !== u.name) throw new UserFacingError("You can only edit your own notes.", 409);
      set.notes = t.notes.map((x) =>
        x.id === n.id
          ? { ...x, text: action.text, edits: [...x.edits, { text: x.text, at: now }] }
          : x,
      );
      events.push(ev(u, "Edited a note (earlier text kept)"));
      break;
    }
    case "attach": {
      if (!allowedFiles.test(action.mime))
        throw new UserFacingError("Attach a PDF, image, Word or text file.");
      if (action.size > 10 * 1024 * 1024)
        throw new UserFacingError("Attachments can be up to 10 MB.");
      if (action.restricted && !can.clinical && u.role !== "therapist") {
        throw new UserFacingError("Only clinical staff can add a restricted attachment.", 409);
      }
      set.attachments = [
        ...t.attachments,
        { name: action.name, size: action.size, type: action.mime, restricted: action.restricted },
      ];
      events.push(ev(u, `Attached ${action.restricted ? "a restricted file" : action.name}`));
      break;
    }
    case "priority": {
      if (action.priority === "Urgent" && action.reason.length < 5)
        throw new UserFacingError("Say why this is urgent.");
      if (action.priority === "Urgent" && t.category === "Clinical Review" && !can.clinical) {
        throw new UserFacingError("Clinical urgency is set by a qualified reviewer.", 409);
      }
      set.priority = action.priority;
      set.urgentReason = action.priority === "Urgent" ? action.reason : "";
      events.push(
        ev(
          u,
          `Priority ${t.priority} → ${action.priority}${action.reason ? `: ${action.reason}` : ""}`,
        ),
      );
      if (action.priority === "Urgent") await escalationApproval(u, t, `Urgent: ${action.reason}`);
      break;
    }
    case "tag": {
      if (t.tags.includes(action.tag)) return { ok: true };
      set.tags = [...t.tags, action.tag];
      events.push(ev(u, `Tagged ${action.tag}`));
      break;
    }
    case "reopen": {
      const allowed =
        can.manager ||
        (t.category === "Clinical Review"
          ? can.clinical
          : can.teams.includes(t.team) && u.role === "admin");
      if (!allowed)
        throw new UserFacingError("Reopening needs the team lead or an Operations Manager.", 409);
      if (!isClosed(t.status))
        throw new UserFacingError("Only a closed task can be reopened.", 409);
      set.status = t.assigneeId ? "Assigned" : "New";
      events.push(
        ev(
          u,
          `Reopened (was ${t.status}${t.resolution ? `, ${t.resolution.code}` : ""}): ${action.reason}`,
        ),
      );
      set.resolution = null;
      break;
    }
    case "confirm": {
      if (!t.suggestion) return { ok: true };
      set.suggestion = false;
      events.push(ev(u, "Confirmed the rule's suggestion"));
      break;
    }
  }
  if (t.status === "Waiting for Patient" && set.status && set.status !== "Waiting for Patient")
    resumedMessage = true;
  const res = await (
    await collections()
  ).opsTasks.updateOne(
    { _id: t._id, version },
    {
      $set: { ...set, updatedAt: now },
      $push: { history: { $each: events } },
      $inc: { version: 1 },
    },
  );
  if (!res.modifiedCount)
    throw new UserFacingError(
      "Someone else changed this task just now. Reload and try again.",
      409,
    );
  void resumedMessage;
  await audit(u, `Operations: ${t.ref} ${events.map((e) => e.action).join("; ")}`, t.clientId);
  await opsChanged();
  return { ok: true };
}

function escalationOwner(team: Team) {
  return team === "Clinical"
    ? "Clinical Lead"
    : team === "Finance"
      ? "Finance Manager"
      : "Operations Manager";
}

async function escalationApproval(u: UserDoc | string, t: OpsTaskDoc, reason: string) {
  const workflow: ApprovalWorkflow =
    t.category === "Clinical Review"
      ? "Clinical-risk referral"
      : t.team === "Finance"
        ? "Funding exception"
        : t.category === "Visit" || t.category === "Scheduling"
          ? "Unusual travel / booking exception"
          : "Unusual travel / booking exception";
  await requestApproval({
    key: `escalation:${t._id.toHexString()}:${t.version}`,
    workflow,
    title: `${t.ref} escalated: ${t.title}`,
    reason,
    initiator: typeof u === "string" ? u : u.name,
    related: {
      label: `${t.related.kind} ${t.related.ref}`,
      href: `/care/operations/tasks/${t._id.toHexString()}`,
    },
    taskId: t._id,
    ruleId: null,
    restricted: t.visibility === "Clinical Restricted",
    slaHours: slaHours[t.sla],
  });
}

/** Rule-side status changes: no version check, but the history says which rule did it. */
export async function ruleUpdateTask(id: ObjectId, set: Partial<OpsTaskDoc>, action: string) {
  const { opsTasks } = await collections();
  await opsTasks.updateOne(
    { _id: id },
    {
      $set: { ...set, updatedAt: new Date() },
      $push: { history: ev("Automation", action) },
      $inc: { version: 1 },
    },
  );
}

export const bulkSchema = z.object({
  ids: z.array(z.string().max(40)).min(1).max(100),
  action: z.enum([
    "Assign to team",
    "Apply tag",
    "Acknowledge",
    "Send approved reminder",
    "Close as duplicate",
  ]),
  team: z.enum(teams).optional(),
  tag: z.string().trim().max(40).optional(),
  reviewed: z.boolean().optional(),
});

/** Safe bulk actions only. Clinical, consent and incident tasks are always skipped (OP-011). */
export async function bulkTasks(u: UserDoc, input: z.infer<typeof bulkSchema>) {
  const can = opsCan(u);
  if (u.role !== "admin") throw new UserFacingError("Bulk actions are for admin staff.", 409);
  const { opsTasks } = await collections();
  const ids = input.ids.filter((i) => ObjectId.isValid(i)).map((i) => new ObjectId(i));
  const rows = await opsTasks.find({ _id: { $in: ids } }).toArray();
  const done: string[] = [];
  const skipped: { ref: string; why: string }[] = [];
  if (input.action === "Close as duplicate" && !input.reviewed) {
    throw new UserFacingError(
      "Confirm you've reviewed each task before closing it as a duplicate.",
    );
  }
  for (const t of rows) {
    if (!canSee(u, can, t) || !canWork(u, can, t)) {
      skipped.push({ ref: t.ref, why: "not your team" });
      continue;
    }
    if (bulkExcludedCategories.includes(t.category) || t.visibility === "Clinical Restricted") {
      skipped.push({ ref: t.ref, why: "clinical or sensitive: handle one at a time" });
      continue;
    }
    if (isClosed(t.status)) {
      skipped.push({ ref: t.ref, why: "closed" });
      continue;
    }
    try {
      if (input.action === "Assign to team") {
        if (!input.team) throw new UserFacingError("Choose a team.");
        await taskAction(u, t._id, t.version, {
          type: "assign",
          team: input.team,
          assigneeId: null,
          reason: "Bulk reassignment to team",
        });
      } else if (input.action === "Apply tag") {
        if (!input.tag) throw new UserFacingError("Enter a tag.");
        await taskAction(u, t._id, t.version, { type: "tag", tag: input.tag });
      } else if (input.action === "Acknowledge") {
        if (!t.assigneeId?.equals(u._id)) {
          skipped.push({ ref: t.ref, why: "not assigned to you" });
          continue;
        }
        await taskAction(u, t._id, t.version, { type: "acknowledge" });
      } else if (input.action === "Close as duplicate") {
        if (!canMoveTask(t.status, "Cancelled")) {
          skipped.push({ ref: t.ref, why: `${t.status} can't be closed directly` });
          continue;
        }
        await taskAction(u, t._id, t.version, {
          type: "move",
          to: "Cancelled",
          code: "Duplicate",
          note: "Closed as duplicate after review (bulk)",
        });
      } else {
        const sent = await genericReminder(u, t);
        if (!sent) {
          skipped.push({ ref: t.ref, why: "no authorised recipient" });
          continue;
        }
      }
      done.push(t.ref);
    } catch (e) {
      skipped.push({ ref: t.ref, why: e instanceof Error ? e.message : "failed" });
    }
  }
  await opsChanged();
  return { done, skipped };
}

async function genericReminder(u: UserDoc, t: OpsTaskDoc) {
  if (!t.clientId && !t.referralId) return false;
  const msg = await queueMessage({
    key: `bulk-reminder:${t._id.toHexString()}:${brisbaneKey(new Date())}`,
    template: "TPL-MISSING-INFO",
    recipientType: "Patient",
    clientId: t.clientId,
    referralId: t.referralId,
    vars: { referral_number: t.related.kind === "Referral" ? t.related.ref : "" },
    related: { label: `${t.related.kind} ${t.related.ref}`, href: t.related.href },
    taskId: t._id,
    by: u.name,
    mode: "Execute Allowed Actions",
  });
  return Boolean(msg && msg.state !== "Suppressed");
}

/* ------------------------------------------------------------------ approvals (section 11) */

export async function requestApproval(
  a: Omit<
    OpsApprovalDoc,
    "_id" | "ref" | "status" | "comments" | "decisions" | "createdAt" | "updatedAt"
  >,
) {
  const { opsApprovals, db } = await collections();
  const existing = await opsApprovals.findOne({
    key: a.key,
    status: { $in: ["Pending", "Changes requested"] },
  });
  if (existing) return existing;
  const now = new Date();
  const doc: OpsApprovalDoc = {
    _id: new ObjectId(),
    ref: await nextRef(db, "opsApproval", "APR", 4),
    ...a,
    status: "Pending",
    comments: [],
    decisions: [],
    createdAt: now,
    updatedAt: now,
  };
  await opsApprovals.insertOne(doc);
  return doc;
}

/** Whether this person may decide the approval: the approvals.decide.* permission for its workflow. */
export function canDecide(u: UserDoc, a: OpsApprovalDoc) {
  if (u.role !== "admin") return false;
  if (a.status !== "Pending" && a.status !== "Changes requested") return false;
  // Nobody approves their own request; only the Super Admin is exempt.
  if (a.initiator === u.name && !isSuperAdmin(u.staffRoles)) return false;
  switch (a.workflow) {
    case "Clinical-risk referral":
    case "Therapist assignment exception":
    case "Telehealth recording review":
    case "Sensitive document distribution":
      return hasPermission(u, "approvals.decide.clinical");
    case "Funding exception":
      return hasPermission(u, "approvals.decide.funding");
    case "Billing adjustment":
      return hasPermission(u, "approvals.decide.billing-adjustment");
    case "Unusual travel / booking exception":
    case "Workflow rule activation":
      return hasPermission(u, "approvals.decide.manager");
  }
}

export function approvalDto(a: OpsApprovalDoc, u: UserDoc, can: OpsCan): ApprovalDto {
  const dueAt = addBusinessHours(a.createdAt, a.slaHours, defaultSettings);
  const restrictedHidden = a.restricted && !can.clinical;
  return {
    id: a._id.toHexString(),
    ref: a.ref,
    workflow: a.workflow,
    title: restrictedHidden ? "Clinically restricted review" : a.title,
    reason: restrictedHidden ? "Visible to the Clinical Lead only." : a.reason,
    initiator: a.initiator,
    approver: approverFor[a.workflow],
    criteria: approvalCriteria[a.workflow],
    status: a.status,
    slaHours: a.slaHours,
    dueAt: dueAt.toISOString(),
    overdue:
      (a.status === "Pending" || a.status === "Changes requested") && dueAt.getTime() < Date.now(),
    related: restrictedHidden ? { label: "Restricted", href: null } : a.related,
    taskId: a.taskId?.toHexString() ?? null,
    comments: restrictedHidden ? [] : a.comments.map((c) => ({ ...c, at: c.at.toISOString() })),
    decisions: a.decisions.map((d) => ({
      ...d,
      note: restrictedHidden ? "" : d.note,
      at: d.at.toISOString(),
    })),
    canDecide: canDecide(u, a),
    restricted: a.restricted,
    createdAt: a.createdAt.toISOString(),
  };
}

export const approvalActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("decide"),
    decision: z.enum(["Approved", "Rejected", "Changes requested"]),
    note: z.string().trim().max(2000),
  }),
  z.object({ type: z.literal("comment"), text: z.string().trim().min(1).max(2000) }),
]);

export async function approvalAction(
  u: UserDoc,
  id: ObjectId,
  action: z.infer<typeof approvalActionSchema>,
  onRuleDecision: (u: UserDoc, ruleId: ObjectId, approved: boolean, note: string) => Promise<void>,
) {
  const can = opsCan(u);
  const { opsApprovals, opsTasks } = await collections();
  const a = await opsApprovals.findOne({ _id: id });
  if (!a) throw new UserFacingError("Approval not found.", 404);
  if (a.restricted && !can.clinical) throw new UserFacingError("Approval not found.", 404);
  const now = new Date();
  if (action.type === "comment") {
    await opsApprovals.updateOne(
      { _id: id },
      { $push: { comments: { by: u.name, text: action.text, at: now } }, $set: { updatedAt: now } },
    );
    await opsChanged();
    return { ok: true };
  }
  if (!canDecide(u, a)) {
    throw new UserFacingError(
      a.initiator === u.name
        ? "You raised this request, so someone else must decide it."
        : `This needs the ${approverFor[a.workflow]}.`,
      409,
    );
  }
  if (action.decision !== "Approved" && action.note.length < 3)
    throw new UserFacingError("Give the reason for this decision.");
  if (a.workflow === "Clinical-risk referral" && action.note.length < 10) {
    throw new UserFacingError("Record the clinical rationale (at least a sentence).");
  }
  await opsApprovals.updateOne(
    { _id: id },
    {
      $set: { status: action.decision, updatedAt: now },
      $push: { decisions: { by: u.name, decision: action.decision, note: action.note, at: now } },
    },
  );
  if (a.ruleId) await onRuleDecision(u, a.ruleId, action.decision === "Approved", action.note);
  if (a.taskId) {
    const t = await opsTasks.findOne({ _id: a.taskId });
    if (t && !isClosed(t.status)) {
      const outcome = `${a.workflow}: ${action.decision} by ${u.name}${action.note ? ` (${action.note})` : ""}`;
      const set: Partial<OpsTaskDoc> = {};
      if (t.status === "Escalated" && t.escalation) set.escalation = { ...t.escalation, outcome };
      if (action.decision === "Approved" && a.workflow === "Clinical-risk referral") {
        set.checklist = t.checklist.map((c) =>
          c.required && !c.done ? { ...c, done: true, by: u.name, at: now } : c,
        );
      }
      await opsTasks.updateOne(
        { _id: t._id },
        {
          $set: { ...set, updatedAt: now },
          $push: { history: ev(u, outcome) },
          $inc: { version: 1 },
        },
      );
    }
  }
  await audit(u, `Operations: ${a.ref} ${a.workflow} ${action.decision}`, null);
  await opsChanged();
  return { ok: true };
}

/* ------------------------------------------------------------------ messages (section 10) */

export function messageDto(m: OpsMessageDoc): MessageDto {
  return {
    id: m._id.toHexString(),
    ref: m.ref,
    template: m.template,
    templateVersion: m.templateVersion,
    category: m.category,
    recipientType: m.recipientType,
    recipient: m.recipient,
    authority: m.authority,
    channel: m.channel,
    subject: m.subject,
    body: m.body,
    missing: m.missing,
    state: m.state,
    reason: m.reason,
    attempts: m.attempts,
    related: m.related,
    taskId: m.taskId?.toHexString() ?? null,
    history: m.history.map((h) => ({ ...h, at: h.at.toISOString() })),
    createdAt: m.createdAt.toISOString(),
  };
}

type Recipient = {
  name: string;
  preferred: string;
  phone: string;
  email: string;
  authority: MessageDto["authority"];
  contactConsent: boolean;
};

/** Who may receive this, from verified records only: the patient, or a representative with authority (OP-035). */
async function recipientFor(
  type: RecipientType,
  clientId: ObjectId | null,
  referralId: ObjectId | null,
): Promise<Recipient | null> {
  const { clients, referrals } = await collections();
  if (clientId) {
    const c = await clients.findOne({ _id: clientId });
    if (!c) return null;
    const preferred = c.profile?.preferredName || c.name.split(" ")[0] || c.name;
    const self = c.contacts?.find((k) => k.role === "Participant");
    const contactConsent = self ? self.contactAllowed : true;
    if (type === "Guardian" || type === "Support Coordinator") {
      const roles =
        type === "Guardian" ? ["Parent", "Guardian", "Nominee"] : ["Support Coordinator"];
      const rep = c.contacts?.find((k) => roles.includes(k.role) && k.state !== "Revoked");
      if (!rep) {
        return {
          name: `No ${type.toLowerCase()} on file`,
          preferred,
          phone: "",
          email: "",
          authority: "Missing authority",
          contactConsent,
        };
      }
      const authorised = rep.state === "Verified" && rep.authorityType !== "None";
      return {
        name: rep.name,
        preferred,
        phone: rep.phone,
        email: rep.email,
        authority: authorised ? "Verified" : "Missing authority",
        contactConsent: rep.contactAllowed,
      };
    }
    return {
      name: c.name,
      preferred,
      phone: c.phone ?? "",
      email: c.email,
      authority: "Verified",
      contactConsent,
    };
  }
  if (referralId) {
    const r = await referrals.findOne({ _id: referralId });
    if (!r) return null;
    const p = r.data.participant;
    const b = r.data.booking;
    const verified = r.data.submitter.authorityConfirmed === true;
    return {
      name: b.name || `${p.firstName} ${p.lastName}`,
      preferred: p.firstName,
      phone: b.phone || p.phone,
      email: b.email || p.email,
      authority: verified && (b.name || p.email) ? "Verified" : "Missing authority",
      contactConsent: true,
    };
  }
  return null;
}

/**
 * Drafts, holds or sends (simulated) one message. Nothing leaves the system: "Sent" and
 * "Delivered" are simulated and labelled so. Blocks are explained, never silent (section 14).
 */
export async function queueMessage(m: {
  key: string;
  template: string;
  recipientType: RecipientType;
  clientId: ObjectId | null;
  referralId: ObjectId | null;
  vars: Record<string, string>;
  related: { label: string; href: string | null };
  taskId: ObjectId | null;
  by: string;
  mode: RunMode;
  channel?: Channel;
  needsApproval?: boolean;
  urgent?: boolean;
}) {
  const { opsMessages, db } = await collections();
  const existing = await opsMessages.findOne({ key: m.key });
  if (existing) return existing;
  const tpl = templates.find((t) => t.id === m.template);
  if (!tpl) throw new UserFacingError("Template not found.", 404);
  const s = await opsSettings();
  const r = await recipientFor(m.recipientType, m.clientId, m.referralId);
  const channel = m.channel ?? tpl.channel;
  const now = new Date();
  const vars = { preferred_name: r?.preferred ?? "", channel, ...m.vars };
  const subject = renderTemplate(tpl.subject, vars);
  const body = renderTemplate(tpl.body, vars);
  let state: OpsMessageDoc["state"] = "Queued";
  let reason = "";
  const capCount = r
    ? await opsMessages.countDocuments({
        recipient: r.name,
        state: { $in: ["Sent", "Delivered"] },
        createdAt: { $gte: new Date(Date.now() - 86_400_000) },
      })
    : 0;
  if (!r || r.authority === "Missing authority") {
    state = "Suppressed";
    reason = "No authorised recipient: the contact's authority isn't verified.";
  } else if (!r.contactConsent && m.recipientType !== "Team") {
    state = "Suppressed";
    reason = "The patient hasn't consented to this kind of contact.";
  } else if (channel === "SMS" && hasSensitiveText(body.text)) {
    state = "Suppressed";
    reason = "Blocked: SMS can carry only a minimal notice, and this text looks clinical.";
  } else if (m.mode === "Simulation") {
    state = "Draft";
    reason = "Simulation only: not sent.";
  } else if (m.mode === "Suggest Only" || m.needsApproval || !tpl.approved || body.missing.length) {
    state = "Awaiting Approval";
    reason = body.missing.length
      ? `Missing ${body.missing.join(", ").replace(/_/g, " ")}: a person completes it before sending.`
      : !tpl.approved
        ? "Template not yet approved for automatic sending."
        : "Suggest Only: a person approves before it's sent.";
  } else if (capCount >= s.reminderCapPerDay && !m.urgent) {
    state = "Suppressed";
    reason = `Daily cap reached (${s.reminderCapPerDay} a day to the same person).`;
  } else if (inQuietHours(now, s) && !m.urgent) {
    state = "Queued";
    reason = `Held for quiet hours (${s.quietStart} to ${s.quietEnd}).`;
  }
  const history: OpsMessageDoc["history"] = [{ at: now, state, note: reason || "Queued" }];
  const doc: OpsMessageDoc = {
    _id: new ObjectId(),
    ref: await nextRef(db, "opsMessage", "MSG", 5),
    key: m.key,
    template: tpl.id,
    templateVersion: tpl.version,
    category: tpl.category,
    recipientType: m.recipientType,
    recipient: r?.name ?? "Unknown",
    authority: r?.authority ?? "Missing authority",
    channel,
    subject: subject.text,
    body: body.text,
    missing: body.missing,
    state,
    reason,
    attempts: 0,
    related: m.related,
    taskId: m.taskId,
    clientId: m.clientId,
    history,
    createdAt: now,
  };
  if (state === "Queued" && !reason) deliver(doc, r);
  await opsMessages.insertOne(doc);
  return doc;
}

/** Simulated delivery: an SMS with no mobile on file, or an email with no address, fails visibly. */
function deliver(doc: OpsMessageDoc, r: Recipient | null) {
  const now = new Date();
  doc.attempts += 1;
  const missingRoute =
    (doc.channel === "SMS" && !r?.phone) ||
    ((doc.channel === "Email" || doc.channel === "Secure Link") && !r?.email);
  if (missingRoute) {
    doc.state = "Failed";
    doc.reason =
      doc.channel === "SMS"
        ? "No mobile number on file (simulated failure)."
        : "No email address on file (simulated failure).";
    doc.history.push({ at: now, state: "Failed", note: doc.reason });
    return;
  }
  doc.state = "Delivered";
  doc.reason = "";
  doc.history.push({ at: now, state: "Sent", note: "Sent (simulated: nothing left the system)" });
  doc.history.push({ at: now, state: "Delivered", note: "Delivered (simulated)" });
}

export const messageActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("approve"), body: z.string().trim().max(1000).optional() }),
  z.object({ type: z.literal("retry") }),
  z.object({ type: z.literal("suppress"), reason: z.string().trim().min(3).max(300) }),
  z.object({ type: z.literal("release") }),
]);

export async function messageAction(
  u: UserDoc,
  id: ObjectId,
  action: z.infer<typeof messageActionSchema>,
) {
  if (u.role !== "admin") throw new UserFacingError("Only admin staff manage messages.", 409);
  const { opsMessages } = await collections();
  const m = await opsMessages.findOne({ _id: id });
  if (!m) throw new UserFacingError("Message not found.", 404);
  const r = await recipientFor(m.recipientType, m.clientId, null);
  const now = new Date();
  if (action.type === "suppress") {
    if (["Delivered", "Sent"].includes(m.state))
      throw new UserFacingError("This message has already gone.", 409);
    m.state = "Suppressed";
    m.reason = action.reason;
    m.history.push({ at: now, state: "Suppressed", note: `${u.name}: ${action.reason}` });
  } else if (action.type === "approve") {
    if (m.state !== "Awaiting Approval" && m.state !== "Draft")
      throw new UserFacingError(
        "Only a draft or a message awaiting approval can be approved.",
        409,
      );
    const text = action.body ?? m.body;
    if (/\[[a-z ]+\]/.test(text))
      throw new UserFacingError("Fill in the missing details before approving.");
    if (m.channel === "SMS" && hasSensitiveText(text))
      throw new UserFacingError(
        "SMS can carry only a minimal notice. Remove the clinical wording.",
      );
    if (m.authority === "Missing authority")
      throw new UserFacingError("No authorised recipient: verify the contact first.", 409);
    m.body = text;
    m.missing = [];
    m.history.push({ at: now, state: "Queued", note: `Approved by ${u.name}` });
    deliver(
      m,
      r ?? {
        name: m.recipient,
        preferred: "",
        phone: "",
        email: "",
        authority: m.authority,
        contactConsent: true,
      },
    );
  } else if (action.type === "retry") {
    if (m.state !== "Failed")
      throw new UserFacingError("Only a failed message can be retried.", 409);
    if (m.attempts >= 3)
      throw new UserFacingError(
        "Retry limit reached (3). Update the contact details and send a new message.",
        409,
      );
    m.history.push({ at: now, state: "Queued", note: `Retry requested by ${u.name}` });
    deliver(m, r);
  } else {
    if (m.state !== "Queued")
      throw new UserFacingError("Only a queued message can be released.", 409);
    m.history.push({ at: now, state: "Queued", note: `Released by ${u.name}` });
    deliver(m, r);
  }
  await opsMessages.replaceOne({ _id: m._id }, m);
  await audit(u, `Operations: message ${m.ref} ${m.state}`, m.clientId);
  await opsChanged();
  return { state: m.state, reason: m.reason };
}

export const entityKindsList = entityKinds;
