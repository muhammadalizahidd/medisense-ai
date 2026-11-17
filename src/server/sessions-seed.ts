import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { activityCatalogue, checklistFor, type SessionMode } from "@/lib/live/sessions";
import { collections } from "./db";
import type { AppointmentDoc, SessionNote } from "./models";
import {
  attendanceOf,
  blankSessionExt,
  modeOf,
  nextSessionRef,
  sessionExts,
  type SessionExtDoc,
} from "./sessions";

/*
 * Module 14 sample sessions: the ten specification scenarios (S01–S10) as their own visits, plus
 * session details for every visit in the four-week window so the lists read like a working
 * practice. Created once (settings flag "m14Seed"). All clinical content is illustrative.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4_294_967_296;
  };
}

const MIN = 60_000;
const DAY = 86_400_000;

type Act = {
  activity: string;
  result: string;
  unit: string;
  method: string;
  support: string;
  response: string;
  source: "Observed" | "Patient-reported" | "Third-party reported";
  narrative: string;
};

type Scenario = {
  code: string;
  participant: string;
  discipline: string;
  mode: SessionMode;
  /** Minutes from now to the booked start; negative is in the past. */
  at: number;
  minutes: number;
  state: "booked" | "in-progress" | "completed" | "partial" | "no-show";
  purpose: string;
  note?: "draft" | "signed" | "ai-unverified";
  conflict?: boolean;
  telehealth?: "off" | "recorded";
  activities: Act[];
  site?: string;
  attendees?: { name: string; role: string; authority: string }[];
  verification?: "Verified" | "Unverified" | "Disputed";
  outcome?: string;
  remaining?: string;
};

