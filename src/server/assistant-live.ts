import "server-only";
import type { ObjectId } from "mongodb";
import { findTopics, productTopics } from "@/lib/knowledge/product";
import { money } from "@/lib/live/clinical";
import { slotLabel, relativeTime } from "@/lib/live/time";
import { collections } from "./db";
import { stageOf } from "./dto";
import type { ClientDoc, UserDoc } from "./models";

/**
 * Ask Medisense's tools for the live product. Each reads the database as the signed-in person
 * would see it: therapists only their patients, operations staff statuses but no clinical content,
 * Finance the invoices. No tool changes anything.
 */

type Item = { label: string; detail: string; href: string };
type Result = { summary: string; items: Item[]; note?: string };

const isLead = (u: UserDoc) =>
  Boolean(u.staffRoles?.some((r) => r === "Clinical Lead" || r === "Super Admin"));
const isFinance = (u: UserDoc) =>
  Boolean(u.staffRoles?.some((r) => r === "Finance" || r === "Super Admin"));
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const str = (input: Record<string, unknown>, key: string) => {
  const v = input[key];
  return typeof v === "string" && v.trim() ? v.trim() : "";
};

function guide(input: Record<string, unknown>): Result {
  const q = str(input, "question") || str(input, "topic");
  const topics = q ? findTopics(q, 3) : [];
  const chosen = topics.length ? topics : productTopics.filter((t) => t.id === "lifecycle");
  return {
    summary: chosen.map((t) => `${t.title}: ${t.summary}`).join("\n\n"),
    items: chosen.flatMap((t) => [
      ...t.steps.map((s) => ({ label: s.label, detail: s.detail, href: s.href ?? "" })),
      ...t.rules.map((r) => ({ label: "Rule", detail: r, href: "" })),
    ]),
    note: `Other topics: ${productTopics.map((t) => t.title).join("; ")}`,
  };
}

/** The patients this person may see. */
async function visiblePatients(user: UserDoc): Promise<ClientDoc[]> {
  const { clients } = await collections();
  if (user.role === "admin") return clients.find().sort({ createdAt: -1 }).limit(300).toArray();
  if (user.role === "therapist" && user.therapistId) {
    return clients
      .find({ "needs.therapistId": user.therapistId })
      .sort({ createdAt: -1 })
      .toArray();
  }
  return [];
}

const patientHref = (user: UserDoc, id: ObjectId) =>
  user.role === "admin" ? `/care/${id.toHexString()}` : `/therapist/patients/${id.toHexString()}`;

async function overview(user: UserDoc): Promise<Result> {
  const db = await collections();
  const patients = await visiblePatients(user);
  const ids = patients.map((p) => p._id);
  const now = new Date();
  const dayStart = new Date(
    new Date(now.getTime() + 36e6).toISOString().slice(0, 10) + "T00:00:00+10:00",
  );
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const visitFilter =
    user.role === "therapist" ? { therapistId: user.therapistId! } : { clientId: { $in: ids } };
  const [today, notes, assessments, referrals, invoices] = await Promise.all([
    db.appointments.countDocuments({
      ...visitFilter,
      status: { $in: ["booked", "completed"] },
      start: { $gte: dayStart, $lt: dayEnd },
    }),
    db.appointments.countDocuments({
      ...visitFilter,
      status: "completed",
      $or: [{ note: { $in: [null] } }, { "note.status": { $in: ["Draft", "Pending Signature"] } }],
    }),
    db.assessments.countDocuments({
      ...(user.role === "therapist" ? { therapistId: user.therapistId! } : {}),
      status: "Awaiting Review",
    }),
    user.role === "admin"
      ? db.referrals
          .aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }])
          .toArray()
      : Promise.resolve([]),
    user.role === "admin" && isFinance(user)
      ? db.invoices
          .aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }])
          .toArray()
      : Promise.resolve([]),
  ]);
  const stages = new Map<string, number>();
  for (const p of patients) stages.set(stageOf(p), (stages.get(stageOf(p)) ?? 0) + 1);
  const items: Item[] = [
    {
      label: "Patients",
      detail: [...stages].map(([s, n]) => `${n} ${s.toLowerCase()}`).join(", ") || "None",
      href: user.role === "admin" ? "/care" : "/therapist",
    },
    {
      label: "Visits today",
      detail: String(today),
      href: user.role === "admin" ? "/care" : "/therapist",
    },
    {
      label: "Notes to write or sign",
      detail: String(notes),
      href: user.role === "admin" ? "/care" : "/therapist",
    },
    { label: "Assessments awaiting Clinical Lead review", detail: String(assessments), href: "" },
  ];
  if (referrals.length)
    items.unshift({
      label: "Referrals by status",
      detail: referrals.map((r) => `${r._id}: ${r.n}`).join(", "),
      href: "/care/referrals",
    });
  if (invoices.length)
    items.push({
      label: "Invoices by status",
      detail: invoices.map((r) => `${r._id}: ${r.n}`).join(", "),
      href: "/care/billing",
    });
  return {
    summary: `Live records as ${user.name} (${user.role === "admin" ? (user.staffRoles ?? []).join(", ") || "admin" : user.role}).`,
    items,
  };
}

