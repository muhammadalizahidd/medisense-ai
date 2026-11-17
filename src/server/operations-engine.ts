import "server-only";
import { ObjectId } from "mongodb";
import {
  canMoveTask,
  isClosed,
  isPaused,
  slaHours,
  type RunDto,
  type RunMode,
} from "@/lib/live/operations";
import { needsRiskReview } from "@/lib/live/referral";
import { builtInRules } from "./operations-catalogue";
import { collections } from "./db";
import { isAway } from "./matching";
import {
  addBusinessHours,
  brisbaneKey,
  inQuietHours,
  insertTask,
  logRun,
  opsChanged,
  opsSettings,
  queueMessage,
  requestApproval,
  ruleUpdateTask,
} from "./operations";
import type {
  AppointmentDoc,
  ClientDoc,
  OpsRuleDoc,
  OpsTaskDoc,
  ReferralDoc,
  TherapistDoc,
  UserDoc,
} from "./models";

/* ------------------------------------------------------------------ rules in the database */

export async function ensureRules() {
  const { opsRules } = await collections();
  const have = new Set(
    (await opsRules.find({}, { projection: { code: 1 } }).toArray()).map((r) => r.code),
  );
  const now = new Date();
  for (const r of builtInRules) {
    if (have.has(r.code)) continue;
    const { code, check, proposedAction, defaultOwnerLabel, status, ...input } = r;
    await opsRules
      .insertOne({
        _id: new ObjectId(),
        ...input,
        code,
        check,
        proposedAction,
        defaultOwnerLabel,
        status,
        version: 1,
        versions: [
          {
            version: 1,
            by: "Medisense setup",
            reason: input.changeReason,
            at: now,
            snapshot: input,
          },
        ],
        builtIn: true,
        createdAt: now,
        updatedAt: now,
      })
      .catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ context */

const FINAL = ["Declined", "Withdrawn", "Closed", "Accepted"];
const day = 86_400_000;

async function loadContext() {
  const db = await collections();
  const now = new Date();
  const [
    referrals,
    clients,
    appointments,
    telehealth,
    assessments,
    plans,
    fundingPlans,
    billables,
    invoices,
    users,
    therapists,
    tasks,
    settings,
  ] = await Promise.all([
    db.referrals.find({ status: { $nin: ["Declined", "Withdrawn", "Closed"] } }).toArray(),
    db.clients.find({ discharged: { $in: [null] } }).toArray(),
    db.appointments
      .find({
        start: {
          $gte: new Date(now.getTime() - 30 * day),
          $lte: new Date(now.getTime() + 4 * day),
        },
      })
      .toArray(),
    db.telehealth.find({}).toArray(),
    db.assessments
      .find({
        status: {
          $in: ["Draft", "In Progress", "Signed", "Amended", "Cancelled", "Awaiting Review"],
        },
      })
      .toArray(),
    db.plans.find({ status: "Active" }).toArray(),
    db.fundingPlans.find({ status: "Active" }).toArray(),
    db.billables.find({ status: { $in: ["Held", "Pending verification"] } }).toArray(),
    db.invoices.find({ status: "Draft" }).toArray(),
    db.users.find({ role: { $in: ["admin", "therapist"] }, disabled: { $ne: true } }).toArray(),
    db.therapists.find({}).toArray(),
    db.opsTasks.find({ idemKey: { $type: "string" } }).toArray(),
    opsSettings(),
  ]);
  const messageKeys = new Set(
    (await db.opsMessages.find({}, { projection: { key: 1 } }).toArray()).map((m) => m.key),
  );
  const userOfTherapist = new Map<string, UserDoc>();
  for (const u of users) if (u.therapistId) userOfTherapist.set(u.therapistId.toHexString(), u);
  const clientById = new Map(clients.map((c) => [c._id.toHexString(), c]));
  const therapistById = new Map(therapists.map((t) => [t._id.toHexString(), t]));
  const taskByKey = new Map(tasks.map((t) => [t.idemKey ?? "", t]));
  const clinicalLead =
    users.find(
      (u) =>
        u.role === "admin" &&
        u.staffRoles?.includes("Clinical Lead") &&
        !u.staffRoles.includes("Super Admin"),
    ) ?? users.find((u) => u.role === "admin" && u.staffRoles?.includes("Clinical Lead"));
  return {
    now,
    messageKeys,
    referrals,
    clients,
    appointments,
    telehealth,
    assessments,
    plans,
    fundingPlans,
    billables,
    invoices,
    users,
    userOfTherapist,
    clientById,
    therapistById,
    taskByKey,
    clinicalLead,
    settings,
  };
}
type Ctx = Awaited<ReturnType<typeof loadContext>>;

/** One thing a rule would do. `run` does it; a simulation lists it without running (OP-029). */
type Planned = {
  key: string;
  entity: string;
  input: string;
  actions: string[];
  run: (
    rule: OpsRuleDoc,
    mode: RunMode,
  ) => Promise<{ outcome: RunDto["outcome"]; detail: string } | null>;
};

const nameOf = (r: ReferralDoc) => `${r.data.participant.firstName} ${r.data.participant.lastName}`;
const refHref = (r: ReferralDoc) => `/care/referrals/${r._id.toHexString()}`;
const aptLabel = (a: AppointmentDoc) =>
  a.ref ?? `APT-${a._id.toHexString().slice(-6).toUpperCase()}`;
const fmtWhen = (d: Date) =>
  new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Brisbane",
  }).format(d);
const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Australia/Brisbane",
  }).format(d);
const fmtTime = (d: Date) =>
  new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Brisbane",
  }).format(d);

function ruleFields(rule: OpsRuleDoc, mode: RunMode) {
  return {
    source: "Rule" as const,
    ruleCode: rule.code,
    ruleVersion: rule.version,
    suggestion: mode === "Suggest Only",
    restrictedNote: null,
    recordingHref: null,
    scenario: null,
    urgentReason: "",
    appointmentId: null,
    referralId: null,
    clientId: null,
    service: null,
    discipline: null,
    locationType: null,
    participant: null,
  };
}

async function created(task: OpsTaskDoc | null, isNew: boolean) {
  return isNew
    ? { outcome: "Task created" as const, detail: `${task?.ref ?? ""} ${task?.title ?? ""}`.trim() }
    : {
        outcome: "Duplicate skipped" as const,
        detail: `Already handled by ${task?.ref ?? "an existing task"}`,
      };
}

/* ------------------------------------------------------------------ the sixteen rules */