const scenarios: Scenario[] = [
  {
    code: "S01",
    participant: "Harper Nguyen",
    discipline: "Occupational Therapy",
    mode: "Home",
    at: -40,
    minutes: 90,
    state: "in-progress",
    purpose: "Assessment Continuation",
    activities: [
      {
        activity: "ADL task: showering",
        result: "Supervision",
        unit: "",
        method: "Observed in own bathroom with shower chair",
        support: "Supervision",
        response: "Tolerated",
        source: "Observed",
        narrative: "Needed reminders to sequence; used the long-handled sponge.",
      },
      {
        activity: "Meal preparation",
        result: "",
        unit: "",
        method: "",
        support: "Prompting",
        response: "Limited",
        source: "Patient-reported",
        narrative: "Harper reports making a sandwich twice this week with the picture card.",
      },
    ],
    attendees: [{ name: "Linh Nguyen", role: "Carer", authority: "Mother, nominated carer" }],
  },
  {
    code: "S02",
    participant: "Mia Tan",
    discipline: "Speech Pathology",
    mode: "School",
    at: -26 * 60,
    minutes: 45,
    state: "completed",
    purpose: "Treatment",
    note: "signed",
    site: "Ashgrove State School, Prep B classroom",
    activities: [
      {
        activity: "Communication target",
        result: "7",
        unit: "times",
        method: "Requests during morning tea, visual cue cards",
        support: "Prompting",
        response: "Improved",
        source: "Observed",
        narrative: "Used two-word requests with a visual cue.",
      },
      {
        activity: "Language task",
        result: "",
        unit: "",
        method: "",
        support: "",
        response: "Not Assessed",
        source: "Third-party reported",
        narrative: "Teacher reports more requests at lunch this week.",
      },
    ],
    attendees: [{ name: "Ms Patel", role: "Educator", authority: "Class teacher, site contact" }],
    verification: "Verified",
  },
  {
    code: "S03",
    participant: "Priya Shah",
    discipline: "Physiotherapy",
    mode: "Other Community Location",
    at: -50 * 60,
    minutes: 60,
    state: "completed",
    purpose: "Treatment",
    note: "draft",
    site: "Kedron Park walking track, meeting point at the car park",
    activities: [
      {
        activity: "Gait distance",
        result: "240",
        unit: "m",
        method: "Continuous walk, four-wheeled walker, flat track",
        support: "Supervision",
        response: "Tolerated",
        source: "Observed",
        narrative: "Two standing rests; no loss of balance.",
      },
      {
        activity: "Strength exercises",
        result: "3",
        unit: "sets",
        method: "Sit to stand, standard chair",
        support: "Independent",
        response: "Tolerated",
        source: "Observed",
        narrative: "Ten repetitions per set.",
      },
    ],
    verification: "Unverified",
  },
  {
    code: "S04",
    participant: "Alex Chen",
    discipline: "Psychology",
    mode: "Telehealth",
    at: -3 * 60,
    minutes: 50,
    state: "completed",
    purpose: "Treatment",
    note: "signed",
    telehealth: "off",
    activities: [
      {
        activity: "Patient-reported outcome",
        result: "",
        unit: "",
        method: "",
        support: "",
        response: "No Change",
        source: "Patient-reported",
        narrative: "Session content is restricted to the treating psychologist.",
      },
    ],
    verification: "Verified",
  },
  {
    code: "S05",
    participant: "Alex Chen",
    discipline: "Occupational Therapy",
    mode: "Telehealth",
    at: -5 * 60,
    minutes: 45,
    state: "completed",
    purpose: "Review",
    note: "ai-unverified",
    telehealth: "recorded",
    activities: [
      {
        activity: "Home environment review",
        result: "",
        unit: "",
        method: "Video walk-through of the kitchen",
        support: "Independent",
        response: "Tolerated",
        source: "Observed",
        narrative: "Bench height suits seated preparation; kettle tipper in place.",
      },
    ],
    verification: "Unverified",
  },
  {
    code: "S06",
    participant: "Isabella Kowalski",
    discipline: "Occupational Therapy",
    mode: "Home",
    at: -28 * 60,
    minutes: 90,
    state: "partial",
    purpose: "Assessment Continuation",
    note: "draft",
    remaining: "Community access and transfers sections of the assessment",
    activities: [
      {
        activity: "Transfer practice",
        result: "",
        unit: "",
        method: "Bed to chair, standard height",
        support: "Physical assistance",
        response: "Limited",
        source: "Observed",
        narrative: "Fatigued after 30 minutes; session paused at her request.",
      },
    ],
  },
  {
    code: "S07",
    participant: "Remy Sorensen",
    discipline: "Nursing",
    mode: "Home",
    at: -76 * 60,
    minutes: 45,
    state: "completed",
    purpose: "Treatment",
    note: "draft",
    activities: [
      {
        activity: "Wound care",
        result: "3.5",
        unit: "cm",
        method: "Wound length, disposable ruler",
        support: "",
        response: "Tolerated",
        source: "Observed",
        narrative: "Dressing changed as per the care plan.",
      },
    ],
  },
  {
    code: "S08",
    participant: "Lachlan O'Brien",
    discipline: "Occupational Therapy",
    mode: "Home",
    at: -6 * 60,
    minutes: 60,
    state: "completed",
    purpose: "Treatment",
    note: "draft",
    conflict: true,
    activities: [
      {
        activity: "Transfer practice",
        result: "Supervision",
        unit: "",
        method: "Car transfer, sedan, own driveway",
        support: "Supervision",
        response: "Improved",
        source: "Observed",
        narrative: "Stand-by supervision only.",
      },
    ],
  },
  {
    code: "S09",
    participant: "Noah Bennett",
    discipline: "Occupational Therapy",
    mode: "Home",
    at: -98 * 60,
    minutes: 60,
    state: "no-show",
    purpose: "Treatment",
    outcome: "No answer at the door or by phone; message left with the emergency contact.",
    activities: [],
    verification: "Unverified",
  },
  {
    code: "S10",
    participant: "Mason Fernando",
    discipline: "Occupational Therapy",
    mode: "Home",
    at: 70,
    minutes: 60,
    state: "booked",
    purpose: "Initial Assessment",
    activities: [],
  },
];

