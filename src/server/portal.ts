import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import {
  MAX_UPLOAD,
  uploadTypes,
  type PortalAction,
  type PortalAppointment,
  type PortalDto,
  type PortalPlan,
} from "@/lib/live/portal";
import { consentItems } from "@/lib/live/participant";
import { shortDate, slotLabel } from "@/lib/live/time";
import { patientInvoices } from "./billing";
import { answerInfo, patientReferral, withdrawReferral } from "./referrals";
import { blankFields, nextTaskRef, taskCol } from "./coord";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { audit, notify, publish } from "./live";
import type { AppointmentDoc, ClientDoc, UserDoc } from "./models";
import { insertTask } from "./operations";

/* ------------------------------------------------------------------ storage */

/** The patient's own preferences, requests and logs, kept beside the canonical record. */
export interface PortalExtDoc {
  _id: ObjectId;
  preferredName: string;
  pronouns: string;
  postal: string;
  postalSameAsHome: boolean;
  preferredLocation: string;
  pending: { field: "Email" | "Mobile phone"; to: string; code: string } | null;
  verified: { email: boolean; phone: boolean };
  prefs: PortalDto["prefs"];
  requests: {
    id: string;
    field: string;
    from: string;
    to: string;
    kind: string;
    status: string;
    reason: string;
    at: Date;
    decidedBy: string;
  }[];
  acknowledgements: { planId: string; version: number; at: Date }[];
  logs: {
    planId: string;
    activityId: string;
    status: string;
    reason: string;
    at: Date;
    review: string;
  }[];
  questionnaires: {
    id: string;
    planId: string;
    title: string;
    status: string;
    items: { q: string; answer: string; na: boolean; required: boolean }[];
    at: Date | null;
  }[];
  bookings: {
    id: string;
    service: string;
    mode: string;
    window: string;
    purpose: string;
    status: string;
    at: Date;
  }[];
  changes: { appointmentId: string; type: string; reason: string; status: string; at: Date }[];
  uploads: { name: string; category: string; status: string; at: Date }[];
  payments: { invoiceId: string; method: string; at: Date }[];
  disputes?: { invoiceId: string; reason: string; at: Date }[];
  consentRequests?: { key: string; reason: string; at: Date }[];
  read: string[];
  ndisRevealedAt: Date | null;
  activity: { at: Date; text: string }[];
}

async function extCol() {
  const { db } = await collections();
  return db.collection<PortalExtDoc>("portalExt");
}

const DAY = 86_400_000;
const CODE = "246810";

async function extFor(c: ClientDoc): Promise<PortalExtDoc> {
  const col = await extCol();
  const found = await col.findOne({ _id: c._id });
  if (found) return found;
  const fresh: PortalExtDoc = {
    _id: c._id,
    preferredName: c.profile?.preferredName ?? "",
    pronouns: c.profile?.pronouns ?? "",
    postal: "",
    postalSameAsHome: true,
    preferredLocation: "Home",
    pending: null,
    verified: { email: true, phone: Boolean(c.phone) },
    prefs: {
      channel: "SMS",
      time: "Morning",
      language: c.profile?.language || "English",
      interpreter: "No",
      accessibility: [],
      reminders: true,
    },
    requests: [],
    acknowledgements: [],
    logs: [],
    questionnaires: [],
    bookings: [],
    changes: [],
    uploads: [],
    payments: [],
    read: [],
    ndisRevealedAt: null,
    activity: [],
  };
  await col.insertOne(fresh).catch(() => undefined);
  return (await col.findOne({ _id: c._id })) ?? fresh;
}

async function clientOf(u: UserDoc) {
  if (u.role !== "client" || !u.clientId)
    throw new UserFacingError("Sign in as a patient to use this.", 409);
  const { clients } = await collections();
  const c = await clients.findOne({ _id: u.clientId });
  if (!c) throw new UserFacingError("Your record wasn't found.", 404);
  return c;
}

/* ------------------------------------------------------------------ view */

const mask = (n: string) =>
  n.length > 3 ? `${"•".repeat(Math.max(0, n.length - 3))}${n.slice(-3)}` : "•••";
const addr = (
  a: { street: string; suburb: string; state: string; postcode: string } | undefined,
) => (a ? [a.street, a.suburb, a.state, a.postcode].filter(Boolean).join(", ") : "");

function prepFor(mode: string): string[] {
  if (mode === "Telehealth")
    return [
      "Test your camera and microphone",
      "Find a quiet, private space",
      "Have a phone nearby in case the call drops",
      "Join from the link up to 15 minutes before",
    ];
  if (mode === "School" || mode === "Daycare" || mode === "Day Program")
    return [
      "Check the site knows we're coming",
      "Bring any forms the school asked for",
      "A guardian or teacher may need to be present",
    ];
  return [
    "Clear a space for the activity",
    "Keep pets secured",
    "Have your equipment or aids ready",
    "Tell us if anyone is unwell",
  ];
}