async function referralList(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  if (user.role !== "admin")
    return { summary: "Referrals are handled by the intake team.", items: [] };
  const { referrals } = await collections();
  const status = str(input, "status");
  const q = norm(str(input, "query"));
  const rows = await referrals
    .find(status ? { status: status as never } : {})
    .sort({ updatedAt: -1 })
    .limit(60)
    .toArray();
  const items = rows
    .filter(
      (r) =>
        !q ||
        norm(
          `${r.reference} ${r.data.participant.firstName} ${r.data.participant.lastName}`,
        ).includes(q),
    )
    .map((r) => ({
      label: `${r.data.participant.firstName} ${r.data.participant.lastName} · ${r.reference}`,
      detail: `${r.status}; ${r.data.supports.map((s) => s.support).join(", ")}; ${r.data.funding.source}${r.data.clinical.knownRisk !== "No" || r.data.clinical.behaviours !== "No" ? "; risk review" : ""}${r.gaps.length ? `; ${r.gaps.length} items to confirm` : ""}${r.owner ? `; owner ${r.owner.name}` : "; unassigned"}; updated ${relativeTime(r.updatedAt.toISOString())}`,
      href: `/care/referrals/${r._id.toHexString()}`,
    }));
  return {
    summary: `${items.length} referral${items.length === 1 ? "" : "s"}${status ? ` in ${status}` : ""}.`,
    items,
  };
}

async function patientList(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  const q = norm(str(input, "query"));
  const { therapists } = await collections();
  const names = new Map(
    (await therapists.find({}, { projection: { name: 1 } }).toArray()).map((t) => [
      t._id.toHexString(),
      t.name,
    ]),
  );
  const items = (await visiblePatients(user))
    .filter((p) => !q || norm(`${p.name} ${p.suburb}`).includes(q))
    .map((p) => ({
      label: p.name,
      detail: `${stageOf(p)}; ${p.suburb}, ${p.region}; ${p.funding}; ${p.needs.map((n) => `${n.support} (${n.therapistId ? names.get(n.therapistId.toHexString()) : "no clinician yet"})`).join(", ")}`,
      href: patientHref(user, p._id),
    }));
  return { summary: `${items.length} patient${items.length === 1 ? "" : "s"} you can see.`, items };
}