function soap(sc: Scenario): Omit<SessionNote, "byName" | "at" | "signedAt"> {
  const objective =
    sc.activities
      .filter((a) => a.source === "Observed")
      .map(
        (a) =>
          `${a.activity}: ${a.result ? `${`${a.result} ${a.unit}`.trim()}, ` : ""}${a.support ? `${a.support.toLowerCase()}. ` : ""}${a.narrative}`,
      )
      .join(" ") || "No direct observations recorded.";
  const subjective =
    sc.activities
      .filter((a) => a.source !== "Observed")
      .map((a) => a.narrative)
      .join(" ") || "Participant reports no new concerns.";
  const assessment =
    sc.state === "partial"
      ? "Session paused for fatigue; the assessment continues next visit."
      : "Progressing toward the agreed goals.";
  const plan =
    sc.state === "partial"
      ? "Book an assessment continuation visit."
      : "Continue the current plan.";
  return {
    subjective,
    objective,
    assessment,
    plan,
    text: `S: ${subjective}\nO: ${objective}\nA: ${assessment}\nP: ${plan}`,
    forPatient:
      "Thanks for today. Keep practising the activities we worked on, and we'll see you at the next visit.",
    status: sc.note === "signed" ? "Final" : "Draft",
    aiDrafted: sc.note === "ai-unverified",
    amendments: [],
  };
}

let inFlight: Promise<void> | null = null;

