import "server-only";
import { ObjectId } from "mongodb";
import { generateJson } from "@/lib/ai/engine";
import type {
  AdminAgentDto,
  AgentAction,
  AgentFeature,
  AgentReply,
  Audience,
  Proposal,
  RunDto,
  RunStatus,
  SourceDoc,
} from "@/lib/live/agent";
import type { EntityKind, TaskCategory, Team } from "@/lib/live/operations";
import { matchesFor } from "./care-admin";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { audit } from "./live";
import type { UserDoc } from "./models";
import { insertTask } from "./operations";

/*
 * The unified agent contract (spec v2.0 §2): identify the person and what they may see, answer
 * from approved sources (RAG) or live records (tools), show any change as a proposal a person
 * confirms, and record every run with its real outcome. Nothing clinical is decided here.
 */

type R = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const date = (v: unknown) => (v instanceof Date ? v : v ? new Date(String(v)) : null);
const day = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "short",
        timeZone: "Australia/Brisbane",
      }).format(d)
    : "no date";
const money = (n: number) => `$${n.toFixed(2)}`;
const DAY = 86_400_000;

/* ------------------------------------------------------------------ approved sources (RAG) */

const A: Audience[] = ["Admin"];
const SOURCES: SourceDoc[] = [
  {
    id: "SRC-INTAKE",
    title: "Referral intake checklist",
    version: "v3",
    status: "Approved",
    approved: "2026-10-01",
    module: "M01",
    audience: A,
    snippet:
      "A referral needs participant identity, a contact with authority, requested supports, funding source, location, consent to refer, and for NDIS a plan document or plan pages. Missing items are requested from the authorised contact.",
  },
  {
    id: "SRC-SERVICES",
    title: "Services catalogue and classification guide",
    version: "v2",
    status: "Approved",
    approved: "2026-09-15",
    module: "M01",
    audience: ["Admin", "Patient"],
    snippet:
      "Occupational therapy covers daily living, equipment and home access; functional capacity assessments (FCA) describe function across domains. Unclear requests stay 'Needs review' for a clinician.",
  },
  {
    id: "SRC-ALLOC",
    title: "Therapist allocation and scope-of-practice policy",
    version: "v4",
    status: "Approved",
    approved: "2026-10-20",
    module: "M04",
    audience: A,
    snippet:
      "Assign only a clinician whose registration, screening and assessment scope are current, who covers the region, and who has capacity. Clinical exceptions are always decided by a person.",
  },
  {
    id: "SRC-SCHED",
    title: "Scheduling and home-visit procedure",
    version: "v2",
    status: "Approved",
    approved: "2026-08-30",
    module: "M05",
    audience: ["Admin", "Therapist"],
    snippet:
      "Offer only real open slots. Allow travel buffers between home visits. A booking is not confirmed until the participant or authorised person confirms. Do not invent travel times.",
  },
  {
    id: "SRC-CANCEL",
    title: "Cancellation and rebooking policy",
    version: "v2",
    status: "Approved",
    approved: "2026-08-30",
    module: "M20",
    audience: ["Admin", "Patient", "Caregiver"],
    snippet:
      "Please tell us at least 24 hours before a visit. Late cancellations may be chargeable under the service agreement; fees and disputed reasons are reviewed by staff.",
  },
  {
    id: "SRC-CAPACITY",
    title: "Capacity and workforce policy",
    version: "v1",
    status: "Approved",
    approved: "2026-07-01",
    module: "M02",
    audience: A,
    snippet:
      "Caseload Health: Healthy under 60, Watch 60 to 79, At Risk 80 and above. Managers review reassignment; continuity of care is weighed in every change.",
  },
  {
    id: "SRC-FUNDING",
    title: "Funding administration checklist",
    version: "v3",
    status: "Approved",
    approved: "2026-10-05",
    module: "M06",
    audience: A,
    snippet:
      "Record plan dates, management type and evidence. Status stays Unverified until staff verify; the assistant cannot confirm NDIS eligibility or balances.",
  },
  {
    id: "SRC-EXPIRY",
    title: "Funding-period reminder policy",
    version: "v1",
    status: "Approved",
    approved: "2026-09-01",
    module: "M06",
    audience: A,
    snippet:
      "Remind the participant and plan manager 60 and 30 days before a recorded plan end date. A missing date means 'No verified expiry'.",
  },
  {
    id: "SRC-AGREE",
    title: "Service agreement template",
    version: "v5",
    status: "Approved",
    approved: "2026-10-10",
    module: "M06",
    audience: A,
    snippet:
      "Populate verified scope, rates, cancellation terms and contacts; issue only to a verified signatory. Unconfirmed funding does not approve service start.",
  },
  {
    id: "SRC-SIGN",
    title: "Signature reminder policy",
    version: "v1",
    status: "Approved",
    approved: "2026-10-10",
    module: "M06",
    audience: A,
    snippet:
      "Remind an unsigned signatory after 3 and 7 days, then escalate to the intake officer. A changed signatory needs a new agreement link.",
  },
  {
    id: "SRC-READY",
    title: "Service readiness policy",
    version: "v2",
    status: "Approved",
    approved: "2026-10-12",
    module: "M05",
    audience: A,
    snippet:
      "Before a first visit: signed agreement, recorded funding, assigned clinician, consent to service. Missing items block automatic progression.",
  },
  {
    id: "SRC-BILLING",
    title: "Billing and pricing policy",
    version: "v3",
    status: "Approved",
    approved: "2026-10-15",
    module: "M07",
    audience: A,
    snippet:
      "Only verified delivered services become invoice lines. Duplicate lines for one visit are reviewed by Finance; legitimate split services are never deleted automatically.",
  },
  {
    id: "SRC-DEBT",
    title: "Payment reminder templates",
    version: "v2",
    status: "Approved",
    approved: "2026-09-20",
    module: "M07",
    audience: A,
    snippet:
      "Friendly reminder at 7 days overdue, second at 21 days. Disputed invoices stop all automated reminders. No financial advice.",
  },
  {
    id: "SRC-COMMS",
    title: "Communication templates",
    version: "v4",
    status: "Approved",
    approved: "2026-10-01",
    module: "M08",
    audience: A,
    snippet:
      "Send only to a verified recipient with a matching consent. Free-text or sensitive content is reviewed before sending.",
  },
  {
    id: "SRC-FOLLOW",
    title: "Follow-up procedure",
    version: "v2",
    status: "Approved",
    approved: "2026-09-10",
    module: "M08",
    audience: A,
    snippet:
      "Follow up an unanswered request after 3 business days, escalate after 7. No response is never treated as a refusal.",
  },
  {
    id: "SRC-DOCTYPES",
    title: "Document type definitions",
    version: "v1",
    status: "Approved",
    approved: "2026-08-01",
    module: "M22",
    audience: A,
    snippet:
      "Types: Referral letter, NDIS plan, Service agreement, Consent, Previous assessment, Other. Unreadable scans stay Unclassified for a person.",
  },
  {
    id: "SRC-EXCEPT",
    title: "Exception routing rules",
    version: "v1",
    status: "Approved",
    approved: "2026-09-25",
    module: "M08",
    audience: A,
    snippet:
      "No eligible clinician, conflicting records or failed automation create an exception owned by Operations, with a resolution tracked to closure.",
  },
  {
    id: "SRC-REPORTS",
    title: "Report definitions",
    version: "v2",
    status: "Approved",
    approved: "2026-10-01",
    module: "M09",
    audience: A,
    snippet:
      "Waiting time runs from submission to acceptance; small samples (fewer than 5) are flagged inconclusive; no causal claims without evidence.",
  },
  {
    id: "SRC-OPS",
    title: "Daily operations SOP",
    version: "v1",
    status: "Approved",
    approved: "2026-10-01",
    module: "M08",
    audience: A,
    snippet:
      "Morning order: safety and clinical escalations, unassigned accepted referrals, unsigned agreements, scheduling conflicts, billing drafts, overdue follow-ups.",
  },
  {
    id: "SRC-CORRECT",
    title: "Record correction policy",
    version: "v1",
    status: "Approved",
    approved: "2026-09-01",
    module: "M11",
    audience: ["Admin", "Therapist"],
    snippet:
      "Errors in an approved record are raised as a correction request to the record owner. The approved version stays until an authorised person amends it; nothing is silently rewritten.",
  },
];

