import "server-only";
import { can } from "./permissions";
import { ObjectId } from "mongodb";
import { generateJson } from "@/lib/ai/engine";
import type {
  AgentPatientDto,
  AgentTaskDto,
  AgentVisitDto,
  BookingAction,
  BookingAgentDto,
  BookingTask,
  ClinicianOptionDto,
  ParsedRequest,
  ProposeResult,
} from "@/lib/live/booking";
import { slotLabel } from "@/lib/live/time";
import { propose, registerTool } from "./agent";
import { matchesFor, requestTherapist } from "./care-admin";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { audit, notify, publish } from "./live";
import { isSlotFree, openSlots } from "./matching";
import type { AppointmentDoc, ClientDoc, TherapistDoc, UserDoc } from "./models";
import { scheduleAction } from "./scheduling";
import { staffBlocks } from "./staff";

/*
 * The booking agent (spec v2.0 A09, therapist booking, patient self-booking): a guided assistant
 * with fixed tasks. It offers only real open slots, re-checks them when the person confirms, and
 * the database's one-visit-per-slot index stops a double booking even in a race.
 */

const TASKS: Record<BookingAgentDto["role"], AgentTaskDto[]> = {
  admin: [
    {
      id: "assign",
      title: "Assign and book a waiting patient",
      detail: "Match a therapist, then hold a first visit",
    },
    { id: "book", title: "Book a visit", detail: "For a patient who already has a therapist" },
    {
      id: "reschedule",
      title: "Reschedule a visit",
      detail: "Move an upcoming visit to a real free time",
    },
  ],
  therapist: [
    {
      id: "book",
      title: "Book a follow-up visit",
      detail: "One of your patients, in your own free time",
    },
    {
      id: "reschedule",
      title: "Reschedule one of my visits",
      detail: "Move it to another free time",
    },
  ],
  client: [
    { id: "book", title: "Book a visit", detail: "With your own therapist, at a time that's free" },
    { id: "reschedule", title: "Reschedule my next visit", detail: "Pick another free time" },
    { id: "cancel", title: "Cancel my next visit", detail: "Sends a cancellation to the team" },
  ],
};

function roleOf(u: UserDoc): BookingAgentDto["role"] {
  if (u.role === "admin" || u.role === "therapist" || u.role === "client") return u.role;
  throw new UserFacingError("The booking agent isn't available for this account.", 409);
}

/** The patients this person may book for: all active (admin), their own caseload, or themselves. */
async function scope(u: UserDoc) {
  const { clients } = await collections();
  const role = roleOf(u);
  const filter =
    role === "admin"
      ? { discharged: { $in: [null] } }
      : role === "therapist"
        ? { "needs.therapistId": u.therapistId, discharged: { $in: [null] } }
        : { _id: u.clientId ?? new ObjectId() };
  return clients
    .find(filter as never)
    .sort({ name: 1 })
    .limit(role === "admin" ? 400 : 60)
    .toArray();
}

async function allowed(u: UserDoc, clientId: string) {
  if (!ObjectId.isValid(clientId)) throw new UserFacingError("Patient not found.", 404);
  const c = (await scope(u)).find((x) => x._id.equals(new ObjectId(clientId)));
  if (!c) throw new UserFacingError("Patient not found.", 404);
  return c;
}

async function therapistMap(ids: ObjectId[]) {
  const { therapists } = await collections();
  const list = await therapists.find({ _id: { $in: ids } }).toArray();
  return new Map(list.map((t) => [t._id.toHexString(), t]));
}

