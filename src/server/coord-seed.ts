import "server-only";
import { ObjectId } from "mongodb";
import type { Category, Status } from "@/lib/live/coord";
import { restrictedDisciplines } from "@/lib/live/records";
import { blankFields, nextTaskRef, taskCol, type CareTaskDoc } from "./coord";
import { collections } from "./db";

/*
 * Module 17 sample care-coordination work: the specification's ten scenarios on our own
 * participants, AI suggestions waiting for a decision, and everyday tasks for every therapist.
 * Created once (settings flag "m17Seed"). All content is fictional.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4_294_967_296;
  };
}

const DAY = 86_400_000;

let inFlight: Promise<void> | null = null;

/** Parallel first requests share one seeding run instead of racing on the same ids. */
export function ensureCoordSeed() {
  inFlight ??= seedOnce().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function seedOnce() {
  const db = await collections();
  const flags = db.db.collection<{ _id: string; at: Date }>("settings");
  if (await flags.findOne({ _id: "m17Seed" })) return;
  const col = await taskCol();
  const rand = rng(1717);
  const pick = <T>(l: readonly T[]) => l[Math.floor(rand() * l.length)] as T;
  const now = Date.now();
  const users = await db.users
    .find(
      { role: { $in: ["therapist", "admin"] } },
      { projection: { name: 1, therapistId: 1, role: 1 } },
    )
    .toArray();
  const userOfTherapist = (tid: ObjectId | null | undefined) =>
    users.find((u) => tid && u.therapistId?.equals(tid));
  const byName = (name: string) => users.find((u) => u.name === name);
  const clients = await db.clients.find({ "needs.therapistId": { $ne: null } }).toArray();
  const docs: CareTaskDoc[] = [];

  const make = async (o: {
    title: string;
    category: Category;
    participant?: string;
    discipline?: string;
    assignee?: string;
    status: Status;
    priority?: string;
    dueIn?: number | null;
    source?: string;
    visibility?: string;
    instructions: string;
    checklist?: string[];
    fields?: Partial<CareTaskDoc["fields"]>;
    outcome?: string;
    suggestion?: CareTaskDoc["suggestion"];
    creator?: string;
    collaborators?: string[];
    sync?: CareTaskDoc["sync"];
    conflict?: CareTaskDoc["conflict"];
    waitReason?: string;
    history?: string[];
    sourceLink?: CareTaskDoc["sourceLink"];
  }) => {
    const c = o.participant ? clients.find((x) => x.name === o.participant) : undefined;
    const need = c?.needs.find(
      (n) => (o.discipline ? n.discipline === o.discipline : true) && n.therapistId,
    );
    const assignee = o.assignee ? byName(o.assignee) : userOfTherapist(need?.therapistId);
    if (!assignee || (o.participant && !c)) return;
    const discipline = need?.discipline ?? "";
    const created = new Date(now - (3 + Math.floor(rand() * 10)) * DAY);
    docs.push({
      _id: new ObjectId(),
      ref: await nextTaskRef(),
      title: o.title,
      category: o.category,
      source: o.source ?? "Manual",
      sourceLink: o.sourceLink ?? null,
      clientId: c?._id ?? null,
      needId: need?.id ?? null,
      discipline,
      assigneeId: assignee._id,
      assigneeName: assignee.name,
      creatorId: (o.creator ? byName(o.creator) : assignee)?._id ?? null,
      collaborators: (o.collaborators ?? [])
        .map((n) => byName(n))
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .map((x) => ({ id: x._id, name: x.name })),
      priority: o.priority ?? "Normal",
      status: o.status,
      dueAt: o.dueIn === null ? null : new Date(now + (o.dueIn ?? 2) * DAY),
      reminder: o.dueIn === null ? "None" : "24h Before",
      visibility:
        o.visibility ??
        (restrictedDisciplines.includes(discipline) ? "Clinical Restricted" : "Care Team"),
      instructions: o.instructions,
      checklist: (o.checklist ?? []).map((label, i) => ({
        label,
        state: o.status === "Completed" || i === 0 ? "Done" : "Not done",
      })),
      fields: { ...blankFields(), ...o.fields },
      outcome: o.outcome ?? "",
      escalation: null,
      cancelReason: o.status === "Cancelled" ? "Not required" : "",
      waitReason: o.waitReason ?? "",
      completed: o.status === "Completed" ? { by: assignee.name, at: new Date(now - DAY) } : null,
      comments: [],
      history: [
        {
          at: created,
          by: o.source && o.source !== "Manual" ? "Automation" : assignee.name,
          action: `Created from ${(o.source ?? "Manual").toLowerCase()}`,
          reason: "",
        },
        ...(o.history ?? []).map((h, i) => ({
          at: new Date(created.getTime() + (i + 1) * 3_600_000),
          by: assignee.name,
          action: h,
          reason: "",
        })),
      ],
      suggestion: o.suggestion ?? null,
      aiDraft: null,
      sync: o.sync ?? "Synced",
      conflict: o.conflict ?? null,
      opsTaskId: null,
      createdAt: created,
      seeded: true,
    });
  };

  /* The ten scenarios (section 13), on our participants. */
  await make({
    title: "Follow up home observations for the FCA",
    category: "Clinical Follow-up",
    participant: "Isabella Kowalski",
    status: "Open",
    priority: "High",
    dueIn: 1,
    source: "Assessment",
    instructions:
      "Observe community access and transfers at the next home visit; FCA sections are partly complete.",
    checklist: [
      "Confirm visit time",
      "Bring transfer board",
      "Record observations in the assessment",
    ],
    sourceLink: { label: "FCA assessment", href: "/therapist/assessments" },
  });
  await make({
    title: "Mobility goal review: repeat the six-minute walk",
    category: "Assessment",
    participant: "Priya Shah",
    status: "In Progress",
    dueIn: 3,
    source: "Treatment Plan",
    instructions:
      "Goal review due. Repeat the walk with the same protocol (four-wheeled walker, flat path).",
    checklist: ["Same protocol confirmed", "Record result", "Update goal progress"],
  });
  await make({
    title: "Confirm school permission and guardian contact",
    category: "Care Coordination",
    participant: "Mia Tan",
    status: "Waiting on Patient",
    dueIn: 2,
    waitReason: "Waiting for the guardian to return the school permission form",
    instructions:
      "Coordinate with the guardian and school contact before the next classroom session.",
    fields: {
      purpose: "School access for classroom sessions",
      recipient: "Guardian",
      consentOk: true,
    },
  });
  await make({
    title: "Session follow-up (restricted)",
    category: "Clinical Follow-up",
    participant: "Alex Chen",
    discipline: "Psychology",
    status: "Open",
    dueIn: 2,
    visibility: "Clinical Restricted",
    instructions:
      "Follow up after the telehealth session as agreed. Content stays in the protected record.",
    fields: { contactMode: "Telehealth" },
  });
  await make({
    title: "Clinician review of wound progress",
    category: "Clinical Follow-up",
    participant: "Remy Sorensen",
    status: "Pending Review",
    dueIn: 1,
    priority: "High",
    instructions:
      "Wound measurements recorded at the last two visits; clinician review requested. No treatment decision is automated.",
    outcome: "",
    fields: { supervisor: "Helen Brooks" },
  });
  await make({
    title: "Request continued assessment visits",
    category: "Appointment Request",
    participant: "Harper Nguyen",
    status: "Waiting on Admin",
    dueIn: 2,
    waitReason: "With Scheduling",
    instructions: "Two more home visits to finish the assessment, weekly, mornings preferred.",
    fields: {
      location: "Home",
      window: "Weekday mornings, next 2 weeks",
      frequency: "Weekly",
      schedulerResponse: "Query: Thursday 9 am or Friday 10 am?",
    },
  });
  await make({
    title: "Handover: OT goals for the psychology course of care",
    category: "Care Coordination",
    participant: "Alex Chen",
    discipline: "Occupational Therapy",
    assignee: "Sarah Thompson",
    creator: "Sarah Thompson",
    collaborators: ["Nadia Hassan"],
    status: "In Progress",
    dueIn: 2,
    visibility: "Care Team",
    waitReason: "",
    instructions:
      "Share the OT goal summary for the shared care goal. Psychology notes are not part of the handover.",
    fields: {
      purpose: "Shared care goal",
      shareAuthority: true,
      documents: [
        { label: "OT goal summary", shareable: true },
        { label: "Signed OT session note", shareable: true },
        { label: "Psychology progress note", shareable: false },
      ],
    },
  });
  await make({
    title: "Supervisor review: NDIS progress report",
    category: "Supervision",
    participant: "Matilda Singh",
    status: "Pending Review",
    dueIn: 1,
    instructions: "Report sent for review; returned once for revisions and resubmitted.",
    fields: {
      supervisor: "Helen Brooks",
      reviewFeedback: "Add the measured walk distance and its date.",
    },
    history: [
      "Sent for review",
      "Returned for changes: add the measured walk distance",
      "Resubmitted after revision",
    ],
  });
  await make({
    title: "Follow-up call after missed session",
    category: "Clinical Follow-up",
    participant: "Noah Bennett",
    status: "Completed",
    dueIn: -2,
    instructions: "Contact after the missed session and agree next steps.",
    outcome:
      "Participant declined further visits this month; agreed information sent; service outcome to review at the plan review.",
    fields: {
      attempts: [
        {
          at: new Date(now - 4 * DAY),
          mode: "Phone",
          outcome: "No answer, voicemail left",
          next: "Tomorrow",
          by: "Sarah Thompson",
        },
        {
          at: new Date(now - 3 * DAY),
          mode: "Phone",
          outcome: "Spoke with participant: declined visits this month",
          next: "",
          by: "Sarah Thompson",
        },
      ],
    },
  });
  await make({
    title: "Update home program after visit",
    category: "Patient Communication",
    participant: "Lachlan O'Brien",
    status: "In Progress",
    dueIn: 1,
    sync: "Conflict",
    conflict: {
      field: "Instructions",
      mobile: "Send the car-transfer home program with photos (edited offline on the phone).",
      web: "Send the car-transfer home program.",
    },
    instructions: "Send the car-transfer home program.",
    fields: { recipient: "Participant", channel: "Secure Message", consentOk: true },
  });

  /* AI suggestions waiting for a decision, including a duplicate (AT-34). */
  await make({
    title: "Send the meal-preparation home program",
    category: "Patient Communication",
    participant: "Harper Nguyen",
    status: "Draft",
    dueIn: 2,
    source: "AI Suggestion",
    suggestion: "pending",
    instructions:
      "Suggested after the signed session note: share the picture recipe routine. Nothing is sent until you approve.",
    fields: { recipient: "Participant", channel: "Secure Message", consentOk: true },
  });
  await make({
    title: "Plan the reassessment before the review date",
    category: "Assessment",
    participant: "Charlotte MacLeod",
    status: "Draft",
    dueIn: 5,
    source: "AI Suggestion",
    suggestion: "pending",
    instructions: "Plan review is due in two weeks. You decide the method and timing.",
  });
  await make({
    title: "Plan the reassessment before the review date",
    category: "Assessment",
    participant: "Charlotte MacLeod",
    status: "Draft",
    dueIn: 5,
    source: "AI Suggestion",
    suggestion: "pending",
    instructions: "Possible duplicate: same source, action and recipient as another suggestion.",
  });
  await make({
    title: "Request consent before messaging the family",
    category: "Patient Communication",
    participant: "Mason Fernando",
    status: "Open",
    dueIn: 1,
    instructions:
      "Contact consent isn't on record; patient messaging is disabled until it's reviewed.",
    fields: { recipient: "Parent", channel: "Secure Message", consentOk: false },
  });
  await make({
    title: "Funding query: extra assessment hours",
    category: "Administrative Handoff",
    participant: "Isabella Kowalski",
    assignee: "Jo Marsh",
    creator: "Sarah Thompson",
    collaborators: ["Sarah Thompson"],
    status: "Open",
    dueIn: 3,
    visibility: "Admin Operational Only",
    instructions:
      "Confirm whether the plan budget covers two more assessment visits. Operational summary only.",
    fields: { handoffType: "Funding Query" },
  });

  /* Everyday work for every therapist so each list is full. */
  const cats: Category[] = [
    "Clinical Follow-up",
    "Documentation",
    "Assessment",
    "Care Coordination",
    "Referral",
    "Appointment Request",
    "Patient Communication",
    "Safety Review",
  ];
  const titles: Record<string, string[]> = {
    "Clinical Follow-up": [
      "Check in after equipment trial",
      "Review home exercise adherence",
      "Follow up carer question",
    ],
    Documentation: [
      "Sign the session note",
      "Complete the report section",
      "Add missing units to measures",
    ],
    Assessment: [
      "Book assessment continuation",
      "Complete the remaining domains",
      "Score the outcome measure",
    ],
    "Care Coordination": [
      "Coordinate with the treating team",
      "Share goal summary with speech",
      "Confirm support worker availability",
    ],
    Referral: ["Refer to dietetics", "External referral to the GP", "Refer for an AT assessment"],
    "Appointment Request": [
      "Request the next visit",
      "Change visit to telehealth",
      "Request a joint visit",
    ],
    "Patient Communication": [
      "Send visit instructions",
      "Request updated documents",
      "Confirm home program",
    ],
    "Safety Review": ["Review a home hazard", "Review a fall reported by carer"],
  };
  const guidance: Record<string, string> = {
    "Clinical Follow-up":
      "Contact the participant or carer, record each attempt and agree the next step.",
    Documentation: "Finish the linked note or report; the task closes when it is signed.",
    Assessment:
      "Complete the outstanding assessment step and record what remains for the next visit.",
    "Care Coordination":
      "Coordinate with the other clinician; share only what is authorised and get an acknowledgement.",
    Referral: "Prepare the referral with the approved summary and confirm consent before sending.",
    "Appointment Request":
      "Send the request to Scheduling with the location, window and frequency.",
    "Patient Communication":
      "Send approved instructions through the participant's preferred channel.",
    "Safety Review":
      "Review the reported concern with the Clinical Lead; follow the incident process if needed.",
  };
  for (const c of clients) {
    for (const n of c.needs.filter((x) => x.therapistId)) {
      const count = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i++) {
        const category = pick(cats);
        const status: Status = pick([
          "Open",
          "Open",
          "In Progress",
          "In Progress",
          "Waiting on Patient",
          "Waiting on Admin",
          "Completed",
          "Completed",
          "Completed",
          "Cancelled",
        ]);
        await make({
          title: `${pick(titles[category] ?? ["Follow up"])}`,
          category,
          participant: c.name,
          discipline: n.discipline,
          status,
          priority: pick(["Low", "Normal", "Normal", "Normal", "High"]),
          dueIn: rand() < 0.18 ? -1 - Math.floor(rand() * 3) : Math.floor(rand() * 12),
          source: pick([
            "Manual",
            "Manual",
            "Appointment",
            "Clinical Note",
            "Treatment Plan",
            "Automation",
          ]),
          instructions: guidance[category] ?? "Follow the linked record and record the outcome.",
          checklist: rand() < 0.4 ? ["First step", "Second step"] : [],
          outcome: status === "Completed" ? "Completed as planned." : "",
          waitReason: status.startsWith("Waiting") ? "Waiting for a reply" : "",
        });
      }
    }
  }
  if (docs.length) await col.insertMany(docs, { ordered: false });
  await flags.updateOne({ _id: "m17Seed" }, { $set: { at: new Date() } }, { upsert: true });
}
