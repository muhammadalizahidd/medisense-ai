import "server-only";
import { can } from "./permissions";
import { ObjectId } from "mongodb";
import { generateJson } from "@/lib/ai/engine";
import { AiError } from "@/lib/ai/types";
import {
  needsClinicalApproval,
  needsOutcome,
  transitions,
  waiting,
  type CareTeamRow,
  type Category,
  type Status,
  type TaskAction,
  type TaskFull,
  type TaskRow,
} from "@/lib/live/coord";
import { restrictedDisciplines } from "@/lib/live/records";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { audit, notify, publish } from "./live";
import type { ClientDoc, UserDoc } from "./models";
import { insertTask } from "./operations";

/* ------------------------------------------------------------------ storage */

export interface CareTaskDoc {
  _id: ObjectId;
  ref: string;
  title: string;
  category: Category;
  source: string;
  sourceLink: { label: string; href: string } | null;
  clientId: ObjectId | null;
  needId: string | null;
  discipline: string;
  assigneeId: ObjectId;
  assigneeName: string;
  creatorId: ObjectId | null;
  collaborators: { id: ObjectId; name: string }[];
  priority: string;
  status: Status;
  dueAt: Date | null;
  reminder: string;
  visibility: string;
  instructions: string;
  checklist: { label: string; state: string }[];
  fields: Omit<TaskFull["fields"], "attempts" | "ack"> & {
    attempts: { at: Date; mode: string; outcome: string; next: string; by: string }[];
    ack: { by: string; at: Date; comment: string } | null;
  };
  outcome: string;
  escalation: { reason: string; to: string; at: Date } | null;
  cancelReason: string;
  waitReason: string;
  completed: { by: string; at: Date } | null;
  comments: { by: string; at: Date; text: string }[];
  history: { at: Date; by: string; action: string; reason: string }[];
  suggestion: "pending" | "accepted" | "rejected" | null;
  aiDraft: { text: string; sources: string[] } | null;
  sync: "Synced" | "Pending sync" | "Conflict";
  conflict: { field: string; mobile: string; web: string } | null;
  opsTaskId: ObjectId | null;
  createdAt: Date;
  seeded?: boolean;
}

export async function taskCol() {
  const { db } = await collections();
  return db.collection<CareTaskDoc>("careTasks");
}

export async function nextTaskRef() {
  const { db } = await collections();
  const c = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: "careTask" },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return `TASK-${17000 + (c?.seq ?? 1)}`;
}

export function blankFields(): CareTaskDoc["fields"] {
  return {
    contactMode: "",
    attempts: [],
    recipient: "",
    channel: "",
    consentOk: true,
    destination: "",
    purpose: "",
    shareAuthority: false,
    documents: [],
    ack: null,
    handoffType: "",
    location: "",
    window: "",
    frequency: "",
    schedulerResponse: "",
    supervisor: "",
    reviewFeedback: "",
    riskCategory: "",
    immediateAction: "",
    linkedRecordStatus: "",
  };
}

/* ------------------------------------------------------------------ access */

const has = (u: UserDoc, ...roles: string[]) =>
  Boolean(u.staffRoles?.some((r) => roles.includes(r)));
/** Reviews and completes clinical tasks: the coordination.review permission. */
const isLead = (u: UserDoc) => u.role === "admin" && can(u, "coordination.review");
const SUPERVISOR = "Helen Brooks";

function involved(u: UserDoc, t: CareTaskDoc) {
  return (
    t.assigneeId.equals(u._id) ||
    Boolean(t.creatorId?.equals(u._id)) ||
    t.collaborators.some((c) => c.id.equals(u._id))
  );
}

async function careTeamUserIds(clientId: ObjectId | null): Promise<ObjectId[]> {
  if (!clientId) return [];
  const { clients, users } = await collections();
  const c = await clients.findOne({ _id: clientId }, { projection: { needs: 1 } });
  const tids = (c?.needs ?? []).map((n) => n.therapistId).filter((x): x is ObjectId => Boolean(x));
  return (
    await users.find({ therapistId: { $in: tids } }, { projection: { _id: 1 } }).toArray()
  ).map((x) => x._id);
}