export function sourcesFor(ids: string[], who: Audience) {
  return SOURCES.filter(
    (x) => ids.includes(x.id) && x.audience.includes(who) && x.status === "Approved",
  );
}

/** Keyword retrieval over approved sources the person may read. */
export function retrieve(text: string, who: Audience, limit = 3) {
  const words = text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  return SOURCES.filter((x) => x.audience.includes(who) && x.status === "Approved")
    .map((x) => ({
      x,
      n: words.filter((w) => `${x.title} ${x.snippet}`.toLowerCase().includes(w)).length,
    }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map((r) => r.x);
}

/* ------------------------------------------------------------------ runs and proposals */

type RunDoc = {
  _id: ObjectId;
  tool: string;
  title: string;
  record: { label: string; href: string | null };
  before: string;
  after: string;
  preconditions: { label: string; ok: boolean }[];
  approver: string;
  status: RunStatus;
  args: R;
  idemKey: string;
  feature: string;
  requestedBy: string;
  requestedById: ObjectId;
  role: string;
  at: Date;
  decidedAt: Date | null;
  decidedBy: string | null;
  result: string;
};

async function runs() {
  const { db } = await collections();
  return db.collection<RunDoc>("agentRuns");
}

export type ProposalInput = Omit<Proposal, "runId" | "status"> & { args: R; idemKey: string };

/** Records a proposed action. A repeat of a completed action is shown as a duplicate, never redone. */
export async function propose(u: UserDoc, feature: string, p: ProposalInput): Promise<Proposal> {
  const col = await runs();
  const done = await col.findOne({ idemKey: p.idemKey, status: "Completed" });
  const open = await col.findOne({ idemKey: p.idemKey, status: "Proposed" });
  const base = {
    ...p,
    feature,
    requestedBy: u.name,
    requestedById: u._id,
    role: u.role,
    at: new Date(),
    decidedAt: null,
    decidedBy: null,
    result: "",
  };
  if (open) return toProposal(open);
  const doc: RunDoc = {
    _id: new ObjectId(),
    ...base,
    status: done ? "Duplicate" : "Proposed",
    result: done
      ? `Already done ${day(done.decidedAt)} by ${done.decidedBy ?? "someone"}: ${done.result}`
      : "",
  };
  await col.insertOne(doc);
  return toProposal(doc);
}

const toProposal = (d: RunDoc): Proposal => ({
  runId: d._id.toHexString(),
  tool: d.tool,
  title: d.title,
  record: d.record,
  before: d.before,
  after: d.after,
  preconditions: d.preconditions,
  approver: d.approver,
  status: d.status,
});
const toRun = (d: RunDoc): RunDto => ({
  ...toProposal(d),
  requestedBy: d.requestedBy,
  role: d.role,
  at: d.at.toISOString(),
  decidedAt: d.decidedAt ? d.decidedAt.toISOString() : null,
  decidedBy: d.decidedBy,
  result: d.result,
  feature: d.feature,
});

export async function runHistory(filter: Partial<Pick<RunDoc, "requestedById">> = {}, limit = 30) {
  return (await (await runs()).find(filter).sort({ at: -1 }).limit(limit).toArray()).map(toRun);
}

/** Tool executors: each changes the record its owning module keeps. Extra tools can be registered. */
type Executor = (u: UserDoc, args: R) => Promise<string>;
const executors: Record<string, Executor> = {};
export function registerTool(name: string, fn: Executor) {
  executors[name] = fn;
}

registerTool("CreateTask", async (u, a) => {
  const { task: t, created } = await insertTask(u, {
    title: s(a.title),
    category: s(a.category || "Other") as TaskCategory,
    status: "New",
    priority: (s(a.priority) || "Normal") as "Low" | "Normal" | "High" | "Urgent",
    urgentReason: "",
    team: (s(a.team) || "Operations") as Team,
    assigneeId: null,
    assigneeName: null,
    related: {
      kind: (s(a.kind) || "Referral") as EntityKind,
      ref: s(a.ref),
      label: s(a.label),
      href: a.href ? s(a.href) : null,
    },
    clientId: a.clientId && ObjectId.isValid(s(a.clientId)) ? new ObjectId(s(a.clientId)) : null,
    referralId:
      a.referralId && ObjectId.isValid(s(a.referralId)) ? new ObjectId(s(a.referralId)) : null,
    appointmentId: null,
    participant: a.participant ? s(a.participant) : null,
    service: null,
    discipline: null,
    locationType: null,
    dueAt: new Date(Date.now() + (num(a.dueDays) || 2) * DAY),
    sla: "Standard",
    visibility: "Internal",
    source: "AI Proposed",
    ruleCode: null,
    ruleVersion: null,
    idemKey: s(a.idemKey) || null,
    restrictedNote: null,
    recordingHref: null,
    suggestion: false,
    scenario: null,
    note: s(a.note) || undefined,
    historyNote: "Created from an AI agent proposal confirmed by a person",
  });
  if (!t) throw new Error("The task could not be created.");
  return created
    ? `Task ${t.ref} created for ${s(a.team) || "Operations"}`
    : `Task ${t.ref} already existed; not duplicated`;
});

registerTool("SendApprovedMessage", async (u, a) => {
  const { db } = await collections();
  const col = db.collection("opsMessages");
  const n = (await col.countDocuments()) + 1;
  const ref = `MSG-${String(n).padStart(5, "0")}`;
  const now = new Date();
  await col.insertOne({
    _id: new ObjectId(),
    ref,
    key: s(a.idemKey),
    template: s(a.template || "TPL-AGENT"),
    templateVersion: 1,
    category: s(a.category || "Agent"),
    recipientType: s(a.recipientType || "Patient"),
    recipient: s(a.recipient),
    authority: "Verified",
    channel: s(a.channel || "Secure Link"),
    subject: s(a.subject),
    body: s(a.body),
    missing: [],
    state: "Queued",
    reason: "",
    attempts: 0,
    related: { label: s(a.label), href: a.href ? s(a.href) : null },
    taskId: null,
    clientId: null,
    history: [
      { at: now, by: u.name, action: "Queued from an AI agent proposal (simulated delivery)" },
    ],
    createdAt: now,
  });
  return `Message ${ref} queued to ${s(a.recipient)} (simulated delivery)`;
});

export async function decide(u: UserDoc, runId: string, confirm: boolean, reason = "") {
  if (!ObjectId.isValid(runId)) throw new UserFacingError("Proposal not found.", 404);
  const col = await runs();
  const d = await col.findOne({ _id: new ObjectId(runId) });
  if (!d || (u.role !== "admin" && !d.requestedById.equals(u._id)))
    throw new UserFacingError("Proposal not found.", 404);
  if (d.status === "Completed" || d.status === "Duplicate") return toRun(d);
  if (d.status === "Declined" && confirm)
    throw new UserFacingError("This proposal was declined.", 409);
  if (!confirm) {
    await col.updateOne(
      { _id: d._id },
      {
        $set: {
          status: "Declined",
          decidedAt: new Date(),
          decidedBy: u.name,
          result: reason || "Declined",
        },
      },
    );
  } else {
    const blocked = d.preconditions.filter((p) => !p.ok);
    if (blocked.length)
      throw new UserFacingError(`Can't run yet: ${blocked.map((b) => b.label).join("; ")}.`, 409);
    const fn = executors[d.tool];
    let status: RunStatus = "Completed";
    let result = "";
    try {
      if (!fn) throw new Error("This tool isn't available.");
      result = await fn(u, { ...d.args, idemKey: d.idemKey });
    } catch (e) {
      status = "Failed";
      result = e instanceof Error ? e.message : "Failed";
    }
    await col.updateOne(
      { _id: d._id },
      { $set: { status, decidedAt: new Date(), decidedBy: u.name, result } },
    );
    await audit(u, `Agent ${d.tool}: ${status}`, null);
  }
  const after = await col.findOne({ _id: d._id });
  return toRun(after ?? d);
}

/* ------------------------------------------------------------------ admin features */

type Finding = {
  answer: string;
  facts: string[];
  records: { label: string; href: string }[];
  proposals: ProposalInput[];
  sources: string[];
  empty?: boolean;
};
type Feature = AgentFeature & { keys: RegExp; run: (u: UserDoc, text: string) => Promise<Finding> };

const refHref = (r: R) => `/care/referrals/${(r._id as ObjectId).toHexString()}`;
const refName = (r: R) => {
  const p = ((r.data as R | undefined)?.participant as R | undefined) ?? {};
  return `${s(p.firstName)} ${s(p.lastName)}`.trim() || s(r.reference);
};
const OPEN_REF = [
  "Under Admin Review",
  "Needs Information",
  "Clinical Triage",
  "Funding Review",
  "Waitlisted",
];

async function db() {
  return (await collections()).db;
}
async function find(name: string, filter: R = {}, limit = 200, sort: R = { _id: -1 }) {
  return (await (
    await db()
  )
    .collection(name)
    .find(filter)
    .sort(sort as never)
    .limit(limit)
    .toArray()) as R[];
}

function task(
  title: string,
  args: {
    category: TaskCategory;
    team: Team;
    kind: EntityKind;
    ref: string;
    label: string;
    href: string | null;
    referralId?: string;
    clientId?: string;
    priority?: string;
  },
  idem: string,
  approver = "Admin",
  before = "No task",
  pre: { label: string; ok: boolean }[] = [],
): ProposalInput {
  return {
    tool: "CreateTask",
    title,
    record: { label: args.label, href: args.href },
    before,
    after: `Task in ${args.team} queue: "${title}"`,
    preconditions: [{ label: "No identical task already open", ok: true }, ...pre],
    approver,
    args: { ...args, title },
    idemKey: idem,
  };
}

const features: Feature[] = [
  {
    no: "A01",
    title: "Referral screening",
    module: "M01 M18",
    group: "Intake",
    keys: /screen|new referral|incoming|need attention|referrals? (need|waiting)/i,
    async run() {
      const list = await find("referrals", { status: { $in: OPEN_REF } }, 12, { createdAt: -1 });
      const facts = list.map(
        (r) =>
          `[${s(r.reference)}] ${refName(r)} · ${s(r.status)} · ${((r.gaps as R[]) ?? []).length} missing item(s)`,
      );
      const first = list.find((r) => ((r.gaps as R[]) ?? []).length > 0);
      return {
        answer: list.length
          ? `${list.length} referrals are open. ${list.filter((r) => ((r.gaps as R[]) ?? []).length).length} have missing information; the rest await staff review.`
          : "No open referrals.",
        facts,
        records: list.slice(0, 6).map((r) => ({ label: s(r.reference), href: refHref(r) })),
        proposals: first
          ? [
              task(
                `Intake review: ${s(first.reference)}`,
                {
                  category: "Referral",
                  team: "Intake",
                  kind: "Referral",
                  ref: s(first.reference),
                  label: refName(first),
                  href: refHref(first),
                  referralId: (first._id as ObjectId).toHexString(),
                },
                `A01:${s(first.reference)}`,
              ),
            ]
          : [],
        sources: ["SRC-INTAKE"],
        empty: !list.length,
      };
    },
  },
  {
    no: "A02",
    title: "Referral document extraction",
    module: "M01 M03 M06",
    group: "Intake",
    keys: /extract|uploaded (plan|pdf|document)|document values/i,
    async run() {
      const docs = await find("documents", { referralId: { $ne: null } }, 6, { at: -1 });
      const refs = await find("referrals", { _id: { $in: docs.map((d) => d.referralId) } }, 20);
      const facts = docs.map((d) => {
        const r = refs.find((x) => (x._id as ObjectId).equals(d.referralId as ObjectId));
        const p = ((r?.data as R | undefined)?.participant as R | undefined) ?? {};
        const f = ((r?.data as R | undefined)?.funding as R | undefined) ?? {};
        return `[${s(d.name)}] type ${s(d.kind)} · candidate name "${s(p.firstName)} ${s(p.lastName)}" · NDIS no. ${s(f.ndisNumber) || "not stated"} · plan end ${s(f.planEnd) || "not stated"}`;
      });
      return {
        answer: docs.length
          ? "Candidate values below come from the referral form next to each file; file contents aren't read in this prototype. Staff confirm before anything is stored."
          : "No uploaded referral documents.",
        facts,
        records: refs.slice(0, 4).map((r) => ({ label: s(r.reference), href: refHref(r) })),
        proposals: docs[0]
          ? [
              task(
                `Confirm extracted values: ${s(docs[0].name)}`,
                {
                  category: "Documentation",
                  team: "Intake",
                  kind: "Document",
                  ref: s(docs[0].name),
                  label: s(docs[0].name),
                  href: null,
                },
                `A02:${(docs[0]._id as ObjectId).toHexString()}`,
              ),
            ]
          : [],
        sources: ["SRC-INTAKE", "SRC-DOCTYPES"],
        empty: !docs.length,
      };
    },
  },
  {
    no: "A03",
    title: "Missing-information follow-up",
    module: "M01 M03 M08",
    group: "Intake",
    keys: /missing|follow.?up request|request (the )?(document|evidence)|chase/i,
    async run(_u, text) {
      const list = await find(
        "referrals",
        { status: { $in: OPEN_REF }, "gaps.0": { $exists: true } },
        8,
        { createdAt: -1 },
      );
      const said = text.toLowerCase();
      const words = new Set(said.split(/[^a-z0-9-]+/));
      // A referral named in the question (reference, full name or first name) comes first.
      const named = (x: R) => {
        const name = refName(x).toLowerCase();
        const first = name.split(" ")[0] ?? "";
        return (
          said.includes(s(x.reference).toLowerCase()) ||
          said.includes(name) ||
          (first.length > 2 && words.has(first))
        );
      };
      const r = list.find(named) ?? list[0];
      if (!r)
        return {
          answer: "No referral is missing information.",
          facts: [],
          records: [],
          proposals: [],
          sources: ["SRC-INTAKE"],
          empty: true,
        };
      const gaps = ((r.gaps as R[]) ?? []).map((g) => s(g.label));
      const sub = ((r.data as R | undefined)?.submitter as R | undefined) ?? {};
      const recipient = s(sub.name) || refName(r);
      const ok = Boolean(sub.email || sub.phone);
      return {
        answer: `${s(r.reference)} is missing ${gaps.length} item(s). I drafted a request to ${recipient}; check the recipient and wording before it goes.`,
        facts: [
          `[${s(r.reference)}] missing: ${gaps.join("; ")}`,
          `[${s(r.reference)}] contact: ${recipient}${ok ? "" : " (no contact details recorded)"}`,
        ],
        records: [{ label: s(r.reference), href: refHref(r) }],
        proposals: [
          {
            tool: "SendApprovedMessage",
            title: `Request missing items for ${s(r.reference)}`,
            record: { label: s(r.reference), href: refHref(r) },
            before: "Not requested",
            after: `Request queued to ${recipient}`,
            preconditions: [
              { label: "Recipient has contact details", ok },
              { label: "Template TPL-DOC-REQUIRED approved", ok: true },
            ],
            approver: "Admin",
            args: {
              recipient,
              recipientType: "Referrer",
              subject: `Information needed for ${s(r.reference)}`,
              body: `Hi ${recipient.split(" ")[0]}, to continue the referral please send: ${gaps.join("; ")}.`,
              label: `Referral ${s(r.reference)}`,
              href: refHref(r),
              category: "Document Required",
              template: "TPL-DOC-REQUIRED",
            },
            idemKey: `A03:${s(r.reference)}`,
          },
        ],
        sources: ["SRC-INTAKE", "SRC-COMMS"],
      };
    },
  },
  {
    no: "A04",
    title: "Duplicate patient detection",
    module: "M01 M03",
    group: "Intake",
    keys: /duplicate (patient|record)|same (phone|person)|possible match/i,
    async run() {
      const list = await find(
        "referrals",
        { "duplicates.0": { $exists: true }, duplicateDecision: null },
        6,
      );
      const facts = list.map(
        (r) =>
          `[${s(r.reference)}] ${refName(r)} · ${((r.duplicates as R[]) ?? []).length} possible match(es); limited identifiers shown`,
      );
      return {
        answer: list.length
          ? `${list.length} referral(s) have a possible existing patient. Staff choose to link or create; nothing is merged automatically.`
          : "No unresolved duplicate candidates.",
        facts,
        records: list.map((r) => ({ label: s(r.reference), href: refHref(r) })),
        proposals: list[0]
          ? [
              task(
                `Resolve possible duplicate: ${s(list[0].reference)}`,
                {
                  category: "Referral",
                  team: "Intake",
                  kind: "Referral",
                  ref: s(list[0].reference),
                  label: refName(list[0]),
                  href: refHref(list[0]),
                },
                `A04:${s(list[0].reference)}`,
              ),
            ]
          : [],
        sources: ["SRC-INTAKE"],
        empty: !list.length,
      };
    },
  },
  {
    no: "A05",
    title: "Patient onboarding preparation",
    module: "M03 M18 M19",
    group: "Intake",
    keys: /onboard|create (the )?patient|register/i,
    async run() {
      const list = await find("referrals", { status: "Accepted" }, 8, { updatedAt: -1 });
      const pending = list.filter((r) => !r.clientId);
      const facts = list.map(
        (r) =>
          `[${s(r.reference)}] ${refName(r)} · ${r.clientId ? "patient record exists" : "no patient record yet"}`,
      );
      return {
        answer: pending.length
          ? `${pending.length} accepted referral(s) have no patient record. Check identity, contact and consent before creating one.`
          : `All ${list.length} accepted referrals already have a patient record.`,
        facts,
        records: list.slice(0, 5).map((r) => ({ label: s(r.reference), href: refHref(r) })),
        proposals: pending[0]
          ? [
              task(
                `Prepare onboarding: ${s(pending[0].reference)}`,
                {
                  category: "Referral",
                  team: "Intake",
                  kind: "Referral",
                  ref: s(pending[0].reference),
                  label: refName(pending[0]),
                  href: refHref(pending[0]),
                },
                `A05:${s(pending[0].reference)}`,
                "Admin",
                "No patient record",
                [
                  {
                    label: "Consent to refer recorded",
                    ok: Boolean((pending[0].data as R | undefined)?.consent as R | undefined),
                  },
                ],
              ),
            ]
          : [],
        sources: ["SRC-INTAKE"],
      };
    },
  },
  {
    no: "A06",
    title: "Referral service classification",
    module: "M01",
    group: "Intake",
    keys: /classif|service type|which service|tag/i,
    async run() {
      const list = await find("referrals", { status: { $in: OPEN_REF } }, 8, { createdAt: -1 });
      const facts = list.map(
        (r) =>
          `[${s(r.reference)}] requested: ${(((r.data as R | undefined)?.supports as R[]) ?? []).map((x) => s(x.support)).join(", ") || "none stated (Needs review)"}`,
      );
      return {
        answer:
          "Service tags come from the supports the referrer selected. Anything unclear stays 'Needs review' for a clinician.",
        facts,
        records: list.slice(0, 5).map((r) => ({ label: s(r.reference), href: refHref(r) })),
        proposals: [],
        sources: ["SRC-SERVICES"],
      };
    },
  },
  {
    no: "A07",
    title: "Therapist eligibility matching",
    module: "M04 M05",
    group: "Allocation",
    keys: /match|eligib|which therapist|who (can|should) (take|see)/i,
    async run() {
      const c = (
        await find(
          "clients",
          { "needs.status": "needs-therapist", discharged: { $in: [null] } },
          1,
          { createdAt: 1 },
        )
      )[0];
      const need = ((c?.needs as R[]) ?? []).find((n) => n.status === "needs-therapist");
      if (!c || !need)
        return {
          answer: "No patient is waiting for a therapist.",
          facts: [],
          records: [],
          proposals: [],
          sources: ["SRC-ALLOC"],
          empty: true,
        };
      const m = await matchesFor(c._id as ObjectId, s(need.id));
      const ok = m.filter((x) => x.eligible).slice(0, 3);
      const best = ok[0];
      return {
        answer: best
          ? `For ${s(c.name)} (${s(need.support)}), ${ok.length} eligible clinician(s). ${best.name} ranks first. A person approves the assignment.`
          : `No eligible clinician for ${s(c.name)}: this becomes an exception.`,
        facts: m.slice(0, 4).map(
          (x) =>
            `[${x.name}] ${x.eligible ? "eligible" : "not eligible"} · score ${x.score} · ${x.activeClients}/${x.capacity} · ${x.reasons
              .slice(0, 2)
              .map((r) => r.label)
              .join("; ")}`,
        ),
        records: [{ label: s(c.name), href: `/care/${(c._id as ObjectId).toHexString()}` }],
        proposals: best
          ? [
              task(
                `Assign ${best.name} to ${s(c.name)} (${s(need.support)})`,
                {
                  category: "Scheduling",
                  team: "Scheduling",
                  kind: "Participant",
                  ref: s(c.mrn),
                  label: s(c.name),
                  href: `/care/${(c._id as ObjectId).toHexString()}`,
                  clientId: (c._id as ObjectId).toHexString(),
                },
                `A07:${(c._id as ObjectId).toHexString()}:${s(need.id)}`,
                "Scheduler",
                "Waiting for a therapist",
                [{ label: `${best.name} credentials and scope current`, ok: best.eligible }],
              ),
            ]
          : [],
        sources: ["SRC-ALLOC"],
      };
    },
  },
  {
    no: "A08",
    title: "Rule-approved therapist allocation",
    module: "M04 M05 M08",
    group: "Allocation",
    keys: /auto.?assign|allocation rule|rule.?approved/i,
    async run() {
      const rule = (await find("opsRules", { code: "AUT-07" }, 1))[0];
      const recent = await find("opsRuns", { ruleCode: "AUT-07" }, 5, { at: -1 });
      return {
        answer: `Auto assignment (AUT-07) is ${s(rule?.status) || "not configured"} in ${s(rule?.runMode) || "unknown"} mode. It assigns only when every hard gate passes; clinical exceptions stay with people.`,
        facts: recent.map((r) => `[${s(r.ruleCode)}] ${day(date(r.at))} · ${s(r.outcome)}`),
        records: [
          { label: "Operations rules", href: "/care/operations?tab=automation&section=rules" },
        ],
        proposals: [],
        sources: ["SRC-ALLOC"],
      };
    },
  },
  {
    no: "A09",
    title: "Appointment scheduling assistant",
    module: "M05 M20",
    group: "Scheduling",
    keys: /schedul|book|slot|available/i,
    async run() {
      const c = (
        await find("clients", { "needs.status": { $in: ["assigned", "needs-therapist"] } }, 1, {
          createdAt: -1,
        })
      )[0];
      const need = ((c?.needs as R[]) ?? [])[0];
      if (!c || !need)
        return {
          answer: "No patient needs a booking.",
          facts: [],
          records: [],
          proposals: [],
          sources: ["SRC-SCHED"],
          empty: true,
        };
      const m = (await matchesFor(c._id as ObjectId, s(need.id))).filter(
        (x) => x.eligible && x.slots.length,
      )[0];
      return {
        answer: m
          ? `Real open slots for ${m.name}: ${m.slots.slice(0, 3).join(", ")}. A booking is only confirmed after the participant confirms.`
          : "No open slots found; offer the waitlist rather than a made-up time.",
        facts: m ? m.slots.slice(0, 4).map((x) => `[${m.name} availability] ${x}`) : [],
        records: [{ label: s(c.name), href: `/care/${(c._id as ObjectId).toHexString()}` }],
        proposals: m
          ? [
              task(
                `Offer ${m.slots[0]} with ${m.name} to ${s(c.name)}`,
                {
                  category: "Scheduling",
                  team: "Scheduling",
                  kind: "Participant",
                  ref: s(c.mrn),
                  label: s(c.name),
                  href: `/care/${(c._id as ObjectId).toHexString()}`,
                },
                `A09:${(c._id as ObjectId).toHexString()}:${m.slots[0]}`,
                "Scheduler",
                "No visit offered",
                [{ label: "Slot re-checked as open", ok: true }],
              ),
            ]
          : [],
        sources: ["SRC-SCHED"],
      };
    },
  },
  {
    no: "A10",
    title: "Home-visit travel coordination",
    module: "M04 M05",
    group: "Scheduling",
    keys: /travel|route|suburb|between visits/i,
    async run() {
      const ts = await find("therapists", {}, 25);
      const appts = await find(
        "appointments",
        { status: "booked", start: { $gte: new Date(), $lte: new Date(Date.now() + 7 * DAY) } },
        400,
        { start: 1 },
      );
      const per = ts
        .map((t) => ({
          t,
          n: appts.filter((a) => (a.therapistId as ObjectId).equals(t._id as ObjectId)).length,
        }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 5);
      return {
        answer:
          "Home visits in the next 7 days by clinician. Travel time isn't estimated without route data; the schedule keeps a buffer between visits.",
        facts: per.map((x) => `[${s(x.t.name)}] ${x.n} visit(s) · region ${s(x.t.region)}`),
        records: [{ label: "Scheduling", href: "/care/schedule" }],
        proposals: [],
        sources: ["SRC-SCHED"],
      };
    },
  },
  {
    no: "A11",
    title: "Cancellation and rescheduling",
    module: "M05 M20",
    group: "Scheduling",
    keys: /cancel|reschedul|rebook/i,
    async run() {
      const list = await find(
        "appointments",
        {
          status: { $in: ["cancelled", "late-cancelled"] },
          start: { $gte: new Date(Date.now() - 14 * DAY) },
        },
        10,
        { start: -1 },
      );
      const late = list.filter(
        (a) =>
          s(a.status) === "late-cancelled" ||
          (a.cancellation as R | undefined)?.chargeable === true,
      );
      return {
        answer: `${list.length} cancellation(s) in the last 14 days; ${late.length} may be chargeable and need staff review. Rebooking offers only real slots.`,
        facts: list
          .slice(0, 6)
          .map(
            (a) =>
              `[${s(a.ref)}] ${day(date(a.start))} · ${s(a.status)} · ${s((a.cancellation as R | undefined)?.reason) || "no reason"}`,
          ),
        records: [{ label: "Scheduling", href: "/care/schedule" }],
        proposals: late[0]
          ? [
              task(
                `Review cancellation fee: ${s(late[0].ref)}`,
                {
                  category: "Billing",
                  team: "Finance",
                  kind: "Appointment",
                  ref: s(late[0].ref),
                  label: s(late[0].ref),
                  href: null,
                },
                `A11:${s(late[0].ref)}`,
                "Finance",
              ),
            ]
          : [],
        sources: ["SRC-CANCEL"],
      };
    },
  },
  {
    no: "A12",
    title: "Caseload and workload monitoring",
    module: "M02 M04 M09",
    group: "Workforce",
    keys: /caseload|workload|capacity|overload/i,
    async run() {
      const ts = (await find("therapists", {}, 30)).sort(
        (a, b) => num(b.caseloadScore) - num(a.caseloadScore),
      );
      const risk = ts.filter((t) => num(t.caseloadScore) >= 80);
      return {
        answer: `${risk.length} clinician(s) are At Risk (score 80+). A manager reviews any reassignment; continuity of care comes first.`,
        facts: ts
          .slice(0, 5)
          .map(
            (t) =>
              `[${s(t.name)}] score ${num(t.caseloadScore)} · ${num(t.activeClients)}/${num(t.capacity)} patients`,
          ),
        records: [{ label: "Team capacity", href: "/team-capacity" }],
        proposals: risk[0]
          ? [
              task(
                `Review caseload balance: ${s(risk[0].name)}`,
                {
                  category: "Other",
                  team: "Operations",
                  kind: "Participant",
                  ref: s(risk[0].slug),
                  label: s(risk[0].name),
                  href: "/team-capacity",
                },
                `A12:${s(risk[0].slug)}`,
                "Manager",
              ),
            ]
          : [],
        sources: ["SRC-CAPACITY"],
      };
    },
  },
  {
    no: "A13",
    title: "NDIS document completeness",
    module: "M06",
    group: "Funding",
    keys: /ndis (doc|evidence)|funding (doc|evidence)|completeness/i,
    async run() {
      const list = await find("fundingPlans", { status: { $in: ["Draft", "Active"] } }, 60);
      const thin = list.filter((p) => ((p.evidence as R[]) ?? []).length === 0 || !p.end);
      return {
        answer: `${thin.length} of ${list.length} plan record(s) lack evidence or an end date and stay Unverified. The assistant can't verify NDIS eligibility.`,
        facts: thin
          .slice(0, 6)
          .map(
            (p) =>
              `[${s(p.ref)}] ${s(p.participant)} · ${((p.evidence as R[]) ?? []).length} evidence item(s) · end ${s(p.end) || "not recorded"} · ${s(p.status)}`,
          ),
        records: [{ label: "Funding", href: "/care/funding" }],
        proposals: thin[0]
          ? [
              task(
                `Request funding evidence: ${s(thin[0].ref)}`,
                {
                  category: "Funding",
                  team: "Finance",
                  kind: "Funding Plan",
                  ref: s(thin[0].ref),
                  label: s(thin[0].participant),
                  href: "/care/funding",
                },
                `A13:${s(thin[0].ref)}`,
                "Finance",
              ),
            ]
          : [],
        sources: ["SRC-FUNDING"],
      };
    },
  },
  {
    no: "A14",
    title: "Funding period monitoring",
    module: "M06 M08",
    group: "Funding",
    keys: /expir|plan end|funding period/i,
    async run() {
      const list = await find("fundingPlans", { status: "Active" }, 200);
      const soon = list.filter((p) => {
        const e = date(p.end);
        return e && e.getTime() - Date.now() < 60 * DAY && e.getTime() > Date.now();
      });
      const missing = list.filter((p) => !p.end).length;
      return {
        answer: `${soon.length} active plan(s) end within 60 days. ${missing} have no recorded end date (no verified expiry).`,
        facts: soon.slice(0, 6).map((p) => `[${s(p.ref)}] ${s(p.participant)} · ends ${s(p.end)}`),
        records: [{ label: "Funding", href: "/care/funding" }],
        proposals: soon[0]
          ? [
              task(
                `Plan ending soon: ${s(soon[0].ref)}`,
                {
                  category: "Funding",
                  team: "Finance",
                  kind: "Funding Plan",
                  ref: s(soon[0].ref),
                  label: s(soon[0].participant),
                  href: "/care/funding",
                },
                `A14:${s(soon[0].ref)}`,
              ),
            ]
          : [],
        sources: ["SRC-EXPIRY"],
      };
    },
  },
  {
    no: "A15",
    title: "Service-agreement preparation",
    module: "M06 M22",
    group: "Funding",
    keys: /agreement (prep|draft)|prepare (an )?agreement/i,
    async run() {
      const drafts = await find("agreements", { status: "Draft" }, 8);
      return {
        answer: `${drafts.length} agreement(s) are in draft. Each uses the approved template and goes only to a verified signatory.`,
        facts: drafts.map(
          (a) =>
            `[${s(a.ref)}] v${num(a.version)} · signatory ${s((a.signatory as R | undefined)?.name) || "not set"} · verified ${(a.signatory as R | undefined)?.verified ? "yes" : "no"}`,
        ),
        records: [{ label: "Agreements", href: "/care/funding?tab=agreements" }],
        proposals: [],
        sources: ["SRC-AGREE"],
      };
    },
  },
  {
    no: "A16",
    title: "Agreement signature reminders",
    module: "M06 M08",
    group: "Funding",
    keys: /unsigned|signature|sign the agreement/i,
    async run() {
      const drafts = await find("agreements", { status: "Draft" }, 20);
      const sig = (x: R) => (x.signatory as R | undefined) ?? {};
      const verified = drafts.filter((x) => sig(x).verified);
      const unverified = drafts.filter((x) => !sig(x).verified);
      const a = verified[0];
      const b = unverified[0];
      const proposals: ProposalInput[] = [];
      if (a)
        proposals.push({
          tool: "SendApprovedMessage",
          title: `Signature reminder for ${s(a.ref)}`,
          record: { label: s(a.ref), href: "/care/funding?tab=agreements" },
          before: "Unsigned",
          after: "Reminder queued (simulated)",
          preconditions: [{ label: "Signatory verified", ok: true }],
          approver: "Admin",
          args: {
            recipient: s(sig(a).name),
            recipientType: "Signatory",
            subject: "Your Medisense service agreement",
            body: "A reminder that your service agreement is ready to sign.",
            label: s(a.ref),
            category: "Agreement",
            template: "TPL-SIGN-REMINDER",
          },
          idemKey: `A16:${s(a.ref)}:${new Date().toISOString().slice(0, 10)}`,
        });
      else if (b)
        proposals.push(
          task(
            `Verify the signatory for ${s(b.ref)}`,
            {
              category: "Funding",
              team: "Intake",
              kind: "Funding Plan",
              ref: s(b.ref),
              label: s(b.ref),
              href: "/care/funding?tab=agreements",
            },
            `A16v:${s(b.ref)}`,
            "Admin",
            "Signatory not verified; no reminder can be sent",
          ),
        );
      return {
        answer: drafts.length
          ? `${drafts.length} agreement(s) are unsigned. ${verified.length} have a verified signatory and can get an approved reminder; ${unverified.length} need the signatory verified first, so no reminder goes out yet.`
          : "No agreement is waiting for a signature.",
        facts: drafts.map(
          (x) =>
            `[${s(x.ref)}] signatory ${s(sig(x).name) || "not set"} · ${sig(x).verified ? "verified" : "not verified"} · drafted ${day(date(x.createdAt))}`,
        ),
        records: [{ label: "Agreements", href: "/care/funding?tab=agreements" }],
        proposals,
        sources: ["SRC-SIGN", "SRC-AGREE"],
        empty: !drafts.length,
      };
    },
  },
  {
    no: "A17",
    title: "Service authorisation readiness",
    module: "M05 M06",
    group: "Funding",
    keys: /ready|readiness|authoris/i,
    async run() {
      const cs = await find(
        "clients",
        { "needs.status": "assigned", discharged: { $in: [null] } },
        40,
      );
      const agreements = await find("agreements", { clientId: { $in: cs.map((c) => c._id) } }, 200);
      const rows = cs.slice(0, 8).map((c) => {
        const signed = agreements.some(
          (a) => (a.clientId as ObjectId).equals(c._id as ObjectId) && s(a.status) === "Signed",
        );
        return { c, signed, funding: Boolean(s(c.funding)) };
      });
      return {
        answer: `${rows.filter((r) => !r.signed).length} of ${rows.length} assigned patients have no signed agreement. Missing items block automatic progression; funding is never declared verified here.`,
        facts: rows.map(
          (r) =>
            `[${s(r.c.name)}] agreement ${r.signed ? "signed" : "not signed"} · funding ${r.funding ? `recorded (${s(r.c.funding)})` : "not recorded"}`,
        ),
        records: [{ label: "Patients", href: "/patients" }],
        proposals: [],
        sources: ["SRC-READY"],
      };
    },
  },
  {
    no: "A18",
    title: "Invoice draft generation",
    module: "M07 M14",
    group: "Finance",
    keys: /invoice draft|ready to (bill|invoice)|draft invoice/i,
    async run() {
      const ready = await find("billables", { status: "Ready" }, 20);
      const pending = await find("billables", { status: "Pending verification" }, 20);
      return {
        answer: `${ready.length} verified service(s) are ready to invoice; ${pending.length} still wait for verification and can't be billed.`,
        facts: ready
          .slice(0, 6)
          .map(
            (b) =>
              `[${s(b.ref)}] ${s(b.therapist)} · ${day(date(b.start))} · ${num(b.billableMinutes)} min · ${money(num(b.rate) * num(b.quantity || 1))}`,
          ),
        records: [{ label: "Billing queue", href: "/care/billing" }],
        proposals: ready[0]
          ? [
              task(
                `Prepare invoice draft for ${ready.length} ready service(s)`,
                {
                  category: "Billing",
                  team: "Finance",
                  kind: "Invoice",
                  ref: s(ready[0].ref),
                  label: "Billing queue",
                  href: "/care/billing",
                },
                `A18:${s(ready[0].ref)}`,
                "Finance",
              ),
            ]
          : [],
        sources: ["SRC-BILLING"],
      };
    },
  },
  {
    no: "A19",
    title: "Billing anomaly detection",
    module: "M07",
    group: "Finance",
    keys: /anomal|duplicate (charge|line|billing)|double.?bill/i,
    async run() {
      const list = await find(
        "billables",
        {
          $or: [
            { duplicateOf: { $ne: null } },
            { "flags.0": { $exists: true } },
            { status: "Held" },
          ],
        },
        10,
      );
      return {
        answer: list.length
          ? `${list.length} billing item(s) need Finance review (possible duplicates, flags or holds). Nothing is deleted automatically.`
          : "No billing anomalies found.",
        facts: list.map(
          (b) =>
            `[${s(b.ref)}] ${s(b.status)}${b.duplicateOf ? " · possible duplicate" : ""}${((b.flags as unknown[]) ?? []).length ? ` · ${((b.flags as unknown[]) ?? []).length} flag(s)` : ""}`,
        ),
        records: [{ label: "Billing queue", href: "/care/billing" }],
        proposals: list[0]
          ? [
              task(
                `Finance review: ${s(list[0].ref)}`,
                {
                  category: "Billing",
                  team: "Finance",
                  kind: "Invoice",
                  ref: s(list[0].ref),
                  label: s(list[0].ref),
                  href: "/care/billing",
                },
                `A19:${s(list[0].ref)}`,
                "Finance",
              ),
            ]
          : [],
        sources: ["SRC-BILLING"],
        empty: !list.length,
      };
    },
  },
  {
    no: "A20",
    title: "Payment status monitoring",
    module: "M07 M22",
    group: "Finance",
    keys: /payment status|outstanding|paid\b|ageing|aging/i,
    async run() {
      const list = await find(
        "invoices",
        { status: { $in: ["Issued", "Part-Paid", "Disputed"] } },
        40,
      );
      const due = (i: R) =>
        ((i.lines as R[]) ?? []).reduce((t, l) => t + num(l.amount), 0) -
        ((i.payments as R[]) ?? []).reduce((t, p) => t + num(p.amount), 0);
      return {
        answer: `${list.length} invoice(s) are outstanding (simulated ledger; not a live payment system).`,
        facts: list
          .slice(0, 6)
          .map(
            (i) =>
              `[${s(i.number)}] ${s(i.status)} · ${money(due(i))} · issued ${day(date(i.issuedAt))}`,
          ),
        records: [{ label: "Invoices", href: "/care/billing?tab=invoices" }],
        proposals: [],
        sources: ["SRC-DEBT"],
      };
    },
  },
  {
    no: "A21",
    title: "Payment reminder preparation",
    module: "M07 M08",
    group: "Finance",
    keys: /payment reminder|overdue invoice|invoices? (are |is )?overdue|remind .*pay/i,
    async run() {
      const list = (
        await find("invoices", { status: { $in: ["Issued", "Part-Paid"] } }, 40)
      ).filter((i) => {
        const d = date(i.dueDate);
        return d && d.getTime() < Date.now();
      });
      const i = list[0];
      return {
        answer: list.length
          ? `${list.length} undisputed invoice(s) are overdue. Disputed invoices are excluded from reminders.`
          : "No overdue undisputed invoices.",
        facts: list
          .slice(0, 6)
          .map((x) => `[${s(x.number)}] due ${day(date(x.dueDate))} · payer ${s(x.payer)}`),
        records: [{ label: "Invoices", href: "/care/billing?tab=invoices" }],
        proposals: i
          ? [
              {
                tool: "SendApprovedMessage",
                title: `Payment reminder for ${s(i.number)}`,
                record: { label: s(i.number), href: "/care/billing?tab=invoices" },
                before: "Overdue, no reminder",
                after: "Reminder queued (simulated)",
                preconditions: [{ label: "Invoice not disputed", ok: s(i.status) !== "Disputed" }],
                approver: "Finance",
                args: {
                  recipient: s(i.payer),
                  recipientType: "Payer",
                  subject: `Invoice ${s(i.number)} reminder`,
                  body: `A friendly reminder that invoice ${s(i.number)} is overdue.`,
                  label: s(i.number),
                  category: "Payment",
                  template: "TPL-PAY-REMINDER",
                },
                idemKey: `A21:${s(i.number)}`,
              },
            ]
          : [],
        sources: ["SRC-DEBT"],
        empty: !list.length,
      };
    },
  },
  {
    no: "A22",
    title: "Financial summary and reporting",
    module: "M02 M07 M09",
    group: "Finance",
    keys: /financial summary|pending this week|revenue|how much/i,
    async run() {
      const list = await find("invoices", {}, 500);
      const by = list.reduce<Record<string, number>>(
        (m, i) => ({ ...m, [s(i.status)]: (m[s(i.status)] ?? 0) + 1 }),
        {},
      );
      return {
        answer:
          "Invoice counts by status from the ledger. Category definitions come from the report definitions; amounts are never estimated.",
        facts: Object.entries(by).map(([k, v]) => `[Invoices] ${k}: ${v}`),
        records: [{ label: "Reports", href: "/care/reports" }],
        proposals: [],
        sources: ["SRC-REPORTS"],
      };
    },
  },
  {
    no: "A23",
    title: "Appointment and referral communications",
    module: "M08 M22",
    group: "Communication",
    keys: /notif|communicat|message (queue|status)|deliver/i,
    async run() {
      const list = await find(
        "opsMessages",
        { state: { $in: ["Queued", "Awaiting Approval", "Failed"] } },
        10,
        { createdAt: -1 },
      );
      return {
        answer: `${list.length} message(s) are queued, awaiting approval or failed. Messages go only to verified recipients with consent.`,
        facts: list.map(
          (m) => `[${s(m.ref)}] ${s(m.category)} → ${s(m.recipient)} · ${s(m.state)}`,
        ),
        records: [
          { label: "Notifications", href: "/care/operations?tab=automation&section=messages" },
        ],
        proposals: [],
        sources: ["SRC-COMMS"],
      };
    },
  },
  {
    no: "A25",
    title: "Automatic administrative task creation",
    module: "M08 M17",
    group: "Operations",
    keys: /automatic task|task creation|rules? (create|fire)/i,
    async run() {
      const list = await find("opsRuns", {}, 10, { at: -1 });
      return {
        answer:
          "Recent rule runs. Each event creates a task once (idempotency key); a repeated event doesn't duplicate it.",
        facts: list.map((r) => `[${s(r.ruleCode)}] ${day(date(r.at))} · ${s(r.outcome)}`),
        records: [
          { label: "Rules and run log", href: "/care/operations?tab=automation&section=log" },
        ],
        proposals: [],
        sources: ["SRC-OPS"],
      };
    },
  },
  {
    no: "A26",
    title: "Overdue follow-up identification",
    module: "M01 M08",
    group: "Operations",
    keys: /overdue follow|no response|not returned|waiting (for|on) (patient|documents)/i,
    async run() {
      const list = await find(
        "opsTasks",
        {
          status: { $in: ["Waiting for Patient", "Waiting for Staff"] },
          dueAt: { $lt: new Date() },
        },
        10,
        { dueAt: 1 },
      );
      return {
        answer: `${list.length} follow-up(s) are past due. No response is never treated as a refusal.`,
        facts: list.map(
          (t) => `[${s(t.ref)}] ${s(t.title)} · due ${day(date(t.dueAt))} · ${s(t.status)}`,
        ),
        records: [{ label: "Work queue", href: "/care/operations?tab=work" }],
        proposals: list[0]
          ? [
              task(
                `Follow up: ${s(list[0].title)}`.slice(0, 150),
                {
                  category: "Other",
                  team: "Operations",
                  kind: "Rule",
                  ref: s(list[0].ref),
                  label: s(list[0].ref),
                  href: "/care/operations?tab=work",
                },
                `A26:${s(list[0].ref)}`,
              ),
            ]
          : [],
        sources: ["SRC-FOLLOW"],
      };
    },
  },
  {
    no: "A27",
    title: "Document classification",
    module: "M03 M06 M22",
    group: "Operations",
    keys: /classify (doc|file)|unclassified|document type/i,
    async run() {
      const list = await find("documents", { kind: "Other" }, 10, { at: -1 });
      return {
        answer: `${list.length} document(s) are typed "Other". Suggested types come from the file name only; staff confirm the type, owner and access.`,
        facts: list.map(
          (d) =>
            `[${s(d.name)}] suggested: ${/plan|ndis/i.test(s(d.name)) ? "NDIS plan" : /letter|referral/i.test(s(d.name)) ? "Referral letter" : /agree|sign/i.test(s(d.name)) ? "Service agreement" : "Unclassified (needs a person)"}`,
        ),
        records: [],
        proposals: [],
        sources: ["SRC-DOCTYPES"],
      };
    },
  },
  {
    no: "A28",
    title: "Daily operations briefing",
    module: "M02 M08 M09",
    group: "Operations",
    keys: /brief|morning|today'?s (work|priorities)|what should i do/i,
    async run() {
      const b = await briefing();
      return {
        answer: "Today's priorities, in the order the operations SOP sets.",
        facts: b.text,
        records: b.items.map((i) => ({ label: i.label, href: i.href })),
        proposals: [],
        sources: ["SRC-OPS"],
      };
    },
  },
  {
    no: "A29",
    title: "Cross-module workflow orchestration",
    module: "M01 M05 M06 M08",
    group: "Operations",
    keys: /next step|orchestrat|after accept|what happens next/i,
    async run() {
      const r = (await find("referrals", { status: "Accepted" }, 1, { updatedAt: -1 }))[0];
      if (!r)
        return {
          answer: "No recently accepted referral.",
          facts: [],
          records: [],
          proposals: [],
          sources: ["SRC-READY"],
          empty: true,
        };
      const c = r.clientId ? (await find("clients", { _id: r.clientId }, 1))[0] : null;
      const steps = [
        `[${s(r.reference)}] accepted`,
        `[Patient record] ${c ? "created" : "not created"}`,
        `[Assignment] ${((c?.needs as R[]) ?? []).some((n) => n.status === "assigned") ? "assigned" : "waiting"}`,
      ];
      return {
        answer:
          "Next steps after acceptance. Clinical and funding gates are never skipped; a failed step shows a retry, never a silent skip.",
        facts: steps,
        records: [{ label: s(r.reference), href: refHref(r) }],
        proposals:
          c && !((c.needs as R[]) ?? []).some((n) => n.status === "assigned")
            ? [
                task(
                  `Start allocation for ${s(c.name)}`,
                  {
                    category: "Scheduling",
                    team: "Scheduling",
                    kind: "Referral",
                    ref: s(r.reference),
                    label: s(c.name),
                    href: refHref(r),
                  },
                  `A29:${s(r.reference)}`,
                  "Scheduler",
                ),
              ]
            : [],
        sources: ["SRC-READY"],
      };
    },
  },
  {
    no: "A30",
    title: "Exception escalation",
    module: "M04 M08",
    group: "Operations",
    keys: /exception|no (eligible|capacity)|escalat/i,
    async run() {
      const cs = await find(
        "clients",
        { "needs.status": "needs-therapist", discharged: { $in: [null] } },
        10,
        { createdAt: 1 },
      );
      const out: { c: R; need: R; n: number }[] = [];
      for (const c of cs.slice(0, 5)) {
        const need = ((c.needs as R[]) ?? []).find((n) => n.status === "needs-therapist");
        if (!need) continue;
        out.push({
          c,
          need,
          n: (await matchesFor(c._id as ObjectId, s(need.id))).filter((x) => x.eligible).length,
        });
      }
      const ex = out.filter((x) => x.n === 0);
      return {
        answer: ex.length
          ? `${ex.length} patient(s) have no eligible clinician: raise an exception owned by Operations. An ineligible clinician is never assigned.`
          : "Every waiting patient has at least one eligible clinician.",
        facts: out.map((x) => `[${s(x.c.name)}] ${s(x.need.support)} · ${x.n} eligible`),
        records: out.map((x) => ({
          label: s(x.c.name),
          href: `/care/${(x.c._id as ObjectId).toHexString()}`,
        })),
        proposals: ex[0]
          ? [
              task(
                `Capacity exception: ${s(ex[0].c.name)} (${s(ex[0].need.support)})`,
                {
                  category: "Scheduling",
                  team: "Operations",
                  kind: "Participant",
                  ref: s(ex[0].c.mrn),
                  label: s(ex[0].c.name),
                  href: `/care/${(ex[0].c._id as ObjectId).toHexString()}`,
                  priority: "High",
                },
                `A30:${(ex[0].c._id as ObjectId).toHexString()}`,
                "Manager",
              ),
            ]
          : [],
        sources: ["SRC-EXCEPT"],
      };
    },
  },
  {
    no: "A31",
    title: "Operational delay insights",
    module: "M02 M09",
    group: "Insight",
    keys: /delay|bottleneck|taking long|waiting longer/i,
    async run() {
      const list = await find("referrals", { status: "Accepted" }, 100);
      const waits = list
        .map((r) => {
          const acc = ((r.history as R[]) ?? []).find((h) =>
            /accept/i.test(s(h.action) + s(h.status)),
          );
          const a = date(acc?.at) ?? date(r.updatedAt);
          const c = date(r.createdAt);
          return a && c ? (a.getTime() - c.getTime()) / DAY : null;
        })
        .filter((x): x is number => x !== null);
      const avg = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
      const open = await find("referrals", { status: { $in: OPEN_REF } }, 200);
      const by = open.reduce<Record<string, number>>(
        (m, r) => ({ ...m, [s(r.status)]: (m[s(r.status)] ?? 0) + 1 }),
        {},
      );
      return {
        answer:
          waits.length < 5
            ? `Only ${waits.length} accepted referral(s) have timestamps: inconclusive.`
            : `Average ${avg.toFixed(1)} days from submission to acceptance across ${waits.length} referrals. The largest open stage is shown below; no cause is claimed.`,
        facts: Object.entries(by)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `[Open referrals] ${k}: ${v}`),
        records: [{ label: "Reports", href: "/care/reports" }],
        proposals: [],
        sources: ["SRC-REPORTS"],
      };
    },
  },
  {
    no: "A32",
    title: "Management question answering",
    module: "M02 M05 M09",
    group: "Insight",
    keys: /why|unbooked|how many|management/i,
    async run() {
      const cs = await find("clients", { discharged: { $in: [null] } }, 400);
      const needs = cs.flatMap((c) => ((c.needs as R[]) ?? []).map((n) => s(n.status)));
      const by = needs.reduce<Record<string, number>>(
        (m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }),
        {},
      );
      return {
        answer:
          "Service status across active patients. Each count links to its records; reasons are only those recorded, never guessed.",
        facts: Object.entries(by).map(([k, v]) => `[Services] ${k}: ${v}`),
        records: [{ label: "Patients", href: "/patients" }],
        proposals: [],
        sources: ["SRC-REPORTS", "SRC-SCHED"],
      };
    },
  },
];
features.push({
  no: "A24",
  title: "Admin conversational assistant",
  module: "M01 M02 M08 AI07 AI08",
  group: "Operations",
  keys: /^$/,
  async run(u, text) {
    const first = features.find((f) => f.no === "A28");
    if (!first) throw new Error("Briefing unavailable");
    return first.run(u, text);
  },
});
features.sort((a, b) => a.no.localeCompare(b.no));

export const adminFeatures: AgentFeature[] = features.map(({ no, title, module, group }) => ({
  no,
  title,
  module,
  group,
}));

/* ------------------------------------------------------------------ briefing */

async function briefing() {
  const d = await db();
  const now = new Date();
  const [refs, unsigned, overdue, ready, waitingTher, escalations] = await Promise.all([
    d.collection("referrals").countDocuments({ status: { $in: OPEN_REF } }),
    d.collection("agreements").countDocuments({ status: "Draft" }),
    d
      .collection("opsTasks")
      .countDocuments({ status: { $nin: ["Completed", "Cancelled"] }, dueAt: { $lt: now } }),
    d.collection("billables").countDocuments({ status: "Ready" }),
    d
      .collection("clients")
      .countDocuments({ "needs.status": "needs-therapist", discharged: { $in: [null] } }),
    d.collection("aiEnhance").countDocuments({
      kind: "concern",
      category: "Safety escalation",
      status: { $nin: ["Resolved", "Closed - No Action"] },
    }),
  ]);
  const items: AdminAgentDto["briefing"] = [
    {
      label: "Safety escalations open",
      value: escalations,
      href: "/care/ai-oversight",
      tone: escalations ? "over" : "neutral",
    },
    {
      label: "Patients waiting for a therapist",
      value: waitingTher,
      href: "/care/operations?tab=needs&type=matching",
      tone: waitingTher ? "watch" : "neutral",
    },
    {
      label: "Open referrals",
      value: refs,
      href: "/care/referrals",
      tone: refs ? "watch" : "neutral",
    },
    {
      label: "Unsigned agreements",
      value: unsigned,
      href: "/care/funding?tab=agreements",
      tone: unsigned ? "watch" : "neutral",
    },
    {
      label: "Overdue tasks",
      value: overdue,
      href: "/care/operations?tab=work",
      tone: overdue ? "over" : "neutral",
    },
    { label: "Services ready to invoice", value: ready, href: "/care/billing", tone: "neutral" },
  ];
  const text = items.filter((i) => i.value > 0).map((i, n) => `${n + 1}. [${i.label}] ${i.value}`);
  return { items, text: text.length ? text : ["Nothing needs attention right now."] };
}

/* ------------------------------------------------------------------ routing and answers */

function route(text: string, featureNo?: string) {
  if (featureNo) return features.find((f) => f.no === featureNo) ?? null;
  return features.find((f) => f.keys.test(text)) ?? null;
}

async function aiRoute(text: string) {
  try {
    const out = await generateJson("admin-agent-route", {
      system:
        "Pick the single best feature number for the operations question. Reply with its code exactly, or NONE if nothing fits.",
      user: `Features:\n${adminFeatures.map((f) => `${f.no}: ${f.title}`).join("\n")}\n\nQuestion: ${text}`,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["code"],
        properties: { code: { type: "string" } },
      } as never,
      schemaName: "route",
      maxTokens: 50,
    });
    const code = (JSON.parse(out.text) as { code: string }).code.trim();
    return features.find((f) => f.no === code) ?? null;
  } catch {
    return null;
  }
}

