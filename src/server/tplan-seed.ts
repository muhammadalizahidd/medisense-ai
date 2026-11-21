import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import type { GoalState, InterventionDto, PlanState } from "@/lib/live/tplan";
import { collections } from "./db";
import { blankPlanExt, nextPlanRef, type PlanExtDoc } from "./tplan";
import type { ClientDoc, PlanDoc } from "./models";

/** Section 15's cases A–H on real participants, plus a plan for most assigned services. Once. */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4_294_967_296;
  };
}

type G = {
  title: string;
  description: string;
  category: string;
  type: string;
  direction: string;
  baseline: string;
  target: string;
  current: string;
  unit: string;
  points?: string[];
  state?: GoalState;
  instrument?: string;
};
type Case = {
  code: string;
  participant: string;
  discipline?: string;
  state: PlanState;
  goals: G[];
  interventions: {
    name: string;
    mode: string;
    perWeek: number;
    minutes: number;
    weeks: number;
    sets?: string;
    reps?: string;
    home?: string;
  }[];
  shareWith?: string[];
  versions?: boolean;
  declined?: boolean;
};

const cases: Case[] = [
  {
    code: "A",
    participant: "Harper Nguyen",
    state: "Active",
    shareWith: ["Participant"],
    goals: [
      {
        title: "Independent showering",
        description:
          "Harper will shower independently using a shower chair and long-handled sponge within 8 weeks.",
        category: "Self-care",
        type: "Ordinal",
        direction: "Increase",
        baseline: "Supervision",
        target: "Modified independent",
        current: "Supervision",
        unit: "",
      },
      {
        title: "Prepare a simple lunch",
        description: "Harper will prepare a simple lunch three days a week with written prompts.",
        category: "Self-care",
        type: "Frequency",
        direction: "Increase",
        baseline: "0",
        target: "3",
        current: "2",
        unit: "times/week",
        points: ["1", "2"],
      },
    ],
    interventions: [
      {
        name: "Showering task practice with energy conservation",
        mode: "In person",
        perWeek: 1,
        minutes: 60,
        weeks: 8,
      },
      {
        name: "Home program: meal preparation routine",
        mode: "Home program",
        perWeek: 3,
        minutes: 20,
        weeks: 8,
        home: "Use the picture recipe card; sit to prepare.",
      },
    ],
  },
  {
    code: "B",
    participant: "Priya Shah",
    state: "Active",
    goals: [
      {
        title: "Walk 300 m outdoors",
        description:
          "Priya will walk 300 m on level ground without increased back pain within 10 weeks.",
        category: "Mobility",
        type: "Numeric",
        direction: "Increase",
        baseline: "100",
        target: "300",
        current: "220",
        unit: "m",
        points: ["140", "180", "220"],
      },
      {
        title: "Reduce pain after walking",
        description: "Pain after a 10-minute walk will fall from 6/10 to 3/10.",
        category: "Mobility",
        type: "Numeric",
        direction: "Decrease",
        baseline: "6",
        target: "3",
        current: "4",
        unit: "/10",
        points: ["5", "4"],
      },
    ],
    interventions: [
      {
        name: "Graded walking program",
        mode: "Telehealth",
        perWeek: 1,
        minutes: 45,
        weeks: 10,
        sets: "1",
        reps: "1",
      },
      {
        name: "Core stability exercises",
        mode: "Home program",
        perWeek: 5,
        minutes: 15,
        weeks: 10,
        sets: "3",
        reps: "10",
        home: "Bird-dog and bridges; stop if pain rises above 6/10.",
      },
    ],
  },
  {
    code: "C",
    participant: "Mia Tan",
    state: "Active",
    shareWith: ["Participant"],
    goals: [
      {
        title: "/s/ in words at verbal-cue level",
        description:
          "Mia will produce /s/ at the start of words with a verbal cue in 8 of 10 attempts in class.",
        category: "Communication",
        type: "Ordinal",
        direction: "Increase",
        baseline: "Model needed",
        target: "Verbal cue",
        current: "Visual cue",
        unit: "",
      },
    ],
    interventions: [
      {
        name: "Articulation therapy at school",
        mode: "In person",
        perWeek: 1,
        minutes: 30,
        weeks: 12,
      },
      {
        name: "Parent-shared practice game",
        mode: "Home program",
        perWeek: 4,
        minutes: 10,
        weeks: 12,
        home: "Five-minute 'sneaky snake' game after school.",
      },
    ],
  },
  {
    code: "D",
    participant: "Alex Chen",
    discipline: "Psychology",
    state: "Pending Review",
    goals: [
      {
        title: "Sleep within 30 minutes",
        description: "Alex will fall asleep within 30 minutes on 5 nights a week.",
        category: "Behavioural health",
        type: "Frequency",
        direction: "Increase",
        baseline: "1",
        target: "5",
        current: "1",
        unit: "times/week",
      },
    ],
    interventions: [
      {
        name: "Structured psychological therapy (clinician-selected approach)",
        mode: "Telehealth",
        perWeek: 0.5,
        minutes: 50,
        weeks: 12,
      },
    ],
  },
  {
    code: "E",
    participant: "Remy Sorensen",
    state: "Draft",
    goals: [
      {
        title: "Continence monitoring and education",
        description:
          "Remy and carer will complete a 3-day bladder diary and understand the toileting plan.",
        category: "Continence",
        type: "Observation",
        direction: "Descriptive",
        baseline: "Diary not started",
        target: "Diary complete and reviewed",
        current: "",
        unit: "",
      },
    ],
    interventions: [
      {
        name: "Continence education session",
        mode: "In person",
        perWeek: 1,
        minutes: 45,
        weeks: 4,
      },
    ],
  },
  {
    code: "F",
    participant: "Alex Chen",
    discipline: "Occupational Therapy",
    state: "Active",
    goals: [
      {
        title: "Shared care goal: attend two lectures a week",
        description:
          "Shared with psychology: Alex attends two university lectures a week using a planner.",
        category: "Participation",
        type: "Frequency",
        direction: "Increase",
        baseline: "0",
        target: "2",
        current: "1",
        unit: "times/week",
        points: ["1"],
      },
    ],
    interventions: [
      {
        name: "Planner and routine coaching",
        mode: "In person",
        perWeek: 1,
        minutes: 45,
        weeks: 8,
      },
    ],
  },
  {
    code: "G",
    participant: "Lachlan O'Brien",
    state: "Active",
    versions: true,
    goals: [
      {
        title: "Transfer in and out of the car",
        description: "Lachlan will transfer into the car with stand-by supervision.",
        category: "Mobility",
        type: "Ordinal",
        direction: "Increase",
        baseline: "Partial physical assistance",
        target: "Supervision",
        current: "Supervision",
        unit: "",
        state: "Achieved",
      },
      {
        title: "Community outing weekly",
        description: "Lachlan will complete one community outing a week with a support worker.",
        category: "Participation",
        type: "Frequency",
        direction: "Increase",
        baseline: "0",
        target: "1",
        current: "1",
        unit: "times/week",
      },
    ],
    interventions: [
      { name: "Car transfer practice", mode: "In person", perWeek: 1, minutes: 60, weeks: 6 },
    ],
  },
  {
    code: "H",
    participant: "Matilda Singh",
    state: "Discontinued",
    declined: true,
    goals: [
      {
        title: "Kitchen safety routine",
        description: "Proposed: Matilda will use the kitchen safety checklist daily.",
        category: "Home environment",
        type: "Observation",
        direction: "Descriptive",
        baseline: "Not using checklist",
        target: "Daily use",
        current: "",
        unit: "",
      },
    ],
    interventions: [
      { name: "Kitchen safety coaching", mode: "In person", perWeek: 1, minutes: 45, weeks: 6 },
    ],
  },
];