export async function bookingAgentView(u: UserDoc): Promise<BookingAgentDto> {
  const role = roleOf(u);
  const { appointments } = await collections();
  const cs = await scope(u);
  const tIds = cs
    .flatMap((c) => c.needs.map((n) => n.therapistId))
    .filter((x): x is ObjectId => x !== null);
  const visitsRaw = await appointments
    .find({
      clientId: { $in: cs.map((c) => c._id) },
      status: { $in: ["booked", "tentative"] },
      start: { $gte: new Date() },
      ...(role === "therapist" && u.therapistId ? { therapistId: u.therapistId } : {}),
    })
    .sort({ start: 1 })
    .limit(role === "admin" ? 25 : 12)
    .toArray();
  const ts = await therapistMap([...tIds, ...visitsRaw.map((v) => v.therapistId)]);
  const name = (c: ClientDoc) => c.name;
  const patients: AgentPatientDto[] = cs
    .filter((c) => c.needs.length)
    .map((c) => ({
      id: c._id.toHexString(),
      name: name(c),
      mrn: c.mrn ?? "",
      needs: c.needs.map((n) => ({
        id: n.id,
        support: n.support,
        status: n.status,
        therapist: n.therapistId ? (ts.get(n.therapistId.toHexString())?.name ?? null) : null,
      })),
    }));
  const visits: AgentVisitDto[] = visitsRaw.map((v) => {
    const c = cs.find((x) => x._id.equals(v.clientId));
    return {
      id: v._id.toHexString(),
      ref: v.ref ?? `APT-${v._id.toHexString().slice(-6).toUpperCase()}`,
      start: v.start.toISOString(),
      patient: c?.name ?? "Patient",
      clientId: v.clientId.toHexString(),
      therapist: ts.get(v.therapistId.toHexString())?.name ?? "Therapist",
      service: c?.needs.find((n) => n.id === v.needId)?.support ?? v.discipline,
      modality: v.modality ?? "In person",
    };
  });
  return { role, name: u.name, tasks: TASKS[role], patients, visits };
}

/* ------------------------------------------------------------------ understanding a request */

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function parseLocally(text: string, patients: AgentPatientDto[]): ParsedRequest {
  const t = text.toLowerCase();
  const task: BookingTask | null = /cancel/.test(t)
    ? "cancel"
    : /reschedul|move|change (the|my) (time|visit)/.test(t)
      ? "reschedule"
      : /assign|waiting|allocate|match/.test(t)
        ? "assign"
        : /book|schedul|appointment|visit|follow.?up/.test(t)
          ? "book"
          : null;
  const p = patients.find((x) =>
    x.name
      .toLowerCase()
      .split(" ")
      .some((w) => w.length > 2 && new RegExp(`\\b${w}\\b`).test(t)),
  );
  const day = WEEKDAYS.find((d) => t.includes(d)) ?? (t.includes("tomorrow") ? "tomorrow" : null);
  return {
    task,
    patientId: p?.id ?? null,
    day,
    part: /morning|\bam\b/.test(t) ? "morning" : /afternoon|\bpm\b/.test(t) ? "afternoon" : null,
    telehealth: /video|telehealth|online/.test(t),
    ai: false,
  };
}

async function parse(u: UserDoc, text: string): Promise<ParsedRequest> {
  const view = await bookingAgentView(u);
  const local = parseLocally(text, view.patients);
  try {
    const out = await generateJson("booking-agent-parse", {
      system:
        "Read a scheduling request. Return the task (book, assign, reschedule, cancel or none), the patient's name exactly as written or an empty string, a weekday in lower case or 'tomorrow' or an empty string, part of day (morning, afternoon or empty) and whether it is a video visit. Never invent a name.",
      user: `Allowed tasks for this person: ${view.tasks.map((x) => x.id).join(", ")}\nRequest: ${text}`,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["task", "patient", "day", "part", "telehealth"],
        properties: {
          task: { type: "string" },
          patient: { type: "string" },
          day: { type: "string" },
          part: { type: "string" },
          telehealth: { type: "boolean" },
        },
      } as never,
      schemaName: "booking_request",
      maxTokens: 120,
    });
    const r = JSON.parse(out.text) as {
      task: string;
      patient: string;
      day: string;
      part: string;
      telehealth: boolean;
    };
    const allowedTasks = view.tasks.map((x) => x.id) as string[];
    const p = r.patient ? parseLocally(r.patient, view.patients).patientId : null;
    return {
      task: allowedTasks.includes(r.task) ? (r.task as BookingTask) : local.task,
      patientId: p ?? local.patientId,
      day: WEEKDAYS.includes(r.day) || r.day === "tomorrow" ? r.day : local.day,
      part: r.part === "morning" || r.part === "afternoon" ? r.part : local.part,
      telehealth: r.telehealth || local.telehealth,
      ai: true,
    };
  } catch {
    return local;
  }
}

/* ------------------------------------------------------------------ options and proposals */

async function heldFor(t: TherapistDoc, except?: ObjectId) {
  const { appointments } = await collections();
  return (
    await appointments
      .find({ therapistId: t._id, holdsSlot: true, start: { $gte: new Date() } })
      .toArray()
  ).filter((a) => !except || !a._id.equals(except));
}