function aut01(ctx: Ctx): Planned[] {
  const out: Planned[] = [];
  for (const r of ctx.referrals) {
    if (
      !["Submitted", "Under Admin Review", "Needs Information"].includes(r.status) ||
      !r.gaps.length
    )
      continue;
    const key = `AUT-01:ReferralSubmitted:${r._id.toHexString()}`;
    const openRequest = r.infoRequests.find((i) => !i.answer);
    const existing = ctx.taskByKey.get(key);
    if (!existing) {
      out.push({
        key,
        entity: `Referral ${r.reference}`,
        input: `${r.gaps.length} missing item(s): ${r.gaps.map((g) => g.label).join("; ")}`,
        actions: [
          "Create intake task with one checklist item per missing field",
          openRequest ? "Set Waiting for Patient" : "Leave in the Intake queue",
        ],
        run: async (rule, mode) => {
          const { task, created: isNew } = await insertTask("Automation", {
            ...ruleFields(rule, mode),
            title: `Resolve ${r.gaps.length} missing item${r.gaps.length === 1 ? "" : "s"} for ${r.reference}`,
            category: "Referral",
            status: openRequest ? "Waiting for Patient" : r.owner ? "Assigned" : "New",
            priority: "Normal",
            team: "Intake",
            assigneeId: r.owner?.id ?? null,
            assigneeName: r.owner?.name ?? null,
            related: { kind: "Referral", ref: r.reference, label: nameOf(r), href: refHref(r) },
            referralId: r._id,
            clientId: r.clientId,
            participant: nameOf(r),
            service: r.data.supports[0]?.support ?? null,
            locationType: r.data.location.type,
            dueAt: addBusinessHours(r.createdAt, slaHours.Standard, ctx.settings),
            sla: "Standard",
            visibility: "Internal",
            idemKey: key,
            checklist: [
              ...r.gaps.map((g) => ({ label: `${g.label} (field: ${g.field})` })),
              { label: "Confirm the details with the authorised contact" },
            ],
          });
          return created(task, isNew);
        },
      });
      continue;
    }
    if (isClosed(existing.status)) continue;
    // A secure response resumes the queue without a second referral (OP-007).
    const answered = r.infoRequests.filter(
      (i) => i.answer && i.answeredAt && i.answeredAt > existing.updatedAt,
    );
    if (existing.status === "Waiting for Patient" && answered.length) {
      out.push({
        key: `${key}:resume:${answered.length}`,
        entity: `Referral ${r.reference}`,
        input: "Secure response received from the authorised contact",
        actions: ["Waiting for Patient → In Progress"],
        run: async () => {
          await ruleUpdateTask(
            existing._id,
            { status: existing.assigneeId ? "In Progress" : "Assigned" },
            "Secure response received: resumed (Waiting for Patient → back in the queue)",
          );
          return {
            outcome: "Updated existing",
            detail: `${existing.ref} resumed after the secure response`,
          };
        },
      });
    } else if (
      openRequest &&
      existing.status !== "Waiting for Patient" &&
      !isPaused(existing.status) &&
      !answered.length &&
      openRequest.at > existing.createdAt
    ) {
      // A New task has no owner yet: the person who sent the request takes it while it waits.
      const requester = ctx.users.find(
        (x) => x.name === openRequest.requestedBy && x.role === "admin",
      );
      const viaAssign = existing.status === "New";
      if (viaAssign && !requester) continue;
      if (!viaAssign && !canMoveTask(existing.status, "Waiting for Patient")) continue;
      out.push({
        key: `${key}:waiting:${openRequest.id}`,
        entity: `Referral ${r.reference}`,
        input: `Information requested by ${openRequest.requestedBy}`,
        actions: [
          viaAssign ? `Assign to ${openRequest.requestedBy}` : "",
          `${existing.status} → Waiting for Patient`,
        ].filter(Boolean),
        run: async () => {
          await ruleUpdateTask(
            existing._id,
            {
              status: "Waiting for Patient",
              ...(viaAssign && requester
                ? { assigneeId: requester._id, assigneeName: requester.name }
                : {}),
            },
            `${viaAssign ? `Assigned to ${openRequest.requestedBy}, who sent the secure request. ` : ""}Waiting for the patient's secure response`,
          );
          return {
            outcome: "Updated existing",
            detail: `${existing.ref} is waiting for the patient`,
          };
        },
      });
    }
    const resolved = existing.checklist.filter(
      (c) =>
        !c.done &&
        r.gaps.length &&
        !c.label.startsWith("Confirm") &&
        !r.gaps.some((g) => c.label.includes(`(field: ${g.field})`)),
    );
    if (resolved.length) {
      out.push({
        key: `${key}:resolved:${resolved.map((c) => c.id).join(",")}`,
        entity: `Referral ${r.reference}`,
        input: "Completeness check re-run: some items are now present",
        actions: resolved.map((c) => `Tick: ${c.label}`),
        run: async () => {
          await ruleUpdateTask(
            existing._id,
            {
              checklist: existing.checklist.map((c) =>
                resolved.includes(c)
                  ? { ...c, done: true, by: "Completeness check", at: new Date() }
                  : c,
              ),
            },
            `Completeness check ticked ${resolved.length} item(s) now present`,
          );
          return {
            outcome: "Updated existing",
            detail: `${existing.ref}: ${resolved.length} item(s) now present`,
          };
        },
      });
    }
  }
  return out;
}

function aut02(ctx: Ctx): Planned[] {
  const closing = ctx.referrals.flatMap((r): Planned[] => {
    const t = ctx.taskByKey.get(`AUT-02:ReferralUpdated:${r._id.toHexString()}`);
    if (!t || isClosed(t.status) || !r.duplicateDecision) return [];
    const d = r.duplicateDecision;
    return [
      {
        key: `${t.idemKey}:decided`,
        entity: `Referral ${r.reference}`,
        input: `Duplicate decision recorded by ${d.byName}`,
        actions: ["Close the duplicate review with the person's decision"],
        run: async () => {
          await ruleUpdateTask(
            t._id,
            {
              status: "Completed",
              checklist: t.checklist.map((c) => ({ ...c, done: true, by: d.byName, at: d.at })),
              resolution: {
                code: "Completed",
                note: d.clientId
                  ? "Linked to the existing patient by a person."
                  : "Confirmed as a new patient by a person.",
                by: d.byName,
                at: d.at,
              },
            },
            `Closed: ${d.byName} recorded the duplicate decision`,
          );
          return { outcome: "Closed", detail: `${t.ref} closed after ${d.byName}'s decision` };
        },
      },
    ];
  });
  return closing.concat(
    ctx.referrals
      .filter((r) => r.duplicates.length && !r.duplicateDecision && !FINAL.includes(r.status))
      .flatMap((r): Planned[] => {
        const key = `AUT-02:ReferralUpdated:${r._id.toHexString()}`;
        if (ctx.taskByKey.has(key)) return [];
        return [
          {
            key,
            entity: `Referral ${r.reference}`,
            input: `${r.duplicates.length} candidate(s): ${r.duplicates.map((d) => `${d.name} (${d.why})`).join("; ")}`,
            actions: ["Create intake task", "Show candidates; no automatic merge"],
            run: async (rule, mode) => {
              const { task, created: isNew } = await insertTask("Automation", {
                ...ruleFields(rule, mode),
                title: `Review possible duplicate for ${r.reference}`,
                category: "Referral",
                status: "New",
                priority: "Normal",
                team: "Intake",
                assigneeId: r.owner?.id ?? null,
                assigneeName: r.owner?.name ?? null,
                related: { kind: "Referral", ref: r.reference, label: nameOf(r), href: refHref(r) },
                referralId: r._id,
                participant: nameOf(r),
                dueAt: addBusinessHours(r.createdAt, slaHours.Standard, ctx.settings),
                sla: "Standard",
                visibility: "Internal",
                idemKey: key,
                note: `Candidates: ${r.duplicates.map((d) => `${d.kind} ${d.name}: ${d.why}`).join(". ")}. Records are never merged automatically: a person decides in the referral.`,
                checklist: [
                  { label: "Compare each candidate's identity and contact details" },
                  { label: "Record the decision in the referral: same person or a new patient" },
                ],
              });
              return created(task, isNew);
            },
          },
        ];
      }),
  );
}

