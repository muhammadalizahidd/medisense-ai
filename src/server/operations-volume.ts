import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import {
  approvalWorkflows,
  slaHours,
  templates,
  type ApprovalStatus,
  type MessageState,
  type RunDto,
  type SlaClass,
  type TaskCategory,
  type TaskPriority,
  type TaskStatus,
  type Team,
} from "@/lib/live/operations";
import { builtInRules } from "./operations-catalogue";
import { collections } from "./db";
import { addBusinessHours, defaultSettings, teamsOf } from "./operations";
import type {
  ClientDoc,
  OpsApprovalDoc,
  OpsMessageDoc,
  OpsRunDoc,
  OpsTaskDoc,
  UserDoc,
} from "./models";

/**
 * A month of operational history, so the hub reads like a working practice: closed work with
 * realistic timelines, rule runs, simulated deliveries and decided approvals. Every record is
 * tagged `scenario: "sample"` (tasks) or carries a `sample:` key, and is linked to real patients
 * and staff so the links open real records. Created once.
 */

/** Deterministic, so a reseed on another database tells the same story. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4_294_967_296;
  };
}

type Recipe = {
  category: TaskCategory;
  team: Team;
  rule: string | null;
  titles: ((p: string) => string)[];
  checklist: string[];
  weight: number;
};

const recipes: Recipe[] = [
  {
    category: "Referral",
    team: "Intake",
    rule: "AUT-01",
    weight: 16,
    titles: [
      (p) => `Confirm the plan manager details for ${p}`,
      (p) => `Chase the NDIS plan pages for ${p}`,
      (p) => `Verify the booking contact for ${p}`,
      (p) => `Confirm goals and the reported diagnosis for ${p}`,
    ],
    checklist: [
      "Call the authorised contact",
      "Record the confirmed details",
      "Re-run the completeness check",
    ],
  },
  {
    category: "Referral",
    team: "Intake",
    rule: "AUT-02",
    weight: 5,
    titles: [(p) => `Review possible duplicate record for ${p}`],
    checklist: ["Compare identity and contact details", "Record the decision on the referral"],
  },
  {
    category: "Clinical Review",
    team: "Clinical",
    rule: "AUT-03",
    weight: 6,
    titles: [
      (p) => `Clinical review before matching: ${p}`,
      (p) => `Confirm visit precautions for ${p}`,
    ],
    checklist: [
      "Review the disclosed information",
      "Record suitability and precautions",
      "Record the rationale",
    ],
  },
  {
    category: "Funding",
    team: "Finance",
    rule: "AUT-04",
    weight: 9,
    titles: [
      (p) => `Verify funding: ${p}'s plan ends soon`,
      (p) => `Check the service agreement budget for ${p}`,
    ],
    checklist: ["Confirm the new plan or extension", "Review services booked after the end date"],
  },
  {
    category: "Scheduling",
    team: "Scheduling",
    rule: "AUT-06",
    weight: 13,
    titles: [
      (p) => `Choose a therapist for ${p}`,
      (p) => `Rebook the cancelled visit for ${p}`,
      (p) => `Offer an earlier slot to ${p}`,
    ],
    checklist: ["Review the ranked shortlist", "Confirm the time with the patient"],
  },
  {
    category: "Visit",
    team: "Clinical",
    rule: "AUT-09",
    weight: 14,
    titles: [(p) => `Prepare for the home visit: ${p}`, (p) => `School visit access check: ${p}`],
    checklist: ["Confirm access and parking", "Check pets and who will be present"],
  },
  {
    category: "Telehealth",
    team: "Scheduling",
    rule: "AUT-10",
    weight: 8,
    titles: [(p) => `Telehealth readiness: ${p}`],
    checklist: ["Video consent recorded", "Device check passed"],
  },
  {
    category: "Documentation",
    team: "Clinical",
    rule: "AUT-11",
    weight: 15,
    titles: [
      (p) => `Sign the session note: ${p}`,
      (p) => `Finish the progress report for ${p}`,
      (p) => `Complete the outstanding FCA sections: ${p}`,
    ],
    checklist: ["Write and sign the note"],
  },
  {
    category: "Billing",
    team: "Finance",
    rule: "AUT-13",
    weight: 10,
    titles: [
      (p) => `Resolve held billable line: ${p}`,
      (p) => `Finish draft invoice for ${p}`,
      (p) => `Check travel time claimed for ${p}`,
    ],
    checklist: ["Review quantity, travel and rate", "Release or adjust the line"],
  },
  {
    category: "Consent",
    team: "Intake",
    rule: null,
    weight: 4,
    titles: [(p) => `Record sharing consent with the coordinator for ${p}`],
    checklist: ["Confirm the consent with the participant", "Record it on the profile"],
  },
  {
    category: "Care Coordination",
    team: "Operations",
    rule: null,
    weight: 6,
    titles: [
      (p) => `Coordinate the joint visit for ${p}`,
      (p) => `Update the support coordinator on ${p}`,
    ],
    checklist: ["Agree the plan with both clinicians", "Send the approved update"],
  },
  {
    category: "Incident",
    team: "Operations",
    rule: null,
    weight: 2,
    titles: [(p) => `Follow up the reported incident for ${p}`],
    checklist: ["Record what happened", "Notify the Clinical Lead"],
  },
];

const outcomesForRule: Record<string, RunDto["outcome"][]> = {
  default: [
    "Task created",
    "Task created",
    "Task created",
    "Updated existing",
    "Closed",
    "Closed",
    "Duplicate skipped",
  ],
  "AUT-05": ["Message queued", "Message queued", "Suppressed"],
  "AUT-08": ["Message queued", "Message queued", "Message queued", "Suppressed"],
  "AUT-16": ["Escalated", "Escalated", "Updated existing"],
  "AUT-17": ["Suppressed"],
};

export async function ensureVolume() {
  const { db, users, clients, opsTasks, opsRuns, opsMessages, opsApprovals } = await collections();
  const flags = db.collection<{ _id: string; at: Date }>("settings");
  if (await flags.findOne({ _id: "opsVolume" })) return;
  const staff = await users
    .find({ role: { $in: ["admin", "therapist"] }, disabled: { $ne: true } })
    .toArray();
  const people = await clients
    .find({ discharged: { $in: [null] } })
    .limit(260)
    .toArray();
  if (people.length < 10 || staff.length < 5) return;
  const rand = rng(8008);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)] as T;
  const now = Date.now();
  const hour = 3_600_000;
  const day = 24 * hour;
  const byTeam = (team: Team) =>
    staff.filter((s) => teamsOf(s).includes(team) && !s.staffRoles?.includes("Super Admin"));
  const lead =
    staff.find((s) => s.email === "helen.brooks@medisense.test") ??
    staff.find((s) => s.staffRoles?.includes("Clinical Lead"));
  const weighted = recipes.flatMap((r) => Array.from({ length: r.weight }, () => r));
  const ruleName = new Map(builtInRules.map((r) => [r.code, r]));

  const tasks: OpsTaskDoc[] = [];
  const total = 280;
  for (let i = 0; i < total; i += 1) {
    const r = pick(weighted);
    const c: ClientDoc = pick(people);
    const created = new Date(now - rand() * 30 * day);
    const ageDays = (now - created.getTime()) / day;
    const sla: SlaClass =
      r.category === "Clinical Review"
        ? "Clinical Escalation"
        : rand() < 0.2
          ? "Expedited"
          : "Standard";
    const due = addBusinessHours(
      created,
      slaHours[sla] * (1 + Math.floor(rand() * 3)),
      defaultSettings,
    );
    const pool =
      r.team === "Clinical" ? staff.filter((s) => s.role === "therapist") : byTeam(r.team);
    const who: UserDoc | undefined =
      r.category === "Clinical Review" ? lead : pool.length ? pick(pool) : undefined;
    // Older work is mostly finished; recent work is mostly open.
    const closedChance = ageDays > 10 ? 0.86 : ageDays > 4 ? 0.55 : 0.18;
    let status: TaskStatus;
    if (rand() < closedChance) status = rand() < 0.93 ? "Completed" : "Cancelled";
    else {
      const roll = rand();
      status =
        due.getTime() < now
          ? roll < 0.5
            ? "Escalated"
            : roll < 0.8
              ? "Waiting for Patient"
              : "On Hold"
          : roll < 0.18
            ? "New"
            : roll < 0.5
              ? "Assigned"
              : roll < 0.78
                ? "In Progress"
                : roll < 0.9
                  ? "Waiting for Patient"
                  : "Waiting for Staff";
    }
    const priority: TaskPriority =
      r.category === "Clinical Review"
        ? "High"
        : rand() < 0.05
          ? "Urgent"
          : rand() < 0.22
            ? "High"
            : rand() < 0.85
              ? "Normal"
              : "Low";
    const closed = status === "Completed" || status === "Cancelled";
    const firstTouch = new Date(created.getTime() + (0.3 + rand() * 6) * hour);
    const finished = new Date(Math.min(now - hour, created.getTime() + (4 + rand() * 70) * hour));
    const assignee = status === "New" ? null : (who ?? null);
    const source = r.rule
      ? rand() < 0.88
        ? "Rule"
        : "Manual"
      : rand() < 0.2
        ? "AI Proposed"
        : "Manual";
    const history: OpsTaskDoc["history"] = [
      {
        at: created,
        by:
          source === "Rule"
            ? "Automation"
            : pick(byTeam(r.team).length ? byTeam(r.team) : staff).name,
        action: source === "Rule" ? `Created by ${r.rule} v1` : "Created",
      },
    ];
    if (assignee)
      history.push({
        at: firstTouch,
        by: source === "Rule" ? "Automation" : assignee.name,
        action: `Assigned to ${assignee.name}`,
      });
    if (assignee && status !== "Assigned")
      history.push({
        at: new Date(firstTouch.getTime() + hour),
        by: assignee.name,
        action: "Acknowledged",
      });
    if (
      [
        "In Progress",
        "Completed",
        "Waiting for Patient",
        "Waiting for Staff",
        "Escalated",
        "On Hold",
      ].includes(status) &&
      assignee
    ) {
      history.push({
        at: new Date(firstTouch.getTime() + 2 * hour),
        by: assignee.name,
        action: "Assigned → In Progress",
      });
    }
    if (status === "Escalated")
      history.push({
        at: new Date(due.getTime() + hour),
        by: "Automation",
        action: `Escalated by AUT-16: past the ${sla} SLA`,
      });
    if (status === "Waiting for Patient")
      history.push({
        at: new Date(firstTouch.getTime() + 3 * hour),
        by: assignee?.name ?? "Automation",
        action: "In Progress → Waiting for Patient: secure request sent",
      });
    if (closed)
      history.push({
        at: finished,
        by: assignee?.name ?? "Automation",
        action: status === "Completed" ? "In Progress → Completed" : "Cancelled: no longer needed",
      });
    const checklist = r.checklist.map((label) => ({
      id: randomUUID(),
      label,
      required: true,
      done: closed && status === "Completed" ? true : rand() < 0.35,
      by: null as string | null,
      at: null as Date | null,
    }));
    for (const item of checklist)
      if (item.done) Object.assign(item, { by: assignee?.name ?? "Automation", at: finished });
    const title = pick(r.titles)(c.name);
    tasks.push({
      _id: new ObjectId(),
      ref: "",
      title,
      category: r.category,
      status,
      priority,
      urgentReason:
        priority === "Urgent" ? "Family asked for an earlier visit after a fall at home" : "",
      team: r.team,
      assigneeId: assignee?._id ?? null,
      assigneeName: assignee?.name ?? null,
      related: {
        kind:
          r.category === "Billing"
            ? "Invoice"
            : r.category === "Visit" || r.category === "Telehealth"
              ? "Appointment"
              : "Participant",
        ref: c.mrn ?? c.name,
        label: c.name,
        href: `/care/${c._id.toHexString()}`,
      },
      clientId: c._id,
      referralId: null,
      appointmentId: null,
      participant: c.name,
      service: c.needs[0]?.support ?? null,
      discipline: c.needs[0]?.discipline ?? null,
      locationType: r.category === "Telehealth" ? "Telehealth" : (c.needs[0]?.location ?? "Home"),
      dueAt: due,
      sla,
      visibility:
        r.category === "Clinical Review" || r.category === "Incident"
          ? "Clinical Restricted"
          : r.team === "Finance"
            ? "Team Only"
            : "Internal",
      source,
      ruleCode: source === "Rule" ? r.rule : null,
      ruleVersion: source === "Rule" ? 1 : null,
      idemKey: null,
      checklist,
      notes:
        rand() < 0.45 && assignee
          ? [
              {
                id: randomUUID(),
                text: pick([
                  "Left a voicemail; will try again tomorrow morning.",
                  "Spoke with the parent; documents coming by Friday.",
                  "Confirmed with the plan manager by email.",
                  "Booked in for next week; reminder will go out automatically.",
                  "Waiting on the school to confirm the room.",
                ]),
                by: assignee.name,
                at: new Date(firstTouch.getTime() + 2.5 * hour),
                edits: [],
              },
            ]
          : [],
      attachments: [],
      history,
      resolution: closed
        ? {
            code:
              status === "Completed"
                ? "Completed"
                : pick(["Duplicate", "Withdrawn", "Not Applicable"] as const),
            note: "",
            by: assignee?.name ?? "Automation",
            at: finished,
          }
        : null,
      holdReason: status === "On Hold" ? "Waiting for the new plan to be approved" : "",
      escalation:
        status === "Escalated"
          ? {
              owner:
                r.team === "Clinical"
                  ? "Clinical Lead"
                  : r.team === "Finance"
                    ? "Finance Manager"
                    : "Operations Manager",
              reason: `Past the ${sla} SLA (business hours)`,
              at: new Date(due.getTime() + hour),
              outcome: "",
            }
          : null,
      acknowledged:
        assignee && status !== "Assigned"
          ? { by: assignee.name, at: new Date(firstTouch.getTime() + hour) }
          : null,
      tags: [],
      restrictedNote:
        r.category === "Clinical Review"
          ? "Referrer reported behaviours of concern during personal care; confirm a two-person visit plan."
          : null,
      recordingHref: null,
      suggestion: false,
      scenario: "sample",
      version: history.length,
      createdAt: created,
      updatedAt: closed ? finished : (history[history.length - 1]?.at ?? created),
    });
  }
  tasks.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const counter = db.collection<{ _id: string; seq: number }>("counters");
  const base =
    ((
      await counter.findOneAndUpdate(
        { _id: "opsTask" },
        { $inc: { seq: total } },
        { upsert: true, returnDocument: "after" },
      )
    )?.seq ?? total) - total;
  tasks.forEach((t, i) => (t.ref = `TASK-${String(base + i + 1).padStart(6, "0")}`));
  await opsTasks.insertMany(tasks);

  const runs: OpsRunDoc[] = [];
  const runTotal = 640;
  const codes = builtInRules.map((r) => r.code);
  for (let i = 0; i < runTotal; i += 1) {
    const code = pick(codes);
    const def = ruleName.get(code);
    const outcome: RunDto["outcome"] = pick(
      outcomesForRule[code] ?? outcomesForRule.default ?? ["Task created"],
    );
    const c = pick(people);
    const at = new Date(now - rand() * 30 * day);
    runs.push({
      _id: new ObjectId(),
      ref: "",
      key: `sample:${i}`,
      ruleCode: code,
      ruleName: def?.name ?? code,
      ruleVersion: 1,
      trigger: def?.trigger ?? "",
      entity: `Participant ${c.name}`,
      input: def?.check ?? "",
      actions: [def?.proposedAction ?? ""],
      outcome,
      detail:
        outcome === "Duplicate skipped"
          ? "Idempotency key already handled. No second task or message."
          : outcome === "Suppressed"
            ? code === "AUT-17"
              ? "Rule paused: no message created"
              : "Held: no contact consent or quiet hours"
            : `${outcome} for ${c.name}`,
      mode: def?.runMode ?? "Execute Allowed Actions",
      retries: 0,
      resolved: true,
      at,
    });
  }
  runs.push({
    ...(runs[0] as OpsRunDoc),
    _id: new ObjectId(),
    key: "sample:error",
    ruleCode: "AUT-13",
    ruleName: "Service-to-billing",
    outcome: "Error" as const,
    detail: "Price item missing for the travel line: Finance fixes the catalogue, then retry.",
    resolved: false,
    at: new Date(now - 5 * hour),
  });
  runs.sort((a, b) => a.at.getTime() - b.at.getTime());
  const runBase =
    ((
      await counter.findOneAndUpdate(
        { _id: "opsRun" },
        { $inc: { seq: runs.length } },
        { upsert: true, returnDocument: "after" },
      )
    )?.seq ?? runs.length) - runs.length;
  runs.forEach((r, i) => (r.ref = `RUN-${String(runBase + i + 1).padStart(6, "0")}`));
  await opsRuns.insertMany(runs);

  const messages: OpsMessageDoc[] = [];
  const msgTotal = 220;
  const stateRoll = (): MessageState => {
    const x = rand();
    return x < 0.74
      ? "Delivered"
      : x < 0.82
        ? "Suppressed"
        : x < 0.88
          ? "Failed"
          : x < 0.95
            ? "Awaiting Approval"
            : "Queued";
  };
  for (let i = 0; i < msgTotal; i += 1) {
    const tpl = pick(templates.filter((t) => t.approved));
    const c = pick(people);
    const at = new Date(now - rand() * 30 * day);
    const state = stateRoll();
    const first = c.name.split(" ")[0] ?? c.name;
    const body = tpl.body
      .replace(/\{\{preferred_name\}\}/g, first)
      .replace(/\{\{referral_number\}\}/g, `REF-${c.mrn ?? "MRN"}`)
      .replace(
        /\{\{appointment_date\}\}/g,
        new Intl.DateTimeFormat("en-AU", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "Australia/Brisbane",
        }).format(new Date(at.getTime() + 2 * day)),
      )
      .replace(/\{\{appointment_time\}\}/g, pick(["9:00 am", "10:30 am", "1:00 pm", "2:30 pm"]))
      .replace(/\{\{location_type\}\}/g, pick(["home visit", "school visit", "video"]))
      .replace(/\{\{task_title\}\}/g, "Prepare for the home visit")
      .replace(/\{\{channel\}\}/g, tpl.channel);
    const reason =
      state === "Suppressed"
        ? pick([
            "No authorised recipient: the contact's authority isn't verified.",
            "Daily cap reached (2 a day to the same person).",
            "The patient hasn't consented to this kind of contact.",
          ])
        : state === "Failed"
          ? tpl.channel === "SMS"
            ? "No mobile number on file (simulated failure)."
            : "Mailbox rejected the message (simulated failure)."
          : state === "Awaiting Approval"
            ? "Suggest Only: a person approves before it's sent."
            : state === "Queued"
              ? "Held for quiet hours (20:00 to 07:30)."
              : "";
    const history: OpsMessageDoc["history"] = [{ at, state: "Queued", note: "Queued" }];
    if (state === "Delivered")
      history.push(
        { at, state: "Sent", note: "Sent (simulated: nothing left the system)" },
        { at: new Date(at.getTime() + 40_000), state: "Delivered", note: "Delivered (simulated)" },
      );
    if (state === "Failed" || state === "Suppressed") history.push({ at, state, note: reason });
    messages.push({
      _id: new ObjectId(),
      ref: "",
      key: `sample:${i}`,
      template: tpl.id,
      templateVersion: tpl.version,
      category: tpl.category,
      recipientType: rand() < 0.75 ? "Patient" : rand() < 0.5 ? "Guardian" : "Support Coordinator",
      recipient: c.name,
      authority:
        state === "Suppressed" && reason.startsWith("No authorised")
          ? "Missing authority"
          : "Verified",
      channel: tpl.channel,
      subject: tpl.subject.replace(/\{\{referral_number\}\}/g, `REF-${c.mrn ?? "MRN"}`),
      body,
      missing: [],
      state,
      reason,
      attempts: state === "Delivered" || state === "Failed" ? 1 : 0,
      related: { label: `Participant ${c.name}`, href: `/care/${c._id.toHexString()}` },
      taskId: null,
      clientId: c._id,
      history,
      createdAt: at,
    });
  }
  messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const msgBase =
    ((
      await counter.findOneAndUpdate(
        { _id: "opsMessage" },
        { $inc: { seq: msgTotal } },
        { upsert: true, returnDocument: "after" },
      )
    )?.seq ?? msgTotal) - msgTotal;
  messages.forEach((m, i) => (m.ref = `MSG-${String(msgBase + i + 1).padStart(5, "0")}`));
  await opsMessages.insertMany(messages);

  const approvals: OpsApprovalDoc[] = [];
  const approverNames = ["Neil Hensley", "Helen Brooks", "Marco Silva", "Morgan Blake"];
  for (let i = 0; i < 48; i += 1) {
    const workflow = pick(approvalWorkflows);
    const t = pick(tasks);
    const at = new Date(now - rand() * 25 * day);
    const status: ApprovalStatus =
      at.getTime() > now - 2 * day && rand() < 0.6
        ? "Pending"
        : pick(["Approved", "Approved", "Approved", "Rejected", "Changes requested"] as const);
    const decider =
      workflow === "Clinical-risk referral" || workflow === "Telehealth recording review"
        ? "Helen Brooks"
        : workflow === "Billing adjustment"
          ? "Morgan Blake"
          : pick(approverNames);
    approvals.push({
      _id: new ObjectId(),
      ref: "",
      key: `sample:${i}`,
      workflow,
      title: `${workflow}: ${t.participant ?? ""}`,
      reason: pick([
        "Past the SLA in business hours",
        "Rule run needs a named decision",
        "Travel over 60 minutes each way",
        "Payer details disagree with the plan",
        "Requested a lower-ranked clinician for continuity of care",
        "Recording requested for supervision",
      ]),
      initiator: pick(["Automation AUT-16", "Jo Marsh", "Sam Rivera", "Automation AUT-03"]),
      status,
      slaHours: workflow === "Clinical-risk referral" ? 4 : 16,
      related: { label: `${t.related.kind} ${t.related.ref}`, href: t.related.href },
      taskId: t._id,
      ruleId: null,
      restricted:
        workflow === "Clinical-risk referral" || workflow === "Telehealth recording review",
      comments:
        rand() < 0.3
          ? [
              {
                by: "Jo Marsh",
                text: "Family prefers mornings; noted on the task.",
                at: new Date(at.getTime() + 2 * hour),
              },
            ]
          : [],
      decisions:
        status === "Pending"
          ? []
          : [
              {
                by: decider,
                decision: status,
                note:
                  status === "Approved" ? "Reviewed and agreed." : "Needs the updated plan first.",
                at: new Date(at.getTime() + (2 + rand() * 20) * hour),
              },
            ],
      createdAt: at,
      updatedAt: at,
    });
  }
  approvals.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const aprBase =
    ((
      await counter.findOneAndUpdate(
        { _id: "opsApproval" },
        { $inc: { seq: approvals.length } },
        { upsert: true, returnDocument: "after" },
      )
    )?.seq ?? approvals.length) - approvals.length;
  approvals.forEach((a, i) => (a.ref = `APR-${String(aprBase + i + 1).padStart(4, "0")}`));
  await opsApprovals.insertMany(approvals);

  await flags.updateOne({ _id: "opsVolume" }, { $set: { at: new Date() } }, { upsert: true });
}