async function visitFor(u: UserDoc, c: ClientDoc, appointmentId?: string) {
  const { appointments } = await collections();
  const filter: Record<string, unknown> = {
    clientId: c._id,
    status: { $in: ["booked", "tentative"] },
    start: { $gte: new Date() },
  };
  if (appointmentId && ObjectId.isValid(appointmentId)) filter._id = new ObjectId(appointmentId);
  if (u.role === "therapist" && u.therapistId) filter.therapistId = u.therapistId;
  const v = await appointments.findOne(filter as never, { sort: { start: 1 } });
  if (!v) throw new UserFacingError("There's no upcoming visit to change.", 404);
  return v;
}

function needFor(c: ClientDoc, task: BookingTask, needId?: string) {
  const fit = (n: ClientDoc["needs"][number]) =>
    task === "assign" ? n.status === "needs-therapist" : n.therapistId !== null;
  const n = c.needs.find((x) => x.id === needId && fit(x)) ?? c.needs.find(fit);
  if (!n)
    throw new UserFacingError(
      task === "assign"
        ? `${c.name} isn't waiting for a therapist.`
        : `${c.name} doesn't have a therapist yet. Use "Assign and book" first.`,
      409,
    );
  return n;
}

async function options(u: UserDoc, a: Extract<BookingAction, { type: "options" }>) {
  const c = await allowed(u, a.clientId);
  const { therapists } = await collections();
  if (a.task === "assign") {
    if (u.role !== "admin" || !can(u, "schedule.assign"))
      throw new UserFacingError("Only the scheduling team assigns therapists.", 409);
    const need = needFor(c, "assign", a.needId);
    const ranked = (await matchesFor(c._id, need.id)).filter((m) => m.eligible).slice(0, 3);
    const list: ClinicianOptionDto[] = ranked.map((m) => ({
      therapistId: m.therapistId,
      name: m.name,
      discipline: m.discipline,
      region: m.region,
      score: m.score,
      reasons: m.reasons.slice(0, 3).map((r) => r.label),
      slots: m.slots.slice(0, 6),
    }));
    return { needId: need.id, support: need.support, clinicians: list, visit: null };
  }
  if (a.task === "reschedule" || a.task === "cancel") {
    const v = await visitFor(u, c, a.appointmentId);
    const t = await therapists.findOne({ _id: v.therapistId });
    if (!t) throw new UserFacingError("Therapist not found.", 404);
    const slots =
      a.task === "cancel" ? [] : openSlots(t, await heldFor(t, v._id), { limit: 6, perDay: 2 });
    return {
      needId: v.needId ?? "",
      support: c.needs.find((n) => n.id === v.needId)?.support ?? v.discipline,
      clinicians: [
        {
          therapistId: t._id.toHexString(),
          name: t.name,
          discipline: t.discipline,
          region: t.region,
          score: null,
          reasons: ["Keeps the same therapist"],
          slots: slots.map((s) => s.toISOString()),
        },
      ],
      visit: { id: v._id.toHexString(), ref: v.ref ?? "", start: v.start.toISOString() },
    };
  }
  const need = needFor(c, "book", a.needId);
  const t = need.therapistId ? await therapists.findOne({ _id: need.therapistId }) : null;
  if (!t) throw new UserFacingError("Therapist not found.", 404);
  if (u.role === "therapist" && !t._id.equals(u.therapistId ?? new ObjectId()))
    throw new UserFacingError("That patient sees another therapist for this service.", 409);
  const slots = openSlots(t, await heldFor(t), { limit: 6, perDay: 2 });
  return {
    needId: need.id,
    support: need.support,
    clinicians: [
      {
        therapistId: t._id.toHexString(),
        name: t.name,
        discipline: t.discipline,
        region: t.region,
        score: null,
        reasons: ["Their current therapist: continuity of care"],
        slots: slots.map((s) => s.toISOString()),
      },
    ],
    visit: null,
  };
}

async function slotOk(therapistId: string, start: string, except?: ObjectId) {
  const { therapists } = await collections();
  const t = ObjectId.isValid(therapistId)
    ? await therapists.findOne({ _id: new ObjectId(therapistId) })
    : null;
  if (!t) return { t: null, ok: false };
  return { t, ok: isSlotFree(t, new Date(start), await heldFor(t, except)) };
}