function viewOf(
  u: UserDoc,
  t: CareTaskDoc,
  team: ObjectId[],
): "edit" | "review" | "status" | "none" {
  const restricted =
    restrictedDisciplines.includes(t.discipline) || t.visibility === "Clinical Restricted";
  if (u.role === "therapist") {
    if (involved(u, t)) return "edit";
    if (t.visibility === "Care Team" && team.some((x) => x.equals(u._id))) return "status";
    return "none";
  }
  if (u.role !== "admin") return "none";
  if (involved(u, t)) return restricted && !isLead(u) ? "status" : "edit";
  if (isLead(u)) return restricted ? "status" : "review";
  return t.visibility === "Admin Operational Only" ? "edit" : "status";
}

/** Who may own a task: someone with legitimate access to the record (section 5). */
async function assignable(
  t: Pick<CareTaskDoc, "clientId" | "category" | "visibility" | "discipline">,
) {
  const { users } = await collections();
  const team = await careTeamUserIds(t.clientId);
  const restricted =
    restrictedDisciplines.includes(t.discipline) || t.visibility === "Clinical Restricted";
  const adminOk =
    ["Appointment Request", "Administrative Handoff"].includes(t.category) ||
    t.visibility === "Admin Operational Only";
  const all = await users
    .find(
      { role: { $in: ["therapist", "admin"] }, active: { $ne: false } },
      { projection: { name: 1, role: 1, staffRoles: 1, therapistId: 1 } },
    )
    .toArray();
  return all
    .filter((x) => {
      if (!t.clientId) return true;
      if (x.role === "therapist") return team.some((id) => id.equals(x._id));
      if (has(x, "Clinical Lead", "Super Admin"))
        return !restricted || t.category === "Supervision";
      return adminOk && !restricted;
    })
    .map((x) => ({
      id: x._id.toHexString(),
      name: x.name,
      role: x.role === "therapist" ? "Clinician" : (x.staffRoles ?? []).join(", ") || "Admin",
    }));
}

/* ------------------------------------------------------------------ list */

const overdue = (t: Pick<CareTaskDoc, "status" | "dueAt">) =>
  Boolean(
    t.dueAt && t.dueAt.getTime() < Date.now() && !["Completed", "Cancelled"].includes(t.status),
  );

async function rowOf(
  u: UserDoc,
  t: CareTaskDoc,
  clients: ClientDoc[] | Pick<ClientDoc, "_id" | "name" | "mrn">[],
): Promise<TaskRow> {
  const c = clients.find((x) => t.clientId && x._id.equals(t.clientId));
  return {
    id: t._id.toHexString(),
    ref: t.ref,
    title: t.title,
    category: t.category,
    source: t.source,
    participant: c?.name ?? null,
    participantId: c?.mrn ?? "",
    discipline: t.discipline,
    assignee: t.assigneeName,
    priority: t.priority,
    status: t.status,
    dueAt: t.dueAt?.toISOString() ?? null,
    overdue: overdue(t),
    visibility: t.visibility,
    restricted:
      restrictedDisciplines.includes(t.discipline) || t.visibility === "Clinical Restricted",
    suggestion: t.suggestion,
    mine: t.assigneeId.equals(u._id),
    sync: t.sync,
  };
}

export async function taskList(u: UserDoc): Promise<{ rows: TaskRow[]; team: CareTeamRow[] }> {
  const db = await collections();
  const col = await taskCol();
  const tasks = await col.find({}).sort({ dueAt: 1 }).limit(1500).toArray();
  const clientIds = [
    ...new Set(tasks.map((t) => t.clientId?.toHexString()).filter((x): x is string => Boolean(x))),
  ].map((x) => new ObjectId(x));
  const clients = await db.clients
    .find({ _id: { $in: clientIds } }, { projection: { name: 1, mrn: 1, needs: 1 } })
    .toArray();
  const ther = await db.users
    .find({ role: "therapist" }, { projection: { therapistId: 1 } })
    .toArray();
  const rows: TaskRow[] = [];
  for (const t of tasks) {
    const c = clients.find((x) => t.clientId && x._id.equals(t.clientId));
    const tids = (c?.needs ?? [])
      .map((n) => n.therapistId)
      .filter((x): x is ObjectId => Boolean(x));
    const team = ther
      .filter((x) => x.therapistId && tids.some((y) => y.equals(x.therapistId as ObjectId)))
      .map((x) => x._id);
    if (viewOf(u, t, team) === "none") continue;
    rows.push(await rowOf(u, t, clients));
  }
  // The care team: every episode for the participants this person works with.
  const mineClients =
    u.role === "therapist"
      ? await db.clients.find({ "needs.therapistId": u.therapistId ?? new ObjectId() }).toArray()
      : [];
  const tNames = await db.therapists.find({}, { projection: { name: 1 } }).toArray();
  const plans = await db.plans
    .find(
      { clientId: { $in: mineClients.map((c) => c._id) } },
      { projection: { clientId: 1, needId: 1, goals: 1 } },
    )
    .toArray();
  const team: CareTeamRow[] = mineClients.map((c) => ({
    participant: c.name,
    participantId: c.mrn ?? "",
    episodes: c.needs
      .filter((n) => n.therapistId)
      .map((n) => ({
        discipline: n.discipline,
        clinician: tNames.find((t) => n.therapistId && t._id.equals(n.therapistId))?.name ?? "",
        restricted: restrictedDisciplines.includes(n.discipline),
        goals: plans.find((p) => p.clientId.equals(c._id) && p.needId === n.id)?.goals.length ?? 0,
      })),
  }));
  return { rows, team };
}