function aut03(ctx: Ctx): Planned[] {
  const out: Planned[] = [];
  for (const r of ctx.referrals) {
    const key = `AUT-03:ReferralSubmitted:${r._id.toHexString()}`;
    const existing = ctx.taskByKey.get(key);
    if (existing && !isClosed(existing.status) && r.triage) {
      out.push({
        key: `${key}:triaged`,
        entity: `Referral ${r.reference}`,
        input: `Clinical triage recorded by ${r.triage.byName}`,
        actions: ["Close the review task with the Clinical Lead's decision (no AI clearance)"],
        run: async () => {
          await ruleUpdateTask(
            existing._id,
            {
              status: "Completed",
              checklist: existing.checklist.map((c) => ({
                ...c,
                done: true,
                by: c.by ?? r.triage?.byName ?? null,
                at: c.at ?? r.triage?.at ?? null,
              })),
              resolution: {
                code: "Completed",
                note: `Clinical decision ${r.triage?.decision} recorded by ${r.triage?.byName}`,
                by: r.triage?.byName ?? "Clinical Lead",
                at: r.triage?.at ?? new Date(),
              },
            },
            `Closed: ${r.triage?.byName} recorded the clinical triage decision (${r.triage?.decision})`,
          );
          return {
            outcome: "Closed",
            detail: `${existing.ref} closed after the Clinical Lead's decision`,
          };
        },
      });
      continue;
    }
    if (existing || r.triage || FINAL.includes(r.status) || !needsRiskReview(r.data)) continue;
    const lead = ctx.clinicalLead;
    out.push({
      key,
      entity: `Referral ${r.reference}`,
      input: `Known risk: ${r.data.clinical.knownRisk}; behaviours of concern: ${r.data.clinical.behaviours}`,
      actions: [
        "Create a Clinical Restricted review task for the Clinical Lead",
        "Request a clinical-risk decision",
        "No automatic acceptance",
      ],
      run: async (rule, mode) => {
        const narrative = [
          r.data.clinical.riskDetails && `Risk: ${r.data.clinical.riskDetails}`,
          r.data.clinical.behavioursDetails && `Behaviours: ${r.data.clinical.behavioursDetails}`,
        ]
          .filter(Boolean)
          .join(" ");
        const { task, created: isNew } = await insertTask("Automation", {
          ...ruleFields(rule, mode),
          suggestion: false,
          title: `Clinical review before matching: ${r.reference}`,
          category: "Clinical Review",
          status: lead ? "Assigned" : "New",
          priority: r.data.clinical.knownRisk === "Yes" ? "High" : "Normal",
          team: "Clinical",
          assigneeId: lead?._id ?? null,
          assigneeName: lead?.name ?? null,
          related: { kind: "Referral", ref: r.reference, label: nameOf(r), href: refHref(r) },
          referralId: r._id,
          participant: nameOf(r),
          service: r.data.supports[0]?.support ?? null,
          locationType: r.data.location.type,
          dueAt: addBusinessHours(r.createdAt, slaHours["Clinical Escalation"], ctx.settings),
          sla: "Clinical Escalation",
          visibility: "Clinical Restricted",
          idemKey: key,
          restrictedNote:
            narrative ||
            "The referral answered Unknown: the Clinical Lead confirms with the referrer.",
          checklist: [
            { label: "Review the disclosed information" },
            { label: "Record suitability and any visit precautions" },
            { label: "Record the decision and rationale in clinical triage" },
          ],
        });
        if (task && isNew && rule.approval !== "Never") {
          await requestApproval({
            key: `AUT-03:${r._id.toHexString()}`,
            workflow: "Clinical-risk referral",
            title: `Clinical-risk referral ${r.reference}`,
            reason:
              "The referral reports a risk or behaviours of concern (Yes or Unknown). Automation can't accept or clear it.",
            initiator: `Automation ${rule.code}`,
            related: { label: `Referral ${r.reference}`, href: refHref(r) },
            taskId: task._id,
            ruleId: null,
            restricted: true,
            slaHours: slaHours["Clinical Escalation"],
          });
        }
        return created(task, isNew);
      },
    });
  }
  return out;
}

function aut04(ctx: Ctx): Planned[] {
  const today = brisbaneKey(ctx.now);
  const limit = brisbaneKey(new Date(ctx.now.getTime() + ctx.settings.planWarningDays * day));
  return ctx.fundingPlans
    .filter((p) => p.end && p.end >= today && p.end <= limit)
    .flatMap((p): Planned[] => {
      const key = `AUT-04:FundingDue:${p._id.toHexString()}:${p.end}`;
      if (ctx.taskByKey.has(key)) return [];
      const days = Math.round((Date.parse(p.end) - Date.parse(today)) / day);
      return [
        {
          key,
          entity: `Funding plan ${p.ref}`,
          input: `Plan ends ${p.end} (${days} day${days === 1 ? "" : "s"})`,
          actions: [
            "Create a Finance verification task",
            "Check booked services after the end date",
          ],
          run: async (rule, mode) => {
            const after = p.clientId
              ? ctx.appointments.filter(
                  (a) =>
                    a.clientId.equals(p.clientId ?? new ObjectId()) &&
                    a.holdsSlot &&
                    brisbaneKey(a.start) > p.end,
                ).length
              : 0;
            const { task, created: isNew } = await insertTask("Automation", {
              ...ruleFields(rule, mode),
              title: `Verify funding: ${p.participant}'s plan ends in ${days} day${days === 1 ? "" : "s"}`,
              category: "Funding",
              status: "New",
              priority: days <= 7 ? "High" : "Normal",
              team: "Finance",
              assigneeId: null,
              assigneeName: null,
              related: {
                kind: "Funding Plan",
                ref: p.ref,
                label: p.participant,
                href: p.clientId ? `/care/funding/${p.clientId.toHexString()}` : null,
              },
              clientId: p.clientId,
              participant: p.participant,
              dueAt: addBusinessHours(
                ctx.now,
                days <= 7 ? slaHours.Expedited : slaHours.Standard,
                ctx.settings,
              ),
              sla: days <= 7 ? "Expedited" : "Standard",
              visibility: "Team Only",
              idemKey: key,
              note: after
                ? `${after} booked visit(s) fall after the plan end date.`
                : "No booked visits fall after the end date yet.",
              checklist: [
                { label: "Confirm the new plan or an extension with the payer" },
                { label: "Review services booked after the end date" },
              ],
            });
            return created(task, isNew);
          },
        },
      ];
    });
}

function aut05(ctx: Ctx): Planned[] {
  const out: Planned[] = [];
  for (const r of ctx.referrals) {
    if (FINAL.includes(r.status)) continue;
    const docGap = r.gaps.find((g) => g.field.startsWith("document:"));
    if (!docGap) continue;
    const task = ctx.taskByKey.get(`AUT-01:ReferralSubmitted:${r._id.toHexString()}`);
    const first = `AUT-05:DocumentRequired:${r._id.toHexString()}:1`;
    const second = `AUT-05:DocumentRequired:${r._id.toHexString()}:2`;
    const make = (key: string, nth: string): Planned => ({
      key,
      entity: `Referral ${r.reference}`,
      input: `${docGap.label} is missing`,
      actions: [
        `${nth} secure document request to the authorised contact (template TPL-DOC-REQUIRED)`,
      ],
      run: async (rule, mode) => {
        const m = await queueMessage({
          key,
          template: "TPL-DOC-REQUIRED",
          recipientType: "Patient",
          clientId: null,
          referralId: r._id,
          vars: { referral_number: r.reference },
          related: { label: `Referral ${r.reference}`, href: refHref(r) },
          taskId: task?._id ?? null,
          by: rule.code,
          mode,
        });
        return {
          outcome: m.state === "Suppressed" ? "Suppressed" : "Message queued",
          detail: `${m.ref} ${m.state}${m.reason ? `: ${m.reason}` : ""}`,
        };
      },
    });
    if (!ctx.messageKeys.has(first)) out.push(make(first, "First"));
    const sentFirst = r.infoRequests[0]?.at ?? r.createdAt;
    if (
      ctx.messageKeys.has(first) &&
      !ctx.messageKeys.has(second) &&
      !r.infoRequests.some((i) => i.answer) &&
      ctx.now.getTime() - sentFirst.getTime() > 2 * day
    ) {
      out.push(make(second, "Second"));
    }
  }
  return out;
}

