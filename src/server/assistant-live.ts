import "server-only";
import type { ObjectId } from "mongodb";
import { can } from "./permissions";
import { findTopics, productTopics } from "@/lib/knowledge/product";
import { money } from "@/lib/live/clinical";
import { slotLabel, relativeTime } from "@/lib/live/time";
import { collections } from "./db";
import { invoiceTotals } from "./finance";
import { stageOf } from "./dto";
import type { ClientDoc, TherapistDoc, UserDoc } from "./models";
import { statusOf } from "./participants";
import { forViewer, scheduleBoard } from "./scheduling";
import { staffBlocks } from "./staff";

/**
 * Ask Medisense's tools for the live product. Each reads the database as the signed-in person
 * would see it: therapists only their patients, operations staff statuses but no clinical content,
 * Finance the invoices. No tool changes anything.
 */

type Item = { label: string; detail: string; href: string };
type Result = { summary: string; items: Item[]; note?: string };

/** Who decides clinical triage: the referrals.triage permission. */
const isLead = (u: UserDoc) => can(u, "referrals.triage");
/** Who sees billing: the finance.work permission. */
const isFinance = (u: UserDoc) => can(u, "finance.work");
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
  // "Who needs a therapist?" must list only the waiting services: in the full list they are lost.
  const waiting = str(input, "focus") === "waiting";
  const open = (n: { status: string; therapistId: unknown }) =>
    n.status === "needs-therapist" || !n.therapistId;
  const items = (await visiblePatients(user))
    .filter((p) => !q || norm(`${p.name} ${p.suburb}`).includes(q))
    .filter((p) => !waiting || p.needs.some(open))
    .map((p) => ({
      label: p.name,
      detail: waiting
        ? `${p.needs
            .filter(open)
            .map((n) => n.support)
            .join(
              ", ",
            )} waiting for a therapist; ${stageOf(p)}; ${p.suburb}, ${p.region}; ${p.funding}`
        : `${stageOf(p)}; ${p.suburb}, ${p.region}; ${p.funding}; ${p.needs.map((n) => `${n.support} (${n.therapistId ? names.get(n.therapistId.toHexString()) : "no clinician yet"})`).join(", ")}`,
      href: patientHref(user, p._id),
    }));
  return {
    summary: waiting
      ? `${items.length} patient${items.length === 1 ? " is" : "s are"} waiting for a therapist for at least one service.`
      : `${items.length} patient${items.length === 1 ? "" : "s"} you can see.`,
    items,
  };
}

async function patient(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  const name = norm(str(input, "name"));
  const p = (await visiblePatients(user)).find((x) => norm(x.name).includes(name));
  if (!p)
    return { summary: `No patient matching "${str(input, "name")}" that you can see.`, items: [] };
  const db = await collections();
  const clinical = user.role === "therapist" || can(user, "records.view.clinical");
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
  if (user.role === "admin") {
    const contacts = (p.contacts ?? []).filter((c) => c.state !== "Revoked");
    const consents = p.consents ?? [];
    const refused = consents.filter((c) => c.state === "Refused" || c.state === "Withdrawn");
    items.unshift({
      label: "Participant record",
      detail: [
        `Status ${statusOf(p)}${p.mrn ? `; MRN ${p.mrn}` : ""}`,
        `${contacts.length} contact${contacts.length === 1 ? "" : "s"}${contacts.length ? ` (${contacts.map((c) => `${c.name}, ${c.role}, ${c.state.toLowerCase()}`).join("; ")})` : ""}`,
        `consent ${consents.filter((c) => c.state === "Given").length} of ${consents.length} given${refused.length ? `; refused or withdrawn: ${refused.map((c) => c.key).join(", ")}` : ""}`,
      ].join("; "),
      href: patientHref(user, p._id),
    });
  }
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
        status: { $in: ["Draft", "Pending Approval", "Approved", "Disputed"] },
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
      const t = invoiceTotals(i);
      const overdue =
        ["Issued", "Part-Paid", "Disputed"].includes(i.status) &&
        i.dueDate &&
        i.dueDate < todayKey() &&
        t.balance > 0;
      return {
        label: `${i.number} · ${clients.find((c) => c._id.equals(i.clientId))?.name ?? "Patient"}`,
        detail: `${overdue ? "Overdue" : i.status}; total ${money(t.total)} (GST ${money(t.gst)}) to ${i.billTo?.name ?? i.payer}; paid ${money(t.paid)}, credited ${money(t.credited)}, balance ${money(t.balance)}; due ${i.dueDate ?? "not set"}; ${i.lines.length} lines`,
        href: `/care/billing/${i._id.toHexString()}`,
      };
    }),
  };
}

const todayKey = () => new Date(Date.now() + 36e6).toISOString().slice(0, 10);
const daysUntil = (iso: string) =>
  Math.round((Date.parse(iso) - Date.parse(todayKey())) / 86_400_000);