async function patient(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  const name = norm(str(input, "name"));
  const p = (await visiblePatients(user)).find((x) => norm(x.name).includes(name));
  if (!p)
    return { summary: `No patient matching "${str(input, "name")}" that you can see.`, items: [] };
  const db = await collections();
  const clinical = user.role === "therapist" || isLead(user);
  const [visits, assessments, plans, invoices, therapists] = await Promise.all([
    db.appointments
      .find({ clientId: p._id, status: { $ne: "tentative" } })
      .sort({ start: 1 })
      .toArray(),
    db.assessments.find({ clientId: p._id }).sort({ createdAt: -1 }).toArray(),
    db.plans.find({ clientId: p._id }).sort({ createdAt: -1 }).toArray(),
    user.role === "admin" && isFinance(user)
      ? db.invoices.find({ clientId: p._id }).toArray()
      : Promise.resolve([]),
    db.therapists.find({}, { projection: { name: 1 } }).toArray(),
  ]);
  const tName = (id: ObjectId | null) =>
    (id ? therapists.find((t) => t._id.equals(id))?.name : null) ?? "no clinician yet";
  const now = Date.now();
  const next = visits.filter((v) => v.status === "booked" && v.start.getTime() > now).slice(0, 3);
  const items: Item[] = [
    ...p.needs.map((n) => {
      const a = assessments.find((x) => x.needId === n.id);
      const plan = plans.find((x) => x.needId === n.id);
      return {
        label: n.support,
        detail: `${n.status === "assigned" ? "Active" : n.status === "completed" ? "Completed" : n.status === "waiting" ? "Clinician suggested" : "Awaiting clinician"} with ${tName(n.therapistId)}; ${n.frequency}, ${n.location ?? "Home"}; assessment ${a?.status ?? "not started"}${a?.recommendation.decision ? ` (${a.recommendation.decision})` : ""}; plan ${plan?.status ?? "none"}${clinical && plan ? `; goals: ${plan.goals.map((g) => `${g.description} — now ${g.current || g.baseline}, target ${g.target}`).join("; ")}` : ""}`,
        href: patientHref(user, p._id),
      };
    }),
    {
      label: "Next visits",
      detail:
        next
          .map((v) => `${slotLabel(v.start.toISOString())} (${v.modality ?? "In person"})`)
          .join("; ") || "None booked",
      href: patientHref(user, p._id),
    },
    {
      label: "Visit record",
      detail: `${visits.filter((v) => v.status === "completed").length} attended, ${visits.filter((v) => v.status === "no-show").length} did not attend, ${visits.filter((v) => v.status === "late-cancelled").length} late cancellations, ${visits.filter((v) => v.status === "completed" && (!v.note || v.note.status === "Draft" || v.note.status === "Pending Signature")).length} notes unsigned`,
      href: "",
    },
  ];
  if (p.precautions) items.unshift({ label: "Precaution", detail: p.precautions, href: "" });
  if (invoices.length)
    items.push({
      label: "Invoices",
      detail: invoices
        .map((i) => `${i.number} ${i.status} ${money(i.lines.reduce((s, l) => s + l.amount, 0))}`)
        .join("; "),
      href: "/care/billing",
    });
  if (p.discharged)
    items.push({
      label: "Discharged",
      detail: `${p.discharged.reason}${p.discharged.outcomes ? `; outcomes: ${p.discharged.outcomes}` : ""}`,
      href: "",
    });
  return {
    summary: `${p.name}: ${stageOf(p)}, ${p.suburb}, ${p.funding}.${clinical ? "" : " Clinical content is limited to the treating clinician and Clinical Leads."}`,
    items,
  };
}