function aut06(ctx: Ctx): Planned[] {
  const out: Planned[] = [];
  for (const c of ctx.clients) {
    for (const n of c.needs) {
      const key = `AUT-06:CaseReadyToAssign:${c._id.toHexString()}:${n.id}`;
      const existing = ctx.taskByKey.get(key);
      if (n.status !== "needs-therapist") {
        if (existing && !isClosed(existing.status)) {
          out.push({
            key: `${key}:filled`,
            entity: `${c.name} · ${n.support}`,
            input: `Service request is now ${n.status}`,
            actions: ["Close the suggestion task"],
            run: async () => {
              await ruleUpdateTask(
                existing._id,
                {
                  status: "Completed",
                  suggestion: false,
                  resolution: {
                    code: "Completed",
                    note: "A therapist was requested through Scheduling.",
                    by: "Automation",
                    at: new Date(),
                  },
                },
                "Closed: a therapist was requested for this service",
              );
              return { outcome: "Closed", detail: `${existing.ref} closed: therapist requested` };
            },
          });
        }
        continue;
      }
      if (existing) continue;
      out.push({
        key,
        entity: `${c.name} · ${n.support}`,
        input: `${n.discipline}, ${c.region}, ${n.location ?? "Home"}`,
        actions: [
          "Rank eligible clinicians with reasons",
          "Create a Scheduling task; nothing is assigned until a person approves",
        ],
        run: async (rule, mode) => {
          const { task, created: isNew } = await insertTask("Automation", {
            ...ruleFields(rule, mode),
            title: `Choose a therapist: ${n.support} for ${c.name}`,
            category: "Scheduling",
            status: "New",
            priority: "Normal",
            team: "Scheduling",
            assigneeId: null,
            assigneeName: null,
            related: {
              kind: "Service Request",
              ref: c.mrn ?? c.name,
              label: `${c.name} · ${n.support}`,
              href: `/care/${c._id.toHexString()}`,
            },
            clientId: c._id,
            participant: c.name,
            service: n.support,
            discipline: n.discipline,
            locationType: n.location ?? "Home",
            dueAt: addBusinessHours(
              c.createdAt > ctx.now ? ctx.now : c.createdAt,
              slaHours.Standard * 2,
              ctx.settings,
            ),
            sla: "Standard",
            visibility: "Internal",
            idemKey: key,
            checklist: [
              { label: "Review the ranked shortlist and its reasons" },
              { label: "Confirm the choice (nothing is assigned until you do)" },
            ],
          });
          return created(task, isNew);
        },
      });
    }
  }
  return out;
}

function reminders(ctx: Ctx, code: "AUT-08" | "AUT-17"): Planned[] {
  const hours = code === "AUT-08" ? 48 : 24;
  return ctx.appointments
    .filter(
      (a) =>
        a.status === "booked" &&
        a.start > ctx.now &&
        a.start.getTime() - ctx.now.getTime() <= hours * 3_600_000,
    )
    .filter(
      (a) => !ctx.messageKeys.has(`${code}:AppointmentCreated:${a._id.toHexString()}:${hours}h`),
    )
    .map((a): Planned => {
      const key = `${code}:AppointmentCreated:${a._id.toHexString()}:${hours}h`;
      const c = ctx.clientById.get(a.clientId.toHexString());
      return {
        key,
        entity: `Appointment ${aptLabel(a)}`,
        input: `${c?.name ?? "Patient"}, ${fmtWhen(a.start)}, ${a.modality ?? "In person"}`,
        actions: [
          `Send the approved ${code === "AUT-08" ? "SMS" : "email"} reminder (${hours} hours before), within quiet hours and the daily cap`,
        ],
        run: async (rule, mode) => {
          const m = await queueMessage({
            key,
            template: rule.messageTemplate || "TPL-BOOKING",
            recipientType: "Patient",
            clientId: a.clientId,
            referralId: null,
            vars: {
              appointment_date: fmtDate(a.start),
              appointment_time: fmtTime(a.start),
              location_type:
                a.modality === "Telehealth" ? "video" : (a.site?.location ?? "home visit"),
            },
            related: {
              label: `Appointment ${aptLabel(a)}`,
              href: `/care/schedule?visit=${a._id.toHexString()}`,
            },
            taskId: null,
            by: rule.code,
            mode,
          });
          return {
            outcome: m.state === "Suppressed" ? "Suppressed" : "Message queued",
            detail: `${m.ref} ${m.state}${m.reason ? `: ${m.reason}` : ""}`,
          };
        },
      };
    });
}

function therapistTaskBase(ctx: Ctx, a: { therapistId: ObjectId }) {
  const u = ctx.userOfTherapist.get(a.therapistId.toHexString());
  return { assigneeId: u?._id ?? null, assigneeName: u?.name ?? null };
}

function aut09(ctx: Ctx): Planned[] {
  const out: Planned[] = [];
  for (const a of ctx.appointments) {
    const key = `AUT-09:AppointmentCreated:${a._id.toHexString()}`;
    const existing = ctx.taskByKey.get(key);
    if (
      existing &&
      !isClosed(existing.status) &&
      ["cancelled", "late-cancelled", "rescheduled"].includes(a.status)
    ) {
      // A cancellation keeps the task's history and closes it with the reason (OP-051).
      out.push({
        key: `${key}:${a.status}`,
        entity: `Appointment ${aptLabel(a)}`,
        input: `Appointment ${a.status}`,
        actions: ["Cancel the preparation task, keeping its history"],
        run: async () => {
          await ruleUpdateTask(
            existing._id,
            {
              status: canMoveTask(existing.status, "Cancelled")
                ? "Cancelled"
                : existing.status === "In Progress"
                  ? "On Hold"
                  : "Cancelled",
              resolution: {
                code: "Withdrawn",
                note: `Appointment ${a.status}; a new preparation task follows any rebooking.`,
                by: "Automation",
                at: new Date(),
              },
            },
            `Appointment ${a.status}: preparation task closed, history kept`,
          );
          return { outcome: "Closed", detail: `${existing.ref} closed: appointment ${a.status}` };
        },
      });
      continue;
    }
    if (existing || a.status !== "booked" || (a.modality ?? "In person") !== "In person") continue;
    if (a.start < ctx.now || a.start.getTime() - ctx.now.getTime() > 3 * day) continue;
    const c = ctx.clientById.get(a.clientId.toHexString());
    const where = a.site?.location ?? c?.needs.find((n) => n.id === a.needId)?.location ?? "Home";
    out.push({
      key,
      entity: `Appointment ${aptLabel(a)}`,
      input: `${where} visit, ${fmtWhen(a.start)}${c?.precautions ? ", precaution on file" : ""}`,
      actions: ["Create the therapist's visit-preparation checklist"],
      run: async (rule, mode) => {
        const { task, created: isNew } = await insertTask("Automation", {
          ...ruleFields(rule, mode),
          suggestion: false,
          title: `Prepare for the ${where.toLowerCase()} visit: ${c?.name ?? "patient"}, ${fmtWhen(a.start)}`,
          category: "Visit",
          status: "Assigned",
          priority: c?.precautions ? "High" : "Normal",
          team: "Clinical",
          ...therapistTaskBase(ctx, a),
          related: {
            kind: "Appointment",
            ref: aptLabel(a),
            label: c?.name ?? "Appointment",
            href: `/care/schedule?visit=${a._id.toHexString()}`,
          },
          clientId: a.clientId,
          appointmentId: a._id,
          participant: c?.name ?? null,
          discipline: a.discipline,
          locationType: where,
          dueAt: new Date(a.start.getTime() - 2 * 3_600_000),
          sla: "Standard",
          visibility: "Team Only",
          idemKey: key,
          checklist: [
            {
              label:
                where === "School"
                  ? "Confirm school permission, the room and the school contact"
                  : "Confirm access and parking",
            },
            { label: "Check pets and who will be present" },
            ...(c?.precautions ? [{ label: "Read the visit precaution before leaving" }] : []),
          ],
        });
        return created(task, isNew);
      },
    });
  }
  return out;
}