const fillerGoals: Record<string, G[]> = {
  "Occupational Therapy": [
    {
      title: "Dress independently",
      description: "Dress upper body independently with adapted clothing.",
      category: "Self-care",
      type: "Ordinal",
      direction: "Increase",
      baseline: "Verbal prompting",
      target: "Independent",
      current: "Supervision",
      unit: "",
    },
  ],
  "Speech Pathology": [
    {
      title: "Use 3-word phrases",
      description: "Use three-word phrases to request at home.",
      category: "Communication",
      type: "Frequency",
      direction: "Increase",
      baseline: "2",
      target: "10",
      current: "6",
      unit: "times/week",
      points: ["4", "6"],
    },
  ],
  Physiotherapy: [
    {
      title: "Sit-to-stand repetitions",
      description: "Complete sit-to-stand without hands.",
      category: "Mobility",
      type: "Numeric",
      direction: "Increase",
      baseline: "5",
      target: "12",
      current: "9",
      unit: "reps",
      points: ["7", "9"],
    },
  ],
  Psychology: [
    {
      title: "Use a coping plan",
      description: "Use the agreed coping plan in stressful situations.",
      category: "Behavioural health",
      type: "Observation",
      direction: "Descriptive",
      baseline: "Not yet developed",
      target: "Used weekly",
      current: "Developing",
      unit: "",
    },
  ],
  "Exercise Physiology": [
    {
      title: "Walk 30 minutes",
      description: "Walk continuously for 30 minutes at moderate intensity.",
      category: "Exercise",
      type: "Time",
      direction: "Increase",
      baseline: "10",
      target: "30",
      current: "18",
      unit: "min",
      points: ["14", "18"],
    },
  ],
  Nursing: [
    {
      title: "Wound healing review",
      description: "Wound reviewed weekly; size documented with the same method.",
      category: "Wound/skin",
      type: "Numeric",
      direction: "Decrease",
      baseline: "32",
      target: "10",
      current: "24",
      unit: "mm",
      points: ["28", "24"],
    },
  ],
};

