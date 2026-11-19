import "server-only";
import { ObjectId } from "mongodb";
import type { Proposal, SourceDoc } from "@/lib/live/agent";
import type { PortalDto } from "@/lib/live/portal";
import { propose, registerTool, retrieve, sourcesFor } from "./agent";
import { collections } from "./db";
import type { ClientDoc, UserDoc } from "./models";
import { insertTask } from "./operations";
import { careTask, portalAction } from "./portal";

/*
 * Patient, caregiver and therapist tools on the shared agent contract (spec v2.0 §5, §6):
 * each is proposed in chat as a card and runs only when the signed-in person confirms it.
 */

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const bne = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Brisbane",
  }).format(new Date(iso));

async function clientOf(id: unknown) {
  const { clients } = await collections();
  const c = ObjectId.isValid(s(id)) ? await clients.findOne({ _id: new ObjectId(s(id)) }) : null;
  if (!c) throw new Error("The patient record wasn't found.");
  return c;
}

registerTool("PortalChange", async (u, a) => {
  await portalAction(u, {
    type: "change",
    appointmentId: s(a.appointmentId),
    kind: s(a.kind) === "Cancel" ? "Cancel" : "Change",
    reason: s(a.reason).slice(0, 400) || "Requested in chat",
    acknowledge: true,
  });
  return `${s(a.kind) === "Cancel" ? "Cancellation" : "Change"} request sent to the scheduling team for ${s(a.label)}`;
});

registerTool("PortalBooking", async (u, a) => {
  await portalAction(u, {
    type: "booking",
    service: s(a.service),
    mode: s(a.mode) === "Telehealth" ? "Telehealth" : "Home",
    window: s(a.window) || "Next available",
    purpose: s(a.purpose).slice(0, 300),
    address: s(a.address).slice(0, 200),
    siteContact: "",
    otherLocation: "",
    device: s(a.mode) === "Telehealth" ? "Phone" : "",
  });
  return `Booking request for ${s(a.service)} sent; the team will offer real times`;
});

registerTool("AcknowledgePlan", async (u, a) => {
  await portalAction(u, { type: "acknowledge", planId: s(a.planId), version: Number(a.version) });
  return `Plan version ${s(a.version)} acknowledged`;
});

registerTool("MessageCareTeam", async (_u, a) => {
  const c = await clientOf(a.clientId);
  await careTask(c, s(a.planId), "Clinical Follow-up", s(a.title).slice(0, 160), "Normal");
  return `Sent to ${s(a.clinician)}'s follow-up list`;
});

registerTool("CareTask", async (_u, a) => {
  const c = await clientOf(a.clientId);
  await careTask(c, "", "Clinical Follow-up", s(a.title).slice(0, 160), "Normal");
  return `Follow-up task added for ${c.name}`;
});

registerTool("CorrectionRequest", async (u, a) => {
  const c = await clientOf(a.clientId);
  const { task } = await insertTask(u, {
    title: `Correction request: ${s(a.title)}`.slice(0, 160),
    category: "Documentation",
    status: "New",
    priority: "Normal",
    urgentReason: "",
    team: "Clinical",
    assigneeId: null,
    assigneeName: null,
    related: {
      kind: "Participant",
      ref: c.mrn ?? c.name,
      label: c.name,
      href: `/care/${c._id.toHexString()}`,
    },
    clientId: c._id,
    referralId: null,
    appointmentId: null,
    participant: c.name,
    service: null,
    discipline: null,
    locationType: null,
    dueAt: new Date(Date.now() + 3 * 86_400_000),
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
    note: s(a.detail).slice(0, 600) || undefined,
    historyNote: "Raised from the clinical copilot; the approved record stays until amended",
  });
  return `Correction request ${task?.ref ?? ""} sent to the record owner; the approved record is unchanged`;
});

const CANCEL = /\b(cancel|can'?t make|cannot make|won'?t make)\b/i;
const MOVE = /\b(reschedul|move|change (my|the) (visit|appointment|time)|different (day|time))/i;
const BOOK =
  /\b(book|another (visit|appointment|session)|new (visit|appointment)|make an appointment)\b/i;
const PLAN = /\b(plan (change|update)|what changed|changed in my plan|new (plan|version))\b/i;
const WHO =
  /\b(who (should|do|can) i (talk|ask|speak|message)|which (therapist|clinician)|ask my|tell my|message my)\b/i;