function aut10(ctx: Ctx): Planned[] {
  const out: Planned[] = [];
  for (const a of ctx.appointments) {
    if ((a.modality ?? "In person") !== "Telehealth") continue;
    const key = `AUT-10:AppointmentCreated:${a._id.toHexString()}`;
    const t = ctx.telehealth.find((x) => x.appointmentId.equals(a._id));
    const consent = Boolean(t?.consents.video?.given || a.site?.consentPlan);
    const device = Boolean(
      (t?.device && t.device.camera && t.device.microphone) || a.site?.deviceCheck,
    );
    const existing = ctx.taskByKey.get(key);
    if (existing && !isClosed(existing.status)) {
      if (consent && device) {
        out.push({
          key: `${key}:ready`,
          entity: `Appointment ${aptLabel(a)}`,
          input: "Video consent and device check complete",
          actions: ["Tick both checks and complete the readiness task"],
          run: async () => {
            await ruleUpdateTask(
              existing._id,
              {
                status: "Completed",
                checklist: existing.checklist.map((c) => ({
                  ...c,
                  done: true,
                  by: c.by ?? "Telehealth check",
                  at: c.at ?? new Date(),
                })),
                resolution: {
                  code: "Completed",
                  note: "Consent and device check recorded.",
                  by: "Automation",
                  at: new Date(),
                },
              },
              "Readiness complete: consent and device check recorded",
            );
            return { outcome: "Closed", detail: `${existing.ref} complete` };
          },
        });
      }
      continue;
    }
    if (
      existing ||
      a.status !== "booked" ||
      a.start < ctx.now ||
      a.start.getTime() - ctx.now.getTime() > 2 * day
    )
      continue;
    if (consent && device) continue;
    const c = ctx.clientById.get(a.clientId.toHexString());
    out.push({
      key,
      entity: `Appointment ${aptLabel(a)}`,
      input: `${consent ? "Consent recorded" : "Video consent missing"}; ${device ? "device checked" : "device check pending"}`,
      actions: ["Create a Scheduling readiness task", "Send the telehealth preparation link"],
      run: async (rule, mode) => {
        const { task, created: isNew } = await insertTask("Automation", {
          ...ruleFields(rule, mode),
          suggestion: false,
          title: `Telehealth readiness: ${c?.name ?? "patient"}, ${fmtWhen(a.start)}`,
          category: "Telehealth",
          status: "New",
          priority: a.start.getTime() - ctx.now.getTime() < day ? "High" : "Normal",
          team: "Scheduling",
          assigneeId: null,
          assigneeName: null,
          related: {
            kind: "Appointment",
            ref: aptLabel(a),
            label: c?.name ?? "Appointment",
            href: `/care/schedule?visit=${a._id.toHexString()}`,
          },
          clientId: a.clientId,
          appointmentId: a._id,
          participant: c?.name ?? null,
          discipline: a.discipline,
          locationType: "Telehealth",
          dueAt: new Date(a.start.getTime() - 3 * 3_600_000),
          sla: "Expedited",
          visibility: "Internal",
          idemKey: key,
          checklist: [
            { label: "Video consent recorded" },
            { label: "Device check passed (camera, microphone, connection)" },
          ],
        });
        await queueMessage({
          key: `${key}:prep`,
          template: "TPL-TELEHEALTH",
          recipientType: "Patient",
          clientId: a.clientId,
          referralId: null,
          vars: {
            appointment_date: fmtDate(a.start),
            appointment_time: fmtTime(a.start),
            location_type: "video",
          },
          related: {
            label: `Appointment ${aptLabel(a)}`,
            href: `/care/schedule?visit=${a._id.toHexString()}`,
          },
          taskId: task?._id ?? null,
          by: rule.code,
          mode,
        });
        return created(task, isNew);
      },
    });
  }
  return out;
}

const signed = (a: AppointmentDoc) => a.note?.status === "Final" || a.note?.status === "Amended";

function aut11(ctx: Ctx): Planned[] {
  const out: Planned[] = [];
  for (const a of ctx.appointments) {
    if (a.status !== "completed") continue;
    const key = `AUT-11:SessionCompleted:${a._id.toHexString()}`;
    const existing = ctx.taskByKey.get(key);
    const ageHours = (ctx.now.getTime() - a.end.getTime()) / 3_600_000;
    if (existing && !isClosed(existing.status)) {
      if (signed(a)) {
        out.push({
          key: `${key}:signed`,
          entity: `Session ${aptLabel(a)}`,
          input: `Note signed by ${a.note?.byName ?? "the clinician"}`,
          actions: ["Close the reminder; the note itself isn't changed"],
          run: async () => {
            await ruleUpdateTask(
              existing._id,
              {
                status: "Completed",
                checklist: existing.checklist.map((c) => ({
                  ...c,
                  done: true,
                  by: a.note?.byName ?? "Clinician",
                  at: a.note?.signedAt ?? new Date(),
                })),
                resolution: {
                  code: "Completed",
                  note: "Note signed. The rule closed this reminder and didn't change the note.",
                  by: "Automation",
                  at: new Date(),
                },
              },
              "Closed: the session note was signed (the note wasn't changed)",
            );
            return { outcome: "Closed", detail: `${existing.ref} closed: note signed` };
          },
        });
      } else if (
        ageHours >= ctx.settings.noteEscalateHours &&
        existing.status !== "Escalated" &&
        canMoveTask(existing.status, "Escalated")
      ) {
        out.push({
          key: `${key}:escalate`,
          entity: `Session ${aptLabel(a)}`,
          input: `Note unsigned for ${Math.round(ageHours)} hours`,
          actions: ["Escalate to the Clinical Lead (supervisor policy)"],
          run: async () => {
            await ruleUpdateTask(
              existing._id,
              {
                status: "Escalated",
                priority: "High",
                escalation: {
                  owner: "Clinical Lead",
                  reason: `Note still unsigned after ${ctx.settings.noteEscalateHours} hours`,
                  at: new Date(),
                  outcome: "",
                },
              },
              `Escalated to the Clinical Lead: unsigned after ${ctx.settings.noteEscalateHours} hours`,
            );
            return {
              outcome: "Escalated",
              detail: `${existing.ref} escalated to the Clinical Lead`,
            };
          },
        });
      }
      continue;
    }
    if (existing || signed(a) || ageHours < ctx.settings.noteThresholdHours) continue;
    const c = ctx.clientById.get(a.clientId.toHexString());
    out.push({
      key,
      entity: `Session ${aptLabel(a)}`,
      input: `Completed ${fmtWhen(a.end)}, note ${a.note?.status ?? "not started"}, ${Math.round(ageHours)} hours`,
      actions: [
        "Create a documentation task for the clinician",
        `Escalate to the Clinical Lead after ${ctx.settings.noteEscalateHours} hours`,
      ],
      run: async (rule, mode) => {
        const { task, created: isNew } = await insertTask("Automation", {
          ...ruleFields(rule, mode),
          suggestion: false,
          title: `Sign the session note: ${c?.name ?? "patient"}, ${fmtDate(a.start)}`,
          category: "Documentation",
          status: "Assigned",
          priority: "Normal",
          team: "Clinical",
          ...therapistTaskBase(ctx, a),
          related: {
            kind: "Session",
            ref: aptLabel(a),
            label: c?.name ?? "Session",
            href: `/care/schedule?visit=${a._id.toHexString()}`,
          },
          clientId: a.clientId,
          appointmentId: a._id,
          participant: c?.name ?? null,
          discipline: a.discipline,
          dueAt: new Date(a.end.getTime() + ctx.settings.noteEscalateHours * 3_600_000),
          sla: "Standard",
          visibility: "Team Only",
          idemKey: key,
          checklist: [{ label: "Write and sign the session note" }],
        });
        return created(task, isNew);
      },
    });
  }
  return out;
}