async function proposeBooking(
  u: UserDoc,
  a: Extract<BookingAction, { type: "propose" }>,
): Promise<ProposeResult> {
  const c = await allowed(u, a.clientId);
  const who = u.role === "client" ? "You" : u.name;
  const feature = u.role === "admin" ? "A09" : u.role === "therapist" ? "T-BOOK" : "P-BOOK";
  if (a.task === "cancel") {
    const v = await visitFor(u, c, a.appointmentId);
    const proposal = await propose(u, "P-CHG", {
      tool: "PortalChange",
      title: `Cancel ${v.ref ?? "your visit"} on ${slotLabel(v.start)}`,
      record: { label: v.ref ?? "Visit", href: null },
      before: `Booked · ${slotLabel(v.start)}`,
      after: "Cancellation sent to the scheduling team",
      preconditions: [
        { label: "Visit is still upcoming", ok: true },
        {
          label:
            v.start.getTime() - Date.now() > 86_400_000
              ? "More than 24 hours' notice"
              : "Late notice: a fee may apply",
          ok: true,
        },
      ],
      approver: who,
      args: {
        appointmentId: v._id.toHexString(),
        kind: "Cancel",
        reason: a.reason || "Cancelled through the booking agent",
        label: v.ref ?? "",
      },
      idemKey: `BK-CAN:${v._id.toHexString()}`,
    });
    return { proposal, summary: `Ready to cancel ${slotLabel(v.start)}. Confirm to send it.` };
  }
  if (!a.start || !a.therapistId) throw new UserFacingError("Pick a time first.", 400);
  if (a.task === "reschedule") {
    const v = await visitFor(u, c, a.appointmentId);
    const { t, ok } = await slotOk(a.therapistId, a.start, v._id);
    const proposal = await propose(u, feature, {
      tool: "MoveVisit",
      title: `Move ${v.ref ?? "visit"} to ${slotLabel(a.start)}`,
      record: {
        label: `${c.name} · ${v.ref ?? ""}`,
        href: u.role === "client" ? null : `/care/${c._id.toHexString()}`,
      },
      before: `${slotLabel(v.start)} with ${t?.name ?? "therapist"}`,
      after: `${slotLabel(a.start)} with ${t?.name ?? "therapist"} · both notified`,
      preconditions: [
        { label: `${t?.name ?? "Therapist"} is free then (hours, leave, travel buffer)`, ok },
        { label: "Same therapist kept", ok: true },
      ],
      approver: who,
      args: {
        appointmentId: v._id.toHexString(),
        start: a.start,
        expectedStart: v.start.toISOString(),
        reason: a.reason || "Rescheduled through the booking agent",
      },
      idemKey: `BK-MOVE:${v._id.toHexString()}:${a.start}`,
    });
    return { proposal, summary: `${slotLabel(a.start)} is free. Confirm to move the visit.` };
  }
  const need = needFor(c, a.task, a.needId);
  const { t, ok } = await slotOk(a.therapistId, a.start);
  const blocks = t ? staffBlocks(t, need.support, null) : ["Therapist not found"];
  if (a.task === "assign") {
    const proposal = await propose(u, "A07", {
      tool: "AssignAndBook",
      title: `Assign ${t?.name ?? "therapist"} to ${c.name} and hold ${slotLabel(a.start)}`,
      record: { label: c.name, href: `/care/${c._id.toHexString()}` },
      before: `${need.support}: waiting for a therapist`,
      after: `First visit held ${slotLabel(a.start)}; ${t?.name ?? "the therapist"} asked to accept`,
      preconditions: [
        { label: "Registration, screening and scope current", ok: blocks.length === 0 },
        { label: "Slot is free (hours, leave, travel buffer)", ok },
      ],
      approver: u.name,
      args: {
        clientId: c._id.toHexString(),
        needId: need.id,
        therapistId: a.therapistId,
        start: a.start,
      },
      idemKey: `BK-ASSIGN:${c._id.toHexString()}:${need.id}`,
    });
    return {
      proposal,
      summary: `${t?.name} can take ${c.name}. Confirm to hold the first visit and ask them to accept.`,
    };
  }
  const tentative = u.role === "client";
  const proposal = await propose(u, feature, {
    tool: "BookVisit",
    title: `Book ${need.support} with ${t?.name ?? "therapist"}, ${slotLabel(a.start)}`,
    record: { label: c.name, href: u.role === "client" ? null : `/care/${c._id.toHexString()}` },
    before: "No visit at this time",
    after: `${a.telehealth ? "Telehealth" : "In-person"} visit ${tentative ? "held for you; the clinic confirms it" : "booked"} · ${slotLabel(a.start)}`,
    preconditions: [
      { label: `${t?.name ?? "Therapist"} is free then (hours, leave, travel buffer)`, ok },
      { label: "Patient's current therapist for this service", ok: true },
      ...(blocks.length ? [{ label: `Clinician can take visits (${blocks[0]})`, ok: false }] : []),
    ],
    approver: who,
    args: {
      clientId: c._id.toHexString(),
      needId: need.id,
      therapistId: a.therapistId,
      start: a.start,
      telehealth: a.telehealth,
      tentative,
    },
    idemKey: `BK-BOOK:${c._id.toHexString()}:${a.therapistId}:${a.start}`,
  });
  return {
    proposal,
    summary: `${slotLabel(a.start)} is free with ${t?.name}. Confirm to book it.`,
  };
}