/** One clinician's Module 04 position: status, what blocks bookings, credentials and services. */
function staffLine(t: TherapistDoc, viewerIsAdmin: boolean): Item {
  const s = t.staff;
  if (!s) return { label: t.name, detail: `${t.discipline}; no staff record yet`, href: "" };
  const blocks = staffBlocks(t, null, null, todayKey());
  const creds = s.credentials.map((c) => {
    const left = c.expiry ? daysUntil(c.expiry) : null;
    const state = c.status === "Verified" && left !== null && left < 0 ? "Expired" : c.status;
    const soon =
      state === "Verified" && left !== null && left <= 30 ? `, expires in ${left} days` : "";
    return `${c.name} ${state.toLowerCase()}${c.expiry ? ` (expiry ${c.expiry})` : ""}${soon}${c.required ? ", required" : ""}`;
  });
  const approved = s.competencies.filter((c) => c.status === "Approved").map((c) => c.support);
  const pending = s.competencies.filter((c) => c.status !== "Approved");
  return {
    label: `${t.name} · ${s.staffId}`,
    detail: [
      `${t.discipline}, ${t.region}; status ${s.status}`,
      blocks.length ? `CAN'T take new patients: ${blocks.join("; ")}` : "Can take new patients",
      `caseload ${t.activeClients} of ${t.capacity}`,
      `approved services: ${approved.join(", ") || "none yet"}`,
      pending.length
        ? `not yet approved: ${pending.map((c) => `${c.support} (${c.status})`).join(", ")}`
        : "",
      `credentials: ${creds.join("; ")}`,
      s.coverage.postcodes.length ? `covers postcodes ${s.coverage.postcodes.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; "),
    href: viewerIsAdmin ? `/care/therapists/${t._id.toHexString()}` : "/profile?tab=credentials",
  };
}

async function staffList(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  const db = await collections();
  if (user.role === "therapist") {
    const me = user.therapistId ? await db.therapists.findOne({ _id: user.therapistId }) : null;
    if (!me) return { summary: "No staff record found for you.", items: [] };
    return {
      summary:
        "Your own staff record. Only a Clinical Lead can verify credentials or approve services.",
      items: [staffLine(me, false)],
    };
  }
  const q = norm(str(input, "query"));
  const focus = str(input, "focus").toLowerCase();
  const on = todayKey();
  const team = (
    await db.therapists
      .find({ active: { $ne: false } })
      .sort({ name: 1 })
      .toArray()
  )
    .filter(
      (t) =>
        !q || norm(`${t.name} ${t.staff?.staffId ?? ""} ${t.discipline} ${t.region}`).includes(q),
    )
    .filter((t) => {
      const s = t.staff;
      if (!focus || focus === "all") return true;
      if (!s) return false;
      if (focus === "blocked") return staffBlocks(t, null, null, on).length > 0;
      if (focus === "expiring")
        return s.credentials.some((c) => c.expiry && daysUntil(c.expiry) <= 30);
      if (focus === "review")
        return (
          s.credentials.some(
            (c) => c.status === "Awaiting Review" || c.status === "Under Review",
          ) || s.competencies.some((c) => c.status === "Pending")
        );
      return true;
    });
  const blocked = team.filter((t) => staffBlocks(t, null, null, on).length > 0).length;
  return {
    summary: `${team.length} clinician${team.length === 1 ? "" : "s"}${focus && focus !== "all" ? ` (${focus})` : ""}; ${blocked} can't be offered new patients right now. Verification is a Clinical Lead's recorded decision, not a live register check.`,
    items: team.map((t) => staffLine(t, true)),
  };
}

/** Brisbane midnight, as an instant, `offset` days from today. */
function brisbaneMidnight(offset: number) {
  return new Date(Date.parse(`${todayKey()}T00:00:00+10:00`) + offset * 86_400_000);
}

async function scheduleList(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  const when = str(input, "when").toLowerCase() || "week";
  const focus = str(input, "focus").toLowerCase();
  const who = norm(str(input, "query"));
  let from = brisbaneMidnight(0);
  let to = brisbaneMidnight(7);
  let label = "the next 7 days";
  if (when === "today") {
    to = brisbaneMidnight(1);
    label = "today";
  } else if (when === "tomorrow") {
    from = brisbaneMidnight(1);
    to = brisbaneMidnight(2);
    label = "tomorrow";
  } else if (when === "past") {
    from = brisbaneMidnight(-7);
    to = brisbaneMidnight(0);
    label = "the last 7 days";
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(when)) {
    from = new Date(`${when}T00:00:00+10:00`);
    to = new Date(from.getTime() + 86_400_000);
    label = when;
  }

  let board = await scheduleBoard(from, to);
  if (user.role === "admin") board = forViewer(board, user);
  let events = board.events;
  if (user.role === "therapist") {
    const mine = user.therapistId?.toHexString();
    events = events.filter((e) => e.therapistId === mine);
  }
  if (who)
    events = events.filter((e) => norm(`${e.patient} ${e.therapist} ${e.ref}`).includes(who));
  if (focus === "exceptions")
    events = events.filter(
      (e) => e.flags.some((f) => f.kind !== "funding") || e.changeRequests.some((r) => !r.resolved),
    );
  if (focus === "reminders")
    events = events.filter((e) => e.reminders.some((r) => r.status === "Failed"));
  if (focus === "unconfirmed")
    events = events.filter((e) => e.confirmation !== "Confirmed by participant");

  const items: Item[] = events.map((e) => ({
    label: `${e.ref} · ${slotLabel(e.start)}`,
    detail: [
      `${e.patient} with ${e.therapist} (${e.support}, ${e.modality}${e.location ? `, ${e.location}` : ""})`,
      `${e.status}; ${e.confirmation.toLowerCase()}`,
      e.series ? `visit ${e.series.index} of ${e.series.total}` : "",
      e.flags.length ? `flags: ${e.flags.map((f) => f.label).join(", ")}` : "",
      e.changeRequests.some((r) => !r.resolved)
        ? `change requested: ${e.changeRequests
            .filter((r) => !r.resolved)
            .map((r) => r.note)
            .join("; ")}`
        : "",
      user.role === "admin" && e.reminders.length
        ? `reminders: ${e.reminders.map((r) => `${r.trigger} ${r.status.toLowerCase()}`).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("; "),
    href: user.role === "admin" ? "/care/schedule" : "/therapist/schedule",
  }));
  if (user.role === "admin" && !who && (focus === "unscheduled" || !focus)) {
    items.unshift(
      ...board.unscheduled.slice(0, focus === "unscheduled" ? 20 : 5).map((u) => ({
        label: `To book · ${u.patient}`,
        detail: `${u.support} (${u.discipline}), ${u.frequency}, ${u.location}; funding ${u.funding.toLowerCase()}${u.risk ? "; risk flagged" : ""}; waiting since ${u.since.slice(0, 10)}`,
        href: "/care/schedule",
      })),
    );
  }
  const c = board.counts;
  return {
    summary:
      user.role === "admin"
        ? `Schedule for ${label}: ${events.length} appointment${events.length === 1 ? "" : "s"} shown. Board totals: ${c.today} today, ${c.week} this week, ${c.unscheduled} services to book, ${c.pending} offers awaiting a clinician, ${c.exceptions} exceptions, ${c.remindersFailed} failed reminders. Assignment mode: ${board.mode}.${board.restricted ? " Site and clinical detail is hidden for your role." : ""} Times are AEST (Brisbane).`
        : `Your schedule for ${label}: ${events.length} visit${events.length === 1 ? "" : "s"}. Times are AEST (Brisbane).`,
    items,
  };
}

/** Module 06: funding plans, budgets, agreements, readiness and alerts. */
async function fundingList(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  if (user.role !== "admin") {
    return {
      summary:
        "Funding details are kept by intake and Finance. Therapists see agreed service limits on the patient record.",
      items: [],
    };
  }
  const q = norm(str(input, "query"));
  const focus = str(input, "focus").toLowerCase();
  const { fundingOverview, fundingWorkspace } = await import("./funding");
  const db = await collections();
  if (q) {
    const client = (await db.clients.find({}, { projection: { name: 1 } }).toArray()).find(
      (c) => norm(c.name).includes(q) || q.includes(norm(c.name.split(" ")[0] ?? "")),
    );
    if (client) {
      const w = await fundingWorkspace(user, client._id);
      const items: Item[] = [];
      for (const p of w.plans) {
        items.push({
          label: `Plan ${p.ref} (${p.status})`,
          detail: `NDIS ${p.ndisNumber ? `•••••${p.ndisNumber.slice(-4)}` : "not recorded"}; ${p.start || "start ?"} to ${p.end || "end ?"}; management ${p.management || "not recorded"}; funding periods ${p.fundingPeriods}; evidence ${p.evidenceStatus}; fields: ${p.fields.map((f) => `${f.label} ${f.state}`).join(", ")}${p.missing.length ? `; still needed: ${p.missing.join("; ")}` : ""}`,
          href: `/care/funding/${w.client.id}?tab=plans`,
        });
        for (const b of p.budgets) {
          items.push({
            label: `Budget: ${b.name}`,
            detail: `${b.management}; payer ${b.payer ?? "none"}${b.payerStatus ? ` (${b.payerStatus})` : ""}; reported ${money(b.reportedTotal ?? 0)}; verified snapshot ${b.verified ? money(b.verified.amount) : "none"}; committed ${money(b.committed)}; remaining ${b.remaining === null ? "unknown (no verified snapshot)" : `${money(b.remaining)} (local estimate)`}; eligibility ${b.eligibility}`,
            href: `/care/funding/${w.client.id}?tab=budgets`,
          });
        }
      }
      for (const a of w.agreements.filter((x) => x.status !== "Superseded")) {
        items.push({
          label: `Agreement ${a.ref} v${a.version} (${a.status})`,
          detail: `${a.type}; ${a.start} to ${a.end}; signatory ${a.signatory.name} (${a.signatory.authority}${a.signatory.verified ? ", verified" : ", not verified"}); estimate ${money(a.total)}; lines: ${a.lines.map((l) => `${l.support} ${l.kind} ${l.quantity} ${l.unit} ${l.frequency} → ${l.payerRoute}`).join("; ")}${a.review.required ? `; internal review ${a.review.by ? `approved by ${a.review.by}` : "needed"}` : ""}`,
          href: `/care/funding/agreements/${a.id}`,
        });
      }
      for (const r of w.readiness) {
        items.push({
          label: `Booking readiness: ${r.support} = ${r.booking}`,
          detail: r.gates
            .map(
              (g) =>
                `${g.label} ${g.status} (${g.owner}${g.severity !== "ok" ? `, next: ${g.next}` : ""})`,
            )
            .join("; "),
          href: `/care/funding/${w.client.id}?tab=readiness`,
        });
      }
      for (const a of w.alerts.filter((x) => !x.acknowledged))
        items.push({
          label: `Alert: ${a.title}`,
          detail: `${a.detail} Owner: ${a.owner}.`,
          href: a.href,
        });
      return {
        summary: `Funding record for ${w.client.name}${w.client.mrn ? ` (${w.client.mrn})` : ""}. Values stay participant-reported until Finance verifies them.`,
        items,
      };
    }
  }
  const o = await fundingOverview(user);
  const rows = o.rows.filter((r) =>
    focus === "expiring"
      ? r.daysToEnd !== null && r.daysToEnd <= Math.max(...o.policy.reminderDays)
      : focus === "blocked"
        ? r.booking !== "Ready"
        : focus === "evidence"
          ? r.evidence !== "Verified"
          : focus === "agreements"
            ? r.agreement !== "Signed"
            : true,
  );
  const items: Item[] = rows.map((r) => ({
    label: `${r.participant} · ${r.planRef ?? "no plan"}`,
    detail: `management ${r.management}${r.budgets.length > 1 ? " (mixed by budget)" : ""}; plan ends ${r.end || "not recorded"}${r.daysToEnd !== null ? ` (${r.daysToEnd} days)` : ""}; evidence ${r.evidence}; agreement ${r.agreement}; booking ${r.booking}; ${r.warnings} open alerts`,
    href: `/care/funding/${r.clientId}`,
  }));
  if (focus === "alerts" || !focus) {
    for (const a of o.alerts.filter((x) => !x.acknowledged).slice(0, 10))
      items.push({
        label: `Alert: ${a.title}`,
        detail: `${a.participant}: ${a.detail} Owner: ${a.owner}.`,
        href: a.href,
      });
  }
  return {
    summary: `Funding: ${o.counts.plans} participants with a plan, ${o.counts.verified} with verified evidence, ${o.counts.expiring} plans ending soon, ${o.counts.awaitingSignature} agreements awaiting signature, ${o.counts.blocked} with booking blocked, ${o.counts.alerts} open alerts. NDIA checks and signatures are simulated.`,
    items,
  };
}