export async function portalView(u: UserDoc): Promise<PortalDto> {
  const c = await clientOf(u);
  const e = await extFor(c);
  const db = await collections();
  const now = Date.now();
  const ther = await db.therapists.find({}, { projection: { name: 1 } }).toArray();
  const tName = (id: ObjectId | null | undefined) =>
    ther.find((t) => id && t._id.equals(id))?.name ?? "To be assigned";

  /* Appointments (Module 20). */
  const appts = await db.appointments
    .find({ clientId: c._id, status: { $ne: "tentative" } })
    .sort({ start: 1 })
    .toArray();
  const appointments: PortalAppointment[] = appts.map((a: AppointmentDoc) => {
    const mode = a.modality === "Telehealth" ? "Telehealth" : (a.site?.location ?? "Home");
    const status: PortalAppointment["status"] = ["cancelled", "late-cancelled", "no-show"].includes(
      a.status,
    )
      ? "Cancelled"
      : a.status === "completed" || a.status === "aborted" || a.end.getTime() < now
        ? "Completed"
        : "Upcoming";
    const ch = e.changes.filter((x) => x.appointmentId === a._id.toHexString()).at(-1) ?? null;
    const events: PortalAppointment["events"] = [
      { at: a.createdAt.toISOString(), actor: "Scheduling", action: "Booked", reason: "" },
    ];
    if (a.confirmedByPatient)
      events.push({
        at: a.confirmedByPatient.toISOString(),
        actor: "You",
        action: "Confirmed attendance",
        reason: "",
      });
    if (a.moved)
      events.push({
        at: a.moved.at.toISOString(),
        actor: a.moved.byName,
        action: "Moved",
        reason: a.moved.reason,
      });
    if (a.cancellation)
      events.push({
        at: a.cancellation.at.toISOString(),
        actor: a.cancellation.actorName,
        action: a.status === "no-show" ? "Recorded as missed" : "Cancelled",
        reason: a.cancellation.reason,
      });
    if (ch)
      events.push({
        at: ch.at.toISOString(),
        actor: "You",
        action: `${ch.type} requested`,
        reason: ch.reason,
      });
    return {
      id: a._id.toHexString(),
      ref: a.ref ?? "",
      start: a.start.toISOString(),
      end: a.end.toISOString(),
      service: a.discipline,
      clinician: tName(a.therapistId),
      mode,
      status,
      detail:
        mode === "Telehealth"
          ? "Secure video link"
          : a.site?.siteName ||
            a.site?.address ||
            (c.profile?.address
              ? `${c.profile.address.suburb} ${c.profile.address.state}`
              : "Your home"),
      confirmed: Boolean(a.confirmedByPatient),
      telehealthJoinOpen:
        mode === "Telehealth" &&
        status === "Upcoming" &&
        Math.abs(a.start.getTime() - now) < 15 * 60_000,
      prep: prepFor(mode),
      changeRequest: ch
        ? { type: ch.type, reason: ch.reason, status: ch.status, at: ch.at.toISOString() }
        : null,
      events: events.sort((x, y) => x.at.localeCompare(y.at)),
    };
  });

  /* Shared treatment plans (Module 21): only what the clinician shared. */
  const plans = await db.plans.find({ clientId: c._id }).sort({ version: -1 }).toArray();
  const exts = await db.db
    .collection<{
      _id: ObjectId;
      state?: string;
      sharing?: { shared: boolean; goalIds: string[] };
      goals?: Record<
        string,
        { title?: string; unit?: string; type?: string; points?: { value: string; date: Date }[] }
      >;
      interventions?: {
        id: string;
        name: string;
        home: { instructions: string; frequency: string } | null;
        sessionsPerWeek: number;
        minutes: number;
      }[];
    }>("planExt")
    .find({ _id: { $in: plans.map((p) => p._id) } })
    .toArray();
  const shared: PortalPlan[] = [];
  for (const p of plans) {
    const x = exts.find((y) => y._id.equals(p._id));
    if (!x?.sharing?.shared || ["Superseded", "Draft", "Pending Review"].includes(x.state ?? ""))
      continue;
    const need = c.needs.find((n) => n.id === p.needId);
    const ack = e.acknowledgements.filter((a) => a.planId === p._id.toHexString()).at(-1);
    shared.push({
      id: p._id.toHexString(),
      service: need?.support ?? need?.discipline ?? "Therapy",
      clinician: tName(p.therapistId),
      version: p.version,
      reviewDate: p.reviewDate ? String(p.reviewDate) : "",
      state: x.state ?? String(p.status),
      acknowledged: ack && ack.version === p.version ? ack.at.toISOString() : null,
      precautions: p.precautions || c.precautions || "",
      goals: p.goals
        .filter((g) => x.sharing?.goalIds.includes(g.id))
        .map((g) => {
          const gx = x.goals?.[g.id];
          const numeric = ["Numeric", "Time", "Frequency"].includes(gx?.type ?? "");
          return {
            id: g.id,
            title: gx?.title ?? g.description,
            description: g.description,
            type: gx?.type ?? "",
            unit: gx?.unit ?? "",
            baseline: g.baseline,
            current: g.current,
            target: g.target,
            points: numeric
              ? (gx?.points ?? [])
                  .filter((pt) => !Number.isNaN(Number(pt.value)))
                  .map((pt) => ({ date: pt.date.toISOString(), value: Number(pt.value) }))
              : [],
          };
        }),
      activities: (x.interventions ?? [])
        .filter((i) => i.home)
        .map((i) => ({
          id: i.id,
          name: i.name,
          instructions: i.home?.instructions ?? "",
          frequency: i.home?.frequency || `${i.sessionsPerWeek} times a week`,
          dose: `${i.minutes} minutes`,
          logs: e.logs
            .filter((l) => l.activityId === i.id)
            .map((l) => ({
              status: l.status,
              reason: l.reason,
              at: l.at.toISOString(),
              review: l.review,
            }))
            .reverse(),
        })),
    });
  }
  // A weekly check-in questionnaire for each shared plan, kept as the patient's own draft.
  const questionnaires = shared.map((p) => {
    const q = e.questionnaires.find((x) => x.planId === p.id);
    return {
      id: q?.id ?? `q-${p.id}`,
      title: `Weekly check-in · ${p.service}`,
      status: q?.status ?? "Not started",
      items: q?.items ?? [
        {
          q: "How many days did you do your home activities this week?",
          answer: "",
          na: false,
          required: true,
        },
        {
          q: "How tired did you feel after them (0 to 10)?",
          answer: "",
          na: false,
          required: true,
        },
        { q: "Did anything make the activities harder?", answer: "", na: false, required: false },
        {
          q: "Any pain or new concerns you want your therapist to know about?",
          answer: "",
          na: false,
          required: true,
        },
      ],
      at: q?.at?.toISOString() ?? null,
    };
  });

  /* Documents (Module 22): released reports, shared note summaries, signed agreements. */
  const reps = await db.db
    .collection<{
      _id: ObjectId;
      clientId: ObjectId;
      type: string;
      version: number;
      releases: { recipient: string; at: Date; version: number }[];
    }>("clinicalReports")
    .find({ clientId: c._id, "releases.recipient": "Participant" })
    .toArray();
  const docShares = await db.db
    .collection<{
      _id: ObjectId;
      clientId: ObjectId;
      noteType: string;
      shares: { recipient: string; summary: string; at: Date }[];
    }>("clinicalDocs")
    .find({ clientId: c._id, "shares.recipient": "Participant" })
    .toArray();
  const agreements = await db.agreements.find({ clientId: c._id }).toArray();
  const documents: PortalDto["documents"] = [
    ...reps.map((r) => {
      const rel = r.releases.filter((x) => x.recipient === "Participant").at(-1);
      return {
        id: `rep:${r._id.toHexString()}`,
        title: r.type,
        kind: "Report",
        date: rel?.at.toISOString() ?? "",
        version: `v${rel?.version ?? r.version}`,
        unread: !e.read.includes(`rep:${r._id.toHexString()}`),
        href: null,
      };
    }),
    ...docShares.flatMap((d) =>
      d.shares
        .filter((s) => s.recipient === "Participant")
        .map((s, i) => ({
          id: `doc:${d._id.toHexString()}:${i}`,
          title: `Visit summary: ${s.summary.slice(0, 60)}${s.summary.length > 60 ? "…" : ""}`,
          kind: "Summary",
          date: s.at.toISOString(),
          version: "",
          unread: !e.read.includes(`doc:${d._id.toHexString()}:${i}`),
          href: null,
        })),
    ),
    ...agreements.map((a) => ({
      id: `agr:${a._id.toHexString()}`,
      title: `Service agreement ${String((a as { ref?: string }).ref ?? "")}`.trim(),
      kind: "Agreement",
      date: ((a as { updatedAt?: Date }).updatedAt ?? new Date()).toISOString(),
      version: String((a as { status?: string }).status ?? ""),
      unread: false,
      href: null,
    })),
  ].sort((x, y) => y.date.localeCompare(x.date));

  /* Money (Module 22). */
  const invs = await patientInvoices(c._id);
  const invoices = invs.map((i) => {
    const pay = e.payments.filter((p) => p.invoiceId === i.id).at(-1);
    const dispute = (e.disputes ?? []).filter((x) => x.invoiceId === i.id).at(-1);
    const due = Math.max(0, Math.round((i.total - i.paid) * 100) / 100);
    return {
      id: i.id,
      number: i.number,
      status:
        dispute && i.status !== "Paid"
          ? "Query raised"
          : pay && i.status !== "Paid"
            ? "Payment processing"
            : i.status,
      total: i.total,
      paid: i.paid,
      due,
      issuedAt: i.issuedAt,
      payment: pay ? `${pay.method}, ${shortDate(pay.at)}` : null,
      payer: i.payer,
      lines: i.lines,
      disputed: dispute ? `${shortDate(dispute.at)}: ${dispute.reason}` : null,
    };
  });

  /* Referrals and funding (Modules 18–19). */
  const refs = c.mrn
    ? await db.referrals.find({ mrn: c.mrn }).sort({ createdAt: -1 }).toArray()
    : [];
  const friendly = (s: string) =>
    (
      ({
        "Under Admin Review": "Under review",
        "Needs Information": "We need something from you",
        "Clinical Triage": "Being assessed by our team",
        Accepted: "Accepted",
        Declined: "Not accepted",
      }) as Record<string, string>
    )[s] ?? s;
  const plan = await db.fundingPlans.findOne(
    { clientId: c._id, status: { $in: ["Active", "Expired"] } },
    { sort: { end: -1 } },
  );
  const revealed = Boolean(e.ndisRevealedAt && now - e.ndisRevealedAt.getTime() < 10 * 60_000);
  const care = c.needs.map((n) => ({
    service: n.support ?? n.discipline,
    clinician: n.therapistId ? tName(n.therapistId) : "To be assigned",
    status:
      n.status === "completed" ? "Completed" : n.therapistId ? "Active" : "Waiting for a therapist",
  }));

  /* What needs the patient's attention. */
  const actions: PortalDto["actions"] = [];
  for (const r of refs)
    if (String(r.status) === "Needs Information")
      actions.push({
        kind: "Referral",
        title: "Information needed for your referral",
        detail: r.reference,
        tab: "me",
      });
  for (const p of shared)
    if (!p.acknowledged)
      actions.push({
        kind: "Plan",
        title: `Read and acknowledge your ${p.service} plan`,
        detail: `Version ${p.version}`,
        tab: "care",
      });
  for (const a of appointments.filter((x) => x.status === "Upcoming" && !x.confirmed).slice(0, 2))
    actions.push({
      kind: "Visit",
      title: "Confirm your next visit",
      detail: `${a.service}, ${slotLabel(a.start)} AEST`,
      tab: "visits",
    });
  for (const i of invoices
    .filter((x) => x.due > 0 && x.status !== "Payment processing" && x.status !== "Query raised")
    .slice(0, 2))
    actions.push({
      kind: "Invoice",
      title: `Invoice ${i.number} is due`,
      detail: `$${i.due.toFixed(2)}`,
      tab: "me",
    });
  for (const q of questionnaires.filter((x) => x.status !== "Submitted").slice(0, 1))
    actions.push({
      kind: "Check-in",
      title: q.title,
      detail: q.status === "Draft" ? "Saved draft" : "Takes two minutes",
      tab: "care",
    });

  return {
    profile: {
      mrn: c.mrn ?? "",
      legalName: c.name,
      preferredName: e.preferredName,
      pronouns: e.pronouns,
      dob: c.dateOfBirth ?? "",
      email: c.email,
      emailVerified: e.verified.email,
      phone: c.phone ?? "",
      phoneVerified: e.verified.phone,
      address: addr(c.profile?.address),
      postal: e.postalSameAsHome ? addr(c.profile?.address) : e.postal,
      postalSameAsHome: e.postalSameAsHome,
      preferredLocation: e.preferredLocation,
      emergency: c.emergencyContact ?? null,
      status: c.discharged
        ? "Discharged"
        : c.needs.some((n) => n.therapistId && n.status !== "completed")
          ? "Active"
          : "Referral only",
    },
    prefs: e.prefs,
    funding: plan
      ? {
          program: "NDIS",
          number: revealed ? plan.ndisNumber : mask(plan.ndisNumber),
          revealed,
          type: plan.management,
          start: plan.start,
          end: plan.end,
          status:
            plan.end && plan.end < new Date().toISOString().slice(0, 10) ? "Expired" : "Active",
          verified: plan.status === "Active",
          manager:
            plan.management === "Plan Managed"
              ? String((plan as { planManagerCompany?: string }).planManagerCompany ?? "")
              : "",
        }
      : null,
    referrals: refs.map((r) => ({
      ref: r.reference,
      submitted: r.createdAt.toISOString(),
      status: friendly(String(r.status)),
      services: (r.data.supports ?? []).map((sp, i) => ({
        name: sp.support,
        status: friendly(
          String((r.services?.[i] as { status?: string } | undefined)?.status ?? r.status),
        ),
      })),
      actionNeeded:
        String(r.status) === "Needs Information" ? "Send the information we asked for" : "",
      question:
        String(r.status) === "Needs Information"
          ? (r.infoRequests.find((q) => !q.answeredAt)?.message ?? "")
          : "",
      canWithdraw: !["Accepted", "Declined", "Withdrawn"].includes(String(r.status)),
      // Patients see the status path only; internal notes stay with staff.
      timeline: r.history.map((h) => ({
        status: friendly(String(h.status)),
        at: h.at.toISOString(),
        note: "",
      })),
    })),
    careTeam: care,
    representatives: (c.contacts ?? []).map((x) => ({
      name: x.name,
      role: x.role,
      relationship: x.relationship,
      status: x.revoked
        ? "Revoked"
        : x.authorityExpires && x.authorityExpires < new Date().toISOString().slice(0, 10)
          ? "Expired"
          : x.state,
      expires: x.authorityExpires,
      scope: x.authorityScope,
    })),
    requests: e.requests
      .map((r) => ({
        id: r.id,
        field: r.field,
        to: r.to,
        kind: r.kind,
        status: r.status,
        reason: r.reason,
        at: r.at.toISOString(),
      }))
      .reverse(),
    appointments,
    bookingRequests: e.bookings.map((b) => ({ ...b, at: b.at.toISOString() })).reverse(),
    plans: shared,
    questionnaires,
    documents,
    uploads: e.uploads.map((x) => ({ ...x, at: x.at.toISOString() })).reverse(),
    invoices,
    consents: consentItems.map((ci) => {
      const got = (c.consents ?? []).find((x) => x.key === ci.key);
      const w = (e.consentRequests ?? []).filter((x) => x.key === ci.key).at(-1);
      return {
        key: ci.key,
        label: ci.label,
        help: ci.help,
        state: got?.state ?? "Not asked",
        at: got?.at ? got.at.toISOString() : null,
        version: got?.version ?? "",
        withdrawal: w ? shortDate(w.at) : null,
      };
    }),
    actions,
    activity: e.activity
      .map((x) => ({ at: x.at.toISOString(), text: x.text }))
      .reverse()
      .slice(0, 30),
  };
}