export async function ensurePlanSeed() {
  const db = await collections();
  const flags = db.db.collection<{ _id: string; at: Date }>("settings");
  if (await flags.findOne({ _id: "m13Seed" })) return;
  const col = db.db.collection<PlanExtDoc>("planExt");
  const rand = rng(1313);
  const pick = <T>(l: readonly T[]) => l[Math.floor(rand() * l.length)] as T;
  const day = 86_400_000;
  const clients = await db.clients
    .find({ "needs.therapistId": { $ne: null }, discharged: { $in: [null] } })
    .toArray();
  const therapists = await db.therapists.find({}, { projection: { name: 1 } }).toArray();
  const tName = (id: ObjectId | null) =>
    therapists.find((t) => id && t._id.equals(id))?.name ?? "Treating clinician";
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const make = async (
    c: ClientDoc,
    need: ClientDoc["needs"][number],
    spec: Case,
    version = 1,
    supersedes: ObjectId | null = null,
  ) => {
    const now = Date.now();
    const created = new Date(now - (version === 1 && spec.versions ? 70 : 35) * day);
    const by = tName(need.therapistId);
    const goals = spec.goals.map((g) => {
      const id = randomUUID();
      const history = (g.points ?? []).slice(0, -1).map((v, i) => ({
        value: v,
        note: "Session observation",
        at: new Date(created.getTime() + (7 + i * 7) * day),
        byName: by,
        visitId: null,
      }));
      return {
        doc: {
          id,
          description: g.description,
          domain: g.category,
          measure: g.instrument ?? `${g.type}${g.unit ? ` (${g.unit})` : ""}`,
          baseline: g.baseline,
          target: g.target,
          current: g.current,
          status: (g.state === "Achieved"
            ? "Achieved"
            : "Active") as PlanDoc["goals"][number]["status"],
          rationale: "",
          history,
        },
        g,
      };
    });
    const signed = ["Active", "Under Review", "Paused", "Completed", "Superseded"].includes(
      spec.state,
    );
    const p: PlanDoc = {
      _id: new ObjectId(),
      clientId: c._id,
      needId: need.id,
      therapistId: need.therapistId ?? new ObjectId(),
      therapistName: by,
      support: need.support,
      status:
        spec.state === "Active"
          ? "Active"
          : spec.state === "Under Review" || spec.state === "Paused"
            ? "Under Review"
            : spec.state === "Completed"
              ? "Completed"
              : spec.state === "Discontinued" || spec.state === "Superseded"
                ? "Discontinued"
                : "Draft",
      version,
      indication: `Assessment findings support ${need.support.toLowerCase()} to address the participant's stated priorities. Reported and observed findings are distinguished in the source assessment.`,
      goals: goals.map((x) => x.doc),
      interventions: spec.interventions.map((i) => i.name).join("; "),
      precautions: c.precautions ?? "",
      frequency: need.frequency ?? "Weekly",
      duration: "8–12 weeks",
      reviewDate: iso(
        new Date(
          now + (spec.state === "Active" && rand() < 0.2 ? -3 : 14 + Math.floor(rand() * 30)) * day,
        ),
      ),
      approved: signed ? { byName: by, at: new Date(created.getTime() + 3 * day) } : null,
      reviews: [],
      progressSummary: null,
      createdAt: created,
      updatedAt: new Date(now - Math.floor(rand() * 4) * day),
    };
    await db.plans.insertOne(p);
    const e = blankPlanExt(p, await nextPlanRef(), spec.state);
    e.scenario = spec.code;
    e.planType = version > 1 ? "Revised" : "Initial";
    e.priorities = "Participant priorities recorded in their own words.";
    e.setting =
      need.location === "Telehealth"
        ? "Telehealth"
        : need.location === "School"
          ? "School"
          : "Home";
    e.startDate = iso(new Date(created.getTime() + 3 * day));
    e.informed = spec.declined ? "Declined" : spec.state === "Draft" ? "Pending" : "Agreed";
    e.informedNotes = spec.declined
      ? "Discussed the proposed plan with Matilda; she prefers to continue with family support only. Assessment-only closure agreed."
      : "Plan discussed and agreed with the participant.";
    e.riskAcknowledged = true;
    const a = await db.assessments.findOne({
      clientId: c._id,
      needId: need.id,
      status: { $in: ["Signed", "Amended"] },
    });
    e.sources = a ? [a._id] : [];
    e.noAssessmentReason = a
      ? ""
      : "Assessment completed before this system; findings summarised in the rationale.";
    for (const { doc, g } of goals) {
      e.goals[doc.id] = {
        title: g.title,
        ownership: pick(["Participant", "Shared decision"] as const),
        priority: pick(["High", "Medium"] as const),
        horizon: "Medium-term",
        horizonReason: "",
        type: g.type,
        direction: g.direction,
        unit: g.unit,
        instrument: g.instrument ?? "",
        context: "Home, usual equipment",
        reviewFrequency: "Every 4 sessions",
        targetDate: iso(new Date(now + 60 * day)),
        state:
          g.state ??
          (spec.state === "Draft" || spec.state === "Pending Review"
            ? "Not Started"
            : spec.state === "Completed"
              ? "Achieved"
              : "In Progress"),
        holdReason: "",
        barriers:
          rand() < 0.3
            ? [{ type: "Attendance", note: "Two sessions cancelled due to illness." }]
            : [],
        closure: null,
        achievedBy: g.state === "Achieved" ? by : null,
        interpretation: "",
        points: (g.points ?? []).slice(-1).map((v) => ({
          value: v,
          date: new Date(now - 5 * day),
          source: "Direct observation",
          context: "Same method as baseline",
          by,
        })),
        baselineAlternative: "",
      };
    }
    e.interventions = spec.interventions.map((i): InterventionDto => ({
      id: randomUUID(),
      name: i.name,
      goalIds: goals.map((x) => x.doc.id),
      rationale: "Linked to the goals it serves.",
      mode: i.mode,
      sessionsPerWeek: i.perWeek,
      minutes: i.minutes,
      weeks: i.weeks,
      dosage: {
        sets: i.sets ?? "",
        reps: i.reps ?? "",
        distance: "",
        time: "",
        resistance: "",
        assistance: "",
        prompts: "",
      },
      home: i.home
        ? {
            activity: i.name,
            instructions: i.home,
            frequency: `${i.perWeek} times a week`,
            equipment: "",
            carer: "",
          }
        : null,
      precautions: c.precautions ?? "",
      stopCriteria: "Stop if pain or distress increases; tell the clinician.",
      status: spec.state === "Active" ? "Active" : "Planned",
    }));
    if (spec.shareWith)
      e.sharing = {
        shared: true,
        recipients: [
          ...spec.shareWith,
          ...(c.contacts ?? [])
            .filter((x) => x.state === "Verified" && x.role === "Parent")
            .map((x) => `${x.name} (${x.role})`),
        ],
        goalIds: goals.map((x) => x.doc.id),
        by,
        at: new Date(created.getTime() + 4 * day),
        acknowledged: new Date(created.getTime() + 5 * day),
      };
    e.supersedes = supersedes;
    e.timeline = [
      { at: created, by, action: "Plan created (Draft)", reason: "" },
      ...(signed
        ? [
            {
              at: new Date(created.getTime() + 3 * day),
              by,
              action: `Signed and activated (version ${version})`,
              reason: "",
            },
          ]
        : []),
      ...(spec.declined
        ? [
            {
              at: new Date(created.getTime() + 2 * day),
              by,
              action: "Participant declined the proposed plan; closed without treatment",
              reason: e.informedNotes,
            },
          ]
        : []),
    ];
    await col.insertOne(e);
    return p;
  };

  for (const spec of cases) {
    const c = clients.find((x) => x.name === spec.participant);
    const need = c?.needs.find(
      (n) => n.therapistId && (!spec.discipline || n.discipline === spec.discipline),
    );
    if (!c || !need) continue;
    if (await db.plans.findOne({ clientId: c._id, needId: need.id })) continue;
    if (spec.versions) {
      // Case G: version 1 signed, then superseded by a revised version 2 after reassessment.
      const v1 = await make(c, need, { ...spec, state: "Superseded" }, 1);
      await make(c, need, spec, 2, v1._id);
    } else {
      await make(c, need, spec);
    }
  }
  for (const c of clients) {
    for (const n of c.needs.filter((x) => x.therapistId && x.status === "assigned")) {
      if (rand() < 0.25) continue;
      if (await db.plans.findOne({ clientId: c._id, needId: n.id })) continue;
      const goals = fillerGoals[n.discipline] ?? fillerGoals["Occupational Therapy"] ?? [];
      await make(c, n, {
        code: "sample",
        participant: c.name,
        state: pick([
          "Active",
          "Active",
          "Active",
          "Draft",
          "Under Review",
          "Paused",
          "Completed",
        ] as const),
        goals,
        interventions: [
          {
            name: `${n.support} sessions`,
            mode: n.location === "Telehealth" ? "Telehealth" : "In person",
            perWeek: 1,
            minutes: 45,
            weeks: 10,
          },
        ],
      });
    }
  }
  await flags.updateOne({ _id: "m13Seed" }, { $set: { at: new Date() } }, { upsert: true });
}
