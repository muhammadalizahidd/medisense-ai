import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { templatesFor, type Outcome } from "@/lib/live/assess";
import { collections } from "./db";
import { blankExt, type AssessExtDoc } from "./assess";
import type { AssessmentDoc, ClientDoc } from "./models";

/**
 * Section 18's mock cases on real participants, plus an assessment for every assigned service so
 * the queue reads like a working practice. Created once (settings flag "m12Seed").
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4_294_967_296;
  };
}

type Pack = {
  code: string;
  participant: string;
  discipline?: string;
  template?: string;
  mode: string;
  state: "requested" | "ready" | "progress" | "paused" | "pending" | "signed" | "cosign";
  outcome?: Outcome;
  consent?: string;
  photo?: string;
  risk?: string;
  baseline?: boolean;
};

const packs: Pack[] = [
  {
    code: "OT-001",
    participant: "Jordan Mills",
    template: "ot-fca",
    mode: "Home",
    state: "pending",
    outcome: "Report only",
    photo: "Obtained",
  },
  {
    code: "OT-002",
    participant: "Charlotte MacLeod",
    template: "ot-fca",
    mode: "School",
    state: "paused",
  },
  {
    code: "PT-001",
    participant: "Priya Shah",
    template: "physio",
    mode: "Telehealth",
    state: "progress",
    baseline: true,
  },
  { code: "SP-001", participant: "Mia Tan", template: "speech", mode: "School", state: "progress" },
  {
    code: "PSY-001",
    participant: "Alex Chen",
    discipline: "Psychology",
    template: "psych",
    mode: "Telehealth",
    state: "cosign",
    outcome: "Treatment recommendation",
  },
  {
    code: "NUR-001",
    participant: "Remy Sorensen",
    template: "wound",
    mode: "Home",
    state: "progress",
    risk: "Concern",
    photo: "Obtained",
  },
  {
    code: "AT-001",
    participant: "Isabella Kowalski",
    template: "at",
    mode: "Home",
    state: "progress",
    photo: "Declined",
  },
  {
    code: "TEL-001",
    participant: "Lachlan O'Brien",
    template: "ot-fca",
    mode: "Telehealth",
    state: "ready",
  },
];

const obsLines: Record<string, [string, string, string][]> = {
  "ot-fca": [
    [
      "personal-care",
      "Dressing",
      "Needed verbal prompts to sequence upper-body dressing; completed safely.",
    ],
    [
      "personal-care",
      "Bathing",
      "Participant reports needing help to wash hair; not observed this visit.",
    ],
    ["mobility", "Shower", "Transfer onto shower chair with stand-by supervision."],
    ["iadl", "Meal preparation", "Prepared a sandwich independently; fatigue after 10 minutes."],
    ["cognition", "Planning", "Used a written list to plan the morning routine."],
  ],
  physio: [
    ["pain", "0–10 rating", "Pain 4/10 at rest, 6/10 after walking (participant report)."],
    ["gait", "Distance", "Walked 120 m indoors without an aid (remote video observation)."],
    ["functional", "Sit-to-stand", "Five repetitions without hands (remote video observation)."],
  ],
  speech: [
    ["modality", "Spoken", "Uses short phrases; gestures when not understood."],
    ["production", "Target sound", "/s/ in initial position accurate 6 of 20 attempts."],
    ["functional-comm", "School", "Teacher reports Mia avoids answering aloud in class."],
  ],
  psych: [
    ["concerns", "Impact", "Reports anxiety affecting study and sleep."],
    ["impact", "Sleep", "Sleep onset delayed most nights (participant report)."],
  ],
  wound: [
    ["wound", "Site", "Left lower leg, lateral aspect."],
    ["review", "Appearance changes", "Increased redness around the wound margin since last week."],
  ],
  at: [
    ["trials", "Device", "Trial 1: lightweight wheelchair, indoor propulsion 20 m with ease."],
    ["trials", "Response", "Trial 2: power-assist wheels, reduced shoulder fatigue reported."],
    ["fit", "Sizing", "Seat width 42 cm suitable; footplate height adjusted."],
  ],
};
const sourceFor = (text: string) =>
  /report/i.test(text)
    ? "Participant report"
    : /teacher/i.test(text)
      ? "Teacher report"
      : "Direct observation";

export async function ensureAssessSeed() {
  const db = await collections();
  const flags = db.db.collection<{ _id: string; at: Date }>("settings");
  if (await flags.findOne({ _id: "m12Seed" })) return;
  const col = db.db.collection<AssessExtDoc>("assessExt");
  const counter = db.db.collection<{ _id: string; seq: number }>("counters");
  const ref = async () =>
    `ASM-${String((await counter.findOneAndUpdate({ _id: "assess" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" }))?.seq ?? 1).padStart(5, "0")}`;
  const rand = rng(1212);
  const pick = <T>(l: readonly T[]) => l[Math.floor(rand() * l.length)] as T;
  const day = 86_400_000;
  const clients = await db.clients
    .find({ "needs.therapistId": { $ne: null }, discharged: { $in: [null] } })
    .toArray();
  const therapists = await db.therapists.find({}, { projection: { name: 1 } }).toArray();
  const tName = (id: ObjectId | null) =>
    therapists.find((t) => id && t._id.equals(id))?.name ?? "Treating clinician";

  const make = async (
    c: ClientDoc,
    need: ClientDoc["needs"][number],
    pack: Pack | null,
    createdAgo: number,
    kind: "Initial" | "Reassessment" = "Initial",
  ) => {
    const now = Date.now();
    const created = new Date(now - createdAgo * day);
    const a: AssessmentDoc = {
      _id: new ObjectId(),
      clientId: c._id,
      needId: need.id,
      therapistId: need.therapistId ?? new ObjectId(),
      therapistName: tName(need.therapistId),
      support: need.support,
      discipline: need.discipline,
      kind,
      status: "In Progress",
      consent: { obtained: true, notes: "" },
      sections: {},
      activities: [],
      findings: "",
      limitations: "",
      recommendation: { decision: "", notes: "" },
      released: null,
      signed: null,
      amendments: [],
      createdAt: created,
      updatedAt: new Date(now - Math.floor(rand() * 3) * day),
    };
    const e = blankExt(a._id, a, await ref());
    const tpl = pack?.template ?? templatesFor(need.discipline, need.support)[0]?.id ?? "custom";
    e.caseCode = pack?.code ?? null;
    e.templateId = tpl;
    e.mode = pack?.mode ?? (need.location as string) ?? "Home";
    e.purpose = kind === "Reassessment" ? "Reassessment" : "Initial";
    e.dueAt = new Date(now + (3 + Math.floor(rand() * 18)) * day);
    const state =
      pack?.state ??
      pick([
        "requested",
        "ready",
        "progress",
        "progress",
        "progress",
        "paused",
        "pending",
        "signed",
      ] as const);
    const by = a.therapistName;
    e.history.push({ at: created, by, action: `Assessment started (${kind})`, reason: "" });
    if (state !== "requested") {
      e.respondents = [{ id: randomUUID(), name: c.name, role: "Participant", permission: "Self" }];
      if (e.mode === "School")
        e.respondents.push({
          id: randomUUID(),
          name: "Classroom teacher",
          role: "Teacher",
          permission: "School permission on file",
        });
      e.consent = pack?.consent ?? "Obtained";
      e.photoConsent = pack?.photo ?? pick(["Obtained", "Not applicable", "Declined"]);
      e.risk = pack?.risk ?? "Reviewed";
      e.riskNote =
        e.risk === "Concern"
          ? "Increasing redness at the wound margin; Clinical Lead review requested."
          : "";
    }
    if (["progress", "paused", "pending", "signed", "cosign"].includes(state)) {
      const lines = obsLines[tpl] ?? [
        ["summary", "Presenting concerns", "Reason for referral confirmed with the participant."],
      ];
      e.visits.push({
        id: randomUUID(),
        date: new Date(created.getTime() + 2 * day),
        location: e.mode,
        author: by,
        summary: "First visit: interview and functional observation completed.",
        paused:
          state === "paused"
            ? "Participant fatigued; community access and school observation still to do"
            : "",
        outstanding: state === "paused" ? ["Community access", "School observation"] : [],
      });
      e.observations = [
        {
          id: randomUUID(),
          domain: "summary",
          item: "Presenting concerns",
          source: "Participant report",
          performance: "Not assessed",
          context: "Home",
          frequency: "Unknown",
          result: "Completed safely",
          quality: "Self-reported",
          notes: "Priorities and goals recorded in the participant's words.",
          reason: "",
          date: new Date(created.getTime() + 2 * day),
          author: by,
          visitId: e.visits[0]?.id ?? null,
          aiSuggested: false,
          accepted: true,
        },
        ...lines.map(([domain, item, notes]) => ({
          id: randomUUID(),
          domain,
          item,
          source: sourceFor(notes),
          performance: pick([
            "Independent",
            "Supervision",
            "Verbal prompting",
            "Modified independent",
          ] as const),
          context: (e.mode === "Telehealth"
            ? "Telehealth"
            : e.mode === "School"
              ? "School"
              : "Home") as string,
          frequency: "Often",
          result: pick(["Completed safely", "Completed with difficulty"] as const),
          quality: sourceFor(notes) === "Direct observation" ? "Observed" : "Self-reported",
          notes,
          reason: "",
          date: new Date(created.getTime() + 2 * day),
          author: by,
          visitId: e.visits[0]?.id ?? null,
          aiSuggested: false,
          accepted: true,
        })),
      ];
      if (tpl === "physio")
        e.measurements = [
          {
            id: randomUUID(),
            parameter: "Timed Up and Go",
            value: "11.2",
            unit: "s",
            method: "TUG, standard chair, no aid",
            side: "",
            device: "None",
            conditions: "Telehealth: timed by carer on video",
            date: new Date(created.getTime() + 2 * day),
            author: by,
            reported: false,
          },
          {
            id: randomUUID(),
            parameter: "Knee flexion",
            value: "110",
            unit: "degrees",
            method: "Goniometer, active",
            side: "Right",
            device: "",
            conditions: "Seated",
            date: new Date(created.getTime() + 2 * day),
            author: by,
            reported: false,
          },
        ];
      if (tpl === "wound")
        e.measurements = [
          {
            id: randomUUID(),
            parameter: "Wound length",
            value: "32",
            unit: "mm",
            method: "Disposable ruler",
            side: "Left",
            device: "",
            conditions: "After cleansing",
            date: new Date(created.getTime() + 2 * day),
            author: by,
            reported: false,
          },
        ];
      if (tpl === "ot-fca")
        e.scores = [
          {
            id: randomUUID(),
            instrument: "COPM",
            version: "5th ed.",
            score: "Performance 4.2 · Satisfaction 3.6",
            domain: "Self-care priorities",
            assessor: by,
            date: new Date(created.getTime() + 2 * day),
            notes: "Manual entry",
            restricted: false,
          },
        ];
      if (tpl === "psych")
        e.scores = [
          {
            id: randomUUID(),
            instrument: "K10",
            version: "Standard",
            score: "24",
            domain: "Psychological distress",
            assessor: by,
            date: new Date(created.getTime() + 2 * day),
            notes: "Manual entry; no automatic interpretation",
            restricted: false,
          },
        ];
      if (e.photoConsent === "Obtained")
        e.evidence = [
          {
            id: randomUUID(),
            type: "Photo",
            caption:
              tpl === "wound"
                ? "Wound site, left lower leg"
                : "Bathroom: shower recess and grab-rail position",
            date: new Date(created.getTime() + 2 * day).toISOString().slice(0, 10),
            sensitivity: "Sensitive",
            sharing: "Care team only",
            consent: "Obtained",
            author: by,
            domain: tpl === "wound" ? "wound" : "home-access",
          },
        ];
    }
    if (["pending", "signed", "cosign"].includes(state)) {
      e.visits.push({
        id: randomUUID(),
        date: new Date(created.getTime() + 9 * day),
        location: e.mode,
        author: by,
        summary: "Second visit: remaining observations completed; limitations discussed.",
        paused: "",
        outstanding: [],
      });
      e.outcome =
        pack?.outcome ??
        pick(["Report only", "Treatment recommendation", "Further assessment"] as const);
      e.outcomeNote =
        e.outcome === "Report only"
          ? "Assessment-only service: report for the plan review."
          : "Clinically indicated after assessment.";
      e.report = {
        text: `Assessment of ${c.name} for ${need.support}. Findings are drawn from direct observation and participant report, as labelled. Limitations: one domain assessed by report only.`,
        sections: [{ heading: "Findings", body: "See observations O1–O5.", cites: ["O1", "O2"] }],
        at: new Date(created.getTime() + 10 * day),
        aiDrafted: true,
        reviewedBy: by,
        aiDisclosure: true,
      };
      // Unincluded optional domains keep the queue honest about what was covered.
      e.excluded = (templatesFor(need.discipline, need.support)[0]?.domains ?? [])
        .slice(3)
        .map((x) => x.key);
    }
    if (state === "pending") e.submitted = { by, at: new Date(created.getTime() + 10 * day) };
    if (state === "signed" || state === "cosign") {
      a.status = "Signed";
      a.signed = { byName: by, at: new Date(created.getTime() + 10 * day) };
      a.findings = e.report?.text ?? "";
    }
    await db.assessments.insertOne(a);
    await col.insertOne(e);
    return { a, e };
  };

  for (const p of packs) {
    const c = clients.find((x) => x.name === p.participant);
    const need = c?.needs.find(
      (n) => (p.discipline ? n.discipline === p.discipline : true) && n.therapistId,
    );
    if (!c || !need) continue;
    if (p.baseline) {
      // PT-001: an earlier signed baseline for reassessment comparison (M12-023).
      const base = await make(
        c,
        need,
        { ...p, code: "PT-001 baseline", state: "signed", outcome: "Treatment recommendation" },
        48,
      );
      await col.updateOne(
        { _id: base.e._id },
        {
          $set: {
            measurements: [
              {
                id: randomUUID(),
                parameter: "Timed Up and Go",
                value: "14.8",
                unit: "s",
                method: "TUG, standard chair, no aid",
                side: "",
                device: "None",
                conditions: "In person",
                date: new Date(Date.now() - 46 * day),
                author: base.a.therapistName,
                reported: false,
              },
              {
                id: randomUUID(),
                parameter: "Knee flexion",
                value: "95",
                unit: "degrees",
                method: "Goniometer, active",
                side: "Right",
                device: "",
                conditions: "Seated",
                date: new Date(Date.now() - 46 * day),
                author: base.a.therapistName,
                reported: false,
              },
            ],
          },
        },
      );
      await make(c, need, p, 6, "Reassessment");
    } else {
      await make(c, need, p, 12 + Math.floor(rand() * 10));
    }
  }
  for (const c of clients) {
    for (const n of c.needs.filter((x) => x.therapistId && x.status === "assigned")) {
      if (
        await db.assessments.findOne({ clientId: c._id, needId: n.id }, { projection: { _id: 1 } })
      )
        continue;
      await make(c, n, null, 4 + Math.floor(rand() * 40));
    }
  }
  await flags.updateOne({ _id: "m12Seed" }, { $set: { at: new Date() } }, { upsert: true });
}