/* ------------------------------------------------------------------ actions */

export async function portalAction(u: UserDoc, a: PortalAction) {
  const c = await clientOf(u);
  const e = await extFor(c);
  const col = await extCol();
  const db = await collections();
  const now = new Date();
  const set: Partial<PortalExtDoc> = {};
  let text = "";
  switch (a.type) {
    case "profile":
      set.preferredName = a.preferredName;
      set.pronouns = a.pronouns;
      set.postalSameAsHome = a.postalSameAsHome;
      set.postal = a.postalSameAsHome ? "" : a.postal;
      set.preferredLocation = a.preferredLocation;
      text = "Updated your profile preferences";
      break;
    case "identity": {
      if (!a.to) throw new UserFacingError(`${a.field} can't be empty.`);
      if (
        a.field === "Date of birth" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(a.to) || a.to > now.toISOString().slice(0, 10))
      )
        throw new UserFacingError("Enter a date of birth in the past.");
      const req = {
        id: randomUUID(),
        field: a.field,
        from: a.field === "Date of birth" ? (c.dateOfBirth ?? "") : c.name,
        to: a.to,
        kind: "Identity",
        status: "Pending",
        reason: a.reason,
        at: now,
        decidedBy: "",
      };
      set.requests = [...e.requests, req];
      await requestTask(u, c, `Review identity change: ${a.field}`, req.id);
      text = `Asked to change ${a.field.toLowerCase()}; our team reviews identity changes`;
      break;
    }
    case "contact":
      if (a.field === "Email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.to))
        throw new UserFacingError("Enter a valid email address.");
      if (a.field === "Mobile phone" && !/^\+?[\d\s]{8,15}$/.test(a.to))
        throw new UserFacingError("Enter a valid mobile number.");
      set.pending = { field: a.field, to: a.to, code: CODE };
      text = `Sent a verification code to the new ${a.field.toLowerCase()}`;
      break;
    case "verify": {
      if (!e.pending || e.pending.field !== a.field)
        throw new UserFacingError("There's nothing waiting to verify.", 409);
      if (a.code !== e.pending.code)
        throw new UserFacingError("That code doesn't match. Check it and try again.");
      if (a.field === "Email") {
        await db.clients.updateOne({ _id: c._id }, { $set: { email: e.pending.to } });
        set.verified = { ...e.verified, email: true };
      } else {
        await db.clients.updateOne({ _id: c._id }, { $set: { phone: e.pending.to } });
        set.verified = { ...e.verified, phone: true };
      }
      set.pending = null;
      text = `Verified your new ${a.field.toLowerCase()}`;
      break;
    }
    case "medical": {
      const req = {
        id: randomUUID(),
        field: "Health information",
        from: "",
        to: a.text,
        kind: "Medical record",
        status: "Pending",
        reason: "",
        at: now,
        decidedBy: "",
      };
      set.requests = [...e.requests, req];
      await requestTask(
        u,
        c,
        "Review a patient's health-record correction request",
        req.id,
        "Clinical",
      );
      text = "Asked for a correction to your health information; your clinician reviews it";
      break;
    }
    case "withdraw": {
      const r = e.requests.find((x) => x.id === a.id);
      if (!r || r.status !== "Pending")
        throw new UserFacingError("Only a pending request can be withdrawn.", 409);
      set.requests = e.requests.map((x) => (x.id === a.id ? { ...x, status: "Withdrawn" } : x));
      text = `Withdrew your ${r.field.toLowerCase()} request; nothing changed`;
      break;
    }
    case "prefs":
      set.prefs = {
        channel: a.channel,
        time: a.time,
        language: a.language,
        interpreter: a.interpreter,
        accessibility: a.accessibility,
        reminders: a.reminders,
      };
      if (a.interpreter === "Yes" && e.prefs.interpreter !== "Yes")
        await requestTask(
          u,
          c,
          `Book an interpreter (${a.language || "language to confirm"})`,
          "",
          "Scheduling",
        );
      text = "Updated your communication preferences";
      break;
    case "reveal":
      set.ndisRevealedAt = now;
      text = "Viewed your NDIS number";
      break;
    case "booking": {
      if (a.mode !== "Telehealth" && a.mode !== "Other community location" && !a.address)
        throw new UserFacingError("Add the address for an in-person visit.");
      if (["School", "Daycare", "Day Program"].includes(a.mode) && !a.siteContact)
        throw new UserFacingError(
          "Add the site contact for a school, daycare or day program visit.",
        );
      if (a.mode === "Other community location" && a.otherLocation.length < 3)
        throw new UserFacingError("Describe the community location.");
      const b = {
        id: randomUUID(),
        service: a.service,
        mode: a.mode,
        window: a.window,
        purpose: a.purpose,
        status: "Requested",
        at: now,
      };
      set.bookings = [...e.bookings, b];
      await insertTask(u.name, {
        title: `Booking request: ${c.name} (${a.service}, ${a.mode})`,
        category: "Scheduling",
        status: "New",
        priority: "Normal",
        urgentReason: "",
        team: "Scheduling",
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
        service: a.service,
        discipline: a.service,
        locationType: a.mode,
        dueAt: new Date(now.getTime() + 2 * DAY),
        sla: "Standard",
        visibility: "Internal",
        source: "Rule",
        ruleCode: "PAT-20",
        ruleVersion: 1,
        idemKey: `booking:${b.id}`,
        restrictedNote: null,
        recordingHref: null,
        suggestion: false,
        scenario: null,
        checklist: [
          { label: `Preferred: ${a.window}` },
          ...(a.device ? [{ label: `Telehealth device: ${a.device}` }] : []),
        ],
        historyNote: "Requested in the patient app",
      });
      text = `Requested a ${a.service} visit (${a.mode}); it's not confirmed until Scheduling books it`;
      break;
    }
    case "confirm": {
      const ap = await db.appointments.findOne({
        _id: new ObjectId(a.appointmentId),
        clientId: c._id,
      });
      if (!ap || ap.status !== "booked")
        throw new UserFacingError("That visit can't be confirmed.", 409);
      await db.appointments.updateOne({ _id: ap._id }, { $set: { confirmedByPatient: now } });
      text = `Confirmed your ${ap.discipline} visit`;
      break;
    }
    case "change": {
      const ap = await db.appointments.findOne({
        _id: new ObjectId(a.appointmentId),
        clientId: c._id,
      });
      if (!ap || ap.status !== "booked")
        throw new UserFacingError("Only an upcoming visit can change.", 409);
      if (a.kind === "Cancel" && !a.acknowledge)
        throw new UserFacingError("Please confirm you've read the cancellation policy.");
      set.changes = [
        ...e.changes,
        {
          appointmentId: a.appointmentId,
          type: a.kind,
          reason: a.reason,
          status: "Pending",
          at: now,
        },
      ];
      await requestTask(u, c, `${a.kind} request for ${ap.ref ?? "a visit"}`, "", "Scheduling");
      text = `Asked to ${a.kind.toLowerCase()} your visit; it stays booked until Scheduling replies`;
      break;
    }
    case "acknowledge":
      if (ObjectId.isValid(a.planId))
        await db.db
          .collection("planExt")
          .updateOne({ _id: new ObjectId(a.planId) }, { $set: { "sharing.acknowledged": now } });
      set.acknowledgements = [
        ...e.acknowledgements,
        { planId: a.planId, version: a.version, at: now },
      ];
      text = `Acknowledged plan version ${a.version}`;
      break;
    case "activity":
      if (a.status === "Unable" && a.reason.length < 3)
        throw new UserFacingError("Tell your therapist why you couldn't do it.");
      set.logs = [
        ...e.logs,
        {
          planId: a.planId,
          activityId: a.activityId,
          status: a.status,
          reason: a.reason,
          at: now,
          review: "Awaiting clinician review",
        },
      ];
      text = `Logged a home activity: ${a.status}`;
      break;
    case "questionnaire": {
      const view = await portalView(u);
      const q = view.questionnaires.find((x) => x.id === a.id);
      if (!q) throw new UserFacingError("Questionnaire not found.", 404);
      const items = q.items.map((it, i) => ({
        ...it,
        answer: a.answers[i]?.answer ?? it.answer,
        na: a.answers[i]?.na ?? it.na,
      }));
      if (a.submit) {
        const missing = items.filter((it) => it.required && !it.na && !it.answer.trim());
        if (missing.length)
          throw new UserFacingError(
            `Answer the required questions first (${missing.length} left).`,
          );
      }
      const planId = a.id.startsWith("q-")
        ? a.id.slice(2)
        : (e.questionnaires.find((x) => x.id === a.id)?.planId ?? "");
      const rec = {
        id: a.id,
        planId,
        title: q.title,
        status: a.submit ? "Submitted" : "Draft",
        items,
        at: now,
      };
      set.questionnaires = [...e.questionnaires.filter((x) => x.id !== a.id), rec];
      if (a.submit) {
        const fatigue = Number(items[1]?.answer);
        const concern =
          /harm|fall|chest|can't breathe|worse|severe/i.test(items[3]?.answer ?? "") ||
          fatigue >= 8;
        await careTask(
          c,
          planId,
          concern ? "Safety Review" : "Clinical Follow-up",
          concern
            ? "Check-in raised a concern: review with the participant"
            : "Review the participant's weekly check-in",
          concern ? "High" : "Normal",
        );
        text = concern
          ? "Submitted your check-in; your therapist will contact you"
          : "Submitted your check-in";
      } else text = "Saved your check-in as a draft";
      break;
    }
    case "clarify":
      await careTask(
        c,
        a.planId,
        "Clinical Follow-up",
        `Question from the participant about their plan: ${a.text.slice(0, 80)}`,
        "Normal",
      );
      text = "Sent your question to your therapist; your plan doesn't change until they reply";
      break;
    case "upload":
      if (!(uploadTypes as readonly string[]).includes(a.mime))
        throw new UserFacingError("Upload a PDF, JPG, PNG or Word document.");
      if (a.size > MAX_UPLOAD) throw new UserFacingError("Files must be 10 MB or smaller.");
      if (!a.consent)
        throw new UserFacingError(
          "Confirm you're happy for us to keep this document with your record.",
        );
      set.uploads = [
        ...e.uploads,
        { name: a.name, category: a.category, status: "Received, waiting for review", at: now },
      ];
      text = `Uploaded ${a.name}`;
      break;
    case "pay": {
      const inv = (await patientInvoices(c._id)).find((i) => i.id === a.invoiceId);
      if (!inv) throw new UserFacingError("Invoice not found.", 404);
      if (inv.total - inv.paid <= 0)
        throw new UserFacingError("This invoice is already paid.", 409);
      set.payments = [...e.payments, { invoiceId: a.invoiceId, method: a.method, at: now }];
      text = `Payment submitted for ${inv.number} (demo only: no money is taken)`;
      break;
    }
    case "referral-answer": {
      if (!c.mrn) throw new UserFacingError("Referral not found.", 404);
      if (!a.text.trim() && !a.file)
        throw new UserFacingError("Write an answer or attach a document.");
      const ref = await patientReferral(c.mrn, a.ref);
      await answerInfo(
        ref,
        [a.text.trim(), a.file ? `Attached: ${a.file}` : ""].filter(Boolean).join(". "),
        [],
      );
      if (a.file)
        set.uploads = [
          ...e.uploads,
          { name: a.file, category: "Referral", status: "Received, waiting for review", at: now },
        ];
      text = `Sent the information for ${a.ref}; it's back with our team`;
      break;
    }
    case "referral-withdraw": {
      if (!c.mrn) throw new UserFacingError("Referral not found.", 404);
      await withdrawReferral(
        await patientReferral(c.mrn, a.ref),
        `Withdrawn by the patient: ${a.reason}`,
      );
      text = `Withdrew referral ${a.ref}`;
      break;
    }
    case "dispute": {
      const inv = (await patientInvoices(c._id)).find((i) => i.id === a.invoiceId);
      if (!inv) throw new UserFacingError("Invoice not found.", 404);
      set.disputes = [...(e.disputes ?? []), { invoiceId: a.invoiceId, reason: a.reason, at: now }];
      await insertTask(u.name, {
        title: `Invoice query: ${inv.number} (${c.name})`,
        category: "Billing",
        status: "New",
        priority: "Normal",
        urgentReason: "",
        team: "Finance",
        assigneeId: null,
        assigneeName: null,
        related: { kind: "Invoice", ref: inv.number, label: inv.number, href: "/care/billing" },
        clientId: c._id,
        referralId: null,
        appointmentId: null,
        participant: c.name,
        service: "",
        discipline: "",
        locationType: "",
        dueAt: new Date(now.getTime() + 3 * DAY),
        sla: "Standard",
        visibility: "Internal",
        source: "Rule",
        ruleCode: "PAT-22",
        ruleVersion: 1,
        idemKey: `dispute:${a.invoiceId}:${now.getTime()}`,
        restrictedNote: null,
        recordingHref: null,
        suggestion: false,
        scenario: null,
        checklist: [{ label: a.reason.slice(0, 120) }],
        historyNote: "Raised from the patient app",
      });
      text = `Raised a query about invoice ${inv.number}; Finance will reply`;
      break;
    }
    case "consent-withdraw": {
      const item = consentItems.find((x) => x.key === a.key);
      if (!item) throw new UserFacingError("Consent not found.", 404);
      set.consentRequests = [
        ...(e.consentRequests ?? []),
        { key: a.key, reason: a.reason, at: now },
      ];
      await requestTask(u, c, `Consent withdrawal: ${item.label}`, a.key);
      text = `Asked to withdraw consent for ${item.label.toLowerCase()}; our team confirms the change`;
      break;
    }
    case "read":
      set.read = [...new Set([...e.read, a.id])];
      text = "Opened a document";
      break;
  }
  set.activity = [...e.activity, { at: now, text }].slice(-60);
  await col.updateOne({ _id: c._id }, { $set: set });
  await audit(u, `Patient app: ${text}`, c._id);
  const { users } = await collections();
  await publish(
    [
      ...(await users.find({ role: "admin" }, { projection: { _id: 1 } }).toArray()).map(
        (x) => x._id,
      ),
      u._id,
    ],
    "care",
    { clientId: c._id.toHexString() },
  );
  return { ok: true, message: text };
}