/** Explain the finding in plain words, citing only the facts and sources given. Fallback: the facts. */
export async function phrase(
  question: string,
  f: { answer: string; facts: string[] },
  sources: SourceDoc[],
  audience: string,
) {
  try {
    const out = await generateJson("agent-answer", {
      system: `You answer a ${audience} question in two to four plain sentences using ONLY the finding, facts and sources given. Keep every number and reference exactly. Never invent records, amounts, reasons or clinical judgements. If the facts are empty, say so.`,
      user: `Question: ${question}\nFinding: ${f.answer}\nFacts:\n${f.facts.join("\n") || "none"}\nSources:\n${sources.map((x) => `[${x.title} ${x.version}] ${x.snippet}`).join("\n") || "none"}`,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["answer"],
        properties: { answer: { type: "string" } },
      } as never,
      schemaName: "agent_answer",
      maxTokens: 500,
    });
    return { text: (JSON.parse(out.text) as { answer: string }).answer, ai: true };
  } catch {
    return { text: f.answer, ai: false };
  }
}

function assertAdmin(u: UserDoc) {
  if (u.role !== "admin")
    throw new UserFacingError("The operations agent is for admin staff.", 409);
}

export async function adminAgentView(u: UserDoc): Promise<AdminAgentDto> {
  assertAdmin(u);
  const b = await briefing();
  return {
    features: adminFeatures,
    briefing: b.items,
    briefingText: b.text,
    runs: await runHistory({}, 25),
  };
}