/** Module 07: billing totals, queue, invoices, claims, payments, reconciliation and approvals. */
async function financeList(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  const focus = str(input, "focus").toLowerCase();
  if (user.role === "therapist") {
    const { myBillables } = await import("./finance-money");
    const mine = await myBillables(user);
    const todo = mine.filter((l) => !l.confirmed || l.needsTravel);
    return {
      summary: `${todo.length} of your delivered services need confirming (time or travel). Rates, payers and claims are handled by Finance.`,
      items: mine.slice(0, 15).map((l) => ({
        label: `${l.participant} · ${l.support} · ${l.start.slice(0, 10)}`,
        detail: `${l.source}; ${l.billableMinutes} min; ${l.confirmed ? "confirmed" : "to confirm"}${l.needsTravel ? "; travel distance to confirm" : ""}`,
        href: "/therapist/schedule",
      })),
    };
  }
  if (user.role !== "admin") return { summary: "Billing is for staff.", items: [] };
  const { financeHub } = await import("./finance-money");
  const h = await financeHub(user);
  const money2 = (n: number) => money(Math.round(n * 100) / 100);
  const open = h.invoices.filter(
    (i) => ["Issued", "Part-Paid", "Disputed"].includes(i.status) && i.balance > 0,
  );
  const overdue = open.filter((i) => i.overdue);
  const queue = h.billables.filter((b) =>
    ["Captured", "Pending verification", "Ready", "Held"].includes(b.status),
  );
  const items: Item[] = [];
  const want = (k: string) => !focus || focus === k;
  if (want("overdue"))
    for (const i of overdue)
      items.push({
        label: `Overdue ${i.number} · ${i.participant}`,
        detail: `${money2(i.balance)} of ${money2(i.total)} owing to ${i.billTo.name}; due ${i.dueDate}; ${i.ageing}`,
        href: `/care/billing/${i.id}`,
      });
  if (want("queue"))
    for (const b of queue.slice(0, 15))
      items.push({
        label: `${b.ref} · ${b.participant} · ${b.status}`,
        detail: `${b.source} ${b.support} on ${b.start.slice(0, 10)} by ${b.therapist}; ${b.path}, ${b.payerRoute}; ${b.quantity} ${b.unit} × ${money2(b.rate)} = ${money2(b.amounts.total)}${b.flags.length ? `; checks: ${b.flags.map((f) => `${f.kind} (${f.severity})`).join(", ")}` : ""}${b.hold ? `; held: ${b.hold.reason}` : ""}`,
        href: "/care/billing?tab=queue",
      });
  if (want("claims"))
    for (const c of h.claims.filter((x) => x.status !== "Closed"))
      items.push({
        label: `Claim ${c.ref} · ${c.participant} · ${c.status}`,
        detail: `${money2(c.total)}; remitted ${money2(c.paid)}${c.outcome ? `; NDIA response: ${c.outcome.note}` : ""}${c.checks.length ? `; checks: ${c.checks.join("; ")}` : ""} (simulated)`,
        href: "/care/billing?tab=claims",
      });
  if (want("payments"))
    for (const p of h.payments.filter((x) => x.unapplied > 0 && x.status !== "Reversed"))
      items.push({
        label: `Payment ${p.ref} · ${p.payer}`,
        detail: `${money2(p.amount)} received ${p.receivedOn} by ${p.method}; ${money2(p.unapplied)} unapplied; ${p.status}`,
        href: "/care/billing?tab=payments",
      });
  if (want("reconciliation"))
    for (const l of h.statement
      .filter((x) => x.status === "Unmatched" || x.status === "Suggested")
      .slice(0, 8))
      items.push({
        label: `Bank line ${money2(l.amount)} on ${l.date}`,
        detail: `${l.description}${l.suggestions[0] ? `; best suggestion ${l.suggestions[0].label} (${l.suggestions[0].score}%)` : "; no suggestion"}${l.duplicate ? "; possible duplicate" : ""}`,
        href: "/care/billing?tab=reconciliation",
      });
  if (want("adjustments"))
    for (const a of h.adjustments.filter((x) =>
      ["Requested", "Reviewed", "Approved"].includes(x.status),
    ))
      items.push({
        label: `${a.type} ${a.ref} · ${a.status}`,
        detail: `${money2(a.amount)} on ${a.invoice?.number ?? a.payment?.ref ?? ""}: ${a.reason}; requested by ${a.requestedBy}${a.status !== "Approved" ? "; needs a Finance Manager" : "; approved, ready to apply"}`,
        href: "/care/billing?tab=adjustments",
      });
  if (want("invoices") && focus === "invoices")
    for (const i of h.invoices.slice(0, 15))
      items.push({
        label: `${i.number} · ${i.participant} · ${i.overdue ? "Overdue" : i.status}`,
        detail: `${money2(i.total)}; balance ${money2(i.balance)}; to ${i.billTo.name}; due ${i.dueDate ?? "not set"}`,
        href: `/care/billing/${i.id}`,
      });
  const unbilled = queue
    .filter((b) => b.status !== "Held")
    .reduce((s, b) => s + b.amounts.total, 0);
  const revenue = h.invoices
    .filter((i) => i.issuedAt && i.status !== "Voided")
    .reduce((s, i) => s + i.total, 0);
  return {
    summary: `Billing now: outstanding ${money2(open.reduce((s, i) => s + i.balance, 0))} on ${open.length} invoices; overdue ${money2(overdue.reduce((s, i) => s + i.balance, 0))} on ${overdue.length}; unbilled ${money2(unbilled)} on ${queue.filter((b) => b.status !== "Held").length} lines (${queue.filter((b) => b.status === "Held").length} held); ${h.claims.filter((c) => c.status === "Rejected").length} rejected claims; ${money2(h.payments.reduce((s, p) => s + (p.status === "Reversed" ? 0 : p.unapplied), 0))} unapplied money; ${h.statement.filter((l) => l.status === "Unmatched" || l.status === "Suggested").length} bank lines to match; ${h.adjustments.filter((a) => ["Requested", "Reviewed"].includes(a.status)).length} adjustments awaiting a Finance Manager; invoiced revenue ${money2(revenue)}. ${h.can.manager ? "You can approve as Finance Manager." : h.can.officer ? "You're a Finance Officer: approvals go to a Finance Manager." : "You can view billing but not change it."} Claims and payments are simulated.`,
    items,
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
        "How every part of Medisense works and where it is: the patient lifecycle, referrals and intake, triage, participant records, contacts and consent, staff and credentials, matching, scheduling and reminders, NDIS funding (plans, evidence, budgets, payers, agreements, readiness), billing and finance (billable queue, invoices, claims, payments, reconciliation, credits, rules, reports), assessments, plans, visits, SOAP notes, telehealth and recordings, discharge, the patient app, roles and demo accounts, navigation, and what AI does. Use for any how, what, why or where question",
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
          "Live patients the person may see, with stage, region, funding and each service's clinician. focus 'waiting' lists only patients with a service still waiting for a therapist.",
        properties: {
          query: prop("Optional name or suburb"),
          focus: prop("Optional: 'waiting' for patients still waiting for a therapist"),
        },
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
        name: "live_staff",
        description:
          "Module 04 staff records: STF id, engagement status, whether they can take new patients and why not (hard stops), credentials (verified, awaiting review, expired, expiring soon), approved services, caseload and coverage. Therapists see only their own record.",
        properties: {
          query: prop("Optional clinician name, STF id, discipline or region"),
          focus: prop("Optional: blocked, expiring, review, all"),
        },
        run: (i) => staffList(user, i),
      },
      {
        name: "live_schedule",
        description:
          "Module 05 scheduling board: appointments with APT ref, time (AEST), patient, clinician, service, status, participant confirmation, series, flags (conflict, leave, risk, funding, change request) and reminders; services still to book; board totals. Therapists see only their own visits.",
        properties: {
          when: prop("Optional: today, tomorrow, week (default), past, or a YYYY-MM-DD date"),
          query: prop("Optional patient, clinician or APT reference"),
          focus: prop("Optional: exceptions, reminders, unconfirmed, unscheduled"),
        },
        run: (i) => scheduleList(user, i),
      },
      {
        name: "live_funding",
        description:
          "Module 06 funding: per participant (query) their NDIS plans (dates, management, evidence, verified fields, what's still needed), budgets (payer, reported, verified snapshot, committed, remaining local estimate, eligibility), service agreements (status, signatory, lines, payer routes, review) and booking readiness gates; or across everyone: plans ending soon, evidence status, agreements, blocked bookings and funding alerts.",
        properties: {
          query: prop("Optional participant name"),
          focus: prop("Optional: expiring, blocked, evidence, agreements, alerts"),
        },
        run: (i) => fundingList(user, i),
      },
      {
        name: "live_finance",
        description:
          "Module 07 billing: totals (outstanding, overdue, unbilled, unapplied money, revenue), the billable queue with checks and holds, overdue invoices with ageing, claims and NDIA outcomes, payments with unapplied money, bank lines to reconcile and adjustments awaiting approval. Therapists get their own services to confirm.",
        properties: {
          focus: prop(
            "Optional: overdue, queue, claims, payments, reconciliation, adjustments, invoices",
          ),
        },
        run: (i) => financeList(user, i),
      },
      {
        name: "live_operations",
        description:
          "Module 08 operations: open, overdue, escalated and due-today tasks by team (only tasks this person may see), approvals waiting for them, failed or held messages and recent rule outcomes.",
        properties: {
          focus: prop("Optional: overdue, escalated, approvals, messages, rules, mine"),
        },
        run: (i) => operationsList(user, i),
      },
      {
        name: "live_assessments",
        description:
          "Module 12 assessments the person may see: ASM reference and case code, participant, service, clinician, status (Requested, Ready, In Progress, Paused, Pending Review, Pending Signature, Finalised, Amended, Cancelled), purpose, location, progress, outcome and due date; plus what blocks signing for one participant when named.",
        properties: { query: prop("Optional participant name, ASM reference or status") },
        run: (i) => assessmentList(user, i),
      },
      {
        name: "live_coordination",
        description:
          "Module 17 tasks and care coordination the person may see: TASK reference, title, category (Clinical Follow-up, Documentation, Assessment, Care Coordination, Referral, Supervision, Appointment Request, Patient Communication, Administrative Handoff, Safety Review), owner, priority, status (Draft, Open, In Progress, Waiting on Patient/Admin/Clinician, Pending Review, Completed, Cancelled), due date and whether it's overdue, and AI suggestions waiting for a decision.",
        properties: {
          query: prop("Optional participant name, TASK reference, category or status"),
        },
        run: (i) => coordSummary(user, i),
      },
      {
        name: "live_patient_requests",
        description:
          "Modules 18–22 patient app requests: identity and health-record corrections patients asked for (field, requested value, status Pending, Approved, Rejected or Withdrawn, who decided). Admin only.",
        properties: { query: prop("Optional patient name, MRN or status") },
        run: (i) => patientRequestSummary(user, i),
      },
      {
        name: "live_progress",
        description:
          "Module 16 progress and clinical reports the person may see: courses of care (Assessment Only, Active Treatment, Paused, Under Review, Transfer Pending, Discharged), goals improving or achieved, next review date and whether it is overdue, and clinical reports (FCA, NDIS progress, discipline progress, reassessment, handover, discharge) with status, due date and purpose.",
        properties: {
          query: prop(
            "Optional participant name, RPT reference, report status or course of care state",
          ),
        },
        run: (i) => progressSummary(user, i),
      },
      {
        name: "live_documentation",
        description:
          "Module 15 clinical documentation the person may see: DOC reference, participant, note type (SOAP, DAP, session note, assessment summary, FCA summary, telehealth, incident, discharge), capture method, status (Capturing, AI Draft, Editing, Needs Review, Awaiting Co-sign, Signed, Addendum), priority (Routine, Due Soon, Overdue, Escalated), open review warnings and whether AI was used; plus what blocks signing for one participant when named.",
        properties: {
          query: prop("Optional participant name, DOC reference, status or note type"),
        },
        run: (i) => docSummary(user, i),
      },
      {
        name: "live_sessions",
        description:
          "Module 14 therapy sessions the person may see (four weeks back, two ahead): SES reference, participant, discipline, purpose, mode (home, school, daycare, day program, community, telehealth), date, attendance (Scheduled, Confirmed, In Progress, Completed, Partially Completed, Cancelled, No Show, Safety Stop), note state, delivery verification and the next step; plus what is missing before signing for one participant when named.",
        properties: { query: prop("Optional participant name, SES reference, attendance or mode") },
        run: (i) => sessionSummary(user, i),
      },
      {
        name: "live_plans",
        description:
          "Module 13 treatment plans the person may see: TP reference and version, participant, service, clinician, state (Not Started, Draft, Pending Review, Ready for Approval, Active, Under Review, Paused, Superseded, Completed, Discontinued), goals and how many are achieved, review date and whether it is overdue, and sharing; plus what blocks signing and each goal's status for one participant when named.",
        properties: { query: prop("Optional participant name, TP reference or state") },
        run: (i) => planSummary(user, i),
      },
      {
        name: "live_clinical_record",
        description:
          "Module 11 clinical record for one participant, filtered to what this person may see: courses of care, history gaps and review, conditions (reported vs confirmed), allergy status, medicines, open risks and safe visit plan, unsigned drafts, consent (telehealth, recording, AI scribe, sharing) and reconciliation items.",
        properties: { name: prop("Participant name, or part of it") },
        run: (i) => clinicalRecord(user, i),
      },
      {
        name: "live_invoices",
        description: "Live invoices (Finance only): status, total, payer, amount owing.",
        properties: {
          status: prop(
            "Optional: Draft, Pending Approval, Approved, Issued, Part-Paid, Paid, Disputed, Voided, Credited",
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
  const names = (await visiblePatients(user)).map((p) => p.name);
  if (user.role === "admin") {
    const { therapists } = await collections();
    names.push(
      ...(await therapists.find({}, { projection: { name: 1 } }).toArray()).map((t) => t.name),
    );
  }
  return names.some((name) =>
    name
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
    if (
      /funding|ndis plan|plan end|plan expir|budget|payer|plan manager|agreement|signatory|readiness|ready to book|evidence|self.managed|agency.managed|plan.managed/.test(
        q,
      )
    ) {
      const focus = /expir|ending|end soon|renew/.test(q)
        ? "expiring"
        : /block|ready|readiness/.test(q)
          ? "blocked"
          : /evidence|verif/.test(q)
            ? "evidence"
            : /agreement|sign/.test(q)
              ? "agreements"
              : /alert/.test(q)
                ? "alerts"
                : "";
      calls.push({ name: "live_funding", input: { focus } });
    }
    if (
      /billing|finance|invoice|overdue|ageing|aging|outstanding|unbilled|billable|queue|claim|remittance|payment|unapplied|reconcil|bank line|statement|credit note|write.?off|refund|adjustment|revenue|collected/.test(
        q,
      )
    ) {
      const focus = /overdue|ageing|aging/.test(q)
        ? "overdue"
        : /queue|unbilled|billable|held/.test(q)
          ? "queue"
          : /claim|remittance|ndia/.test(q)
            ? "claims"
            : /reconcil|bank|statement/.test(q)
              ? "reconciliation"
              : /credit|write.?off|refund|adjustment|approv/.test(q)
                ? "adjustments"
                : /unapplied|payment/.test(q)
                  ? "payments"
                  : "";
      calls.push({ name: "live_finance", input: { focus } });
    }
    if (
      /operation|work ?queue|\btasks?\b|escalat|sla|approval|automation|\brules?\b|run log|aut-\d/.test(
        q,
      )
    ) {
      const focus = /escalat/.test(q)
        ? "escalated"
        : /overdue|late/.test(q)
          ? "overdue"
          : /approv/.test(q)
            ? "approvals"
            : /message|notification|reminder/.test(q)
              ? "messages"
              : /rule|automation|run/.test(q)
                ? "rules"
                : /\bmy\b|mine/.test(q)
                  ? "mine"
                  : "";
      calls.push({ name: "live_operations", input: { focus } });
    }
    if (
      /(need|needs|waiting|without|no|yet to get|still to get)\b.{0,30}\b(therapist|clinician)|unassigned|not (yet )?(been )?assigned|to be assigned|awaiting (a )?(therapist|clinician|allocation)/.test(
        q,
      )
    )
      calls.push({ name: "live_patients", input: { focus: "waiting" } });
    else if (/patients|caseload|who is|which patient/.test(q))
      calls.push({ name: "live_patients", input: {} });
    if (
      /staff|clinician|take new patients|therapist|credential|registration|screening|insurance|indemnity|expir|verif|approved service|competenc|stf-|on leave|suspend|coverage|capacity/.test(
        q,
      )
    ) {
      const focus = /expir|due|renew/.test(q)
        ? "expiring"
        : /block|can'?t|cannot|not able|unavailable/.test(q)
          ? "blocked"
          : /review|pending|awaiting|approve/.test(q)
            ? "review"
            : "";
      calls.push({ name: "live_staff", input: { focus } });
    }
    if (
      /schedul|appointment|booking|booked|calendar|agenda|tomorrow|today|this week|next week|reminder|reschedul|exception|apt-|confirm|unbooked|to book|still to book|services? (still )?(waiting|to)|no.?show|slot/.test(
        q,
      )
    ) {
      const when = /tomorrow/.test(q)
        ? "tomorrow"
        : /\btoday\b/.test(q)
          ? "today"
          : /last week|past/.test(q)
            ? "past"
            : (q.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "week");
      const focus = /exception|conflict|change request|problem/.test(q)
        ? "exceptions"
        : /reminder/.test(q)
          ? "reminders"
          : /unconfirmed|not confirmed|awaiting (the )?participant/.test(q)
            ? "unconfirmed"
            : /to book|unbooked|unscheduled|not booked|waiting to be booked/.test(q)
              ? "unscheduled"
              : "";
      calls.push({ name: "live_schedule", input: { when, focus } });
    }
    const named = (await visiblePatients(user)).find((p) =>
      p.name
        .split(" ")
        .some((part) => part.length > 2 && new RegExp(`\\b${part.toLowerCase()}\\b`).test(q)),
    );
    if (named) calls.push({ name: "live_patient", input: { name: named.name } });
    if (
      /assessment|asm-|template|instrument|copm|fca|co-?sign|reassess|baseline|to sign|unable to assess/.test(
        q,
      )
    ) {
      calls.push({
        name: "live_assessments",
        input: { query: named?.name ?? q.match(/asm-\d+/)?.[0] ?? "" },
      });
    }
    if (
      /\btasks?\b|follow.?up|handover|coordinat|referral to|supervis|waiting on|overdue task|suggest|task-\d/.test(
        q,
      )
    ) {
      calls.push({
        name: "live_coordination",
        input: { query: named?.name ?? q.match(/task-\d+/)?.[0] ?? "" },
      });
    }
    if (/patient (app|request)|correction|date of birth|legal name|portal/.test(q)) {
      calls.push({ name: "live_patient_requests", input: { query: named?.name ?? "" } });
    }
    if (
      /progress|outcome|reassess|report|discharg|episode|rpt-\d|goal (status|progress)|baseline|not calculable/.test(
        q,
      )
    ) {
      calls.push({
        name: "live_progress",
        input: { query: named?.name ?? q.match(/rpt-\d+/)?.[0] ?? "" },
      });
    }
    if (
      /documentation|\bnotes?\b|soap|\bdap\b|dictat|transcript|co-?sign|addendum|unsigned|overdue note|ai draft|doc-\d/.test(
        q,
      )
    ) {
      calls.push({
        name: "live_documentation",
        input: { query: named?.name ?? q.match(/doc-\d+/)?.[0] ?? "" },
      });
    }
    if (
      /session|check.?in|no.?show|did not attend|safety stop|verif|edit conflict|addend/.test(q)
    ) {
      calls.push({
        name: "live_sessions",
        input: { query: named?.name ?? q.match(/ses-\d+/)?.[0] ?? "" },
      });
    }
    if (
      /treatment plan|\bplans?\b|goal|intervention|home program|tp-\d|review date|plan review/.test(
        q,
      )
    ) {
      calls.push({
        name: "live_plans",
        input: { query: named?.name ?? q.match(/tp-\d+/)?.[0] ?? "" },
      });
    }
    if (
      named &&
      /record|history|allerg|medic|condition|diagnos|risk|consent|timeline|addend|entr(y|ies)|safety|handover/.test(
        q,
      )
    ) {
      calls.push({ name: "live_clinical_record", input: { name: named.name } });
    }

    const fundingCall = calls.find((c) => c.name === "live_funding");
    if (named && fundingCall) fundingCall.input = { query: named.name };
    if (user.role === "admin") {
      const { therapists } = await collections();
      const clinician = (await therapists.find({}, { projection: { name: 1 } }).toArray()).find(
        (t) =>
          t.name
            .split(" ")
            .some((part) => part.length > 2 && new RegExp(`\\b${part.toLowerCase()}\\b`).test(q)),
      );
      if (clinician) {
        const staffCall = calls.find((c) => c.name === "live_staff");
        if (staffCall) staffCall.input = { ...staffCall.input, query: clinician.name, focus: "" };
        const schedCall = calls.find((c) => c.name === "live_schedule");
        if (schedCall) schedCall.input = { ...schedCall.input, query: clinician.name };
        if (!staffCall && !schedCall)
          calls.push({ name: "live_staff", input: { query: clinician.name } });
      }
    }
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

/* ------------------------------------------------------------------ Module 08 and 11 */

async function operationsList(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  const { opsCan, canSee } = await import("./operations");
  const can = opsCan(user);
  const db = await collections();
  const focus = str(input, "focus");
  const now = Date.now();
  const tasks = (
    await db.opsTasks
      .find({ status: { $nin: ["Completed", "Cancelled"] } })
      .sort({ dueAt: 1 })
      .limit(600)
      .toArray()
  ).filter((t) => canSee(user, can, t));
  const overdue = tasks.filter(
    (t) => t.dueAt.getTime() < now && !["Waiting for Patient", "On Hold"].includes(t.status),
  );
  const escalated = tasks.filter((t) => t.status === "Escalated");
  const mine = tasks.filter((t) => t.assigneeId?.equals(user._id));
  const approvals = await db.opsApprovals
    .find({ status: { $in: ["Pending", "Changes requested"] } })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  const messages = await db.opsMessages
    .find({ state: { $in: ["Failed", "Awaiting Approval", "Queued"] } })
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray();
  const runs = await db.opsRuns.find({}).sort({ at: -1 }).limit(30).toArray();
  const byTeam = ["Intake", "Scheduling", "Clinical", "Finance", "Operations"]
    .map((t) => `${t} ${tasks.filter((x) => x.team === t).length}`)
    .join(", ");
  const taskItem = (t: (typeof tasks)[number]) => ({
    label: `${t.ref} ${t.title}`,
    detail: `${t.status} · ${t.priority} · ${t.team}${t.assigneeName ? ` · ${t.assigneeName}` : " · unassigned"} · due ${t.dueAt.toLocaleString("en-AU", { timeZone: "Australia/Brisbane", dateStyle: "medium", timeStyle: "short" })}${t.escalation ? ` · escalated to ${t.escalation.owner}` : ""}`,
    href:
      user.role === "admin"
        ? `/care/operations/tasks/${t._id.toHexString()}`
        : `/therapist/tasks/${t._id.toHexString()}`,
  });
  const items: Item[] =
    focus === "approvals"
      ? approvals
          .filter((a) => !a.restricted || can.clinical)
          .map((a) => ({
            label: `${a.ref} ${a.title}`,
            detail: `${a.workflow} · ${a.status} · raised by ${a.initiator}: ${a.reason}`,
            href: "/care/operations?tab=needs&type=approvals",
          }))
      : focus === "messages"
        ? messages.map((m) => ({
            label: `${m.ref} ${m.subject}`,
            detail: `${m.state} (simulated) · ${m.channel} to ${m.recipient}${m.reason ? ` · ${m.reason}` : ""}`,
            href: "/care/operations?tab=automation&section=messages",
          }))
        : focus === "rules"
          ? runs.map((r) => ({
              label: `${r.ruleCode} v${r.ruleVersion} ${r.ruleName}`,
              detail: `${r.outcome}: ${r.detail}`,
              href: "/care/operations?tab=automation&section=log",
            }))
          : (focus === "escalated"
              ? escalated
              : focus === "mine"
                ? mine
                : overdue.length && focus !== ""
                  ? overdue
                  : [...escalated, ...overdue.filter((t) => t.status !== "Escalated")]
            ).map(taskItem);
  return {
    summary: `${tasks.length} open operational task(s) you can see (${byTeam}); ${overdue.length} overdue, ${escalated.length} escalated, ${mine.length} assigned to you; ${approvals.length} approval(s) pending; ${messages.filter((m) => m.state === "Failed").length} failed simulated message(s).`,
    items,
    note: "Rules route work, AI only suggests, people decide. Clinically restricted tasks are shown only to the Clinical Lead and the assignee.",
  };
}

async function clinicalRecord(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  const { recordFor } = await import("./records");
  const name = norm(str(input, "name"));
  const db = await collections();
  const candidates = await db.clients.find({}, { projection: { name: 1 } }).toArray();
  const hit = candidates.find((c) => norm(c.name).includes(name));
  if (!hit) return { summary: `No participant matching "${str(input, "name")}".`, items: [] };
  let r;
  try {
    r = await recordFor(user, hit._id, false);
  } catch {
    return {
      summary: `You don't have access to ${hit.name}'s clinical record. A clinician who isn't assigned can request access from Clinical records.`,
      items: [],
    };
  }
  const href =
    user.role === "therapist" ? `/therapist/records/${r.clientId}` : `/care/records/${r.clientId}`;
  const gaps = r.exceptions.filter((x) => !x.resolved);
  const items: Item[] = [
    ...r.episodes.map((e) => ({
      label: `${e.support} (${e.discipline})`,
      detail: `${e.status} · ${e.clinician ?? "unassigned"}${e.restricted ? " · notes restricted to this discipline" : ""}`,
      href,
    })),
    {
      label: "Conditions",
      detail:
        r.conditions.map((c) => `${c.label} (${c.status}, source ${c.source})`).join("; ") ||
        (r.canWrite ? "None documented (not the same as none)" : "Not visible to your role"),
      href: `${href}?tab=conditions`,
    },
    {
      label: "Allergies",
      detail: r.canWrite
        ? r.allergies.length
          ? r.allergies
              .map((a) => `${a.substance}: ${a.reaction || "reaction not recorded"}`)
              .join("; ")
          : r.allergyState
        : "Not visible to your role",
      href: `${href}?tab=conditions`,
    },
    {
      label: "Medicines",
      detail:
        r.medications
          .map((m) => `${m.name} ${m.strength} ${m.frequency} (${m.status}, ${m.verification})`)
          .join("; ") || (r.canWrite ? "None recorded" : "Not visible to your role"),
      href: `${href}?tab=conditions`,
    },
    {
      label: "Risks and visit safety",
      detail:
        [
          ...r.safetySummary,
          ...r.risks
            .filter((k) => k.review !== "Retired")
            .map((k) => `${k.types.join(", ")} · ${k.severity} · review ${k.review}`),
        ].join("; ") || "No open risks or precautions",
      href: `${href}?tab=risks`,
    },
    {
      label: "History",
      detail: r.historyReview
        ? `Reviewed by ${r.historyReview.by} (${r.historyReview.sources.join(", ")}); completeness ${r.completeness}`
        : `Not yet reviewed; completeness ${r.completeness}`,
      href: `${href}?tab=history`,
    },
    {
      label: "Unsigned drafts",
      detail:
        r.entries
          .filter((e) => e.status === "Draft" && !e.hidden)
          .map(
            (e) =>
              `${e.title}${e.missing.length ? ` (still to complete: ${e.missing.join(", ")})` : ""}`,
          )
          .join("; ") || "None",
      href: `${href}?tab=entries`,
    },
    {
      label: "Consent",
      detail:
        r.consents
          .filter((c) =>
            ["telehealth", "recording", "ai-scribe", "share-coordinator"].includes(c.key),
          )
          .map((c) => `${c.label}: ${c.state}`)
          .join("; ") || "Not visible to your role",
      href: `${href}?tab=consent`,
    },
    {
      label: "To reconcile",
      detail: gaps.map((x) => `${x.kind}: ${x.title}`).join("; ") || "Nothing open",
      href: `${href}?tab=reconcile`,
    },
  ];
  return {
    summary: `${r.name} (${r.participantId}) · your access: ${r.accessNote || r.access}. ${r.alerts.map((a) => a.text).join("; ") || "No critical alerts."}`,
    items,
    note: "Reported, unknown and confirmed information are kept apart; nothing missing is assumed to be negative.",
  };
}

async function patientRequestSummary(
  user: UserDoc,
  input: Record<string, unknown>,
): Promise<Result> {
  const { patientRequests } = await import("./portal");
  const query = norm(str(input, "query"));
  const rows = await patientRequests(user);
  const hits = query
    ? rows.filter((r) => norm(`${r.participant} ${r.mrn} ${r.status} ${r.field}`).includes(query))
    : rows;
  return {
    summary: `${rows.filter((r) => r.status === "Pending").length} patient request(s) waiting for review, ${rows.filter((r) => r.status === "Approved").length} approved, ${rows.filter((r) => r.status === "Rejected").length} not approved.`,
    items: hits.slice(0, 20).map((r) => ({
      label: `${r.participant} · ${r.field}`,
      detail: `${r.status} · asked ${r.at.slice(0, 10)}${r.decidedBy ? ` · decided by ${r.decidedBy}` : ""}`,
      href: "/care/patient-requests",
    })),
    note: "Identity changes apply only after staff approve them; health-information requests are decided by the treating clinician.",
  };
}

async function coordSummary(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  const { taskList } = await import("./coord");
  const { ensureCoordSeed } = await import("./coord-seed");
  await ensureCoordSeed();
  const query = norm(str(input, "query"));
  const { rows } = await taskList(user);
  const hits = query
    ? rows.filter((r) =>
        norm(`${r.ref} ${r.title} ${r.participant ?? ""} ${r.category} ${r.status}`).includes(
          query,
        ),
      )
    : rows.filter((r) => !["Completed", "Cancelled"].includes(r.status));
  const base = user.role === "therapist" ? "/therapist/coordination" : "/care/coordination";
  const items: Item[] = hits.slice(0, 20).map((r) => ({
    label: `${r.ref} · ${r.restricted ? "Restricted follow-up" : r.title}`,
    detail: `${r.category} · ${r.status} · ${r.priority} · ${r.mine ? "yours" : r.assignee}${r.participant ? ` · ${r.participant}` : ""}${r.dueAt ? ` · due ${r.dueAt.slice(0, 10)}${r.overdue ? " (overdue)" : ""}` : ""}${r.suggestion === "pending" ? " · AI suggestion awaiting decision" : ""}`,
    href: `${base}/${r.id}`,
  }));
  const open = rows.filter(
    (r) => !["Completed", "Cancelled"].includes(r.status) && r.suggestion !== "pending",
  );
  return {
    summary: `${open.length} open task(s): ${open.filter((r) => r.mine).length} yours, ${open.filter((r) => r.overdue).length} overdue, ${open.filter((r) => r.status.startsWith("Waiting")).length} waiting, ${open.filter((r) => r.status === "Pending Review").length} pending review; ${rows.filter((r) => r.suggestion === "pending").length} AI suggestion(s) waiting for a decision.`,
    items,
    note: "Tasks are operational actions: completing one never signs a clinical note or authorises treatment, and AI suggestions stay drafts until someone accepts them.",
  };
}

async function progressSummary(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  const { episodeList, reportList } = await import("./progress");
  const { ensureProgressSeed } = await import("./progress-seed");
  await ensureProgressSeed();
  const query = norm(str(input, "query"));
  const eps = await episodeList(user);
  const reps = await reportList(user);
  const epHits = query
    ? eps.filter((e) => norm(`${e.participant} ${e.state} ${e.service}`).includes(query))
    : eps;
  const repHits = query
    ? reps.filter((r) => norm(`${r.ref} ${r.participant} ${r.status} ${r.type}`).includes(query))
    : reps;
  const base = user.role === "therapist" ? "/therapist/progress" : "/care/progress";
  const items: Item[] = [
    ...epHits.slice(0, 10).map((e) => ({
      label: `${e.participant} · ${e.service}`,
      detail: `${e.state} · ${e.goals} goal(s), ${e.improving} improving, ${e.achieved} achieved · review ${e.reviewDue ? e.reviewDue.slice(0, 10) : "not set"}${e.reviewOverdue ? " (overdue)" : ""} · ${e.reportStatus}`,
      href: `${base}/${encodeURIComponent(e.id)}`,
    })),
    ...repHits.slice(0, 10).map((r) => ({
      label: `${r.ref} · ${r.participant} · ${r.type}`,
      detail: `${r.status} · ${r.purpose} · due ${r.dueAt.slice(0, 10)}${r.overdue ? " (overdue)" : ""}${r.gaps ? ` · ${r.gaps} data check(s)` : ""}`,
      href: `${base}/reports/${r.id}`,
    })),
  ];
  return {
    summary: `${eps.length} course(s) of care you can see: ${eps.filter((e) => e.reviewOverdue).length} with an overdue review; ${reps.length} report(s): ${reps.filter((r) => !["Signed", "Released", "Superseded", "Withdrawn"].includes(r.status)).length} open (${reps.filter((r) => r.overdue).length} overdue), ${reps.filter((r) => r.status === "In Review").length} awaiting co-signature, ${reps.filter((r) => r.status === "Released").length} released.`,
    items,
    note: "Progress percentages appear only for comparable upward numeric goals; others show 'Not calculable'. Reports are released only after signing and recipient checks.",
  };
}

async function docSummary(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  const { docList, docDetail } = await import("./docs");
  const { ensureDocSeed } = await import("./docs-seed");
  await ensureDocSeed();
  const query = norm(str(input, "query"));
  const rows = await docList(user);
  const hits = query
    ? rows.filter((r) =>
        norm(`${r.ref} ${r.participant} ${r.status} ${r.noteType}`).includes(query),
      )
    : rows;
  const base = user.role === "therapist" ? "/therapist/documentation" : "/care/documentation";
  const items: Item[] = hits.slice(0, 20).map((r) => ({
    label: `${r.ref} · ${r.participant} · ${r.noteType}`,
    detail: `${r.status} · ${r.priority} · ${r.capture}${r.aiUsed ? " · AI draft used" : ""}${r.warnings ? ` · ${r.warnings} warning(s)` : ""} · encounter ${r.encounterAt.slice(0, 10)}`,
    href: `${base}/${r.id}`,
  }));
  const one =
    hits.length && query && hits.every((h) => h.participant === hits[0]?.participant)
      ? hits.find((h) => !["Signed", "Addendum"].includes(h.status))
      : undefined;
  if (one) {
    try {
      const { ObjectId } = await import("mongodb");
      const d = await docDetail(user, new ObjectId(one.id));
      if (d.blockers.length)
        items.unshift({
          label: `Before signing ${d.ref}`,
          detail: d.blockers.join("; "),
          href: `${base}/${d.id}?tab=sign`,
        });
    } catch {
      /* not visible at clinical level */
    }
  }
  const count = (...a: string[]) => rows.filter((r) => a.includes(r.status)).length;
  return {
    summary: `${rows.length} note(s) you can see: ${rows.filter((r) => r.overdue).length} overdue, ${count("AI Draft")} AI drafts awaiting review, ${count("Capturing", "Editing", "Needs Review")} in progress, ${count("Awaiting Co-sign")} awaiting co-signature, ${count("Signed", "Addendum")} signed; ${rows.reduce((n, r) => n + r.warnings, 0)} open review warning(s).`,
    items,
    note: "AI drafts stay labelled not clinically verified until the clinician accepts each section and confirms the review; protected psychology and trauma notes show status only.",
  };
}

async function sessionSummary(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  const { sessionList, sessionDetail } = await import("./sessions");
  const { ensureSessionSeed } = await import("./sessions-seed");
  await ensureSessionSeed();
  const query = norm(str(input, "query"));
  const rows = await sessionList(user);
  const hits = query
    ? rows.filter((r) =>
        norm(`${r.ref} ${r.participant} ${r.attendance} ${r.mode} ${r.discipline}`).includes(query),
      )
    : rows;
  const base = user.role === "therapist" ? "/therapist/sessions" : "/care/sessions";
  const items: Item[] = hits.slice(0, 20).map((r) => ({
    label: `${r.ref} · ${r.participant} · ${r.purpose}`,
    detail: `${r.start.slice(0, 16).replace("T", " ")} · ${r.mode} · ${r.attendance} · note ${r.record.toLowerCase()} · delivery ${r.verification.toLowerCase()} · next: ${r.next}`,
    href: `${base}/${r.id}`,
  }));
  const one =
    hits.length && query && hits.every((h) => h.participant === hits[0]?.participant)
      ? hits.find((h) => ["Completed", "Partially Completed", "In Progress"].includes(h.attendance))
      : undefined;
  if (one) {
    try {
      const { ObjectId } = await import("mongodb");
      const d = await sessionDetail(user, new ObjectId(one.id));
      if (d.noteGaps.length)
        items.unshift({
          label: `Before signing ${d.ref}`,
          detail: d.noteGaps.join("; "),
          href: `${base}/${d.id}?tab=notes`,
        });
    } catch {
      /* not visible at clinical level */
    }
  }
  const count = (...a: string[]) => rows.filter((r) => a.includes(r.attendance)).length;
  return {
    summary: `${rows.length} session(s) you can see: ${count("In Progress")} in progress, ${count("Scheduled", "Confirmed")} upcoming, ${count("Completed", "Partially Completed")} delivered (${rows.filter((r) => ["Completed", "Partially Completed"].includes(r.attendance) && !["Signed", "Amended"].includes(r.record)).length} notes still to sign), ${count("No Show")} did not attend, ${rows.filter((r) => r.sync === "Conflict").length} edit conflict(s).`,
    items,
    note: "AI drafts are unverified until the therapist reviews them; signing a note sends delivery to finance for verification, never straight to an invoice.",
  };
}

async function planSummary(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  const { planList, planDetail } = await import("./tplan");
  const { ensurePlanSeed } = await import("./tplan-seed");
  await ensurePlanSeed();
  const query = norm(str(input, "query"));
  const rows = await planList(user);
  const hits = query
    ? rows.filter((r) => norm(`${r.ref} ${r.participant} ${r.state} ${r.support}`).includes(query))
    : rows;
  const base = user.role === "therapist" ? "/therapist/plans" : "/care/plans";
  const items: Item[] = hits.slice(0, 20).map((r) => ({
    label: `${r.ref} · ${r.participant} · ${r.support}`,
    detail: `${r.state}${r.version > 1 ? ` (v${r.version})` : ""} · ${r.clinician || "no clinician"} · ${r.goals} goal(s), ${r.achieved} achieved${r.reviewDate ? ` · review ${r.reviewDate.slice(0, 10)}${r.reviewOverdue ? " (overdue)" : ""}` : ""}${r.shared ? " · shared with participant" : ""}`,
    href: r.id ? `${base}/${r.id}` : base,
  }));
  const one =
    hits.length && query && hits.every((h) => h.clientId === hits[0]?.clientId)
      ? hits.find((h) => h.id && !["Superseded", "Completed", "Discontinued"].includes(h.state))
      : undefined;
  if (one?.id) {
    try {
      const { ObjectId } = await import("mongodb");
      const d = await planDetail(user, new ObjectId(one.id));
      for (const g of d.goals.slice(0, 6)) {
        items.unshift({
          label: `Goal: ${g.title}`,
          detail: `${g.state} · baseline ${g.baseline || "none"} → target ${g.target || "not set"}${g.current ? ` · now ${g.current}` : ""}`,
          href: `${base}/${d.id}?tab=goals`,
        });
      }
      if (["Draft", "Pending Review", "Ready for Approval"].includes(d.state))
        items.unshift({
          label: `What blocks signing ${d.ref}`,
          detail: d.blockers.join(" ") || "Nothing: ready to sign.",
          href: `${base}/${d.id}`,
        });
    } catch {
      /* not visible at clinical level */
    }
  }
  const count = (...s: string[]) => rows.filter((r) => s.includes(r.state)).length;
  return {
    summary: `${rows.length} plan(s) and course(s) of care you can see: ${count("Active")} active, ${count("Not Started")} waiting for a plan, ${count("Draft", "Ready for Approval")} in draft, ${count("Pending Review")} awaiting Clinical Lead review, ${rows.filter((r) => r.reviewOverdue).length} with an overdue review.`,
    items,
    note: "Goals and targets are set by the clinician; AI only suggests wording and summarises signed measurements. Progress percentages are shown only for numeric measures.",
  };
}

async function assessmentList(user: UserDoc, input: Record<string, unknown>): Promise<Result> {
  const { assessQueue, assessDetail } = await import("./assess");
  const query = norm(str(input, "query"));
  const rows = await assessQueue(user);
  const hits = query
    ? rows.filter((r) => norm(`${r.ref} ${r.participant} ${r.status} ${r.support}`).includes(query))
    : rows;
  const base = user.role === "therapist" ? "/therapist/assessments" : "/care/assessments";
  const items: Item[] = hits.slice(0, 20).map((r) => ({
    label: `${r.ref} · ${r.participant} · ${r.support}`,
    detail: `${r.status} · ${r.clinician} · ${r.purpose}, ${r.mode} · ${r.progress}% of sections${r.outcome ? ` · outcome ${r.outcome}` : ""}${r.due ? ` · due ${r.due.slice(0, 10)}` : ""}`,
    href: `${base}/${r.id}`,
  }));
  const one =
    hits.length && query && hits.every((h) => h.clientId === hits[0]?.clientId)
      ? hits.find((h) => !["Finalised", "Amended", "Cancelled"].includes(h.status))
      : undefined;
  if (one) {
    try {
      const { ObjectId } = await import("mongodb");
      const d = await assessDetail(user, new ObjectId(one.id));
      items.unshift({
        label: `What blocks signing ${d.ref}`,
        detail: d.blockers.join(" ") || "Nothing: ready to sign.",
        href: `${base}/${d.id}?tab=review`,
      });
    } catch {
      /* not visible at clinical level */
    }
  }
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return {
    summary: `${rows.length} assessment(s) you can see: ${count("In Progress")} in progress, ${count("Paused")} paused, ${count("Pending Signature")} to sign, ${count("Pending Review")} awaiting co-signature, ${count("Finalised") + count("Amended")} finalised.`,
    items,
    note: "Templates are documentation aids: no diagnosis, automatic score interpretation or treatment is generated, and a person signs every assessment.",
  };
}