async function requestTask(
  u: UserDoc,
  c: ClientDoc,
  title: string,
  requestId: string,
  team: "Intake" | "Clinical" | "Scheduling" = "Intake",
) {
  await insertTask(u.name, {
    title: `${title}: ${c.name}`,
    category:
      team === "Scheduling" ? "Scheduling" : team === "Clinical" ? "Clinical Review" : "Referral",
    status: "New",
    priority: "Normal",
    urgentReason: "",
    team,
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
    service: "",
    discipline: "",
    locationType: "",
    dueAt: new Date(Date.now() + 2 * DAY),
    sla: "Standard",
    visibility: "Internal",
    source: "Rule",
    ruleCode: "PAT-19",
    ruleVersion: 1,
    idemKey: `patient:${c._id.toHexString()}:${title}:${requestId || Date.now()}`,
    restrictedNote: null,
    recordingHref: null,
    suggestion: false,
    scenario: null,
    checklist: [],
    historyNote: "Raised from the patient app",
  });
}

/** Patient questions and check-ins land in the treating therapist's Module 17 task list. */
export async function careTask(
  c: ClientDoc,
  planId: string,
  category: "Clinical Follow-up" | "Safety Review",
  title: string,
  priority: string,
) {
  const db = await collections();
  const plan = ObjectId.isValid(planId)
    ? await db.plans.findOne({ _id: new ObjectId(planId) })
    : null;
  const need = c.needs.find((n) => n.id === plan?.needId) ?? c.needs.find((n) => n.therapistId);
  const assignee = need?.therapistId
    ? await db.users.findOne({ therapistId: need.therapistId }, { projection: { name: 1 } })
    : null;
  if (!assignee) return;
  const now = new Date();
  await (
    await taskCol()
  ).insertOne({
    _id: new ObjectId(),
    ref: await nextTaskRef(),
    title,
    category,
    source: "Automation",
    sourceLink: null,
    clientId: c._id,
    needId: need?.id ?? null,
    discipline: need?.discipline ?? "",
    assigneeId: assignee._id,
    assigneeName: assignee.name,
    creatorId: null,
    collaborators: [],
    priority,
    status: "Open",
    dueAt: new Date(now.getTime() + (priority === "High" ? 1 : 3) * DAY),
    reminder: "24h Before",
    visibility: "Care Team",
    instructions:
      "Raised from the patient app. Reply through secure messages; the plan doesn't change unless you revise it.",
    checklist: [],
    fields: blankFields(),
    outcome: "",
    escalation: null,
    cancelReason: "",
    waitReason: "",
    completed: null,
    comments: [],
    history: [{ at: now, by: "Patient app", action: "Created from the patient app", reason: "" }],
    suggestion: null,
    aiDraft: null,
    sync: "Synced",
    conflict: null,
    opsTaskId: null,
    createdAt: now,
  });
  await notify([assignee._id], { title, body: c.name, href: "/therapist/coordination" });
}