export async function adminAgentAction(u: UserDoc, a: AgentAction): Promise<unknown> {
  if (a.type === "confirm") return { run: await decide(u, a.runId, true) };
  if (a.type === "decline") return { run: await decide(u, a.runId, false, a.reason) };
  if (a.type === "retry") {
    const col = await runs();
    if (!ObjectId.isValid(a.runId)) throw new UserFacingError("Not found.", 404);
    await col.updateOne(
      { _id: new ObjectId(a.runId), status: "Failed" },
      { $set: { status: "Proposed", result: "" } },
    );
    return { run: await decide(u, a.runId, true) };
  }
  assertAdmin(u);
  const feature = route(a.text, a.feature) ?? (await aiRoute(a.text));
  if (!feature) {
    const reply: AgentReply = {
      feature: null,
      outcome: "Need more information",
      answer:
        "I couldn't match that to an operations feature. Try asking about referrals, scheduling, funding, billing or today's priorities.",
      facts: [],
      records: [],
      sources: [],
      proposals: [],
      ai: false,
    };
    return { reply };
  }
  let found: Finding;
  try {
    found = await feature.run(u, a.text);
  } catch (e) {
    const reply: AgentReply = {
      feature: { no: feature.no, title: feature.title },
      outcome: "Failed",
      answer: `The lookup failed: ${e instanceof Error ? e.message : "unknown error"}. Nothing was changed. Try again or open the module directly.`,
      facts: [],
      records: [],
      sources: [],
      proposals: [],
      ai: false,
    };
    return { reply };
  }
  const sources = sourcesFor(found.sources, "Admin");
  const phrased = await phrase(
    a.text || feature.title,
    found,
    sources,
    "Medisense operations staff",
  );
  const proposals: Proposal[] = [];
  for (const p of found.proposals) proposals.push(await propose(u, feature.no, p));
  const reply: AgentReply = {
    feature: { no: feature.no, title: feature.title },
    outcome: found.empty && !found.facts.length ? "No authorised source" : "Answered",
    answer: phrased.text,
    facts: found.facts,
    records: found.records,
    sources,
    proposals,
    ai: phrased.ai,
  };
  return { reply };
}
