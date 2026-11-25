import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { generateJson } from "@/lib/ai/engine";
import { AiError } from "@/lib/ai/types";
import { assessmentGaps, templateFor } from "@/lib/live/clinical";
import type { Discipline, ServiceLocation, Support } from "@/lib/live/catalogue";
import {
  addDays,
  ageLabel,
  atBrisbane,
  brisbaneDay,
  brisbaneMinutes,
  isoWeekday,
} from "@/lib/live/time";
import {
  defaultPrefs,
  priorityLabel,
  taskStatusLabel,
  type ConsentReadiness,
  type DeliveryMode,
  type DocStatus,
  type LocationReadiness,
  type WorkspaceAction,
  type WorkspaceDto,
  type WsAlert,
  type WsAssessment,
  type WsBlock,
  type WsBrief,
  type WsNote,
  type WsBriefPoint,
  type WsVisit,
} from "@/lib/live/workspace";
import { collections } from "./db";
import { appointmentDto, nameMap, seriesLookup } from "./dto";
import { UserFacingError } from "./http";
import { audit, notify, publish } from "./live";
import type { AppointmentDoc, AssessmentDoc, ClientDoc, TherapistDoc, UserDoc } from "./models";
import { nextMrn } from "./mrn";
import { insertTask } from "./operations";

const HOUR = 3_600_000;
const DAY = 86_400_000;
/** A Clinical Lead who isn't also the Super Admin owns supervision work first. */
const dedicatedLead = (u: Pick<UserDoc, "staffRoles">) =>
  Boolean(u.staffRoles?.includes("Clinical Lead") && !u.staffRoles.includes("Super Admin"));
const isLead = (u: Pick<UserDoc, "staffRoles">) =>
  Boolean(u.staffRoles?.some((r) => r === "Clinical Lead" || r === "Super Admin"));

async function me(user: UserDoc): Promise<TherapistDoc> {
  const { therapists } = await collections();
  const t = user.therapistId ? await therapists.findOne({ _id: user.therapistId }) : null;
  if (!t) throw new UserFacingError("Only a therapist has a workspace.", 404);
  return t;
}

/* ------------------------------------------------------------ scenarios (11) */

type Scenario = {
  code: string;
  first: string;
  last: string;
  dob: string;
  suburb: string;
  discipline: Discipline;
  support: Support;
  frequency: "Assessment" | "Weekly" | "Fortnightly";
  location: ServiceLocation;
  minutes: number;
  length: number;
  dayOffset: number;
  purpose: NonNullable<AppointmentDoc["purpose"]>;
  site: NonNullable<AppointmentDoc["site"]>;
  precautions: string | null;
  recording: "Given" | "Refused" | null;
  travel: number | null;
  notes: string;
};

const site = (
  s: Partial<NonNullable<AppointmentDoc["site"]>>,
): NonNullable<AppointmentDoc["site"]> => ({
  location: "Home",
  locationChangeReason: "",
  address: "",
  accessNotes: "",
  parking: "",
  pets: "",
  supportPerson: "",
  siteName: "",
  siteContact: "",
  sitePhone: "",
  room: "",
  permission: false,
  deviceCheck: false,
  consentPlan: false,
  attendees: "",
  ...s,
});

/** The five fictional records from section 11, each with a clinician of that discipline. */
const scenarios: Scenario[] = [
  {
    code: "APT-1001",
    first: "Jordan",
    last: "Mills",
    dob: "2011-05-18",
    suburb: "Aspley",
    discipline: "Occupational Therapy",
    support: "Functional Capacity Assessment",
    frequency: "Assessment",
    location: "Home",
    minutes: 10 * 60,
    length: 90,
    dayOffset: 0,
    purpose: "Initial Assessment",
    site: site({
      address: "14 Albany Creek Road, Aspley QLD 4034",
      accessNotes: "Side gate, ring the bell at the back door.",
      parking: "Street parking out the front",
      pets: "One friendly dog, kept inside",
      supportPerson: "Karen Mills (mother)",
      attendees: "Jordan, Karen Mills",
      permission: true,
      consentPlan: true,
    }),
    precautions: null,
    recording: null,
    travel: 25,
    notes: "FCA in two parts: home routines today, community access on visit 2.",
  },
  {
    code: "APT-1002",
    first: "Emma",
    last: "Carter",
    dob: "2017-09-02",
    suburb: "Kedron",
    discipline: "Speech Pathology",
    support: "Speech Therapy",
    frequency: "Weekly",
    location: "School",
    minutes: 11 * 60 + 30,
    length: 45,
    dayOffset: 0,
    purpose: "Treatment Session",
    site: site({
      location: "School",
      address: "Kedron State School, 72 Park Road, Kedron QLD 4031",
      siteName: "Kedron State School",
      siteContact: "Ms R Patel (learning support)",
      sitePhone: "07 3000 3333",
      room: "Library meeting room",
      accessNotes: "Sign in at the office; visitor lanyard required.",
      attendees: "Emma, learning support teacher",
      permission: false,
      consentPlan: false,
    }),
    precautions: null,
    recording: null,
    travel: 15,
    notes: "School asked for this term's sessions in the library room.",
  },
  {
    code: "APT-1003",
    first: "Noah",
    last: "Bennett",
    dob: "1979-12-11",
    suburb: "Carina",
    discipline: "Physiotherapy",
    support: "Physiotherapy",
    frequency: "Weekly",
    location: "Home",
    minutes: 14 * 60,
    length: 60,
    dayOffset: 0,
    purpose: "Treatment Session",
    site: site({
      address: "9 Creek Road, Carina QLD 4152",
      accessNotes: "Ground floor unit 2, ramp at the side.",
      parking: "Visitor bay 3",
      supportPerson: "",
      attendees: "Noah",
      permission: true,
      consentPlan: true,
    }),
    precautions: "Falls risk on stairs: complete balance work on level ground.",
    recording: null,
    travel: 30,
    notes: "Knee rehabilitation after surgery; home exercise program.",
  },
  {
    code: "APT-1004",
    first: "Olivia",
    last: "Reed",
    dob: "1996-03-27",
    suburb: "Toowong",
    discipline: "Psychology",
    support: "Psychological Therapy",
    frequency: "Fortnightly",
    location: "Telehealth",
    minutes: 15 * 60,
    length: 50,
    dayOffset: 0,
    purpose: "Telehealth Consultation",
    site: site({
      location: "Telehealth",
      attendees: "Olivia",
      deviceCheck: false,
      consentPlan: true,
    }),
    precautions: null,
    recording: "Refused",
    travel: null,
    notes: "Prefers telehealth. Recording declined: sessions are never recorded.",
  },
  {
    code: "APT-1005",
    first: "William",
    last: "Park",
    dob: "1946-07-30",
    suburb: "Nundah",
    discipline: "Nursing",
    support: "Nursing",
    frequency: "Weekly",
    location: "Home",
    minutes: 16 * 60 + 30,
    length: 45,
    dayOffset: 0,
    purpose: "Treatment Session",
    site: site({
      address: "3 Bage Street, Nundah QLD 4012",
      accessNotes: "Key safe by the front door; code from the care team.",
      parking: "Driveway",
      supportPerson: "Grace Park (daughter, by phone)",
      attendees: "William",
      permission: true,
      consentPlan: true,
    }),
    precautions: null,
    recording: null,
    travel: 20,
    notes: "Wound review and medication check; hand over to the GP practice nurse.",
  },
];