export async function bookingAgentAction(u: UserDoc, a: BookingAction) {
  roleOf(u);
  if (a.type === "parse") return { parsed: await parse(u, a.text) };
  if (a.type === "options") return await options(u, a);
  return await proposeBooking(u, a);
}

/* ------------------------------------------------------------------ tools */

async function nextAptRef() {
  const { db } = await collections();
  const r = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: "appointment" },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return `APT-${String(r?.seq ?? 1).padStart(6, "0")}`;
}

registerTool("BookVisit", async (u, a) => {
  const { clients, therapists, appointments, users } = await collections();
  const c = await clients.findOne({ _id: new ObjectId(String(a.clientId)) });
  const t = await therapists.findOne({ _id: new ObjectId(String(a.therapistId)) });
  if (!c || !t) throw new Error("Patient or therapist not found.");
  const need = c.needs.find((n) => n.id === a.needId);
  if (!need) throw new Error("Service not found.");
  const start = new Date(String(a.start));
  if (!isSlotFree(t, start, await heldFor(t)))
    throw new Error(`${slotLabel(start)} was just taken. Ask the agent for new times.`);
  const ref = await nextAptRef();
  const doc: AppointmentDoc = {
    _id: new ObjectId(),
    therapistId: t._id,
    clientId: c._id,
    discipline: need.discipline,
    start,
    end: new Date(start.getTime() + t.sessionMinutes * 60_000),
    status: a.tentative ? "tentative" : "booked",
    holdsSlot: true,
    needId: need.id,
    modality: a.telehealth ? "Telehealth" : "In person",
    ref,
    createdAt: new Date(),
  } as AppointmentDoc;
  try {
    await appointments.insertOne(doc);
  } catch {
    throw new Error(`${slotLabel(start)} was just taken. Ask the agent for new times.`);
  }
  const cu = await users.findOne({ clientId: c._id }, { projection: { _id: 1 } });
  const tu = await users.findOne({ therapistId: t._id }, { projection: { _id: 1 } });
  await notify(
    [cu?._id ?? null, tu?._id ?? null].filter((x): x is ObjectId => x !== null),
    {
      title: `Visit ${a.tentative ? "requested" : "booked"}: ${slotLabel(start)}`,
      body: `${need.support} with ${t.name}${a.telehealth ? " (telehealth)" : ""}. Booked through the booking agent by ${u.name}.`,
      href: "/mobile/patient",
    },
  );
  await audit(
    u,
    `Booking agent: ${ref} ${a.tentative ? "held" : "booked"} for ${c.name} with ${t.name}, ${slotLabel(start)}`,
    c._id,
  );
  const ids = (await users.find({ role: "admin" }, { projection: { _id: 1 } }).toArray()).map(
    (x) => x._id,
  );
  await publish([...ids, ...(tu ? [tu._id] : []), ...(cu ? [cu._id] : [])], "care", {
    clientId: c._id.toHexString(),
  });
  return `${ref} ${a.tentative ? "held for the clinic to confirm" : "booked"}: ${need.support} with ${t.name}, ${slotLabel(start)}`;
});

registerTool("MoveVisit", async (u, a) => {
  await scheduleAction(u, new ObjectId(String(a.appointmentId)), {
    type: "move",
    start: String(a.start),
    expectedStart: String(a.expectedStart),
    reason: String(a.reason || "Rescheduled through the booking agent"),
  });
  return `Visit moved to ${slotLabel(String(a.start))}; the patient and therapist were notified`;
});

registerTool("AssignAndBook", async (u, a) => {
  if (u.role !== "admin") throw new Error("Only the scheduling team assigns therapists.");
  await requestTherapist(u, new ObjectId(String(a.clientId)), {
    needId: String(a.needId),
    therapistId: String(a.therapistId),
    start: String(a.start),
  });
  return `First visit held ${slotLabel(String(a.start))}; the therapist has been asked to accept`;
});