/* ------------------------------------------------------------------ detail */

async function load(id: ObjectId) {
  const db = await collections();
  const t = await (await taskCol()).findOne({ _id: id });
  if (!t) throw new UserFacingError("Task not found.", 404);
  const client = t.clientId ? await db.clients.findOne({ _id: t.clientId }) : null;
  return { db, t, client, team: await careTeamUserIds(t.clientId) };
}

export async function taskDetail(u: UserDoc, id: ObjectId): Promise<TaskFull> {
  const { t, client, team } = await load(id);
  const v = viewOf(u, t, team);
  if (v === "none") throw new UserFacingError("Task not found.", 404);
  const full = v !== "status";
  const row = await rowOf(u, t, client ? [client] : []);
  const allowed = transitions[t.status].filter(
    (s) => s !== "Completed" || !needsClinicalApproval.includes(t.category) || isLead(u),
  );
  return {
    ...row,
    view: v,
    instructions: full
      ? t.instructions
      : "Restricted: details are visible to the assigned clinician only.",
    sourceLink: full ? t.sourceLink : null,
    collaborators: t.collaborators.map((c) => c.name),
    reminder: t.reminder,
    checklist: t.checklist,
    fields: {
      ...t.fields,
      attempts: full ? t.fields.attempts.map((a) => ({ ...a, at: a.at.toISOString() })) : [],
      ack: t.fields.ack ? { ...t.fields.ack, at: t.fields.ack.at.toISOString() } : null,
      documents: full ? t.fields.documents : [],
      reviewFeedback: full ? t.fields.reviewFeedback : "",
      immediateAction: full ? t.fields.immediateAction : "",
    },
    outcome: full ? t.outcome : t.outcome ? "Recorded" : "",
    escalation: t.escalation ? { ...t.escalation, at: t.escalation.at.toISOString() } : null,
    cancelReason: t.cancelReason,
    waitReason: t.waitReason,
    completed: t.completed ? { by: t.completed.by, at: t.completed.at.toISOString() } : null,
    comments: full ? t.comments.map((c) => ({ ...c, at: c.at.toISOString() })) : [],
    history: t.history
      .map((h) => ({ ...h, at: h.at.toISOString(), reason: full ? h.reason : "" }))
      .reverse(),
    aiDraft: full ? t.aiDraft : null,
    conflict: v === "edit" ? t.conflict : null,
    allowed: v === "edit" || v === "review" ? allowed : [],
    assignable: v === "edit" || v === "review" ? await assignable(t) : [],
    canEdit: v === "edit",
    canReview: (v === "review" || (v === "edit" && isLead(u))) && t.status === "Pending Review",
  };
}

/* ------------------------------------------------------------------ create */