function aut12(ctx: Ctx): Planned[] {
  const out: Planned[] = [];
  for (const a of ctx.assessments) {
    const key = `AUT-12:AssessmentOverdue:${a._id.toHexString()}`;
    const existing = ctx.taskByKey.get(key);
    if (
      existing &&
      !isClosed(existing.status) &&
      ["Signed", "Amended", "Cancelled"].includes(a.status)
    ) {
      out.push({
        key: `${key}:${a.status}`,
        entity: `Assessment ${a.support}`,
        input: `Assessment ${a.status}`,
        actions: ["Close the follow-up"],
        run: async () => {
          await ruleUpdateTask(
            existing._id,
            {
              status: "Completed",
              checklist: existing.checklist.map((c) => ({
                ...c,
                done: true,
                by: a.therapistName,
                at: new Date(),
              })),
              resolution: {
                code: a.status === "Cancelled" ? "Not Applicable" : "Completed",
                note: `Assessment ${a.status.toLowerCase()}.`,
                by: "Automation",
                at: new Date(),
              },
            },
            `Closed: assessment ${a.status.toLowerCase()}`,
          );
          return { outcome: "Closed", detail: `${existing.ref} closed` };
        },
      });
      continue;
    }
    if (existing || !["Draft", "In Progress"].includes(a.status)) continue;
    const ageDays = (ctx.now.getTime() - a.createdAt.getTime()) / day;
    if (ageDays < ctx.settings.assessmentOverdueDays) continue;
    const c = ctx.clientById.get(a.clientId.toHexString());
    const u = ctx.userOfTherapist.get(a.therapistId.toHexString());
    out.push({
      key,
      entity: `Assessment ${a.support} · ${c?.name ?? ""}`,
      input: `${a.status} for ${Math.floor(ageDays)} days (review deadline ${ctx.settings.assessmentOverdueDays} days)`,
      actions: ["Create a clinician follow-up linked to the same episode"],
      run: async (rule, mode) => {
        const { task, created: isNew } = await insertTask("Automation", {
          ...ruleFields(rule, mode),
          suggestion: false,
          title: `Finish the ${a.kind.toLowerCase()} ${a.support}: ${c?.name ?? "patient"}`,
          category: "Documentation",
          status: "Assigned",
          priority: "Normal",
          team: "Clinical",
          assigneeId: u?._id ?? null,
          assigneeName: u?.name ?? a.therapistName,
          related: {
            kind: "Assessment",
            ref: `${a.support} (${a.kind})`,
            label: c?.name ?? "Assessment",
            href: c ? `/care/${c._id.toHexString()}` : null,
          },
          clientId: a.clientId,
          participant: c?.name ?? null,
          service: a.support,
          discipline: a.discipline,
          dueAt: addBusinessHours(ctx.now, slaHours.Standard * 3, ctx.settings),
          sla: "Standard",
          visibility: "Team Only",
          idemKey: key,
          note: "The partial save is kept. This follow-up continues the same assessment episode; it doesn't start a new one.",
          checklist: [
            { label: "Complete the outstanding sections" },
            { label: "Sign the assessment or record why it can't be finished" },
          ],
        });
        return created(task, isNew);
      },
    });
  }
  return out;
}

function aut13(ctx: Ctx): Planned[] {
  const out: Planned[] = [];
  for (const b of ctx.billables) {
    if (b.status !== "Held") continue;
    const key = `AUT-13:ServiceVerified:${b._id.toHexString()}`;
    if (ctx.taskByKey.has(key)) continue;
    const c = ctx.clientById.get(b.clientId.toHexString());
    out.push({
      key,
      entity: `Billable ${b.ref}`,
      input: `Verified ${b.support}, ${b.quantity} ${b.unit}, held`,
      actions: ["Create a Finance reconciliation task (never charges or claims)"],
      run: async (rule, mode) => {
        const { task, created: isNew } = await insertTask("Automation", {
          ...ruleFields(rule, mode),
          suggestion: false,
          title: `Resolve held billable line ${b.ref}: ${c?.name ?? "patient"}`,
          category: "Billing",
          status: "New",
          priority: "Normal",
          team: "Finance",
          assigneeId: null,
          assigneeName: null,
          related: {
            kind: "Invoice",
            ref: b.ref,
            label: c?.name ?? "Billable line",
            href: "/care/billing?tab=queue",
          },
          clientId: b.clientId,
          participant: c?.name ?? null,
          service: b.support,
          discipline: b.discipline,
          dueAt: addBusinessHours(ctx.now, slaHours.Standard * 2, ctx.settings),
          sla: "Standard",
          visibility: "Team Only",
          idemKey: key,
          note: "Verified service only. This task can't change the clinical record or charge anyone; Finance reviews the quantity, travel and rate in the billable queue.",
          checklist: [
            { label: "Review quantity, travel and rate" },
            { label: "Release or adjust the line in the billable queue" },
          ],
        });
        return created(task, isNew);
      },
    });
  }
  for (const inv of ctx.invoices) {
    if (ctx.now.getTime() - inv.createdAt.getTime() < day) continue;
    const key = `AUT-13:InvoiceDraft:${inv._id.toHexString()}`;
    if (ctx.taskByKey.has(key)) continue;
    const c = ctx.clientById.get(inv.clientId.toHexString());
    out.push({
      key,
      entity: `Invoice ${inv.number}`,
      input: `Draft for ${Math.floor((ctx.now.getTime() - inv.createdAt.getTime()) / day)} days, ${inv.lines.length} line(s)`,
      actions: ["Create a Finance reconciliation task (never issues the invoice)"],
      run: async (rule, mode) => {
        const { task, created: isNew } = await insertTask("Automation", {
          ...ruleFields(rule, mode),
          suggestion: false,
          title: `Finish draft invoice ${inv.number}: ${c?.name ?? "patient"}`,
          category: "Billing",
          status: "New",
          priority: "Normal",
          team: "Finance",
          assigneeId: null,
          assigneeName: null,
          related: {
            kind: "Invoice",
            ref: inv.number,
            label: c?.name ?? "Invoice",
            href: `/care/billing/${inv._id.toHexString()}`,
          },
          clientId: inv.clientId,
          participant: c?.name ?? null,
          dueAt: addBusinessHours(ctx.now, slaHours.Standard * 2, ctx.settings),
          sla: "Standard",
          visibility: "Team Only",
          idemKey: key,
          checklist: [
            { label: "Check every delivered service is on the invoice" },
            { label: "Send it for approval, or void it with a reason" },
          ],
        });
        return created(task, isNew);
      },
    });
  }
  return out;
}