/** Proposals and approved sources for a patient or caregiver chat turn. */
export async function patientProposals(
  u: UserDoc,
  c: ClientDoc,
  p: PortalDto,
  text: string,
  audience: "Patient" | "Caregiver",
): Promise<{ proposals: Proposal[]; sourceDocs: SourceDoc[]; note: string }> {
  const out: Proposal[] = [];
  let note = "";
  const ids: string[] = [];
  const next = p.appointments.find((x) => x.status === "Upcoming");
  const day = new Date().toISOString().slice(0, 10);
  if ((CANCEL.test(text) || MOVE.test(text)) && next) {
    const kind = CANCEL.test(text) ? "Cancel" : "Change";
    const hours = (new Date(next.start).getTime() - Date.now()) / 3_600_000;
    ids.push("SRC-CANCEL");
    note = `Your next visit is ${next.service} with ${next.clinician}, ${bne(next.start)}. ${kind === "Cancel" ? "I can send a cancellation request" : "I can ask the team to move it"}; staff confirm any new time.${hours < 24 ? " It's less than 24 hours away, so a late-cancellation fee may apply under your agreement." : ""}`;
    out.push(
      await propose(u, audience === "Patient" ? "P-CHG" : "C-CHG", {
        tool: "PortalChange",
        title: `${kind === "Cancel" ? "Cancel" : "Reschedule"} ${next.service} on ${bne(next.start)}`,
        record: { label: `Visit ${next.ref}`, href: null },
        before: `Booked · ${bne(next.start)} · ${next.mode}`,
        after: `${kind === "Cancel" ? "Cancellation" : "Change"} request sent to scheduling`,
        preconditions: [
          { label: "Visit is still upcoming", ok: true },
          {
            label:
              hours >= 24
                ? "More than 24 hours' notice"
                : "Late notice acknowledged (fee may apply)",
            ok: true,
          },
        ],
        approver: audience === "Patient" ? "You" : "You, as authorised caregiver",
        args: { appointmentId: next.id, kind, reason: text, label: next.ref },
        idemKey: `PCHG:${next.id}:${kind}`,
      }),
    );
  } else if (BOOK.test(text)) {
    const plan = p.plans[0];
    const service = plan?.service ?? "Occupational therapy";
    const tele = /\b(video|telehealth|online)\b/i.test(text);
    ids.push("SRC-SCHED", "SRC-SERVICES");
    note = `I can send a booking request for ${service}. The team replies with real open times; nothing is booked until you confirm one.`;
    out.push(
      await propose(u, "P-BOOK", {
        tool: "PortalBooking",
        title: `Request a ${tele ? "telehealth" : "home"} visit for ${service}`,
        record: { label: "Booking requests", href: null },
        before: "No request",
        after: "Request sent to the scheduling team",
        preconditions: [
          {
            label: tele ? "Telehealth chosen" : "Home address on file",
            ok: tele || Boolean(p.profile.address),
          },
        ],
        approver: "You",
        args: {
          service,
          mode: tele ? "Telehealth" : "Home",
          window: "Next available",
          purpose: text,
          address: p.profile.address,
        },
        idemKey: `PBOOK:${c._id.toHexString()}:${day}`,
      }),
    );
  } else if (PLAN.test(text) && p.plans.length) {
    const plan = p.plans[0];
    if (plan) {
      const { plans } = await collections();
      const doc = ObjectId.isValid(plan.id)
        ? await plans.findOne({ _id: new ObjectId(plan.id) })
        : null;
      const review = doc?.reviews.at(-1);
      note = `Your ${plan.service} plan is version ${plan.version}${doc?.approved ? `, approved by ${doc.approved.byName}` : ""}. ${review ? `The latest review says: "${review.notes}".` : "No change reason was recorded for this version, so I can't say exactly what changed; your clinician can explain."} It has ${plan.goals.length} goal(s) and ${plan.activities.length} home activit${plan.activities.length === 1 ? "y" : "ies"}.`;
      if (!plan.acknowledged)
        out.push(
          await propose(u, "P-PLAN", {
            tool: "AcknowledgePlan",
            title: `Acknowledge plan version ${plan.version}`,
            record: { label: `${plan.service} plan`, href: null },
            before: "Not yet acknowledged",
            after: `Version ${plan.version} acknowledged`,
            preconditions: [{ label: "This is the current approved version", ok: true }],
            approver: "You",
            args: { planId: plan.id, version: plan.version },
            idemKey: `PPLAN:${plan.id}:${plan.version}`,
          }),
        );
    }
  } else if (WHO.test(text) && p.plans.length) {
    const words = text.toLowerCase();
    const plan =
      p.plans.find((x) =>
        x.service
          .toLowerCase()
          .split(/\W+/)
          .some((w) => w.length > 3 && words.includes(w)),
      ) ??
      p.plans.find((x) => /\b(ot|occupational)\b/i.test(text) && /occupational/i.test(x.service)) ??
      p.plans[0];
    if (plan) {
      ids.push("SRC-SERVICES");
      note = `For ${plan.service}, your clinician is ${plan.clinician}. I can send your question to them; they reply in Messages.`;
      out.push(
        await propose(u, "P-NAV", {
          tool: "MessageCareTeam",
          title: `Send your question to ${plan.clinician}`,
          record: { label: `${plan.service} plan`, href: null },
          before: "Not sent",
          after: `On ${plan.clinician}'s follow-up list`,
          preconditions: [
            { label: `${plan.clinician} is your current ${plan.service} clinician`, ok: true },
          ],
          approver: "You",
          args: {
            clientId: c._id.toHexString(),
            planId: plan.id,
            clinician: plan.clinician,
            title: `Patient question (${audience.toLowerCase()}): ${text}`,
          },
          idemKey: `PNAV:${plan.id}:${text.toLowerCase().slice(0, 60)}`,
        }),
      );
    }
  }
  const sourceDocs = [...sourcesFor(ids, audience), ...retrieve(text, audience, 2)].filter(
    (x, i, all) => all.findIndex((y) => y.id === x.id) === i,
  );
  return { proposals: out, sourceDocs, note };
}