export async function createTask(
  u: UserDoc,
  input: {
    title: string;
    category: Category;
    clientId: string;
    needId: string;
    assigneeId: string;
    priority: string;
    dueAt: string;
    noDue: boolean;
    reminder: string;
    visibility: string;
    instructions: string;
    checklist: string[];
    open: boolean;
    urgentDetail: string;
  },
) {
  const db = await collections();
  let client: ClientDoc | null = null;
  let discipline = "";
  if (input.clientId) {
    client = await db.clients.findOne({ _id: new ObjectId(input.clientId) });
    if (!client) throw new UserFacingError("Participant not found.", 404);
    const need = client.needs.find((n) => n.id === input.needId);
    if (!need && input.category !== "Care Coordination")
      throw new UserFacingError("Choose the service episode for a participant task.");
    discipline = need?.discipline ?? "";
  }
  if (!input.noDue && !input.dueAt)
    throw new UserFacingError("Set a due date, or choose No due date.");
  if (input.noDue && input.reminder !== "None")
    throw new UserFacingError("A reminder needs a due date.");
  if (input.priority === "Urgent" && input.urgentDetail.length < 5)
    throw new UserFacingError("Say why it's urgent and who needs to know.");
  const visibility = restrictedDisciplines.includes(discipline)
    ? "Clinical Restricted"
    : input.visibility;
  const draft: Pick<CareTaskDoc, "clientId" | "category" | "visibility" | "discipline"> = {
    clientId: client?._id ?? null,
    category: input.category,
    visibility,
    discipline,
  };
  const ok = await assignable(draft);
  const who = ok.find((x) => x.id === input.assigneeId);
  if (!who)
    throw new UserFacingError(
      "That person doesn't have access to this participant's record. Choose someone on the care team.",
      409,
    );
  const col = await taskCol();
  const now = new Date();
  const doc: CareTaskDoc = {
    _id: new ObjectId(),
    ref: await nextTaskRef(),
    title: input.title,
    category: input.category,
    source: "Manual",
    sourceLink: null,
    clientId: client?._id ?? null,
    needId: input.needId || null,
    discipline,
    assigneeId: new ObjectId(who.id),
    assigneeName: who.name,
    creatorId: u._id,
    collaborators: [],
    priority: input.priority,
    status: input.open ? "Open" : "Draft",
    dueAt: input.noDue ? null : new Date(input.dueAt),
    reminder: input.reminder,
    visibility,
    instructions: input.instructions,
    checklist: input.checklist.filter(Boolean).map((label) => ({ label, state: "Not done" })),
    fields: blankFields(),
    outcome: "",
    escalation: null,
    cancelReason: "",
    waitReason: "",
    completed: null,
    comments: [],
    history: [
      {
        at: now,
        by: u.name,
        action: `Created and ${input.open ? "opened" : "saved as draft"}; assigned to ${who.name}`,
        reason: input.urgentDetail,
      },
    ],
    suggestion: null,
    aiDraft: null,
    sync: "Synced",
    conflict: null,
    opsTaskId: null,
    createdAt: now,
  };
  await col.insertOne(doc);
  await notifyAssignee(doc, `New task: ${doc.title}`);
  if (client) await audit(u, `Created ${doc.ref}`, client._id);
  await changed();
  return { id: doc._id.toHexString() };
}

/* ------------------------------------------------------------------ actions */