/** Parallel first requests share one seeding run instead of racing on the same ids. */
export function ensureSessionSeed() {
  inFlight ??= seedOnce().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function seedOnce() {
  const db = await collections();
  const flags = db.db.collection<{ _id: string; at: Date }>("settings");
  if (await flags.findOne({ _id: "m14Seed" })) return;
  const col = await sessionExts();
  const rand = rng(1414);
  const pick = <T>(l: readonly T[]) => l[Math.floor(rand() * l.length)] as T;
  const now = Date.now();
  const therapists = await db.therapists.find({}, { projection: { name: 1 } }).toArray();
  const clients = await db.clients
    .find({ name: { $in: scenarios.map((s) => s.participant) } })
    .toArray();

  for (const sc of scenarios) {
    const c = clients.find((x) => x.name === sc.participant);
    const need = c?.needs.find((n) => n.discipline === sc.discipline && n.therapistId);
    if (!c || !need?.therapistId) continue;
    const therapistId = need.therapistId;
    const tName = therapists.find((t) => t._id.equals(therapistId))?.name ?? "Treating clinician";
    const start = new Date(now + sc.at * MIN);
    const end = new Date(start.getTime() + sc.minutes * MIN);
    const id = new ObjectId();
    const location = sc.mode === "Other Community Location" ? "Other community location" : sc.mode;
    const a: AppointmentDoc = {
      _id: id,
      therapistId,
      clientId: c._id,
      discipline: sc.discipline as AppointmentDoc["discipline"],
      start,
      end,
      status:
        sc.state === "no-show"
          ? "no-show"
          : sc.state === "booked" || sc.state === "in-progress"
            ? "booked"
            : "completed",
      holdsSlot: sc.state !== "no-show",
      needId: need.id,
      modality: sc.mode === "Telehealth" ? "Telehealth" : "In person",
      ref: `APT-${String(900000 + Math.floor(rand() * 99999))}`,
      site: {
        location: location as NonNullable<AppointmentDoc["site"]>["location"],
        locationChangeReason: "",
        address: sc.mode === "Telehealth" ? "" : `${c.suburb}, QLD`,
        accessNotes: sc.mode === "Home" ? "Side gate; two steps at the front door" : "",
        parking: "",
        pets: sc.mode === "Home" ? "One small dog, kept inside" : "",
        supportPerson: "",
        siteName: sc.site ?? "",
        siteContact: sc.mode === "School" ? "Ms Patel, class teacher" : "",
        sitePhone: "",
        room: "",
        permission: sc.mode === "School",
        deviceCheck: sc.mode === "Telehealth",
        consentPlan: true,
        attendees: "",
      },
      purpose: (sc.purpose === "Treatment"
        ? "Treatment Session"
        : sc.purpose) as AppointmentDoc["purpose"],
      confirmedByPatient: sc.state === "booked" ? new Date(now - DAY) : null,
      createdAt: new Date(now - 10 * DAY),
    };
    if (sc.state === "in-progress")
      a.checkIn = {
        at: new Date(now - 38 * MIN),
        attendees: "Participant, Carer",
        safe: true,
        notes: "",
        byName: tName,
      };
    if (sc.state === "completed" || sc.state === "partial") {
      a.checkIn = {
        at: new Date(start.getTime() + 2 * MIN),
        attendees: "Participant",
        safe: true,
        notes: "",
        byName: tName,
      };
      const mins = sc.state === "partial" ? 35 : sc.minutes - 4;
      a.checkOut = {
        at: new Date(start.getTime() + (2 + mins) * MIN),
        minutes: mins,
        byName: tName,
      };
    }
    if (sc.state === "no-show")
      a.cancellation = {
        by: "client",
        reason: "Did not attend",
        noticeHours: 0,
        chargeable: true,
        actorName: tName,
        at: new Date(start.getTime() + 20 * MIN),
      };
    if (sc.note)
      a.note = {
        ...soap(sc),
        signedAt: sc.note === "signed" ? new Date(end.getTime() + 30 * MIN) : null,
        byName: tName,
        at: new Date(end.getTime() + 20 * MIN),
      };
    await db.appointments.insertOne(a);

    if (sc.telehealth) {
      const rec = sc.telehealth === "recorded";
      await db.telehealth.insertOne({
        _id: new ObjectId(),
        appointmentId: id,
        clientId: c._id,
        therapistId,
        tokenHash: null,
        linkSentAt: new Date(start.getTime() - DAY),
        suitability: {
          ok: true,
          notes: "Quiet room, stable connection",
          byName: tName,
          at: new Date(start.getTime() - DAY),
        },
        guest: { name: c.name, relationship: "Participant", verified: true, at: start },
        consents: {
          video: { given: true, by: c.name, at: start },
          recording: rec ? { given: true, by: c.name, at: start } : null,
          transcription: null,
          sharing: null,
        },
        device: { camera: true, microphone: true, network: "good" },
        state: "Ended",
        waitingSince: start,
        admittedAt: new Date(start.getTime() + MIN),
        endedAt: end,
        participants: [
          { name: tName, role: "Clinician", joinedAt: start },
          { name: c.name, role: "Participant", joinedAt: new Date(start.getTime() + MIN) },
        ],
        screenShare: false,
        recordingAllowed: rec,
        recording: {
          status: rec ? "Available" : "Off",
          segments: rec
            ? [
                {
                  start: new Date(start.getTime() + 3 * MIN),
                  end: new Date(start.getTime() + 18 * MIN),
                },
                {
                  start: new Date(start.getTime() + 21 * MIN),
                  end: new Date(start.getTime() + 40 * MIN),
                },
              ]
            : [],
          availableAt: rec ? new Date(end.getTime() + 10 * MIN) : null,
          durationSec: rec ? 34 * 60 : 0,
          retentionUntil: rec ? new Date(now + 90 * DAY) : null,
          deleted: null,
          restricted: false,
        },
        transcript: [],
        accessLog: [],
        events: [
          { at: start, text: "Participant waiting; identity checked" },
          { at: new Date(start.getTime() + MIN), text: "Participant admitted" },
          ...(rec
            ? [
                { at: new Date(start.getTime() + 3 * MIN), text: "Recording started with consent" },
                { at: new Date(start.getTime() + 18 * MIN), text: "Recording paused" },
                { at: new Date(start.getTime() + 21 * MIN), text: "Recording resumed" },
                { at: new Date(start.getTime() + 40 * MIN), text: "Recording stopped" },
              ]
            : [{ at: new Date(start.getTime() + 2 * MIN), text: "Recording not requested" }]),
          { at: end, text: "Call ended" },
        ],
      });
    }

    const e = blankSessionExt(a, await nextSessionRef());
    e.seeded = true;
    e.purpose = sc.purpose;
    e.siteDetail = sc.site ?? "";
    const past = sc.state !== "booked";
    for (const item of checklistFor(sc.mode))
      if (past || rand() < 0.5)
        e.checklist[item] = {
          state: item === "Interpreter need" ? "Not applicable" : "Confirmed",
          note: "",
          by: tName,
          at: new Date(start.getTime() - DAY),
        };
    e.attendees = [
      {
        name: "Participant",
        role: "Participant",
        present: sc.state !== "no-show",
        authority: "Self",
        recordingConsent: sc.telehealth === "recorded" ? "Given" : "Not asked",
      },
      ...(sc.attendees ?? []).map((x) => ({
        ...x,
        present: true,
        recordingConsent: "Not asked" as const,
      })),
    ];
    if (past && sc.state !== "no-show") {
      e.identity = {
        identity: true,
        location: true,
        by: tName,
        at: new Date(start.getTime() + MIN),
      };
      e.safety = { status: "Clear", detail: "", action: "", escalated: false };
    }
    e.interventions = sc.activities.map((x, i) => ({
      id: randomUUID(),
      activity: x.activity,
      goalIds: [],
      minutes: 10 + i * 5,
      dose: { sets: "", reps: "", duration: "", resistance: "" },
      resultType: x.unit ? "Numeric" : x.result ? "Ordinal" : "Narrative",
      result: x.result,
      unit: x.unit,
      method: x.method,
      support: x.support,
      response: x.response,
      narrative: x.narrative,
      source: x.source,
      adverse: "No",
      adverseDetail: "",
      flags: [],
      at: new Date((a.checkIn?.at ?? start).getTime() + (10 + i * 12) * MIN),
      by: tName,
    }));
    if (sc.state === "partial") {
      e.partial = { remaining: sc.remaining ?? "" };
      e.disposition = "Reassess";
      e.followUps = [{ type: "Further Assessment", note: sc.remaining ?? "", taskId: null }];
    } else if (sc.state === "completed") {
      e.disposition = "Continue";
      e.followUps = [{ type: "New Session", note: "", taskId: null }];
    }
    if (sc.note === "ai-unverified")
      e.aiNote = { verified: false, at: new Date(end.getTime() + 15 * MIN) };
    if (sc.conflict)
      e.sync = {
        state: "Conflict",
        conflict: {
          field: "objective",
          mobile:
            "Car transfer with stand-by supervision only; used the grab handle (entered offline on the phone).",
          web: "Car transfer with stand-by supervision only.",
          at: new Date(end.getTime() + 40 * MIN),
        },
      };
    if (sc.verification)
      e.verification = {
        state: sc.verification,
        note: sc.verification === "Verified" ? "Attended, times and signature confirmed" : "",
        by: "Morgan Blake",
        at: new Date(end.getTime() + DAY),
      };
    e.outcomeReason = sc.outcome ?? "";
    e.timeline = [
      {
        at: new Date(start.getTime() - 10 * DAY),
        by: "Scheduling",
        action: "Session booked",
        reason: "",
      },
      ...(past && sc.state !== "no-show"
        ? [
            {
              at: new Date(start.getTime() + MIN),
              by: tName,
              action: "Checked in: identity and location confirmed",
              reason: "",
            },
          ]
        : []),
      ...(sc.state === "no-show"
        ? [
            {
              at: new Date(start.getTime() + 20 * MIN),
              by: tName,
              action: "Recorded as did not attend; no clinical note created",
              reason: sc.outcome ?? "",
            },
          ]
        : []),
      ...(sc.state === "partial"
        ? [
            {
              at: a.checkOut?.at ?? end,
              by: tName,
              action: "Session ended partially completed · Reassess",
              reason: sc.remaining ?? "",
            },
          ]
        : []),
      ...(sc.state === "completed"
        ? [{ at: a.checkOut?.at ?? end, by: tName, action: "Session ended · Continue", reason: "" }]
        : []),
      ...(sc.note === "signed"
        ? [
            {
              at: new Date(end.getTime() + 30 * MIN),
              by: tName,
              action: "Signed the session note",
              reason: "",
            },
          ]
        : []),
      ...(sc.conflict
        ? [
            {
              at: new Date(end.getTime() + 40 * MIN),
              by: "Sync",
              action: "Edit conflict: phone and web versions differ",
              reason: "",
            },
          ]
        : []),
    ];
    await col.insertOne(e);
  }

  /* Volume: session details for the real visits in the window, so every list is full. */
  const existing = new Set(
    (await col.find({}, { projection: { _id: 1 } }).toArray()).map((x) => x._id.toHexString()),
  );
  const appts = await db.appointments
    .find({
      status: { $ne: "tentative" },
      start: { $gte: new Date(now - 28 * DAY), $lte: new Date(now + 14 * DAY) },
    })
    .toArray();
  const docs: SessionExtDoc[] = [];
  for (const a of appts) {
    if (existing.has(a._id.toHexString())) continue;
    const e = blankSessionExt(a, await nextSessionRef());
    e.seeded = true;
    const tName = therapists.find((t) => t._id.equals(a.therapistId))?.name ?? "Treating clinician";
    const mode = modeOf(a);
    const att = attendanceOf(a, e);
    const happened = ["Completed", "Partially Completed", "In Progress"].includes(att);
    const soon = a.start.getTime() < now + 2 * DAY;
    for (const item of checklistFor(mode))
      if (rand() < (happened || soon ? 0.9 : 0.35))
        e.checklist[item] = {
          state: rand() < 0.06 ? "Unresolved" : "Confirmed",
          note: "",
          by: tName,
          at: new Date(a.start.getTime() - DAY),
        };
    if (happened) {
      e.identity = { identity: true, location: true, by: tName, at: a.checkIn?.at ?? a.start };
      const concern = rand() < 0.08;
      e.safety = {
        status: concern ? "Concern / Precaution" : "Clear",
        detail: concern
          ? pick(["Loose rug in the hallway", "Carer unwell", "Step without a rail at the entry"])
          : "",
        action: "",
        escalated: concern,
      };
      const acts = activityCatalogue[a.discipline] ?? ["Session activity"];
      const n = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++)
        e.interventions.push({
          id: randomUUID(),
          activity: pick(acts),
          goalIds: [],
          minutes: 10 + Math.floor(rand() * 20),
          dose: { sets: "", reps: "", duration: "", resistance: "" },
          resultType: "Narrative",
          result: "",
          unit: "",
          method: "",
          support: pick(["Independent", "Supervision", "Prompting", "Physical assistance"]),
          response: pick(["Tolerated", "Improved", "Limited", "No Change"]),
          narrative: "Illustrative sample entry.",
          source: rand() < 0.8 ? "Observed" : "Patient-reported",
          adverse: "No",
          adverseDetail: "",
          flags: [],
          at: a.checkIn?.at ?? a.start,
          by: tName,
        });
      e.disposition = pick(["Continue", "Continue", "Continue", "Reassess", "Change Plan"]);
      if (a.status === "completed" && a.note?.signedAt) {
        const r = rand();
        e.verification = {
          state: r < 0.62 ? "Verified" : r < 0.94 ? "Unverified" : "Disputed",
          note: "",
          by: "Morgan Blake",
          at: new Date(a.note.signedAt.getTime() + DAY),
        };
      }
      if (rand() < 0.04 && a.note && !a.note.signedAt)
        e.sync = { state: "Unsynced draft", conflict: null };
    }
    if (att === "No Show") e.outcomeReason = "Did not attend";
    e.timeline = [{ at: a.createdAt, by: "Scheduling", action: "Session booked", reason: "" }];
    docs.push(e);
  }
  if (docs.length) await col.insertMany(docs, { ordered: false }).catch(() => undefined);
  await flags.updateOne({ _id: "m14Seed" }, { $set: { at: new Date() } }, { upsert: true });
}
