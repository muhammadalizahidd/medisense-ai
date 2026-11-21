import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import type { Discipline } from "@/lib/live/catalogue";
import { restrictedDisciplines } from "@/lib/live/records";
import { addDays, atBrisbane, brisbaneDay } from "@/lib/live/time";
import { collections } from "./db";
import { nextMrn } from "./mrn";
import { blankRecord, type ClinicalRecordDoc } from "./records";
import type { ClientDoc, ConsentDoc, ContactDoc, UserDoc } from "./models";

/**
 * Section 15's four participants, plus a clinical record for every assigned participant so the
 * record screens read like a working caseload. Created once; every record is tagged
 * `scenario: "m11"` or `"m11-sample"`.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4_294_967_296;
  };
}

const consent = (
  key: ConsentDoc["key"],
  state: ConsentDoc["state"],
  who: string,
  by: string,
  note = "",
  scope: string[] = [],
): ConsentDoc => {
  const at = new Date(Date.now() - 20 * 86_400_000);
  return {
    key,
    state,
    version: "1",
    respondent: who,
    recordedBy: by,
    at,
    scope,
    note,
    history: [{ state, respondent: who, recordedBy: by, at, note }],
  };
};

const contact = (c: Partial<ContactDoc> & Pick<ContactDoc, "name" | "role">): ContactDoc =>
  ({
    id: randomUUID(),
    organisation: "",
    relationship: "",
    phone: "0400 555 210",
    email: `${c.name.toLowerCase().replace(/\W+/g, ".")}@example.test`,
    responsibilities: [],
    primaryFor: [],
    authorityType: "None",
    authorityScope: [],
    authorityExpires: "",
    restrictions: "",
    contactAllowed: true,
    state: "Verified",
    verifiedBy: "Jo Marsh",
    verifiedAt: new Date(Date.now() - 25 * 86_400_000),
    ...c,
  }) as ContactDoc;

type Scenario = {
  first: string;
  last: string;
  dob: string;
  suburb: string;
  episodes: { support: string; discipline: Discipline; therapist: string; location: string }[];
  contacts: ContactDoc[];
  consents: (who: string, by: string) => ConsentDoc[];
  precautions: string | null;
  telehealth?: boolean;
};

const scenarios: Scenario[] = [
  {
    first: "Mia",
    last: "Tan",
    dob: "2018-03-14",
    suburb: "Kedron",
    episodes: [
      {
        support: "Speech/Language Assessment",
        discipline: "Speech Pathology",
        therapist: "Marcus Bell",
        location: "School",
      },
    ],
    contacts: [
      contact({
        name: "Lily Tan",
        role: "Parent",
        relationship: "Mother",
        authorityType: "Parent/Guardian",
        authorityScope: ["Sign", "Schedule", "Approved reports"],
      }),
      contact({
        name: "Ms Rachel Ong",
        role: "School Contact",
        relationship: "Classroom teacher",
        organisation: "Kedron State School",
        authorityType: "Consent-Based Delegate",
        authorityScope: ["Schedule"],
      }),
    ],
    consents: (who, by) => [
      consent("general-care", "Given", who, by),
      consent(
        "share-coordinator",
        "Given",
        who,
        by,
        "Teacher may receive school strategies only.",
        ["Approved reports"],
      ),
      consent("photos", "Given", who, by, "Classroom work samples only; no faces."),
    ],
    precautions: null,
  },
  {
    first: "Alex",
    last: "Chen",
    dob: "1996-09-02",
    suburb: "Indooroopilly",
    episodes: [
      {
        support: "Occupational Therapy",
        discipline: "Occupational Therapy",
        therapist: "Sarah Thompson",
        location: "Home",
      },
      {
        support: "Psychological Therapy",
        discipline: "Psychology",
        therapist: "Nadia Hassan",
        location: "Telehealth",
      },
    ],
    contacts: [
      contact({
        name: "Grace Liu-Chen",
        role: "Support Coordinator",
        relationship: "Support coordinator",
        organisation: "Westside Coordination",
        authorityType: "Consent-Based Delegate",
        authorityScope: ["Schedule", "Approved reports"],
      }),
    ],
    consents: (who, by) => [
      consent("general-care", "Given", who, by),
      consent(
        "share-coordinator",
        "Given",
        who,
        by,
        "Care summary only; psychology notes excluded.",
        ["Approved reports"],
      ),
      consent("telehealth", "Given", who, by),
      consent("ai-scribe", "Refused", who, by, "Prefers no AI drafting for psychology sessions."),
    ],
    precautions: null,
  },
  {
    first: "Priya",
    last: "Shah",
    dob: "1979-12-21",
    suburb: "Carindale",
    episodes: [
      {
        support: "Physiotherapy",
        discipline: "Physiotherapy",
        therapist: "Olivia Reyes",
        location: "Telehealth",
      },
    ],
    contacts: [],
    consents: (who, by) => [
      consent("general-care", "Given", who, by),
      consent("telehealth", "Given", who, by),
      consent(
        "recording",
        "Refused",
        who,
        by,
        "Does not want sessions recorded; consult goes ahead without recording.",
      ),
      consent("ai-scribe", "Not asked", who, by),
    ],
    precautions: null,
    telehealth: true,
  },
];

const pools: Record<
  string,
  { presenting: string; functional: string; entries: string[]; conditions: string[] }
> = {
  "Occupational Therapy": {
    presenting:
      "Difficulty with morning routines and fatigue after showering; family reports two near-falls in the bathroom over the last month.",
    functional:
      "Independent with eating; needs supervision to shower; uses a shower chair borrowed from a neighbour. Walks short distances indoors without an aid.",
    entries: [
      "Observed transfer on and off the shower chair; needed verbal prompts for foot placement. Grab rail position discussed with the family.",
      "Discussed energy conservation; agreed to trial sitting for grooming tasks this week.",
      "Home access checked: two steps at the front entry without a rail. Photos taken with consent for the home modification report.",
    ],
    conditions: ["Multiple sclerosis (reported)", "Chronic fatigue"],
  },
  "Speech Pathology": {
    presenting:
      "Teacher reports reduced intelligibility in class; parent reports frustration when not understood by peers.",
    functional:
      "Uses short sentences at home; strong receptive language reported by parent. Not yet assessed formally.",
    entries: [
      "Classroom observation: participated in group reading; peers asked for repetition on three occasions.",
      "Teacher report: Mia avoids answering questions aloud during whole-class time. Recorded as teacher-reported, not clinician-observed.",
      "Parent phone contact: confirmed preferred appointment times and consent for school visits.",
    ],
    conditions: ["Speech sound disorder (reported)"],
  },
  Psychology: {
    presenting:
      "Anxiety affecting study and sleep; referrer requests structured psychological therapy.",
    functional: "Attending university part-time; sleep onset delayed most nights.",
    entries: [
      "Session focused on psychoeducation and a shared formulation. Safety screen completed; no current concerns raised.",
      "Reviewed sleep diary; agreed to a consistent wind-down routine.",
    ],
    conditions: ["Generalised anxiety (reported)"],
  },
  Physiotherapy: {
    presenting:
      "Lower back pain after a lifting injury; wants to return to walking 30 minutes a day.",
    functional: "Walks 10 minutes before pain limits; independent with personal care.",
    entries: [
      "Telehealth review: completed home exercise programme check by video. No recording, as agreed.",
      "Pain 4/10 at rest, 6/10 after walking; progressed the walking plan to 12 minutes.",
    ],
    conditions: ["Non-specific low back pain"],
  },
  default: {
    presenting: "Referral requests support to maintain independence at home.",
    functional: "Independent with most daily tasks; some assistance with community access.",
    entries: [
      "Initial contact: confirmed goals and preferred visit times.",
      "Reviewed progress against goals; plan continues unchanged.",
    ],
    conditions: ["Condition as reported on referral"],
  },
};

export async function ensureRecordScenarios() {
  const db = await collections();
  const flags = db.db.collection<{ _id: string; at: Date }>("settings");
  if (await flags.findOne({ _id: "m11Scenarios" })) {
    if (!(await flags.findOne({ _id: "m11Volume" }))) {
      await seedVolume();
      await seedRecords();
      await flags.updateOne({ _id: "m11Volume" }, { $set: { at: new Date() } }, { upsert: true });
    }
    return;
  }
  const jo = await db.users.findOne({ email: "jo.marsh@medisense.test" });
  const therapists = await db.therapists.find({ active: { $ne: false } }).toArray();
  if (!jo || !therapists.length) return;
  const today = brisbaneDay(new Date());

  for (const s of scenarios) {
    const name = `${s.first} ${s.last}`;
    if (await db.clients.findOne({ name })) continue;
    const clientId = new ObjectId();
    const userId = new ObjectId();
    const now = new Date();
    const email = `${s.first}.${s.last}.m11@example.test`.toLowerCase();
    const needs = s.episodes.map((e) => {
      const t =
        therapists.find((x) => x.name === e.therapist) ??
        therapists.find((x) => x.discipline === e.discipline);
      return {
        id: randomUUID(),
        support: e.support as ClientDoc["needs"][number]["support"],
        discipline: e.discipline,
        frequency: "Fortnightly" as ClientDoc["needs"][number]["frequency"],
        location: e.location as ClientDoc["needs"][number]["location"],
        status: "assigned" as const,
        therapistId: t?._id ?? null,
        referralId: null,
      };
    });
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
    await db.clients.insertOne({
      _id: clientId,
      mrn: await nextMrn(db.db, now),
      name,
      dateOfBirth: s.dob,
      email,
      phone: "0400 555 110",
      suburb: s.suburb,
      region:
        therapists.find((t) => t._id.equals(needs[0]?.therapistId ?? new ObjectId()))?.region ??
        "Brisbane North",
      funding: "NDIS",
      needs,
      notes: "",
      contacts: s.contacts,
      consents: s.consents(name, jo.name),
      precautions: s.precautions,
      emergencyContact: { name: "Family contact", relationship: "Family", phone: "0400 555 199" },
      fundingDetails: {
        payer: "Plan manager",
        payerEmail: "invoices@example.test",
        ndisNumber: "430880000",
        planEndDate: "2027-06-30",
        planType: "Plan Managed",
      },
      discharged: null,
      userId,
      createdBy: jo._id,
      createdAt: new Date(now.getTime() - 40 * 86_400_000),
    } as ClientDoc);
    for (const [i, n] of needs.entries()) {
      if (!n.therapistId) continue;
      const apptId = new ObjectId();
      const start = atBrisbane(addDays(today, 2 + i * 2), 10 * 60 + i * 90);
      await db.appointments.insertOne({
        _id: apptId,
        therapistId: n.therapistId,
        clientId,
        discipline: n.discipline,
        start,
        end: new Date(start.getTime() + 60 * 60_000),
        status: "booked",
        holdsSlot: true,
        seriesId: null,
        replaces: null,
        cancellation: null,
        note: null,
        invoiceId: null,
        needId: n.id,
        modality: n.location === "Telehealth" ? "Telehealth" : "In person",
        confirmedByPatient: now,
        ref: `APT-${String(1050 + scenarios.indexOf(s) * 2 + i)}`,
        site: null,
        purpose: null,
        createdAt: now,
      });
      await db.assignments.insertOne({
        _id: new ObjectId(),
        clientId,
        needId: n.id,
        therapistId: n.therapistId,
        discipline: n.discipline,
        status: "accepted",
        appointmentId: apptId,
        declineReason: null,
        createdBy: jo._id,
        createdAt: now,
        respondedAt: now,
      });
    }
  }
  await seedVolume();
  await seedRecords();
  await flags.updateOne({ _id: "m11Scenarios" }, { $set: { at: new Date() } }, { upsert: true });
  await flags.updateOne({ _id: "m11Volume" }, { $set: { at: new Date() } }, { upsert: true });
}

const firstNames = [
  "Harper",
  "Lachlan",
  "Isabella",
  "Mason",
  "Charlotte",
  "Oscar",
  "Matilda",
  "Archer",
  "Evie",
  "Hudson",
  "Willow",
  "Lincoln",
  "Sienna",
  "Xavier",
  "Ivy",
  "Beau",
  "Aria",
  "Jasper",
  "Elsie",
  "Darcy",
  "Frankie",
  "Remy",
  "Pippa",
  "Kai",
];
const lastNames = [
  "Nguyen",
  "O'Brien",
  "Kowalski",
  "Fernando",
  "MacLeod",
  "Papadopoulos",
  "Singh",
  "Brennan",
  "Okoye",
  "Lindqvist",
  "Moretti",
  "Harlow",
  "Tanaka",
  "Dubois",
  "Murray",
  "Petrov",
  "Ashworth",
  "Castillo",
  "Fitzroy",
  "Huang",
  "Delaney",
  "Sorensen",
  "Whitmore",
  "Abara",
];
const suburbs = [
  "Aspley",
  "Chermside",
  "Nundah",
  "Stafford",
  "Kedron",
  "Carindale",
  "Mansfield",
  "Holland Park",
  "Toowong",
  "Ashgrove",
  "Wavell Heights",
  "Sunnybank",
];
const volumePlan: { discipline: Discipline; support: string; count: number; location: string }[] = [
  {
    discipline: "Occupational Therapy",
    support: "Occupational Therapy",
    count: 7,
    location: "Home",
  },
  { discipline: "Speech Pathology", support: "Speech Therapy", count: 4, location: "School" },
  { discipline: "Physiotherapy", support: "Physiotherapy", count: 4, location: "Home" },
  { discipline: "Psychology", support: "Psychological Therapy", count: 3, location: "Telehealth" },
  {
    discipline: "Exercise Physiology",
    support: "Exercise Physiology",
    count: 3,
    location: "Community",
  },
  { discipline: "Nursing", support: "Nursing", count: 3, location: "Home" },
];

/** A working caseload: two dozen sample participants spread across clinicians. */
async function seedVolume() {
  const db = await collections();
  const jo = await db.users.findOne({ email: "jo.marsh@medisense.test" });
  const therapists = await db.therapists.find({ active: { $ne: false } }).toArray();
  if (!jo) return;
  const rand = rng(4242);
  let i = 0;
  for (const p of volumePlan) {
    const pool = therapists.filter((t) => t.discipline === p.discipline);
    if (!pool.length) continue;
    for (let k = 0; k < p.count; k += 1, i += 1) {
      // The first OTs go to Sarah Thompson so the demo clinician has a full caseload.
      const t =
        p.discipline === "Occupational Therapy" && k < 5
          ? (pool.find((x) => x.name === "Sarah Thompson") ?? pool[0]!)
          : pool[k % pool.length]!;
      const name = `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`;
      if (await db.clients.findOne({ name })) continue;
      const clientId = new ObjectId();
      const needId = randomUUID();
      const now = new Date();
      const created = new Date(now.getTime() - (20 + Math.floor(rand() * 60)) * 86_400_000);
      const year =
        p.discipline === "Speech Pathology"
          ? 2014 + Math.floor(rand() * 6)
          : 1950 + Math.floor(rand() * 50);
      const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".")}.m11@example.test`;
      // Upsert, so a rerun after an interrupted seed reuses the sign-in it already made.
      const user = await db.users.findOneAndUpdate(
        { email },
        {
          $setOnInsert: {
            _id: new ObjectId(),
            email,
            name,
            role: "client",
            passwordHash: null,
            invite: null,
            therapistId: null,
            createdAt: created,
          },
          $set: { clientId },
        },
        { upsert: true, returnDocument: "after" },
      );
      const userId = user?._id ?? new ObjectId();
      await db.clients.insertOne({
        _id: clientId,
        mrn: await nextMrn(db.db, now),
        name,
        dateOfBirth: `${year}-0${1 + Math.floor(rand() * 9)}-1${Math.floor(rand() * 9)}`,
        email,
        phone: `0400 55${String(i).padStart(2, "0")} ${100 + i}`,
        suburb: suburbs[i % suburbs.length]!,
        region: t.region,
        funding: rand() < 0.75 ? "NDIS" : "Aged Care",
        needs: [
          {
            id: needId,
            support: p.support as ClientDoc["needs"][number]["support"],
            discipline: p.discipline,
            frequency: "Weekly" as ClientDoc["needs"][number]["frequency"],
            location: p.location as ClientDoc["needs"][number]["location"],
            status: "assigned",
            therapistId: t._id,
            referralId: null,
          },
        ],
        notes: "",
        contacts:
          p.discipline === "Speech Pathology"
            ? [
                contact({
                  name: `${lastNames[(i + 3) % lastNames.length]} family`,
                  role: "Parent",
                  relationship: "Parent",
                  authorityType: "Parent/Guardian",
                  authorityScope: ["Sign", "Schedule", "Approved reports"],
                }),
              ]
            : [],
        consents: [
          consent("general-care", "Given", name, jo.name),
          consent("share-coordinator", rand() < 0.6 ? "Given" : "Not asked", name, jo.name),
          consent("telehealth", p.location === "Telehealth" ? "Given" : "Not asked", name, jo.name),
          consent("recording", rand() < 0.3 ? "Refused" : "Not asked", name, jo.name),
        ],
        precautions:
          rand() < 0.15 ? "Dog on the property: ask for it to be secured before entering." : null,
        emergencyContact: { name: "Family contact", relationship: "Family", phone: "0400 555 199" },
        fundingDetails: {
          payer: "Plan manager",
          payerEmail: "invoices@example.test",
          ndisNumber: `43077${String(1000 + i)}`,
          planEndDate: "2027-03-31",
          planType: "Plan Managed",
        },
        discharged: null,
        userId,
        createdBy: jo._id,
        createdAt: created,
      } as ClientDoc);
      const start = atBrisbane(addDays(brisbaneDay(now), 1 + (i % 9)), 8 * 60 + (i % 8) * 60);
      const apptId = new ObjectId();
      await db.appointments.insertOne({
        _id: apptId,
        therapistId: t._id,
        clientId,
        discipline: p.discipline,
        start,
        end: new Date(start.getTime() + 60 * 60_000),
        status: "booked",
        holdsSlot: true,
        seriesId: null,
        replaces: null,
        cancellation: null,
        note: null,
        invoiceId: null,
        needId,
        modality: p.location === "Telehealth" ? "Telehealth" : "In person",
        confirmedByPatient: rand() < 0.6 ? now : null,
        ref: `APT-${String(1100 + i)}`,
        site: null,
        purpose: null,
        createdAt: now,
      });
      await db.assignments.insertOne({
        _id: new ObjectId(),
        clientId,
        needId,
        therapistId: t._id,
        discipline: p.discipline,
        status: "accepted",
        appointmentId: apptId,
        declineReason: null,
        createdBy: jo._id,
        createdAt: created,
        respondedAt: created,
      });
    }
  }
}

/** A clinical record for every participant with an assigned clinician. */
async function seedRecords() {
  const db = await collections();
  const col = db.db.collection<ClinicalRecordDoc>("clinicalRecords");
  const clients = await db.clients.find({ "needs.therapistId": { $ne: null } }).toArray();
  const users = await db.users.find({ role: "therapist" }).toArray();
  const userOf = (tid: ObjectId | null) =>
    users.find((u) => tid && u.therapistId?.equals(tid)) ?? null;
  const rand = rng(1111);
  const pick = <T>(l: readonly T[]) => l[Math.floor(rand() * l.length)] as T;
  for (const c of clients) {
    if (await col.findOne({ _id: c._id }, { projection: { _id: 1 } })) continue;
    const rec = blankRecord(c._id, "Sample history");
    const lead = c.needs.find((n) => n.therapistId) ?? c.needs[0];
    if (!lead) continue;
    const pool = pools[lead.discipline] ?? pools.default!;
    const author: UserDoc | null = userOf(lead.therapistId);
    const by = author?.name ?? "Treating clinician";
    const days = (n: number) => new Date(Date.now() - n * 86_400_000);
    const special = ["Jordan Mills", "Mia Tan", "Alex Chen", "Priya Shah"].includes(c.name);
    rec.scenario = special ? "m11" : "m11-sample";
    const partial = c.name === "Jordan Mills" || rand() < 0.3;
    rec.history = {
      presenting: {
        state: "Recorded",
        text: pool.presenting,
        source: "Referral",
        by,
        at: days(18),
      },
      functional: partial
        ? { state: "Not reported", text: "", source: "", by: null, at: null }
        : {
            state: "Recorded",
            text: pool.functional,
            source: "Treating clinician",
            by,
            at: days(12),
          },
      surgical: (() => {
        const st = pick(["Unknown", "Not reported", "Recorded"] as const);
        return {
          state: st,
          text:
            st === "Recorded"
              ? pick([
                  "Appendicectomy in childhood, as reported.",
                  "Knee arthroscopy 2019; no complications reported.",
                  "Hospital admission for pneumonia, 2021.",
                ])
              : "",
          source: "Participant",
          by,
          at: days(15),
        };
      })(),
      social: {
        state: "Recorded",
        text: pick([
          "Lives with parents and a younger sibling.",
          "Lives alone in a ground-floor unit; daughter visits daily.",
          "Lives with partner; works part-time from home.",
        ]),
        source: "Participant",
        by,
        at: days(15),
      },
      communication:
        c.name === "Mia Tan"
          ? {
              state: "Recorded",
              text: "English at home; no interpreter needed. Uses gestures when not understood.",
              source: "Guardian",
              by,
              at: days(14),
            }
          : partial
            ? { state: "Unknown", text: "", source: "Participant", by, at: days(14) }
            : {
                state: "Recorded",
                text: "English; no interpreter needed.",
                source: "Participant",
                by,
                at: days(14),
              },
      supports: {
        state: "Recorded",
        text: pick([
          "Support worker 6 hours a week.",
          "No current supports.",
          "Weekly cleaning service; family transport.",
        ]),
        source: "Referral",
        by,
        at: days(18),
      },
      developmental:
        c.dateOfBirth && c.dateOfBirth > "2012-01-01"
          ? {
              state: "Recorded",
              text: "Walked at 14 months; first words at 18 months per parent report.",
              source: "Guardian",
              by,
              at: days(14),
            }
          : { state: "Not applicable", text: "", source: "Treating clinician", by, at: days(14) },
    };
    if (!partial)
      rec.historyReview = { by, at: days(10), sources: ["Referral", "Participant interview"] };
    rec.conditions = pool.conditions.map((label, i) => ({
      id: randomUUID(),
      label,
      status:
        i === 0
          ? partial
            ? "Reported by referral"
            : "Confirmed by clinician"
          : "Under investigation",
      source: i === 0 ? "Referral" : "Treating clinician",
      onset: pick(["2019", "2021", "Childhood", "Unknown"]),
      evidence: i === 0 ? "Referral letter" : "Clinical observation",
      by,
      at: days(16),
    })) as ClinicalRecordDoc["conditions"];
    if (rand() < 0.45) {
      rec.medications = [
        {
          id: randomUUID(),
          name: pick(["Baclofen", "Paracetamol", "Sertraline", "Melatonin"]),
          strength: pick(["10 mg", "500 mg", "50 mg", "2 mg"]),
          route: "Oral",
          frequency: pick(["Twice daily", "As needed", "Nightly"]),
          indication: "As reported",
          status: "Current",
          verification: pick([
            "Unverified",
            "Patient reported",
            "External document reviewed",
          ] as const),
          source: "Participant",
          reviewedAt: days(9),
          by,
        },
      ];
    }
    const allergy =
      c.name === "Priya Shah"
        ? "Specific"
        : pick(["Unknown", "No known allergies reported", "Not assessed", "Specific"] as const);
    if (allergy === "Specific") {
      rec.allergies = [
        {
          id: randomUUID(),
          substance: pick(["Penicillin", "Latex", "Elastoplast adhesive"]),
          reaction: pick(["Rash", "Skin irritation", "Hives"]),
          severity: "Moderate",
          source: "Participant",
          confirmed: false,
          by,
          at: days(17),
        },
      ];
      rec.allergyState = "Specific allergies recorded";
    } else rec.allergyState = allergy;
    rec.allergyStateSource = { source: "Participant", by, at: days(17) };
    if (c.name === "Jordan Mills" || rand() < 0.35) {
      rec.risks = [
        {
          id: randomUUID(),
          types:
            c.name === "Jordan Mills"
              ? ["Falls", "Environmental"]
              : [pick(["Falls", "Manual handling", "Environmental", "Swallowing"] as const)],
          origin: "Referral disclosed",
          severity:
            c.name === "Jordan Mills" ? "Moderate" : pick(["Low", "Moderate", "High"] as const),
          description:
            c.name === "Jordan Mills"
              ? "Two near-falls in the bathroom reported by family; front steps without a rail."
              : "Reported on referral; confirmed at first visit.",
          mitigation:
            "Second person present for bathroom assessment; check the front steps before entering.",
          escalation: "Notify the Clinical Lead if a fall occurs during a visit.",
          review: pick(["Reviewed", "Pending"] as const),
          reviewDue: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
          reviewer: null,
          reviewNote: "",
          sharing: "Operational safety summary",
          by,
          at: days(11),
        },
      ];
    }
    for (const n of c.needs.filter((x) => x.therapistId)) {
      const p = pools[n.discipline] ?? pools.default!;
      const au = userOf(n.therapistId);
      if (!au) continue;
      p.entries.forEach((text, i) => {
        const created = days(14 - i * 4);
        rec.entries.push({
          id: randomUUID(),
          type:
            i === 1 && n.discipline === "Speech Pathology"
              ? "School liaison"
              : i === 0
                ? "Clinical observation"
                : pick(["Clinical observation", "Phone contact", "Case conference"] as const),
          episodeId: n.id,
          discipline: n.discipline,
          title: text.split(/[.:]/)[0]?.slice(0, 70) ?? "Entry",
          text,
          informant: text.startsWith("Teacher report") ? "Teacher report" : "Clinician observation",
          status: "Signed",
          restricted: restrictedDisciplines.includes(n.discipline),
          missing: [],
          author: au.name,
          authorId: au._id,
          createdAt: created,
          updatedAt: created,
          signedAt: new Date(created.getTime() + 3_600_000),
          addenda:
            i === 0 && rand() < 0.4
              ? [
                  {
                    text: "Correction: the grab rail is on the left wall, not the right.",
                    reason: "Location recorded incorrectly",
                    by: au.name,
                    at: new Date(created.getTime() + 86_400_000),
                  },
                ]
              : [],
          voided: null,
          offline: false,
        });
      });
      if (c.name === "Jordan Mills" || rand() < 0.3) {
        rec.entries.push({
          id: randomUUID(),
          type: "Clinical observation",
          episodeId: n.id,
          discipline: n.discipline,
          title: "Home visit: assessment incomplete",
          text: "Bathroom and kitchen observed. Bedroom and front access not yet assessed; participant fatigued.",
          informant: "Clinician observation",
          status: "Draft",
          restricted: restrictedDisciplines.includes(n.discipline),
          missing: ["Bedroom transfers", "Front access measurements"],
          author: au.name,
          authorId: au._id,
          createdAt: days(1),
          updatedAt: days(1),
          signedAt: null,
          addenda: [],
          voided: null,
          offline: c.name === "Jordan Mills",
        });
      }
    }
    rec.accessLog = [
      {
        at: days(10),
        by,
        userId: author?._id ?? new ObjectId(),
        role: "Treating clinician",
        action: "History reviewed",
        purpose: "Treating care",
      },
    ];
    rec.updated = { by, at: days(1) };
    await col.insertOne(rec).catch(() => undefined);
  }
}