async function myWork(user: UserDoc): Promise<Result> {
  const db = await collections();
  const items: Item[] = [];
  if (user.role === "therapist" && user.therapistId) {
    const id = user.therapistId;
    const now = new Date();
    const [pending, toRecord, unsigned, drafts, reviews] = await Promise.all([
      db.assignments.countDocuments({ therapistId: id, status: "pending" }),
      db.appointments.countDocuments({ therapistId: id, status: "booked", start: { $lt: now } }),
      db.appointments.countDocuments({
        therapistId: id,
        status: "completed",
        $or: [
          { note: { $in: [null] } },
          { "note.status": { $in: ["Draft", "Pending Signature"] } },
        ],
      }),
      db.assessments.countDocuments({ therapistId: id, status: { $in: ["Draft", "In Progress"] } }),
      db.plans.countDocuments({
        therapistId: id,
        status: "Active",
        reviewDate: { $lte: new Date(now.getTime() + 36e6).toISOString().slice(0, 10) },
      }),
    ]);
    items.push(
      { label: "New patient requests to answer", detail: String(pending), href: "/therapist" },
      {
        label: "Past visits to record (check in/out or did not attend)",
        detail: String(toRecord),
        href: "/therapist",
      },
      { label: "Notes to write or sign", detail: String(unsigned), href: "/therapist" },
      { label: "Assessments in progress", detail: String(drafts), href: "/therapist" },
      { label: "Plans due for review", detail: String(reviews), href: "/therapist" },
    );
  } else if (user.role === "admin") {
    const [intake, info, triage, funding, unmatched, aborted, toReview] = await Promise.all([
      db.referrals.countDocuments({ status: "Under Admin Review" }),
      db.referrals.countDocuments({ status: "Needs Information" }),
      db.referrals.countDocuments({ status: "Clinical Triage" }),
      db.referrals.countDocuments({ status: "Funding Review" }),
      db.clients.countDocuments({ "needs.status": "needs-therapist", discharged: { $in: [null] } }),
      db.appointments.countDocuments({ status: "aborted", replaces: { $exists: false } }),
      db.invoices.countDocuments({
        status: { $in: ["Draft", "Ready for Review", "Approved", "Disputed"] },
      }),
    ]);
    items.push(
      { label: "Referrals in intake review", detail: String(intake), href: "/care/referrals" },
      { label: "Waiting on submitters", detail: String(info), href: "/care/referrals" },
      {
        label: `Clinical triage${isLead(user) ? " (yours to decide)" : " (for a Clinical Lead)"}`,
        detail: String(triage),
        href: "/care/referrals",
      },
      { label: "Funding and consent to record", detail: String(funding), href: "/care/referrals" },
      {
        label: "Patients with a service awaiting a clinician",
        detail: String(unmatched),
        href: "/care",
      },
      { label: "Incomplete visits to rebook", detail: String(aborted), href: "/care" },
    );
    if (isFinance(user))
      items.push({
        label: "Invoices to review, issue or resolve",
        detail: String(toReview),
        href: "/care/billing",
      });
  }
  return {
    summary: `What needs ${user.name.split(" ")[0]}'s attention in the live system.`,
    items,
  };
}

async function invoiceList(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  if (!(user.role === "admin" && isFinance(user)))
    return { summary: "Invoices are visible to Finance only.", items: [] };
  const db = await collections();
  const status = str(input, "status");
  const rows = await db.invoices
    .find(status ? { status: status as never } : {})
    .sort({ updatedAt: -1 })
    .limit(40)
    .toArray();
  const clients = await db.clients
    .find({ _id: { $in: rows.map((r) => r.clientId) } }, { projection: { name: 1 } })
    .toArray();
  return {
    summary: `${rows.length} invoice${rows.length === 1 ? "" : "s"}${status ? ` ${status}` : ""}.`,
    items: rows.map((i) => {
      const total = i.lines.reduce((s, l) => s + l.amount, 0);
      const paid = i.payments.reduce((s, p) => s + p.amount, 0);
      return {
        label: `${i.number} · ${clients.find((c) => c._id.equals(i.clientId))?.name ?? "Patient"}`,
        detail: `${i.status}; ${money(total)} to ${i.payer}; ${money(total - paid)} owing; ${i.lines.length} lines`,
        href: `/care/billing/${i._id.toHexString()}`,
      };
    }),
  };
}

const prop = (description: string) => ({ type: "string", description });

export type LiveTool = {
  name: string;
  description: string;
  run: (input: Record<string, unknown>) => Promise<Result>;
};