/* ------------------------------------------------------------------ admin review of patient requests */

export async function patientRequests(u: UserDoc) {
  if (u.role !== "admin") return [];
  const db = await collections();
  const exts = await (await extCol()).find({ "requests.0": { $exists: true } }).toArray();
  const clients = await db.clients
    .find({ _id: { $in: exts.map((x) => x._id) } }, { projection: { name: 1, mrn: 1 } })
    .toArray();
  return exts
    .flatMap((x) =>
      x.requests.map((r) => ({
        ...r,
        at: r.at.toISOString(),
        clientId: x._id.toHexString(),
        participant: clients.find((c) => c._id.equals(x._id))?.name ?? "",
        mrn: clients.find((c) => c._id.equals(x._id))?.mrn ?? "",
      })),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
}

export async function decideRequest(
  u: UserDoc,
  id: string,
  decision: "Approve" | "Reject",
  reason: string,
) {
  if (u.role !== "admin") throw new UserFacingError("Only staff review patient requests.", 409);
  const col = await extCol();
  const x = await col.findOne({ "requests.id": id });
  const r = x?.requests.find((y) => y.id === id);
  if (!x || !r) throw new UserFacingError("Request not found.", 404);
  if (r.status !== "Pending") throw new UserFacingError("This request was already decided.", 409);
  if (decision === "Reject" && reason.length < 3)
    throw new UserFacingError("Give the reason the patient will see.");
  const db = await collections();
  if (decision === "Approve" && r.kind === "Identity") {
    const c = await db.clients.findOne({ _id: x._id });
    if (c) {
      if (r.field === "Date of birth")
        await db.clients.updateOne({ _id: c._id }, { $set: { dateOfBirth: r.to } });
      else {
        const [first, ...rest] = c.name.split(" ");
        const name =
          r.field === "Legal first name" ? [r.to, ...rest].join(" ") : `${first} ${r.to}`;
        await db.clients.updateOne({ _id: c._id }, { $set: { name } });
      }
    }
  }
  await col.updateOne(
    { _id: x._id, "requests.id": id },
    {
      $set: {
        "requests.$.status": decision === "Approve" ? "Approved" : "Rejected",
        "requests.$.reason": reason,
        "requests.$.decidedBy": u.name,
      },
      $push: {
        activity: {
          at: new Date(),
          text: `${r.field} request ${decision === "Approve" ? "approved" : "not approved"}${reason ? `: ${reason}` : ""}`,
        },
      },
    },
  );
  await audit(
    u,
    `${decision === "Approve" ? "Approved" : "Rejected"} a patient ${r.field.toLowerCase()} request`,
    x._id,
  );
  return { ok: true };
}