export async function taskAction(u: UserDoc, id: ObjectId, a: TaskAction) {
  const { db, t, client, team } = await load(id);
  const v = viewOf(u, t, team);
  if (v === "none") throw new UserFacingError("Task not found.", 404);
  const col = await taskCol();
  const now = new Date();
  const set: Partial<CareTaskDoc> = {};
  let note = "";
  let reason = "";
  const reviewer = isLead(u);
  const actor = v === "edit" || (v === "review" && reviewer);
  if (!actor && a.type !== "acknowledge" && a.type !== "scheduler-response")
    throw new UserFacingError("You can view this task but not change it.", 409);

  switch (a.type) {
    case "status": {
      if (!transitions[t.status].includes(a.to))
        throw new UserFacingError(`A ${t.status} task can't move to ${a.to}.`, 409);
      if (t.status === "Draft" && a.to === "Open" && (!t.title || !t.instructions))
        throw new UserFacingError("Complete the title and instructions first.");
      if (waiting.includes(a.to) && a.reason.length < 3)
        throw new UserFacingError("Say what you're waiting for and who is responsible.");
      if (a.to === "Completed") {
        if (needsClinicalApproval.includes(t.category) && !reviewer)
          throw new UserFacingError("Only a clinical reviewer can complete this task.", 409);
        if (needsOutcome.includes(t.category) && a.outcome.length < 5)
          throw new UserFacingError("Record the outcome before completing.");
        if (
          t.category === "Documentation" &&
          t.fields.linkedRecordStatus !== "Signed" &&
          a.outcome.length < 5
        )
          throw new UserFacingError(
            "The linked note isn't signed. Explain how the task was resolved.",
          );
        set.completed = { by: u.name, at: now };
        set.outcome = a.outcome;
      }
      if (waiting.includes(a.to)) set.waitReason = a.reason;
      set.status = a.to;
      note = `Status: ${t.status} → ${a.to}`;
      reason = a.reason || a.outcome;
      break;
    }
    case "assign": {
      const ok = await assignable(t);
      const who = ok.find((x) => x.id === a.assigneeId);
      if (!who)
        throw new UserFacingError(
          "That person doesn't have access to this participant's record.",
          409,
        );
      set.assigneeId = new ObjectId(who.id);
      set.assigneeName = who.name;
      note = `Reassigned from ${t.assigneeName} to ${who.name}`;
      reason = a.reason;
      await notifyAssignee(
        { ...t, assigneeId: new ObjectId(who.id) },
        `Task reassigned to you: ${t.title}`,
      );
      await notifyAssignee(t, `Task moved to ${who.name}: ${t.ref}`);
      break;
    }
    case "priority":
      set.priority = a.priority;
      note = `Priority: ${t.priority} → ${a.priority}`;
      break;
    case "checklist": {
      const list = [...t.checklist];
      const item = list[a.index];
      if (!item) throw new UserFacingError("Checklist item not found.", 404);
      list[a.index] = { ...item, state: a.state };
      set.checklist = list;
      note = `Checklist: ${item.label} ${a.state.toLowerCase()}`;
      break;
    }
    case "comment":
      set.comments = [...t.comments, { by: u.name, at: now, text: a.text }];
      note = "Comment added";
      break;
    case "attempt": {
      set.fields = {
        ...t.fields,
        attempts: [
          ...t.fields.attempts,
          { at: now, mode: a.mode, outcome: a.outcome, next: a.next, by: u.name },
        ],
        contactMode: a.mode,
      };
      if (/no answer|unreachable|voicemail|left message/i.test(a.outcome)) {
        set.status = "Waiting on Patient";
        set.waitReason = `Contact attempt ${t.fields.attempts.length + 1}: ${a.outcome}`;
      } else if (["Open", "Waiting on Patient"].includes(t.status)) set.status = "In Progress";
      note = `Contact attempt ${t.fields.attempts.length + 1} by ${a.mode}: ${a.outcome}`;
      break;
    }
    case "escalate":
      set.escalation = { reason: a.reason, to: SUPERVISOR, at: now };
      set.priority = t.priority === "Urgent" ? "Urgent" : "High";
      note = `Escalated to ${SUPERVISOR}: ${a.reason}`;
      reason = a.detail;
      {
        const sup = await db.users.findOne({ name: SUPERVISOR }, { projection: { _id: 1 } });
        // The notification names the task only; no clinical detail leaves the record.
        if (sup)
          await notify([sup._id], {
            title: `Escalated: ${t.ref}`,
            body: `${a.reason} escalation from ${u.name}`,
            href: `/care/coordination/${t._id.toHexString()}`,
          });
      }
      break;
    case "cancel":
      if (["Completed", "Cancelled"].includes(t.status))
        throw new UserFacingError("This task is already closed.", 409);
      set.status = "Cancelled";
      set.cancelReason = a.reason;
      note = `Cancelled: ${a.reason}`;
      reason = a.detail;
      break;
    case "reopen":
      if (!["Completed", "Cancelled"].includes(t.status))
        throw new UserFacingError("Only a closed task reopens.", 409);
      set.status = "Open";
      set.completed = null;
      note = "Reopened";
      reason = a.reason;
      break;
    case "handover": {
      if (!a.shareAuthority)
        throw new UserFacingError("Confirm the sharing authority before handing over.", 409);
      const blocked = t.fields.documents.filter(
        (d) => a.documents.includes(d.label) && !d.shareable,
      );
      if (blocked.length)
        throw new UserFacingError(
          `These can't be shared in a handover: ${blocked.map((d) => d.label).join(", ")}.`,
          409,
        );
      set.fields = {
        ...t.fields,
        shareAuthority: true,
        purpose: a.purpose,
        documents: t.fields.documents.map(
          (d) => ({ ...d, selected: a.documents.includes(d.label) }) as typeof d,
        ),
      };
      set.status = "Waiting on Clinician";
      set.waitReason = "Awaiting recipient acknowledgement";
      note = `Handover sent with ${a.documents.length} document(s)`;
      reason = a.purpose;
      break;
    }
    case "acknowledge":
      if (!t.assigneeId.equals(u._id) && !t.collaborators.some((c) => c.id.equals(u._id)))
        throw new UserFacingError("Only the recipient acknowledges this handover.", 409);
      set.fields = { ...t.fields, ack: { by: u.name, at: now, comment: a.comment } };
      set.status = "In Progress";
      note = "Handover acknowledged";
      reason = a.comment;
      break;
    case "send-scheduling": {
      const created = await insertTask(u, {
        title: `Book: ${t.title}`,
        category: "Scheduling",
        status: "New",
        priority: t.priority === "Urgent" ? "Urgent" : "Normal",
        urgentReason: "",
        team: "Scheduling",
        assigneeId: null,
        assigneeName: null,
        related: {
          kind: "Participant",
          ref: client?.mrn ?? "",
          label: client?.name ?? "",
          href: `/care/coordination/${t._id.toHexString()}`,
        },
        clientId: client?._id ?? null,
        referralId: null,
        appointmentId: null,
        participant: client?.name ?? "",
        service: t.discipline,
        discipline: t.discipline,
        locationType: a.location,
        dueAt: new Date(now.getTime() + 2 * 86_400_000),
        sla: "Standard",
        visibility: "Internal",
        source: "Rule",
        ruleCode: "COORD-17",
        ruleVersion: 1,
        idemKey: `coord:${t._id.toHexString()}:schedule`,
        restrictedNote: null,
        recordingHref: null,
        suggestion: false,
        scenario: null,
        checklist: [{ label: `Offer slots: ${a.window}` }],
        historyNote: `Requested by ${u.name} from ${t.ref}`,
      });
      set.opsTaskId = created.task?._id ?? null;
      set.fields = {
        ...t.fields,
        location: a.location,
        window: a.window,
        frequency: a.frequency,
        schedulerResponse: "Sent",
      };
      set.status = "Waiting on Admin";
      set.waitReason = "With Scheduling";
      note = `Sent to Scheduling: ${a.location}, ${a.window}`;
      break;
    }
    case "scheduler-response":
      if (u.role !== "admin")
        throw new UserFacingError("Scheduling responds to booking requests.", 409);
      set.fields = {
        ...t.fields,
        schedulerResponse: `${a.response}${a.note ? `: ${a.note}` : ""}`,
      };
      set.status = a.response === "Accepted" ? "In Progress" : "Waiting on Clinician";
      note = `Scheduling ${a.response.toLowerCase()} the request`;
      reason = a.note;
      break;
    case "review":
      if (!reviewer || t.status !== "Pending Review")
        throw new UserFacingError("Only an authorised reviewer decides a pending review.", 409);
      if (a.decision === "Approve") {
        set.status = "Completed";
        set.completed = { by: u.name, at: now };
        set.outcome = `Approved by ${u.name}${a.feedback ? `: ${a.feedback}` : ""}`;
        note = "Approved by the reviewer";
      } else {
        if (a.feedback.length < 5) throw new UserFacingError("Say what needs changing.");
        set.status = "In Progress";
        note = "Returned for changes";
      }
      set.fields = { ...t.fields, reviewFeedback: a.feedback };
      reason = a.feedback;
      break;
    case "patient-message":
      if (!t.fields.consentOk) {
        await col.updateOne(
          { _id: t._id },
          {
            $push: {
              history: {
                at: now,
                by: u.name,
                action: "Patient message blocked: no consent to contact on record",
                reason: "",
              },
            },
          },
        );
        throw new UserFacingError(
          "There's no consent to message this person. A consent review is needed first.",
          409,
        );
      }
      set.fields = { ...t.fields, recipient: a.recipient, channel: a.channel };
      set.comments = [
        ...t.comments,
        { by: u.name, at: now, text: `To ${a.recipient} by ${a.channel}: ${a.text}` },
      ];
      note = `Message sent to ${a.recipient} by ${a.channel}`;
      break;
    case "suggestion":
      if (t.suggestion !== "pending")
        throw new UserFacingError("This suggestion was already decided.", 409);
      if (a.decision === "accept") {
        set.suggestion = "accepted";
        set.status = "Open";
        if (a.title) set.title = a.title;
        note = "AI suggestion accepted";
      } else {
        set.suggestion = "rejected";
        set.status = "Cancelled";
        set.cancelReason = "Not required";
        note = "AI suggestion rejected";
      }
      break;
    case "resolve-conflict": {
      if (!t.conflict) throw new UserFacingError("There is no conflict to resolve.", 409);
      const value = a.keep === "mobile" ? t.conflict.mobile : t.conflict.web;
      if (t.conflict.field === "Instructions") set.instructions = value;
      set.sync = "Synced";
      set.conflict = null;
      note = `Sync conflict resolved: kept the ${a.keep === "mobile" ? "phone" : "web"} version`;
      break;
    }
    case "draft-summary": {
      if (!client || !t.needId)
        throw new UserFacingError("A handover summary needs a participant episode.", 409);
      set.aiDraft = await aiSummary(client, t.needId, t.discipline);
      note = "AI drafted a handover summary for review";
      break;
    }
  }

  await col.updateOne(
    { _id: t._id },
    { $set: set, $push: { history: { at: now, by: u.name, action: note, reason } } },
  );
  if (client) await audit(u, `${t.ref}: ${note}`, client._id);
  await changed();
  return { ok: true };
}