const CORRECT = /\b(correct|wrong|incorrect|error|out of date|mistake)\b/i;
const FOLLOW = /\b(book|schedule|follow.?up visit|next visit)\b/i;

/** Proposals and approved sources for a therapist copilot turn. */
export async function copilotProposals(
  u: UserDoc,
  c: ClientDoc,
  text: string,
  proposedTask: string | null,
): Promise<{ proposals: Proposal[]; sourceDocs: SourceDoc[] }> {
  const out: Proposal[] = [];
  const id = c._id.toHexString();
  const ids: string[] = [];
  if (CORRECT.test(text)) {
    ids.push("SRC-CORRECT");
    out.push(
      await propose(u, "T-CORR", {
        tool: "CorrectionRequest",
        title: `Request a record correction for ${c.name}`,
        record: { label: c.name, href: `/care/${id}` },
        before: "Approved record unchanged",
        after: "Correction request with the record owner",
        preconditions: [{ label: "Approved record stays until amended", ok: true }],
        approver: u.name,
        args: { clientId: id, title: text.slice(0, 120), detail: text },
        idemKey: `TCORR:${id}:${text.toLowerCase().slice(0, 60)}`,
      }),
    );
  }
  if (FOLLOW.test(text)) {
    ids.push("SRC-SCHED");
    out.push(
      await propose(u, "T-BOOK", {
        tool: "CareTask",
        title: `Book a follow-up visit for ${c.name}`,
        record: { label: c.name, href: `/care/${id}` },
        before: "No follow-up requested",
        after: "Follow-up task on your list; scheduling offers real slots",
        preconditions: [{ label: "Patient has an active service", ok: c.needs.length > 0 }],
        approver: u.name,
        args: { clientId: id, title: `Book follow-up visit: ${c.name}` },
        idemKey: `TBOOK:${id}:${new Date().toISOString().slice(0, 10)}`,
      }),
    );
  }
  if (proposedTask && !out.length)
    out.push(
      await propose(u, "T-TASK", {
        tool: "CareTask",
        title: proposedTask,
        record: { label: c.name, href: `/care/${id}` },
        before: "No task",
        after: "Task on your follow-up list",
        preconditions: [],
        approver: u.name,
        args: { clientId: id, title: proposedTask },
        idemKey: `TTASK:${id}:${proposedTask.toLowerCase().slice(0, 60)}`,
      }),
    );
  const sourceDocs = [...sourcesFor(ids, "Therapist"), ...retrieve(text, "Therapist", 2)].filter(
    (x, i, all) => all.findIndex((y) => y.id === x.id) === i,
  );
  return { proposals: out, sourceDocs };
}