function aut14(ctx: Ctx): Planned[] {
  const today = brisbaneKey(ctx.now);
  const limit = brisbaneKey(new Date(ctx.now.getTime() + 14 * day));
  return ctx.plans
    .filter((p) => p.reviewDate && p.reviewDate >= today && p.reviewDate <= limit)
    .flatMap((p): Planned[] => {
      const key = `AUT-14:ReportDue:${p._id.toHexString()}:${p.reviewDate}`;
      if (ctx.taskByKey.has(key)) return [];
      const c = ctx.clientById.get(p.clientId.toHexString());
      const u = ctx.userOfTherapist.get(p.therapistId.toHexString());
      return [
        {
          key,
          entity: `Plan ${p.support} · ${c?.name ?? ""}`,
          input: `Goal review due ${p.reviewDate}`,
          actions: ["Create a progress-report task and reminder for the clinician"],
          run: async (rule, mode) => {
            const { task, created: isNew } = await insertTask("Automation", {
              ...ruleFields(rule, mode),
              suggestion: false,
              title: `Progress review and report due ${p.reviewDate}: ${c?.name ?? "patient"}`,
              category: "Documentation",
              status: "Assigned",
              priority: "Normal",
              team: "Clinical",
              assigneeId: u?._id ?? null,
              assigneeName: u?.name ?? p.therapistName,
              related: {
                kind: "Participant",
                ref: c?.mrn ?? p.support,
                label: c?.name ?? "Plan",
                href: c ? `/care/${c._id.toHexString()}` : null,
              },
              clientId: p.clientId,
              participant: c?.name ?? null,
              service: p.support,
              dueAt: new Date(`${p.reviewDate}T07:00:00Z`),
              sla: "Standard",
              visibility: "Team Only",
              idemKey: key,
              checklist: [
                { label: "Review each goal's progress" },
                { label: "Draft and sign the progress report" },
              ],
            });
            return created(task, isNew);
          },
        },
      ];
    });
}

function aut15(ctx: Ctx): Planned[] {
  const out: Planned[] = [];
  for (const t of ctx.telehealth) {
    if (t.recording.status !== "Available") continue;
    const c = ctx.clientById.get(t.clientId.toHexString());
    const clientConsent = c?.consents?.find((k) => k.key === "recording")?.state;
    const valid =
      Boolean(t.consents.recording?.given) &&
      clientConsent !== "Withdrawn" &&
      clientConsent !== "Refused";
    const key = `AUT-15:RecordingReady:${t._id.toHexString()}`;
    if (ctx.taskByKey.has(key) || ctx.taskByKey.has(`${key}:governance`)) continue;
    const u = ctx.userOfTherapist.get(t.therapistId.toHexString());
    if (!valid) {
      out.push({
        key: `${key}:governance`,
        entity: `Recording for ${c?.name ?? "patient"}`,
        input: `Recording consent ${clientConsent ?? "not recorded"}`,
        actions: ["Stop automated sharing", "Route the retention question to clinical governance"],
        run: async (rule, mode) => {
          const { task, created: isNew } = await insertTask("Automation", {
            ...ruleFields(rule, mode),
            suggestion: false,
            title: `Recording retention question: consent ${clientConsent?.toLowerCase() ?? "not valid"}`,
            category: "Consent",
            status: "New",
            priority: "High",
            team: "Clinical",
            assigneeId: ctx.clinicalLead?._id ?? null,
            assigneeName: ctx.clinicalLead?.name ?? null,
            related: {
              kind: "Session",
              ref: t.appointmentId.toHexString().slice(-6).toUpperCase(),
              label: c?.name ?? "Recording",
              href: null,
            },
            clientId: t.clientId,
            participant: c?.name ?? null,
            dueAt: addBusinessHours(ctx.now, slaHours.Expedited, ctx.settings),
            sla: "Expedited",
            visibility: "Clinical Restricted",
            idemKey: `${key}:governance`,
            note: "Automated sharing stopped. Nobody was notified of the recording. Decide retention under the recording policy.",
            checklist: [
              { label: "Confirm the consent position with the patient or representative" },
              { label: "Decide retention or deletion under policy and record why" },
            ],
          });
          return created(task, isNew);
        },
      });
      continue;
    }
    out.push({
      key,
      entity: `Recording for ${c?.name ?? "patient"}`,
      input: "Processed with valid consent",
      actions: [
        "Tell the authorised clinician only",
        "Playback stays behind the recording access check",
      ],
      run: async (rule, mode) => {
        const { task, created: isNew } = await insertTask("Automation", {
          ...ruleFields(rule, mode),
          suggestion: false,
          title: `Recording available to review: ${c?.name ?? "patient"}`,
          category: "Telehealth",
          status: "Assigned",
          priority: "Low",
          team: "Clinical",
          assigneeId: u?._id ?? null,
          assigneeName: u?.name ?? null,
          related: {
            kind: "Session",
            ref: t.appointmentId.toHexString().slice(-6).toUpperCase(),
            label: c?.name ?? "Recording",
            href: null,
          },
          clientId: t.clientId,
          participant: c?.name ?? null,
          dueAt: addBusinessHours(ctx.now, slaHours.Standard * 3, ctx.settings),
          sla: "Standard",
          visibility: "Clinical Restricted",
          idemKey: key,
          recordingHref: "/telehealth/recordings",
          note: "Opening the recording asks for the purpose and is logged. This task alone doesn't grant playback.",
          checklist: [{ label: "Review the recording for the documented purpose" }],
        });
        return created(task, isNew);
      },
    });
  }
  return out;
}

async function aut16(ctx: Ctx): Promise<Planned[]> {
  const { opsTasks } = await collections();
  const open = await opsTasks
    .find({ status: { $nin: ["Completed", "Cancelled", "Escalated"] }, dueAt: { $lt: ctx.now } })
    .toArray();
  const out: Planned[] = [];
  for (const t of open) {
    if (isPaused(t.status) || !canMoveTask(t.status, "Escalated")) continue;
    const owner =
      t.team === "Clinical"
        ? "Clinical Lead"
        : t.team === "Finance"
          ? "Finance Manager"
          : "Operations Manager";
    out.push({
      key: `AUT-16:TaskOverdue:${t._id.toHexString()}:${t.dueAt.toISOString()}`,
      entity: `Task ${t.ref}`,
      input: `Due ${fmtWhen(t.dueAt)}, ${t.status}, ${t.sla} SLA`,
      actions: [`Escalate to the ${owner}`],
      run: async (rule) => {
        await ruleUpdateTask(
          t._id,
          {
            status: "Escalated",
            escalation: {
              owner,
              reason: `Past the ${t.sla} SLA (business hours)`,
              at: new Date(),
              outcome: "",
            },
          },
          `Escalated to the ${owner} by ${rule.code}: past the SLA`,
        );
        return { outcome: "Escalated", detail: `${t.ref} escalated to the ${owner}` };
      },
    });
  }
  // Staff leave: alert for eligible reassignment, never reassign automatically (OP-052).
  for (const t of await opsTasks
    .find({ status: { $nin: ["Completed", "Cancelled"] }, assigneeId: { $ne: null } })
    .toArray()) {
    const u = ctx.users.find((x) => t.assigneeId?.equals(x._id));
    const th = u?.therapistId ? ctx.therapistById.get(u.therapistId.toHexString()) : undefined;
    if (!th || !isAway(th as TherapistDoc, ctx.now) || t.tags.includes("Assignee on leave"))
      continue;
    out.push({
      key: `AUT-16:Leave:${t._id.toHexString()}:${brisbaneKey(ctx.now)}`,
      entity: `Task ${t.ref}`,
      input: `${t.assigneeName} is on leave today`,
      actions: ["Flag for reassignment to an eligible colleague (no automatic reassignment)"],
      run: async () => {
        await ruleUpdateTask(
          t._id,
          { tags: [...t.tags, "Assignee on leave"] },
          `${t.assigneeName} is on leave: reassign to an eligible colleague if this can't wait`,
        );
        return { outcome: "Updated existing", detail: `${t.ref} flagged: assignee on leave` };
      },
    });
  }
  return out;
}