async function notifyAssignee(t: Pick<CareTaskDoc, "assigneeId" | "ref" | "_id">, title: string) {
  // Notifications carry the task reference only, never clinical content (AT-39).
  await notify([t.assigneeId], {
    title,
    body: `${t.ref}`,
    href: `/therapist/coordination/${t._id.toHexString()}`,
  });
}

async function changed() {
  const { users } = await collections();
  await publish(
    (
      await users
        .find({ role: { $in: ["admin", "therapist"] } }, { projection: { _id: 1 } })
        .toArray()
    ).map((x) => x._id),
    "care",
    {},
  );
}

async function aiSummary(client: ClientDoc, needId: string, discipline: string) {
  const db = await collections();
  const plan = await db.plans.findOne({ clientId: client._id, needId }, { sort: { version: -1 } });
  const notes = await db.appointments
    .find({ clientId: client._id, needId, "note.signedAt": { $ne: null } })
    .sort({ start: -1 })
    .limit(2)
    .toArray();
  const facts = [
    ...(plan?.goals ?? []).map(
      (g, i) =>
        `[G${i + 1}] goal: ${g.description}; baseline ${g.baseline}; current ${g.current}; target ${g.target}`,
    ),
    ...notes.map(
      (n, i) =>
        `[N${i + 1}] signed note ${n.start.toISOString().slice(0, 10)}: ${(n.note?.text ?? "").slice(0, 500)}`,
    ),
    client.precautions ? `[R1] documented precaution: ${client.precautions}` : "",
  ].filter(Boolean);
  if (!facts.length)
    throw new UserFacingError("There are no signed goals or notes to summarise yet.", 409);
  if (restrictedDisciplines.includes(discipline))
    throw new UserFacingError(
      "Restricted psychology or trauma content isn't summarised for handover.",
      409,
    );
  try {
    const out = await generateJson("handover-summary", {
      system:
        "Draft a concise multidisciplinary handover summary from the sources only: current goals and progress, active supports, documented risks and outstanding work. Cite the bracketed tags. Include the minimum necessary information; never add measurements, diagnoses or instructions. Call the person 'the participant'. The clinician reviews it before sharing.",
      user: facts.join("\n"),
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "sources"],
        properties: {
          summary: { type: "string" },
          sources: { type: "array", items: { type: "string" } },
        },
      },
      schemaName: "handover_summary",
      maxTokens: 700,
    });
    const p = JSON.parse(out.text) as { summary: string; sources: string[] };
    return { text: p.summary, sources: p.sources.slice(0, 8) };
  } catch (error) {
    if (error instanceof AiError)
      throw new UserFacingError(`AI isn't available right now: ${error.message}`, 409);
    throw new UserFacingError("The AI answer couldn't be read. Try again.", 409);
  }
}