const g = globalThis as unknown as { __m10Seed?: Promise<void> };

/** Creates the section 11 records once; afterwards keeps untouched ones on today's date. */
export async function ensureWorkspaceScenarios() {
  g.__m10Seed ??= seed().catch((e: unknown) => {
    g.__m10Seed = undefined;
    throw e;
  });
  await g.__m10Seed;
  await rollScenarios();
}

async function seed() {
  const db = await collections();
  const flags = db.db.collection<{ _id: string; at: Date }>("settings");
  if (await flags.findOne({ _id: "m10Scenarios" })) return;
  const jo = await db.users.findOne({ email: "jo.marsh@medisense.test" });
  const therapists = await db.therapists.find({ active: { $ne: false } }).toArray();
  if (!jo || !therapists.length) return;
  const today = brisbaneDay(new Date());
  const preferred: Partial<Record<Discipline, string>> = {
    "Occupational Therapy": "Sarah Thompson",
    "Speech Pathology": "Marcus Bell",
    Physiotherapy: "Olivia Reyes",
    Psychology: "Nadia Hassan",
    Nursing: "Lucy Grant",
  };
  for (const s of scenarios) {
    const t =
      therapists.find((x) => x.name === preferred[s.discipline]) ??
      therapists.find((x) => x.discipline === s.discipline);
    if (!t) continue;
    const name = `${s.first} ${s.last}`;
    if (await db.clients.findOne({ name, "needs.discipline": s.discipline })) continue;
    const clientId = new ObjectId();
    const userId = new ObjectId();
    const needId = randomUUID();
    const now = new Date();
    const email = `${s.first}.${s.last}.m10@example.test`.toLowerCase();
    await db.users.insertOne({
      _id: userId,
      email,
      name,
      role: "client",
      passwordHash: null,
      invite: null,
      therapistId: null,
      clientId,
      createdAt: now,
    });
    const client: ClientDoc = {
      _id: clientId,
      mrn: await nextMrn(db.db, now),
      name,
      dateOfBirth: s.dob,
      email,
      phone: "0400 555 010",
      suburb: s.suburb,
      region: t.region,
      funding: "NDIS",
      needs: [
        {
          id: needId,
          support: s.support,
          discipline: s.discipline,
          frequency: s.frequency,
          location: s.location,
          status: "assigned",
          therapistId: t._id,
          referralId: null,
        },
      ],
      notes: s.notes,
      precautions: s.precautions,
      emergencyContact: { name: "Family contact", relationship: "Family", phone: "0400 555 099" },
      fundingDetails: {
        payer: "Plan manager",
        payerEmail: "invoices@example.test",
        ndisNumber: "430990000",
        planEndDate: s.code === "APT-1003" ? isoDay(addDays(today, 21)) : "2027-06-30",
        planType: "Plan Managed",
      },
      consents: s.recording
        ? [
            {
              key: "recording",
              state: s.recording,
              version: "1",
              respondent: name,
              recordedBy: jo.name,
              at: now,
              scope: [],
              note: s.recording === "Refused" ? "Participant does not want sessions recorded." : "",
              history: [],
            },
          ]
        : [],
      discharged: null,
      userId,
      createdBy: jo._id,
      createdAt: now,
    };
    await db.clients.insertOne(client);
    const visits = s.code === "APT-1001" ? [0, 7] : [0];
    for (const [i, offset] of visits.entries()) {
      const appointmentId = new ObjectId();
      const day = addDays(today, s.dayOffset + offset);
      const start = atBrisbane(day, s.minutes);
      const code = i === 0 ? s.code : "APT-1006";
      await db.appointments.insertOne({
        _id: appointmentId,
        therapistId: t._id,
        clientId,
        discipline: s.discipline,
        start,
        end: new Date(start.getTime() + s.length * 60_000),
        status: "booked",
        holdsSlot: true,
        seriesId: null,
        replaces: null,
        cancellation: null,
        note: null,
        invoiceId: null,
        needId,
        modality: s.location === "Telehealth" ? "Telehealth" : "In person",
        confirmedByPatient: i === 0 && s.code !== "APT-1002" ? now : null,
        ref: code,
        site: s.site,
        purpose: i === 0 ? s.purpose : "Assessment Continuation",
        travelPlan: s.travel
          ? { bookedMinutes: s.travel, recordedMinutes: null, charge: "Charged on agreement" }
          : null,
        scenario: { code, dayOffset: s.dayOffset + offset, minutes: s.minutes },
        createdAt: now,
      });
      if (i === 0) {
        await db.assignments.insertOne({
          _id: new ObjectId(),
          clientId,
          needId,
          therapistId: t._id,
          discipline: s.discipline,
          status: "accepted",
          appointmentId,
          declineReason: null,
          createdBy: jo._id,
          createdAt: now,
          respondedAt: now,
        });
      }
    }
  }
  await flags.updateOne({ _id: "m10Scenarios" }, { $set: { at: new Date() } }, { upsert: true });
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Untouched scenario visits move with the calendar, so the demo day is always today. */
async function rollScenarios() {
  const { appointments } = await collections();
  const today = brisbaneDay(new Date());
  const stale = await appointments
    .find({
      "scenario.code": { $type: "string" },
      status: "booked",
      checkIn: { $in: [null, undefined] },
    })
    .toArray();
  for (const a of stale) {
    if (!a.scenario) continue;
    const start = atBrisbane(addDays(today, a.scenario.dayOffset), a.scenario.minutes);
    if (start.getTime() === a.start.getTime()) continue;
    const length = a.end.getTime() - a.start.getTime();
    await appointments.updateOne(
      { _id: a._id },
      { $set: { start, end: new Date(start.getTime() + length) } },
    );
  }
}

/* ------------------------------------------------------------- the workspace */

function modeOf(a: AppointmentDoc, client: ClientDoc | undefined): DeliveryMode {
  if (a.modality === "Telehealth") return "Telehealth";
  const loc = a.site?.location ?? client?.needs.find((n) => n.id === a.needId)?.location ?? "Home";
  if (loc === "Telehealth") return "Telehealth";
  return (["Home", "School", "Daycare", "Day Program", "Community"] as const).includes(
    loc as "Home",
  )
    ? (loc as DeliveryMode)
    : "Other";
}

function readinessOf(a: AppointmentDoc, client: ClientDoc | undefined, mode: DeliveryMode) {
  const blockers: WsVisit["blockers"] = [];
  let readiness: LocationReadiness = "Ready";
  let consent: ConsentReadiness = "Not Applicable";
  const consentState = (key: string) => client?.consents?.find((c) => c.key === key)?.state;
  if (mode === "Telehealth") {
    readiness = "Not Applicable";
    const tele = consentState("telehealth");
    consent = tele === "Refused" || tele === "Withdrawn" ? "Needs Review" : "Complete";
    if (consent === "Needs Review") {
      blockers.push({
        reason: "Telehealth consent was refused or withdrawn.",
        remedy: "Offer an in-person visit or ask the care team to review consent.",
      });
    }
  } else if (mode === "School" || mode === "Daycare" || mode === "Day Program") {
    consent = a.site?.consentPlan ? "Complete" : "Outstanding";
    if (!a.site?.permission) {
      readiness = "Needs Contact";
      blockers.push({
        reason: `No ${mode.toLowerCase()} permission or guardian authority is recorded.`,
        remedy: `Confirm permission with ${a.site?.siteContact || "the site contact"}; the scheduling team is told.`,
      });
    }
  } else if (!a.site?.address && !client?.suburb) {
    readiness = "Address Unconfirmed";
    blockers.push({
      reason: "The visit address isn't confirmed.",
      remedy: "Call the patient to confirm it.",
    });
  }
  if (client?.precautions && mode !== "Telehealth") readiness = "Safety Review Required";
  return { readiness, consent, blockers };
}

export async function workspace(user: UserDoc): Promise<WorkspaceDto> {
  await ensureWorkspaceScenarios();
  const db = await collections();
  const t = await me(user);
  const now = new Date();
  const today = brisbaneDay(now);
  const weekStart = addDays(today, 1 - isoWeekday(today));
  const rangeEnd = addDays(weekStart, 14);
  const [
    visitsRaw,
    assessmentsRaw,
    notesRaw,
    tasksRaw,
    plansRaw,
    acks,
    briefDoc,
    conversations,
    staff,
  ] = await Promise.all([
    db.appointments
      .find({
        therapistId: t._id,
        start: { $gte: addDays(weekStart, -7), $lt: rangeEnd },
        $or: [
          { status: { $ne: "cancelled" } },
          { status: "cancelled", cancellation: { $type: "object" } },
        ],
      })
      .sort({ start: 1 })
      .toArray(),
    db.assessments
      .find({ therapistId: t._id, status: { $ne: "Cancelled" } })
      .sort({ updatedAt: -1 })
      .limit(60)
      .toArray(),
    db.appointments
      .find({
        therapistId: t._id,
        status: "completed",
        start: { $gte: new Date(now.getTime() - 30 * DAY) },
      })
      .sort({ start: -1 })
      .toArray(),
    db.opsTasks
      .find({
        $or: [
          { assigneeId: user._id },
          { "history.0.by": user.name, assigneeId: { $ne: user._id } },
        ],
      })
      .sort({ dueAt: 1 })
      .limit(150)
      .toArray(),
    db.plans.find({ therapistId: t._id, status: "Active" }).toArray(),
    db.db
      .collection<{ userId: ObjectId; key: string; at: Date }>("workspaceAcks")
      .find({ userId: user._id })
      .toArray(),
    db.db
      .collection<BriefDoc>("workspaceBriefs")
      .find({ userId: user._id })
      .sort({ generatedAt: -1 })
      .limit(1)
      .next(),
    db.conversations.find({ therapistId: t._id }).toArray(),
    db.users.find({ role: "admin", disabled: { $ne: true } }).toArray(),
  ]);

  const clientIds = [
    ...new Set([...visitsRaw, ...notesRaw, ...assessmentsRaw].map((v) => v.clientId.toHexString())),
  ].map((id) => new ObjectId(id));
  const caseload = await db.clients
    .find({
      $or: [{ _id: { $in: clientIds } }, { "needs.therapistId": t._id }],
    })
    .toArray();
  const clientById = new Map(caseload.map((c) => [c._id.toHexString(), c]));
  const clientNames = nameMap(caseload);
  const meName = nameMap([t]);
  const series = seriesLookup(visitsRaw);
  const tele = await db.telehealth
    .find({ appointmentId: { $in: visitsRaw.map((v) => v._id) } })
    .toArray();
  const teleBy = new Map(tele.map((x) => [x.appointmentId.toHexString(), x]));

  const held = visitsRaw.filter((v) => v.holdsSlot);
  const visits: WsVisit[] = visitsRaw.map((a) => {
    const client = clientById.get(a.clientId.toHexString());
    const mode = modeOf(a, client);
    const r = readinessOf(a, client, mode);
    const recordingState = client?.consents?.find((c) => c.key === "recording")?.state;
    const conflictWith = a.holdsSlot
      ? held
          .filter((o) => !o._id.equals(a._id) && o.start < a.end && a.start < o.end)
          .map((o) => o.ref ?? "another visit")
      : [];
    return {
      ...appointmentDto(a, clientNames, meName, series),
      ref: a.ref ?? `APT-${a._id.toHexString().slice(-6).toUpperCase()}`,
      purpose: a.purpose ?? "Treatment Session",
      mode,
      location:
        mode === "Telehealth"
          ? "Video consultation"
          : a.site?.siteName || a.site?.address || client?.suburb || "Address to confirm",
      travelMinutes: mode === "Telehealth" ? null : (a.travelPlan?.bookedMinutes ?? null),
      readiness: r.readiness,
      consent: r.consent,
      blockers: r.blockers,
      safetyFlag: Boolean(client?.precautions),
      site:
        mode === "Telehealth" || !a.site
          ? null
          : {
              contact: a.site.siteContact || a.site.supportPerson,
              phone: a.site.sitePhone,
              room: a.site.room,
              access: [a.site.accessNotes, a.site.parking, a.site.pets].filter(Boolean).join(" · "),
              permission: mode === "Home" ? null : a.site.permission,
            },
      recordingConsent:
        mode === "Telehealth" ? (recordingState === "Given" ? "Given" : "Not given") : null,
      conflictWith,
      needId: a.needId ?? null,
      scenario: a.scenario?.code ?? null,
    };
  });

  /* Week blocks: visits, the travel before them, planned documentation and leave (AT-04). */
  const blocks: WsBlock[] = [];
  for (const v of visits) {
    if (v.status === "cancelled" || v.status === "late-cancelled") continue;
    const day = isoDay(brisbaneDay(new Date(v.start)));
    if (v.travelMinutes) {
      blocks.push({
        day,
        kind: "Travel",
        start: new Date(new Date(v.start).getTime() - v.travelMinutes * 60_000).toISOString(),
        end: v.start,
        label: `Travel to ${v.location}`,
        visitId: v.id,
      });
    }
    blocks.push({
      day,
      kind: v.mode === "Telehealth" ? "Telehealth" : "Visit",
      start: v.start,
      end: v.end,
      label: `${v.clientName} · ${v.purpose}`,
      visitId: v.id,
    });
  }
  const byDay = new Map<string, WsVisit[]>();
  for (const v of visits.filter((x) => x.status !== "cancelled" && x.status !== "late-cancelled")) {
    const k = isoDay(brisbaneDay(new Date(v.start)));
    byDay.set(k, [...(byDay.get(k) ?? []), v]);
  }
  for (const [day, list] of byDay) {
    const last = list.reduce((m, v) => (v.end > m ? v.end : m), list[0]?.end ?? "");
    if (!last) continue;
    const minutes = 15 * list.length;
    blocks.push({
      day,
      kind: "Documentation",
      start: last,
      end: new Date(new Date(last).getTime() + minutes * 60_000).toISOString(),
      label: `Planned notes time (${list.length} × 15 min)`,
      visitId: null,
    });
  }
  let leaveDays = 0;
  for (let i = 0; i < 14; i++) {
    const day = addDays(weekStart, i);
    const key = isoDay(day);
    const off = (t.timeOff ?? []).find((o) => o.from <= key && key <= o.to);
    if (!off) continue;
    if (i < 7 && isoWeekday(day) <= 5) leaveDays += 1;
    blocks.push({
      day: key,
      kind: "Leave",
      start: atBrisbane(day, 9 * 60).toISOString(),
      end: atBrisbane(day, 17 * 60).toISOString(),
      label: off.reason || "Leave",
      visitId: null,
    });
  }
  blocks.sort((a, b) => a.start.localeCompare(b.start));

  /* Assessments: progress is form completion, never a recovery score (AT-20). */
  const nextVisitOf = (clientId: string) =>
    visits.find((v) => v.clientId === clientId && v.status === "booked" && new Date(v.start) > now)
      ?.start ?? null;
  const assessments: WsAssessment[] = assessmentsRaw.map((a) => {
    const sections = templateFor(a.support, a.discipline).sections;
    const complete = sections.filter((s) => sectionDone(a, s.key));
    const lastSection = [...sections].reverse().find((s) => sectionDone(a, s.key));
    const status =
      a.status === "Signed"
        ? "Finalised"
        : a.status === "Amended"
          ? "Amended"
          : a.status === "Awaiting Review"
            ? "Awaiting Review"
            : complete.length === 0 && a.status === "Draft"
              ? "Not Started"
              : now.getTime() - a.updatedAt.getTime() > 14 * DAY
                ? "Paused"
                : "In Progress";
    return {
      id: a._id.toHexString(),
      clientId: a.clientId.toHexString(),
      clientName: clientNames.get(a.clientId.toHexString()) ?? "Patient",
      support: a.support,
      kind: a.kind,
      status,
      startedAt: a.createdAt.toISOString(),
      lastSavedAt: a.updatedAt.toISOString(),
      done: complete.length,
      total: sections.length,
      lastSection: lastSection?.title ?? null,
      missing: a.status === "Signed" ? [] : assessmentGaps(a).slice(0, 6),
      nextVisit: nextVisitOf(a.clientId.toHexString()),
    };
  });

  /* Documentation queue: only notes this therapist wrote or owes (AT-17). */
  const notes: WsNote[] = notesRaw.map((a) => {
    const s = a.note?.status ?? (a.note ? "Final" : null);
    const status: DocStatus = !a.note
      ? "Not Started"
      : s === "Draft"
        ? "Draft"
        : s === "Pending Signature"
          ? "Ready for Signature"
          : "Signed";
    return {
      visitId: a._id.toHexString(),
      ref: a.ref ?? "Visit",
      clientName: clientNames.get(a.clientId.toHexString()) ?? "Patient",
      discipline: a.discipline,
      visitAt: a.start.toISOString(),
      status,
      ageHours: Math.max(0, Math.round((now.getTime() - a.end.getTime()) / HOUR)),
      aiDrafted: Boolean(a.note?.aiDrafted),
      visit: appointmentDto(a, clientNames, meName),
    };
  });
  for (const a of assessmentsRaw) {
    const review = a.reviews?.at(-1);
    if (a.status === "Draft" && review?.comment) {
      notes.push({
        visitId: a._id.toHexString(),
        ref: "Assessment",
        clientName: clientNames.get(a.clientId.toHexString()) ?? "Patient",
        discipline: a.discipline,
        visitAt: a.updatedAt.toISOString(),
        status: "Amendment Required",
        ageHours: Math.round((now.getTime() - (review.reviewedAt ?? a.updatedAt).getTime()) / HOUR),
        aiDrafted: false,
        visit: null,
      });
    }
  }

  const tasks = tasksRaw.map((x) => {
    const status = taskStatusLabel[x.status] ?? "Open";
    const closed = status === "Completed" || status === "Cancelled";
    const last = x.history.at(-1);
    return {
      id: x._id.toHexString(),
      ref: x.ref,
      title: x.title,
      category: x.category,
      status,
      priority: priorityLabel[x.priority] ?? "Medium",
      dueAt: x.dueAt.toISOString(),
      overdue: !closed && x.dueAt < now,
      owner: x.assigneeName ?? x.team,
      participant: x.participant,
      delegated: !x.assigneeId?.equals(user._id),
      lastActivity: (last?.at ?? x.updatedAt).toISOString(),
      lastAction: last?.action ?? "Created",
    };
  });

  /* Alerts are rules over the records above, never AI (section 9). */
  const ackBy = new Map(acks.map((a) => [a.key, a.at.toISOString()]));
  const alerts: WsAlert[] = [];
  const push = (a: Omit<WsAlert, "acknowledged">) =>
    alerts.push({
      ...a,
      acknowledged: ackBy.has(a.key) ? { at: ackBy.get(a.key) as string } : null,
    });
  const upcoming = visits.filter(
    (v) =>
      v.status === "booked" &&
      new Date(v.end) > new Date(now.getTime() - 12 * HOUR) &&
      new Date(v.start) < addDays(today, 3),
  );
  for (const v of upcoming) {
    if (v.safetyFlag)
      push({
        key: `risk:${v.id}`,
        kind: "Risk review",
        severity: "High",
        title: `Precaution recorded for ${v.clientName}`,
        detail: `${v.ref}: read the precaution in the patient record before the visit.`,
        href: `/therapist/patients/${v.clientId}`,
      });
    if (v.consent === "Outstanding" || v.consent === "Needs Review")
      push({
        key: `consent:${v.id}`,
        kind: "Missing consent",
        severity: "High",
        title: `Consent ${v.consent.toLowerCase()} for ${v.clientName}`,
        detail: `${v.ref} at ${v.location}: the referral's general consent doesn't cover this.`,
        href: `/therapist/workspace?tab=visits&visit=${v.id}`,
      });
    if (v.mode === "Telehealth" && v.recordingConsent !== "Given")
      push({
        key: `recording:${v.id}`,
        kind: "Recording restriction",
        severity: "Review",
        title: `Recording not permitted for ${v.clientName}`,
        detail: `${v.ref}: recording stays off; it can't be switched on without consent.`,
        href: `/therapist/workspace?tab=telehealth`,
      });
    if (v.conflictWith.length)
      push({
        key: `conflict:${v.id}`,
        kind: "Schedule conflict",
        severity: "Medium",
        title: `${v.ref} overlaps ${v.conflictWith.join(", ")}`,
        detail: "Nothing has been moved. Ask the scheduling team to resolve it.",
        href: `/therapist/workspace?tab=schedule`,
      });
  }
  const overdueNotes = notes.filter((n) => n.status !== "Signed" && n.ageHours > 48);
  if (overdueNotes.length)
    push({
      key: `notes:${isoDay(today)}`,
      kind: "Overdue notes",
      severity: "Medium",
      title: `${overdueNotes.length} note${overdueNotes.length === 1 ? "" : "s"} past the 48-hour rule`,
      detail: "Notes are never signed for you. Open the documentation queue.",
      href: `/therapist/workspace?tab=documentation`,
    });
  for (const x of tasks.filter((x) => x.overdue && !x.delegated).slice(0, 4))
    push({
      key: `task:${x.id}`,
      kind: "Overdue follow-up",
      severity: x.priority === "Critical" || x.priority === "High" ? "High" : "Medium",
      title: `${x.ref} is overdue`,
      detail: x.title,
      href: `/therapist/tasks/${x.id}`,
    });
  for (const c of caseload) {
    const end = c.fundingDetails?.planEndDate;
    if (!end || !c.needs.some((n) => n.therapistId?.equals(t._id) && n.status === "assigned"))
      continue;
    const days = Math.round((Date.parse(end) - today.getTime()) / DAY);
    if (days >= 0 && days <= 30)
      push({
        key: `plan:${c._id.toHexString()}:${end}`,
        kind: "Expiring authorisation",
        severity: "Review",
        title: `${c.name}'s funding ends in ${days} days`,
        detail: "Bookings after the end date may be held. Finance has the detail.",
        href: `/therapist/patients/${c._id.toHexString()}`,
      });
  }

  /* Caseload counts each person once, however many services they have (AT-10). */
  const mine = caseload.filter(
    (c) =>
      !c.discharged && c.needs.some((n) => n.therapistId?.equals(t._id) && n.status === "assigned"),
  );
  const chatBy = new Map(conversations.map((c) => [c.clientId.toHexString(), c._id.toHexString()]));
  const clients = mine.map((c) => {
    const id = c._id.toHexString();
    const past = visits.filter((v) => v.clientId === id && v.status === "completed").at(-1);
    return {
      id,
      name: c.name,
      mrn: c.mrn ?? "",
      age: ageLabel(c.dateOfBirth) ?? "",
      suburb: c.suburb,
      episodes: c.needs
        .filter((n) => n.therapistId?.equals(t._id) && n.status === "assigned")
        .map((n) => ({
          needId: n.id,
          support: n.support,
          frequency: n.frequency,
          location: n.location ?? "Home",
        })),
      nextVisit: nextVisitOf(id),
      lastVisit: past?.start ?? null,
      safetyFlag: Boolean(c.precautions),
      conversationId: chatBy.get(id) ?? null,
    };
  });

  const thisWeek = visits.filter(
    (v) =>
      new Date(v.start) >= weekStart &&
      new Date(v.start) < addDays(weekStart, 7) &&
      v.status !== "cancelled" &&
      v.status !== "late-cancelled",
  );
  const contactHours = thisWeek.reduce(
    (s, v) => s + (new Date(v.end).getTime() - new Date(v.start).getTime()) / HOUR,
    0,
  );
  const travelHours = thisWeek.reduce((s, v) => s + (v.travelMinutes ?? 0) / 60, 0);
  const documentationHours =
    thisWeek.length * 0.25 + notes.filter((n) => n.status !== "Signed").length * 0.25;
  const workingHours = (t.weekly ?? []).reduce((s, w) => s + (w.end - w.start) / 60, 0);
  const leaveHours = leaveDays * 8;
  const weekHours = workingHours > 0 ? workingHours : 38;

  const supervision = assessmentsRaw
    .filter((a) => a.reviews?.length)
    .map((a) => {
      const r = a.reviews?.at(-1);
      if (!r) return null;
      return {
        id: a._id.toHexString(),
        clientName: clientNames.get(a.clientId.toHexString()) ?? "Patient",
        support: a.support,
        requestedAt: r.requestedAt.toISOString(),
        status: (r.reviewedAt ? "Commented" : "Awaiting response") as
          "Commented" | "Awaiting response",
        comment: r.comment,
        reviewer: r.reviewedBy,
      };
    })
    .filter((x) => x !== null);

  const reports: WorkspaceDto["reports"] = [
    ...plansRaw
      .filter((p) => p.reviewDate && Date.parse(p.reviewDate) - today.getTime() < 21 * DAY)
      .map((p) => ({
        id: p._id.toHexString(),
        kind: "Plan review" as const,
        clientName: clientNames.get(p.clientId.toHexString()) ?? "Patient",
        requestedBy: "Treatment plan review date",
        due: new Date(Date.parse(p.reviewDate)).toISOString(),
        progress: p.progressSummary ? 50 : 0,
        href: `/therapist/plans/${p._id.toHexString()}`,
      })),
    ...assessmentsRaw
      .filter((a) => a.status === "Signed" && !a.released)
      .map((a) => ({
        id: a._id.toHexString(),
        kind: "Assessment report" as const,
        clientName: clientNames.get(a.clientId.toHexString()) ?? "Patient",
        requestedBy: "Referral (report to release)",
        due: new Date((a.signed?.at ?? a.updatedAt).getTime() + 10 * DAY).toISOString(),
        progress: 80,
        href: `/therapist/assessments/${a._id.toHexString()}`,
      })),
  ].sort((a, b) => a.due.localeCompare(b.due));

  const telehealth = visits
    .filter(
      (v) =>
        v.mode === "Telehealth" &&
        v.status === "booked" &&
        isoDay(brisbaneDay(new Date(v.start))) === isoDay(today),
    )
    .map((v) => {
      const room = teleBy.get(v.id);
      return {
        visitId: v.id,
        ref: v.ref,
        clientName: v.clientName,
        start: v.start,
        readiness:
          room?.state === "Waiting"
            ? ("Waiting room open" as const)
            : v.consent !== "Complete"
              ? ("Consent outstanding" as const)
              : room?.device
                ? ("Ready" as const)
                : ("Device check needed" as const),
        link: (room?.linkSentAt ? "Sent" : "Not sent") as "Sent" | "Not sent",
        recording: (v.recordingConsent === "Given" ? "Consented" : "Not consented") as
          "Consented" | "Not consented",
      };
    });

  return {
    therapist: {
      name: t.name,
      discipline: t.discipline,
      region: t.region,
      capacity: t.capacity,
      sessionMinutes: t.sessionMinutes || 60,
      supervisor: (staff.find(dedicatedLead) ?? staff.find(isLead))?.name ?? null,
    },
    now: now.toISOString(),
    today: isoDay(today),
    visits,
    blocks,
    assessments,
    notes,
    tasks,
    alerts,
    clients,
    supervision,
    reports,
    telehealth,
    capacity: {
      activeClients: clients.length,
      activeEpisodes: clients.reduce((s, c) => s + c.episodes.length, 0),
      contactHours: round1(contactHours),
      travelHours: round1(travelHours),
      documentationHours: round1(documentationHours),
      leaveHours,
      availableHours: round1(
        Math.max(0, weekHours - leaveHours - contactHours - travelHours - documentationHours),
      ),
    },
    brief: briefDoc ? briefDto(briefDoc) : null,
    recipients: staff
      .filter((s) => s.staffRoles?.length)
      .map((s) => ({ id: s._id.toHexString(), name: s.name, role: s.staffRoles?.[0] ?? "Staff" })),
    prefs: user.workspacePrefs ?? defaultPrefs,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function sectionDone(a: AssessmentDoc, key: string) {
  const e = a.sections[key];
  if (!e?.applicability) return false;
  if (e.applicability === "Applicable") return Boolean(e.observed.trim() || e.reported.trim());
  return Boolean(e.reason.trim());
}

/* ------------------------------------------------------------------ AI brief */

type BriefDoc = {
  _id: ObjectId;
  userId: ObjectId;
  generatedAt: Date;
  summary: string;
  limitations: string;
  points: WsBriefPoint[];
  actions: WsBriefPoint[];
};

const briefDto = (b: BriefDoc): WsBrief => ({
  id: b._id.toHexString(),
  generatedAt: b.generatedAt.toISOString(),
  summary: b.summary,
  limitations: b.limitations,
  points: b.points,
  actions: b.actions,
});

/** The morning brief: every point must cite a record we gave it, or it's marked unverified (AT-36). */
async function morningBrief(user: UserDoc) {
  const ws = await workspace(user);
  const sources = new Map<string, { label: string; href: string }>();
  const today = ws.visits.filter((v) => isoDay(brisbaneDay(new Date(v.start))) === ws.today);
  const facts = {
    clinician: `${ws.therapist.name}, ${ws.therapist.discipline}`,
    today: today.map((v) => {
      sources.set(v.ref, {
        label: `${v.ref} · ${v.clientName}`,
        href: `/therapist/workspace?tab=visits&visit=${v.id}`,
      });
      return {
        source: v.ref,
        time: brisbaneMinutes(new Date(v.start)),
        patient: v.clientName,
        purpose: v.purpose,
        mode: v.mode,
        status: v.status,
        locationReadiness: v.readiness,
        consentCheck:
          v.consent === "Not Applicable"
            ? "No site or telehealth consent check applies to this visit type"
            : v.consent,
        blockers: v.blockers.map((b) => b.reason),
        precautionOnFile: v.safetyFlag,
        recordingConsent: v.recordingConsent,
        conflicts: v.conflictWith,
      };
    }),
    notesOwed: ws.notes
      .filter((n) => n.status !== "Signed")
      .slice(0, 10)
      .map((n) => {
        const key = `NOTE-${n.visitId.slice(-5).toUpperCase()}`;
        sources.set(key, {
          label: `${n.ref} note · ${n.clientName}`,
          href: `/therapist/workspace?tab=documentation`,
        });
        return {
          source: key,
          patient: n.clientName,
          status: n.status,
          hoursSinceVisit: n.ageHours,
        };
      }),
    assessments: ws.assessments
      .filter((a) => a.status !== "Finalised")
      .slice(0, 8)
      .map((a) => {
        const key = `ASM-${a.id.slice(-5).toUpperCase()}`;
        sources.set(key, {
          label: `${a.support} · ${a.clientName}`,
          href: `/therapist/assessments/${a.id}`,
        });
        return {
          source: key,
          patient: a.clientName,
          type: a.support,
          sectionsDone: `${a.done} of ${a.total}`,
          missing: a.missing,
        };
      }),
    tasks: ws.tasks
      .filter((x) => !x.delegated && x.status !== "Completed" && x.status !== "Cancelled")
      .slice(0, 10)
      .map((x) => {
        sources.set(x.ref, { label: `${x.ref} · ${x.title}`, href: `/therapist/tasks/${x.id}` });
        return { source: x.ref, title: x.title, priority: x.priority, overdue: x.overdue };
      }),
  };
  const schemaPoint = {
    type: "object",
    additionalProperties: false,
    required: ["text", "source"],
    properties: { text: { type: "string" }, source: { type: "string" } },
  };
  let parsed: {
    summary: string;
    points: { text: string; source: string }[];
    actions: { text: string; source: string }[];
    limitations: string;
  };
  try {
    const out = await generateJson("therapist-morning-brief", {
      system:
        "You prepare a morning brief for a community allied health clinician. Use only the records given. Never invent facts, diagnoses, measurements or risk levels; never say a visit is safe. Each point is one sentence and cites exactly one source id from the records (for example APT-1001, TASK-000123, NOTE-AB12C, ASM-3F2A1). Actions are suggestions for the clinician to decide on. Say what is missing in limitations.",
      user: JSON.stringify(facts),
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "points", "actions", "limitations"],
        properties: {
          summary: { type: "string", description: "Two sentences on the day ahead." },
          points: { type: "array", items: schemaPoint },
          actions: { type: "array", items: schemaPoint },
          limitations: { type: "string" },
        },
      },
      schemaName: "therapist_morning_brief",
      maxTokens: 1100,
    });
    parsed = JSON.parse(out.text);
  } catch (error) {
    if (error instanceof AiError)
      throw new UserFacingError(`AI isn't available: ${error.message}`, 409);
    throw new UserFacingError("The AI brief couldn't be read. Try again.", 409);
  }
  const cite = (p: { text: string; source: string }): WsBriefPoint => {
    const s = sources.get(p.source.trim());
    return {
      text: p.text,
      source: p.source,
      sourceLabel: s?.label ?? null,
      href: s?.href ?? null,
      verified: Boolean(s),
      decision: null,
    };
  };
  const doc: BriefDoc = {
    _id: new ObjectId(),
    userId: user._id,
    generatedAt: new Date(),
    summary: parsed.summary,
    limitations: parsed.limitations,
    points: (parsed.points ?? []).slice(0, 10).map(cite),
    actions: (parsed.actions ?? []).slice(0, 6).map(cite),
  };
  const { db } = await collections();
  await db.collection<BriefDoc>("workspaceBriefs").insertOne(doc);
  await audit(user, "Generated the AI morning brief", null);
  return briefDto(doc);
}

/* ------------------------------------------------------------------- actions */

export async function workspaceAction(user: UserDoc, action: WorkspaceAction) {
  const t = await me(user);
  const db = await collections();
  switch (action.type) {
    case "acknowledge": {
      await db.db
        .collection<{ userId: ObjectId; key: string; at: Date }>("workspaceAcks")
        .updateOne(
          { userId: user._id, key: action.key },
          { $set: { at: new Date() } },
          { upsert: true },
        );
      await audit(user, `Acknowledged alert ${action.key.split(":")[0]}`, null);
      return { ok: true };
    }
    case "brief":
      return { brief: await morningBrief(user) };
    case "review-suggestion": {
      if (!ObjectId.isValid(action.briefId)) throw new UserFacingError("Not found.", 404);
      const briefs = db.db.collection<BriefDoc>("workspaceBriefs");
      const b = await briefs.findOne({ _id: new ObjectId(action.briefId), userId: user._id });
      const item = b?.[action.list][action.index];
      if (!b || !item) throw new UserFacingError("Suggestion not found.", 404);
      // The decision is recorded on the suggestion only; no clinical record is touched (AT-37).
      await briefs.updateOne(
        { _id: b._id },
        { $set: { [`${action.list}.${action.index}.decision`]: action.decision } },
      );
      await audit(
        user,
        `${action.decision}: AI brief suggestion "${item.text.slice(0, 80)}"`,
        null,
      );
      return { ok: true };
    }
    case "follow-up":
    case "supervisor-review":
    case "safety": {
      const visit =
        "visitId" in action && action.visitId && ObjectId.isValid(action.visitId)
          ? await db.appointments.findOne({ _id: new ObjectId(action.visitId), therapistId: t._id })
          : null;
      const assessment =
        action.type === "supervisor-review" &&
        action.assessmentId &&
        ObjectId.isValid(action.assessmentId)
          ? await db.assessments.findOne({
              _id: new ObjectId(action.assessmentId),
              therapistId: t._id,
            })
          : null;
      const clientId = visit?.clientId ?? assessment?.clientId ?? null;
      const client = clientId ? await db.clients.findOne({ _id: clientId }) : null;
      const leads = (
        await db.users.find({ role: "admin", disabled: { $ne: true } }).toArray()
      ).filter(isLead);
      const lead = leads.find(dedicatedLead) ?? leads[0] ?? null;
      const ref =
        visit?.ref ??
        (assessment ? `ASM-${assessment._id.toHexString().slice(-5).toUpperCase()}` : t.name);
      const base = {
        urgentReason: "",
        clientId,
        referralId: null,
        appointmentId: visit?._id ?? null,
        participant: client?.name ?? null,
        service: visit?.purpose ?? assessment?.support ?? null,
        discipline: t.discipline,
        locationType: visit?.site?.location ?? null,
        source: "Manual" as const,
        ruleCode: null,
        ruleVersion: null,
        idemKey: null,
        restrictedNote: null,
        recordingHref: null,
        suggestion: false,
        scenario: null,
        related: {
          kind: (visit ? "Appointment" : assessment ? "Assessment" : "Participant") as
            "Appointment" | "Assessment" | "Participant",
          ref,
          label: client?.name ?? t.name,
          href: client ? `/therapist/patients/${client._id.toHexString()}` : null,
        },
      };
      if (action.type === "follow-up") {
        const { task } = await insertTask(user, {
          ...base,
          title: `Follow-up visit request: ${client?.name ?? "patient"} (${ref})`,
          category: "Scheduling",
          status: "New",
          priority: "Normal",
          team: "Scheduling",
          assigneeId: null,
          assigneeName: null,
          dueAt: new Date(action.dueAt),
          sla: "Standard",
          visibility: "Internal",
          note: action.reason,
          historyNote: `Requested by ${user.name} from the therapist workspace (draft for scheduling)`,
        });
        return { ref: task?.ref ?? null };
      }
      if (action.type === "supervisor-review") {
        if (assessment) {
          await db.assessments.updateOne(
            { _id: assessment._id },
            {
              $push: {
                reviews: {
                  requestedBy: user.name,
                  requestedAt: new Date(),
                  comment: null,
                  reviewedBy: null,
                  reviewedAt: null,
                },
              },
            },
          );
        }
        const { task } = await insertTask(user, {
          ...base,
          title: `Supervisor review requested: ${client?.name ?? "caseload"} (${ref})`,
          category: "Clinical Review",
          status: "Assigned",
          priority: "Normal",
          team: "Clinical",
          assigneeId: lead?._id ?? null,
          assigneeName: lead?.name ?? null,
          dueAt: new Date(Date.now() + 2 * DAY),
          sla: "Standard",
          visibility: "Clinical Restricted",
          note: action.note,
          historyNote: `Review requested by ${user.name}; not clinically approved until the reviewer responds`,
        });
        await audit(
          user,
          `Requested supervisor review ${task?.ref ?? ""} (owner ${lead?.name ?? "Clinical team"})`,
          clientId,
        );
        return { ref: task?.ref ?? null, owner: lead?.name ?? "Clinical team" };
      }
      const { task } = await insertTask(user, {
        ...base,
        title: `Safety issue reported: ${client?.name ?? "field visit"} (${ref})`,
        category: "Incident",
        status: "Escalated",
        priority: "Urgent",
        urgentReason: action.immediateDanger
          ? "Immediate danger reported: emergency protocol first"
          : "Reported from a visit",
        team: "Clinical",
        assigneeId: lead?._id ?? null,
        assigneeName: lead?.name ?? null,
        dueAt: new Date(Date.now() + 2 * HOUR),
        sla: "Clinical Escalation",
        visibility: "Clinical Restricted",
        note: action.what,
        historyNote: `Reported by ${user.name}; routed to clinical leadership for a human decision`,
      });
      if (leads.length)
        await notify(
          leads.map((l) => l._id),
          {
            title: "Safety issue reported",
            body: `${user.name} reported a safety issue (${task?.ref ?? ""}).`,
            href: task ? `/care/operations/tasks/${task._id.toHexString()}` : "/care/operations",
          },
        );
      await audit(user, `Reported a safety issue ${task?.ref ?? ""}`, clientId);
      return { ref: task?.ref ?? null };
    }
    case "message": {
      if (!ObjectId.isValid(action.recipientId))
        throw new UserFacingError("Choose who to send it to.");
      const to = await db.users.findOne({ _id: new ObjectId(action.recipientId), role: "admin" });
      if (!to) throw new UserFacingError("That person can't receive care-team messages.");
      const client =
        action.clientId && ObjectId.isValid(action.clientId)
          ? await db.clients.findOne({
              _id: new ObjectId(action.clientId),
              "needs.therapistId": t._id,
            })
          : null;
      if (action.clientId && !client)
        throw new UserFacingError("You can only message about your own patients.", 404);
      const { task } = await insertTask(user, {
        title: `Care-team message from ${user.name}${client ? `: ${client.name}` : ""}`,
        category: "Care Coordination",
        status: "Assigned",
        priority: "Normal",
        urgentReason: "",
        team: "Clinical",
        assigneeId: to._id,
        assigneeName: to.name,
        related: {
          kind: "Participant",
          ref: client?.mrn ?? t.name,
          label: client?.name ?? t.name,
          href: client ? `/care/participants/${client._id.toHexString()}` : null,
        },
        clientId: client?._id ?? null,
        referralId: null,
        appointmentId: null,
        participant: client?.name ?? null,
        service: null,
        discipline: t.discipline,
        locationType: null,
        dueAt: new Date(Date.now() + DAY),
        sla: "Standard",
        visibility:
          action.sensitivity === "Clinical Restricted" ? "Clinical Restricted" : "Internal",
        source: "Manual",
        ruleCode: null,
        ruleVersion: null,
        idemKey: null,
        restrictedNote: null,
        recordingHref: null,
        suggestion: false,
        scenario: null,
        note: action.text,
        historyNote: `Secure care-team message (${action.sensitivity})`,
      });
      await publish([to._id], "notification");
      await audit(user, `Sent a care-team message to ${to.name}`, client?._id ?? null);
      return { ref: task?.ref ?? null };
    }
    case "prefs": {
      await db.users.updateOne({ _id: user._id }, { $set: { workspacePrefs: action.prefs } });
      return { ok: true };
    }
  }
}