/* ------------------------------------------------------------------ running */

const planners: Record<string, (ctx: Ctx) => Planned[] | Promise<Planned[]>> = {
  "AUT-01": aut01,
  "AUT-02": aut02,
  "AUT-03": aut03,
  "AUT-04": aut04,
  "AUT-05": aut05,
  "AUT-06": aut06,
  "AUT-08": (c) => reminders(c, "AUT-08"),
  "AUT-09": aut09,
  "AUT-10": aut10,
  "AUT-11": aut11,
  "AUT-12": aut12,
  "AUT-13": aut13,
  "AUT-14": aut14,
  "AUT-15": aut15,
  "AUT-16": aut16,
  "AUT-17": (c) => reminders(c, "AUT-17"),
};

/** Custom rules reuse the planner of a built-in rule with the same trigger. */
function plannerFor(rule: OpsRuleDoc) {
  if (planners[rule.code]) return planners[rule.code];
  const twin = builtInRules.find((b) => b.trigger === rule.trigger);
  return twin ? planners[twin.code] : undefined;
}

async function runRule(rule: OpsRuleDoc, ctx: Ctx) {
  const plan = plannerFor(rule);
  if (!plan || rule.status === "Draft" || rule.status === "Archived") return 0;
  if (!planners[rule.code]) return 0;
  const items = await plan(ctx);
  let changes = 0;
  for (const item of items) {
    const base = {
      ruleCode: rule.code,
      ruleName: rule.name,
      ruleVersion: rule.version,
      trigger: rule.trigger,
      entity: item.entity,
      input: item.input,
      actions: item.actions,
      mode: rule.runMode,
    };
    if (rule.status === "Paused") {
      // A paused rule keeps its history and suppresses new triggers (OP-031).
      const logged = await logRun({
        ...base,
        key: `paused:${item.key}`,
        outcome: "Suppressed",
        detail: "Rule paused: no task or message created",
        once: true,
      });
      if (logged) changes += 1;
      continue;
    }
    if (rule.runMode === "Simulation") continue;
    try {
      const res = await item.run(rule, rule.runMode);
      if (!res) continue;
      await logRun({ ...base, key: item.key, outcome: res.outcome, detail: res.detail });
      changes += 1;
    } catch (error) {
      await logRun({
        ...base,
        key: item.key,
        outcome: "Error",
        detail: error instanceof Error ? error.message : "The rule failed",
        once: true,
      });
      changes += 1;
    }
  }
  return changes;
}

const g = globalThis as unknown as { __opsScan?: { at: number; running: Promise<number> | null } };

/** Runs every active rule over the live records. Throttled, so opening the hub stays quick. */
export async function scanAll(force = false) {
  const state = (g.__opsScan ??= { at: 0, running: null });
  if (state.running) return force ? state.running : 0;
  if (!force && Date.now() - state.at < 45_000) return 0;
  // Pages show the last scan straight away; the next one runs in the background.
  const background = !force && state.at > 0;
  state.running = (async () => {
    await ensureRules();
    const ctx = await loadContext();
    const { opsRules } = await collections();
    const rules = await opsRules
      .find({ status: { $in: ["Active", "Paused"] } })
      .sort({ code: 1 })
      .toArray();
    let changes = 0;
    for (const rule of rules) changes += await runRule(rule, ctx);
    changes += await releaseQuiet(ctx);
    if (changes) await opsChanged();
    return changes;
  })().finally(() => {
    state.at = Date.now();
    state.running = null;
  });
  if (background) {
    state.running.catch(() => undefined);
    return 0;
  }
  return state.running;
}

export const lastScan = () => (g.__opsScan?.at ? new Date(g.__opsScan.at).toISOString() : null);

/** Messages held for quiet hours go out once the window ends (simulated). */
async function releaseQuiet(ctx: Ctx) {
  if (inQuietHours(ctx.now, ctx.settings)) return 0;
  const { opsMessages } = await collections();
  const held = await opsMessages.find({ state: "Queued", reason: /quiet hours/ }).toArray();
  for (const m of held) {
    m.state = "Delivered";
    m.attempts += 1;
    m.reason = "";
    m.history.push(
      { at: ctx.now, state: "Sent", note: "Quiet hours ended: sent (simulated)" },
      { at: ctx.now, state: "Delivered", note: "Delivered (simulated)" },
    );
    await opsMessages.replaceOne({ _id: m._id }, m);
  }
  return held.length;
}

/** OP-029: what a rule would do now, without changing any record. Logged as a simulation. */
export async function simulateRule(rule: OpsRuleDoc, by: string) {
  const plan = plannerFor(rule);
  const ctx = await loadContext();
  const items = plan ? await plan(ctx) : [];
  const preview = items
    .slice(0, 25)
    .map((i) => ({ entity: i.entity, input: i.input, actions: i.actions }));
  await logRun({
    key: `simulate:${rule.code}:v${rule.version}:${Date.now()}`,
    ruleCode: rule.code,
    ruleName: rule.name,
    ruleVersion: rule.version,
    trigger: rule.trigger,
    entity: `${items.length} matching record(s)`,
    input: `Simulation by ${by}`,
    actions: preview
      .slice(0, 3)
      .flatMap((p) => p.actions)
      .slice(0, 4),
    outcome: "Simulated",
    detail: items.length
      ? `Would act on ${items.length} record(s). Nothing was changed.`
      : "No current records match. Nothing was changed.",
    mode: "Simulation",
  });
  return { matches: items.length, preview };
}

/** OP-032 / RULE-001: the same event arriving again is skipped and logged, never duplicated. */
export async function replayEvent(key: string, by: string) {
  const { opsTasks, opsRules } = await collections();
  const task = await opsTasks.findOne({ idemKey: key });
  if (!task) return null;
  const rule = await opsRules.findOne({ code: task.ruleCode ?? "" });
  return logRun({
    key: `replay:${key}:${Date.now()}`,
    ruleCode: task.ruleCode ?? "",
    ruleName: rule?.name ?? "",
    ruleVersion: rule?.version ?? 1,
    trigger: rule?.trigger ?? "",
    entity: `${task.related.kind} ${task.related.ref}`,
    input: `Event received again (replayed by ${by})`,
    actions: ["Create Task"],
    outcome: "Duplicate skipped",
    detail: `Idempotency key ${key} already has ${task.ref}. No second task or message.`,
    mode: rule?.runMode ?? "Execute Allowed Actions",
  });
}

export type { ClientDoc };