/** The live tools for this person. Signed-out visitors get the product guide only. */
export function liveTools(user: UserDoc | null): LiveTool[] {
  const tools: {
    name: string;
    description: string;
    properties: Record<string, unknown>;
    run: (input: Record<string, unknown>) => Promise<Result> | Result;
  }[] = [
    {
      name: "product_guide",
      description:
        "How Medisense works: the patient lifecycle, referrals, triage, matching, assessments, plans, visits, SOAP notes, telehealth and recordings, billing, discharge, the patient app, roles and privacy, and what AI does. Use for any how/what/why question about the product.",
      properties: { question: prop("The question or topic, in words") },
      run: guide,
    },
  ];
  if (user && user.role !== "client") {
    tools.push(
      {
        name: "live_overview",
        description:
          "Counts from the live system for the signed-in person: patients by stage, visits today, notes to sign, assessments awaiting review, referrals and invoices by status (when allowed).",
        properties: {},
        run: () => overview(user),
      },
      {
        name: "live_my_work",
        description:
          "What needs the signed-in person's attention now: requests, visits to record, notes to sign, assessments, plan reviews; or intake, triage, funding, matching, rebooking and invoices for admins.",
        properties: {},
        run: () => myWork(user),
      },
      {
        name: "live_referrals",
        description:
          "Live referrals with status, supports, funding, risk flag, items to confirm and owner. Statuses: Submitted, Needs Information, Under Admin Review, Clinical Triage, Funding Review, Waitlisted, Accepted, Declined, Withdrawn, Closed.",
        properties: {
          status: prop("Optional exact status"),
          query: prop("Optional name or reference"),
        },
        run: (i) => referralList(user, i),
      },
      {
        name: "live_patients",
        description:
          "Live patients the person may see, with stage, region, funding and each service's clinician.",
        properties: { query: prop("Optional name or suburb") },
        run: (i) => patientList(user, i),
      },
      {
        name: "live_patient",
        description:
          "One live patient: services and clinicians, assessment and plan status, goals (clinicians only), next visits, attendance, unsigned notes, precautions, invoices (Finance) and discharge.",
        properties: { name: prop("Patient name, or part of it") },
        run: (i) => patient(user, i),
      },
      {
        name: "live_invoices",
        description: "Live invoices (Finance only): status, total, payer, amount owing.",
        properties: {
          status: prop(
            "Optional: Draft, Ready for Review, Approved, Issued, Partially Paid, Paid, Disputed, Adjusted, Voided",
          ),
        },
        run: (i) => invoiceList(user, i),
      },
    );
  }
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    run: async (input: Record<string, unknown>) => {
      const r = await t.run(input);
      return { ...r, items: r.items.slice(0, 20) };
    },
  }));
}

/** True when the question names a live patient this person can see. */
export async function mentionsLivePatient(user: UserDoc | null, question: string) {
  if (!user || user.role === "client") return false;
  const q = question.toLowerCase();
  return (await visiblePatients(user)).some((p) =>
    p.name
      .split(" ")
      .some((part) => part.length > 2 && new RegExp(`\\b${part.toLowerCase()}\\b`).test(q)),
  );
}

/**
 * Records first: which live tools a question needs, run before the one model call. The product
 * guide always comes along, so "how" questions are answered from the documented behaviour.
 */
export async function liveRecords(user: UserDoc | null, question: string) {
  const q = question.toLowerCase();
  const tools = liveTools(user);
  const calls: { name: string; input: Record<string, unknown> }[] = [
    { name: "product_guide", input: { question } },
  ];
  if (user && user.role !== "client") {
    if (
      /my work|today|attention|priorit|to do|todo|what should i|need(s)? (me|action)|outstanding|waiting/.test(
        q,
      )
    )
      calls.push({ name: "live_my_work", input: {} });
    if (/how many|overview|summary|status|this week|numbers|count/.test(q))
      calls.push({ name: "live_overview", input: {} });
    if (/referral|intake|triage|waitlist|msr-|needs information/.test(q))
      calls.push({ name: "live_referrals", input: {} });
    if (/invoice|bill|paid|owing|dispute|payment/.test(q))
      calls.push({ name: "live_invoices", input: {} });
    if (/patients|caseload|who is|which patient/.test(q))
      calls.push({ name: "live_patients", input: {} });
    const named = (await visiblePatients(user)).find((p) =>
      p.name
        .split(" ")
        .some((part) => part.length > 2 && new RegExp(`\\b${part.toLowerCase()}\\b`).test(q)),
    );
    if (named) calls.push({ name: "live_patient", input: { name: named.name } });
  }
  return Promise.all(
    calls.map(async (c) => ({
      tool: c.name,
      input: c.input,
      result: await (tools.find((t) => t.name === c.name)?.run(c.input) ??
        Promise.resolve({ summary: "Not available", items: [] })),
    })),
  );
}
