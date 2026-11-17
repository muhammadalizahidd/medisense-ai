import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import {
  templates,
  type DocStatus,
  type NoteType,
  type SourceItem,
  type TranscriptSeg,
  type Warning,
} from "@/lib/live/docs";
import { collections } from "./db";
import { blankSections, docCol, nextDocRef, type ClinicalDocDoc } from "./docs";
import type { AppointmentDoc } from "./models";

/*
 * Module 15 sample documentation: the ten specification scenarios plus a note for most completed
 * visits in the last three weeks, so every queue is full. Created once (settings flag "m15Seed").
 * All clinical text is fictional and illustrative.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4_294_967_296;
  };
}

const DAY = 86_400_000;
const seg = (
  speaker: TranscriptSeg["speaker"],
  at: number,
  text: string,
  uncertain = false,
): TranscriptSeg => ({
  id: randomUUID(),
  speaker,
  at,
  text,
  original: text,
  uncertain,
  corrected: false,
});

type Spec = {
  code: string;
  participant: string;
  discipline: string;
  noteType: NoteType;
  capture: string;
  status: DocStatus;
  daysAgo: number;
  mode?: string;
  observations?: string;
  transcript?: TranscriptSeg[];
  consents?: Partial<ClinicalDocDoc["consents"]>;
  sections?: Record<string, string>;
  ai?: boolean;
  warnings?: Warning[];
  extra?: SourceItem[];
  supervised?: boolean;
  coSign?: ClinicalDocDoc["coSign"]["status"];
  offline?: ClinicalDocDoc["offline"];
  shares?: string[];
  selectAll?: boolean;
};

const specs: Spec[] = [
  {
    code: "1",
    participant: "Harper Nguyen",
    discipline: "Occupational Therapy",
    noteType: "SOAP",
    capture: "Dictated",
    status: "Editing",
    daysAgo: 0,
    mode: "Home",
    observations:
      "Dressing: upper body independent with set-up; lower body physical assistance for socks and shoes. Bed to chair transfer with stand-by supervision using the bed stick.",
    transcript: [
      seg(
        "Clinician",
        0,
        "Dressing observed in the bedroom. Socks and shoes needed hands-on help.",
      ),
      seg("Participant", 14, "I get tired by the time I do my shoes, maybe ten minutes in.", true),
      seg("Clinician", 31, "Recommend a long-handled shoe horn trial and review next visit."),
    ],
    consents: { ai: "Granted" },
  },
  {
    code: "2",
    participant: "Charlotte MacLeod",
    discipline: "Occupational Therapy",
    noteType: "FCA observation summary",
    capture: "Approved source compilation",
    status: "Signed",
    daysAgo: 5,
    mode: "School",
    sections: {
      domains:
        "Visit 1 of 2: self-care and school participation assessed. Community access and transfers are planned for visit 2.",
      evidence:
        "Observed: opens lunch containers with set-up (1 of 4 attempts independent). Teacher-reported: needs reminders for bag routine.",
      limits:
        "Community and transport domains not yet assessed; the full report stays in progress.",
      recs: "Complete the remaining domains at visit 2 before the FCA report is drafted.",
    },
  },
  {
    code: "3",
    participant: "Alex Chen",
    discipline: "Occupational Therapy",
    noteType: "Telehealth consultation",
    capture: "Typed",
    status: "Signed",
    daysAgo: 2,
    mode: "Telehealth",
    consents: { recording: "Declined", ai: "Declined" },
    sections: {
      identity:
        "Identity and location confirmed by video. Participant declined recording; the call continued unrecorded.",
      issues: "Reports difficulty reaching the top kitchen shelves.",
      assessment: "Observed by video: reaches to shoulder height without discomfort.",
      interventions: "Discussed reacher use and reorganising the pantry.",
      followup: "Review in two weeks by telehealth.",
    },
  },
  {
    code: "4",
    participant: "Lachlan O'Brien",
    discipline: "Occupational Therapy",
    noteType: "Telehealth consultation",
    capture: "Transcript import",
    status: "Editing",
    daysAgo: 1,
    mode: "Telehealth",
    consents: { recording: "Granted", ai: "Granted" },
    transcript: [
      seg("Clinician", 0, "Can you show me the car transfer set-up on the camera?"),
      seg("Participant", 9, "I used the grab handle and got in on my own."),
      seg("Carer", 22, "He needed me to steady him once, I think.", true),
      seg("Clinician", 40, "Transfer appeared steady with stand-by supervision on video."),
    ],
  },
  {
    code: "5",
    participant: "Alex Chen",
    discipline: "Psychology",
    noteType: "SOAP",
    capture: "Typed",
    status: "Signed",
    daysAgo: 3,
    mode: "Telehealth",
    sections: {
      s: "Protected content: visible to the treating psychologist only.",
      o: "Protected content.",
      a: "Protected content.",
      p: "Protected content.",
    },
  },
  {
    code: "6",
    participant: "Priya Shah",
    discipline: "Physiotherapy",
    noteType: "SOAP",
    capture: "Dictated",
    status: "AI Draft",
    daysAgo: 1,
    mode: "Community",
    transcript: [
      seg("Clinician", 0, "Walked 200 m with the four-wheeled walker, two rests."),
      seg("Participant", 18, "My knee was sore, maybe a four out of ten.", true),
    ],
    extra: [
      {
        id: "extra:walk",
        kind: "Assessment value",
        label: "Validated encounter observation",
        text: "Continuous walk 120 m, four-wheeled walker, measured wheel, flat path.",
        date: new Date(Date.now() - DAY).toISOString(),
        reported: "Observed",
      },
    ],
    ai: true,
    selectAll: true,
    sections: {
      s: "Participant reports knee soreness, possibly 4/10 [S2].",
      o: "Walked with a four-wheeled walker. Sources disagree on distance: 200 m in dictation [S1] and 120 m measured [S3].",
      a: "Walking tolerance limited by knee soreness; distance to be confirmed.",
      p: "Continue graded walking; repeat the measured walk next session.",
    },
  },
  {
    code: "7",
    participant: "Matilda Singh",
    discipline: "Occupational Therapy",
    noteType: "Therapy session note",
    capture: "Typed",
    status: "Awaiting Co-sign",
    daysAgo: 1,
    mode: "Home",
    supervised: true,
    coSign: "Pending",
    sections: {
      attendance: "Home visit, participant and mother present.",
      interventions: "Kitchen task practice, 30 minutes; energy conservation education.",
      measures: "Prepared a sandwich with verbal prompts (2 prompts).",
      followup: "Continue weekly; trial a perching stool.",
    },
  },
  {
    code: "8",
    participant: "Isabella Kowalski",
    discipline: "Occupational Therapy",
    noteType: "SOAP",
    capture: "Typed",
    status: "Editing",
    daysAgo: 1,
    mode: "Home",
    sections: {
      s: "Reports fatigue in the afternoons.",
      o: "Transfer bed to chair with physical assistance.",
      a: "Fatigue limiting session length.",
      p: "Shorter morning sessions.",
    },
    offline: {
      state: "Conflict",
      conflict: {
        section: "Objective",
        mobile:
          "Transfer bed to chair with physical assistance of one; paused after 30 minutes (entered offline on the phone).",
        web: "Transfer bed to chair with physical assistance.",
      },
    },
  },
  {
    code: "9",
    participant: "Mason Fernando",
    discipline: "Occupational Therapy",
    noteType: "Initial assessment summary",
    capture: "Approved source compilation",
    status: "AI Draft",
    daysAgo: 2,
    mode: "Home",
    observations:
      "Participant prefers routine; becomes frustrated when tasks change. Dresses with verbal prompts.",
    ai: true,
    selectAll: true,
    sections: {
      reason: "Referred for functional capacity in self-care [S1].",
      history: "Prefers routine and becomes frustrated when tasks change [S1].",
      consent: "Consent recorded at intake.",
      observations: "Dresses with verbal prompts [S1].",
      synthesis: "Presentation consistent with an autism diagnosis.",
      recs: "Continue functional assessment of daily routines.",
    },
  },
  {
    code: "10",
    participant: "Mia Tan",
    discipline: "Speech Pathology",
    noteType: "Therapy session note",
    capture: "Typed",
    status: "Signed",
    daysAgo: 4,
    mode: "School",
    consents: { sharing: "Granted" },
    shares: ["Participant"],
    sections: {
      attendance: "School visit; teacher present.",
      interventions: "Two-word request practice with visual cues.",
      measures: "7 of 10 requests with prompts; teacher reports more requests at lunch.",
      followup: "Continue fortnightly; share the home practice sheet.",
    },
  },
];

const filler: Record<string, string[]> = {
  s: [
    "Participant reports a good week.",
    "Reports mild fatigue after school.",
    "Carer reports practising daily.",
  ],
  o: [
    "Completed the planned activities with set-up.",
    "Tolerated the session; no adverse events.",
    "Measures recorded in the session record.",
  ],
  a: [
    "Progressing toward the agreed goals.",
    "Steady progress; continue the current plan.",
    "Some variability; review in two sessions.",
  ],
  p: [
    "Continue the current program.",
    "Review the home program next visit.",
    "Book the next session in two weeks.",
  ],
};

let inFlight: Promise<void> | null = null;

/** Parallel first requests share one seeding run instead of racing on the same ids. */
export function ensureDocSeed() {
  inFlight ??= seedOnce().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function seedOnce() {
  const db = await collections();
  const flags = db.db.collection<{ _id: string; at: Date }>("settings");
  if (await flags.findOne({ _id: "m15Seed" })) return;
  const col = await docCol();
  const rand = rng(1515);
  const pick = <T>(l: readonly T[]) => l[Math.floor(rand() * l.length)] as T;
  const now = Date.now();
  const ther = await db.therapists.find({}, { projection: { name: 1 } }).toArray();
  const tName = (id: ObjectId) => ther.find((t) => t._id.equals(id))?.name ?? "Treating clinician";

  for (const s of specs) {
    const c = await db.clients.findOne({ name: s.participant });
    const need = c?.needs.find((n) => n.discipline === s.discipline && n.therapistId);
    if (!c || !need?.therapistId) continue;
    const at = new Date(now - s.daysAgo * DAY - 3 * 3_600_000);
    const appt = await db.appointments.findOne(
      {
        clientId: c._id,
        therapistId: need.therapistId,
        status: "completed",
        start: { $lte: new Date(now) },
      },
      { sort: { start: -1 } },
    );
    const by = tName(need.therapistId);
    const sections = blankSections(s.noteType).map((sec) => {
      const text = s.sections?.[sec.key] ?? "";
      return {
        ...sec,
        text,
        origin: (s.ai ? "ai" : "clinician") as "ai" | "clinician",
        state: (s.ai ? "pending" : "clinician") as "pending" | "clinician",
        cites: s.ai ? ["S1"] : [],
      };
    });
    const signed = ["Signed", "Addendum", "Awaiting Co-sign"].includes(s.status);
    const doc: ClinicalDocDoc = {
      _id: new ObjectId(),
      ref: await nextDocRef(),
      clientId: c._id,
      needId: need.id,
      therapistId: need.therapistId,
      discipline: s.discipline,
      appointmentId: appt?._id ?? null,
      unlinkedReason: appt ? "" : "Documented from a phone review",
      noteType: s.noteType,
      capture: s.capture,
      mode: s.mode ?? "Home",
      encounterAt: at,
      status: s.status,
      observations: s.observations ?? "",
      dictation: { seconds: s.transcript ? 45 : 0, language: "English (Australia)" },
      transcript: s.transcript ?? [],
      consents: {
        recording: s.mode === "Telehealth" ? "Pending" : "Not required",
        ai: "Granted",
        sharing: "Pending",
        ...s.consents,
      },
      selected: [],
      sections,
      warnings: [],
      reviewedAck: signed,
      signed: signed ? { by, at: new Date(at.getTime() + 3_600_000) } : null,
      supervised: Boolean(s.supervised),
      coSign: { status: s.coSign ?? "Not required", note: "", by: "", at: null },
      addenda: [],
      shares: (s.shares ?? []).map((r) => ({
        recipient: r,
        summary:
          "Thanks for today. Keep practising two-word requests with the picture cards at home.",
        by,
        at: new Date(at.getTime() + 2 * 3_600_000),
      })),
      offline: s.offline ?? { state: "Synced", conflict: null },
      extraSources: s.extra ?? [],
      aiAt: s.ai ? new Date(at.getTime() + 1_800_000) : null,
      timeline: [
        { at, by, action: `Note created: ${s.noteType}, ${s.capture.toLowerCase()}`, reason: "" },
        ...(s.ai
          ? [
              {
                at: new Date(at.getTime() + 1_800_000),
                by,
                action: "AI drafted the note from chosen sources; not clinically verified",
                reason: "",
              },
            ]
          : []),
        ...(signed
          ? [
              {
                at: new Date(at.getTime() + 3_600_000),
                by,
                action: s.supervised
                  ? "Author signed; sent to the supervisor"
                  : "Signed and locked",
                reason: "",
              },
            ]
          : []),
        ...(s.offline?.state === "Conflict"
          ? [
              {
                at: new Date(at.getTime() + 5_400_000),
                by: "Sync",
                action: "Phone draft synced: one section differs from the web",
                reason: "",
              },
            ]
          : []),
      ],
      createdAt: at,
      seeded: true,
    };
    if (s.selectAll) {
      const ids = [
        "obs",
        ...doc.transcript.map((x) => `tr:${x.id}`),
        ...doc.extraSources.map((x) => x.id),
      ];
      doc.selected = ids.filter((id) => id !== "obs" || doc.observations);
    }
    // Scenario warnings the rules would raise on the draft, stored so the queue shows them.
    if (s.code === "6")
      doc.warnings = [
        {
          id: "conflict:m:120-200",
          kind: "Conflict",
          text: "Sources disagree: 200 m (dictation) vs 120 m (validated encounter observation). Choose which is correct before signing.",
          resolved: false,
          resolution: "",
        },
      ];
    if (s.code === "9")
      doc.warnings = [
        {
          id: "unsupported:synthesis:autism",
          kind: "Unsupported",
          text: '"autism" in Clinical synthesis isn\'t in any chosen source. Delete it or add the source.',
          resolved: false,
          resolution: "",
        },
      ];
    if (s.transcript?.some((x) => x.uncertain) && s.status !== "Signed")
      doc.warnings.push(
        ...s.transcript
          .filter((x) => x.uncertain)
          .map((x) => ({
            id: `uncertain:${x.id}`,
            kind: "Uncertain" as const,
            text: `Uncertain transcript at 0:${String(x.at).padStart(2, "0")}: "${x.text}". Correct or confirm it.`,
            resolved: false,
            resolution: "",
          })),
      );
    await col.insertOne(doc);
  }

  /* Volume: notes for most completed visits in the last three weeks. */
  const appts = await db.appointments
    .find({ status: "completed", start: { $gte: new Date(now - 90 * DAY), $lte: new Date(now) } })
    .limit(500)
    .toArray();
  const have = new Set(
    (await col.find({}, { projection: { appointmentId: 1 } }).toArray()).map((d) =>
      d.appointmentId?.toHexString(),
    ),
  );
  const docs: ClinicalDocDoc[] = [];
  for (const a of appts as AppointmentDoc[]) {
    if (have.has(a._id.toHexString()) || rand() < 0.05) continue;
    const c = await db.clients.findOne({ _id: a.clientId }, { projection: { needs: 1 } });
    const need =
      c?.needs.find((n) => n.id === a.needId) ??
      c?.needs.find((n) => n.discipline === a.discipline);
    if (!need) continue;
    const r = rand();
    const status: DocStatus =
      r < 0.56
        ? "Signed"
        : r < 0.66
          ? "Addendum"
          : r < 0.78
            ? "Needs Review"
            : r < 0.9
              ? "Editing"
              : r < 0.96
                ? "AI Draft"
                : "Capturing";
    const noteType: NoteType =
      rand() < 0.55
        ? "SOAP"
        : rand() < 0.6
          ? "Therapy session note"
          : a.modality === "Telehealth"
            ? "Telehealth consultation"
            : "DAP";
    const capture = pick(["Typed", "Typed", "Dictated", "Approved source compilation"]);
    const ai = status === "AI Draft" || (status !== "Capturing" && rand() < 0.45);
    const by = tName(a.therapistId);
    const at = a.start;
    const sections = templates[noteType].map((sec) => ({
      ...sec,
      text: status === "Capturing" ? "" : pick(filler[sec.key] ?? ["Documented as planned."]),
      origin: (ai ? "ai" : "clinician") as "ai" | "clinician",
      state: (status === "AI Draft" ? "pending" : ai ? "accepted" : "clinician") as
        "pending" | "accepted" | "clinician",
      cites: ai ? ["S1"] : [],
    }));
    const signed = status === "Signed" || status === "Addendum";
    docs.push({
      _id: new ObjectId(),
      ref: await nextDocRef(),
      clientId: a.clientId,
      needId: need.id,
      therapistId: a.therapistId,
      discipline: a.discipline,
      appointmentId: a._id,
      unlinkedReason: "",
      noteType,
      capture,
      mode:
        a.modality === "Telehealth"
          ? "Telehealth"
          : a.site?.location === "Other community location"
            ? "Community"
            : (a.site?.location ?? "Home"),
      encounterAt: at,
      status,
      observations: "",
      dictation: {
        seconds: capture === "Dictated" ? 40 + Math.floor(rand() * 80) : 0,
        language: "English (Australia)",
      },
      transcript: [],
      consents: {
        recording: a.modality === "Telehealth" ? pick(["Granted", "Declined"]) : "Not required",
        ai: "Granted",
        sharing: "Pending",
      },
      selected: [],
      sections,
      warnings: [],
      reviewedAck: signed,
      signed: signed ? { by, at: new Date(at.getTime() + (2 + rand() * 30) * 3_600_000) } : null,
      supervised: false,
      coSign: { status: "Not required", note: "", by: "", at: null },
      addenda:
        status === "Addendum"
          ? [
              {
                reason: pick(["Correction", "Late entry", "Addition"]),
                text: "Clarified the home program frequency.",
                by,
                at: new Date(at.getTime() + 2 * DAY),
              },
            ]
          : [],
      shares: [],
      offline: { state: rand() < 0.04 && !signed ? "Unsynced draft" : "Synced", conflict: null },
      extraSources: [],
      aiAt: ai ? new Date(at.getTime() + 3_600_000) : null,
      timeline: [
        { at, by, action: `Note created: ${noteType}, ${capture.toLowerCase()}`, reason: "" },
      ],
      createdAt: at,
      seeded: true,
    });
  }
  if (docs.length) await col.insertMany(docs, { ordered: false });
  await flags.updateOne({ _id: "m15Seed" }, { $set: { at: new Date() } }, { upsert: true });
}
