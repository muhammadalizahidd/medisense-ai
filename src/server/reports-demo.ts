import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import {
  supportInfo,
  type Discipline,
  type FundingStream,
  type Region,
  type ServiceLocation,
  type Support,
} from "@/lib/live/catalogue";
import type { FundingPath } from "@/lib/live/finance";
import type { ReferralInput, ReferralStatus } from "@/lib/live/referral";
import { blankFilters, dayKey, presetRange } from "@/lib/live/reports";
import { collections } from "./db";
import { captureVisit, nextRef } from "./finance";
import type {
  AppointmentDoc,
  AssessmentDoc,
  ClientDoc,
  InvoiceDoc,
  InvoiceLine,
  OpsTaskDoc,
  PaymentDoc,
  PlanDoc,
  ReferralDoc,
  ReportExportDoc,
  ReportScheduleDoc,
  ReportViewDoc,
  TelehealthDoc,
  TherapistDoc,
  UserDoc,
} from "./models";
import { nextMrn } from "./mrn";
import { serverLog } from "./log";

/**
 * Shared history (Module 09, section 13): Jul–Nov records across referrals, participants,
 * visits, assessments, plans, telehealth, invoices, payments and tasks, so every module and
 * every report reads the same facts. Runs once. Every record carries demo: true.
 */
const SEEDED = "reports-history-seeded";
const BY = "Shared history";

let seq = 7;
const rand = () => {
  seq = (seq * 48271) % 2147483647;
  return seq / 2147483647;
};
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)] as T;
const DAY = 86_400_000;
const at = (key: string, hour: number, min = 0) =>
  new Date(`${key}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00+10:00`);
const addDays = (key: string, d: number) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10);
const weekday = (key: string) => {
  const wd = new Date(`${key}T00:00:00Z`).getUTCDay();
  return wd === 6 ? addDays(key, 2) : wd === 0 ? addDays(key, 1) : key;
};

type Person = {
  first: string;
  last: string;
  dob: string;
  funding: FundingStream;
  plan: "" | "Plan Managed" | "Agency Managed" | "Self-Managed";
  region: Region;
  suburb: string;
  supports: {
    support: Support;
    location: ServiceLocation;
    frequency: "Weekly" | "Fortnightly" | "Assessment" | "Monthly";
    nursingType?: string;
  }[];
  submitted: string;
  submitter: "Participant" | "Parent or guardian" | "Support coordinator" | "Other referrer";
};

const people: Person[] = [
  {
    first: "Noah",
    last: "Bennett",
    dob: "2017-03-14",
    funding: "NDIS",
    plan: "Plan Managed",
    region: "Brisbane North",
    suburb: "Chermside",
    supports: [
      { support: "Occupational Therapy", location: "Home", frequency: "Weekly" },
      { support: "Functional Capacity Assessment", location: "Home", frequency: "Assessment" },
    ],
    submitted: "2026-07-21",
    submitter: "Parent or guardian",
  },
  {
    first: "Grace",
    last: "Whitfield",
    dob: "1979-09-02",
    funding: "NDIS",
    plan: "Agency Managed",
    region: "Brisbane South",
    suburb: "Sunnybank",
    supports: [{ support: "Physiotherapy", location: "Home", frequency: "Weekly" }],
    submitted: "2026-07-24",
    submitter: "Support coordinator",
  },
  {
    first: "Harold",
    last: "Pike",
    dob: "1941-05-30",
    funding: "Aged Care",
    plan: "",
    region: "Brisbane North",
    suburb: "Aspley",
    supports: [
      { support: "Physiotherapy", location: "Home", frequency: "Fortnightly" },
      { support: "Podiatry", location: "Home", frequency: "Monthly" },
    ],
    submitted: "2026-07-29",
    submitter: "Other referrer",
  },
  {
    first: "Leila",
    last: "Haddad",
    dob: "2019-11-08",
    funding: "NDIS",
    plan: "Self-Managed",
    region: "Brisbane South",
    suburb: "Holland Park",
    supports: [
      { support: "Speech Therapy", location: "Daycare", frequency: "Weekly" },
      { support: "Speech/Language Assessment", location: "Daycare", frequency: "Assessment" },
    ],
    submitted: "2026-08-04",
    submitter: "Parent or guardian",
  },
  {
    first: "Marcus",
    last: "Doyle",
    dob: "1986-01-19",
    funding: "Workers Compensation",
    plan: "",
    region: "Brisbane North",
    suburb: "Nundah",
    supports: [
      { support: "Exercise Physiology", location: "Other community location", frequency: "Weekly" },
    ],
    submitted: "2026-08-07",
    submitter: "Other referrer",
  },
  {
    first: "Priya",
    last: "Raman",
    dob: "1993-06-25",
    funding: "NDIS",
    plan: "Plan Managed",
    region: "Brisbane South",
    suburb: "Coorparoo",
    supports: [
      { support: "Psychological Therapy", location: "Telehealth", frequency: "Fortnightly" },
    ],
    submitted: "2026-08-12",
    submitter: "Participant",
  },
  {
    first: "Tom",
    last: "Archer",
    dob: "2015-02-11",
    funding: "NDIS",
    plan: "Plan Managed",
    region: "Brisbane North",
    suburb: "Kedron",
    supports: [
      { support: "Occupational Therapy", location: "School", frequency: "Weekly" },
      { support: "Assistive Technology Assessment", location: "School", frequency: "Assessment" },
    ],
    submitted: "2026-08-18",
    submitter: "Parent or guardian",
  },
  {
    first: "Edith",
    last: "Collins",
    dob: "1938-12-03",
    funding: "Aged Care",
    plan: "",
    region: "Brisbane South",
    suburb: "Carina",
    supports: [
      {
        support: "Nursing",
        location: "Home",
        frequency: "Weekly",
        nursingType: "Wound/Catheter Supports",
      },
      { support: "Other", location: "Home", frequency: "Monthly" },
    ],
    submitted: "2026-08-25",
    submitter: "Other referrer",
  },
  {
    first: "Sienna",
    last: "Brooks",
    dob: "2020-04-17",
    funding: "NDIS",
    plan: "Agency Managed",
    region: "Brisbane North",
    suburb: "Stafford",
    supports: [{ support: "Speech Therapy", location: "Home", frequency: "Weekly" }],
    submitted: "2026-09-01",
    submitter: "Parent or guardian",
  },
  {
    first: "Kai",
    last: "Thompson",
    dob: "2001-10-29",
    funding: "NDIS",
    plan: "Plan Managed",
    region: "Brisbane South",
    suburb: "Greenslopes",
    supports: [
      { support: "Occupational Therapy", location: "Home", frequency: "Fortnightly" },
      { support: "Psychological Assessment", location: "Telehealth", frequency: "Assessment" },
    ],
    submitted: "2026-09-08",
    submitter: "Support coordinator",
  },
  {
    first: "Ruby",
    last: "Nguyen",
    dob: "1997-07-07",
    funding: "Private",
    plan: "",
    region: "Brisbane South",
    suburb: "Woolloongabba",
    supports: [{ support: "Physiotherapy", location: "Home", frequency: "Weekly" }],
    submitted: "2026-09-14",
    submitter: "Participant",
  },
  {
    first: "Walter",
    last: "Reid",
    dob: "1945-08-21",
    funding: "Aged Care",
    plan: "",
    region: "Brisbane North",
    suburb: "Wavell Heights",
    supports: [
      { support: "Occupational Therapy", location: "Home", frequency: "Fortnightly" },
      { support: "Home Mod Assessment", location: "Home", frequency: "Assessment" },
    ],
    submitted: "2026-09-22",
    submitter: "Other referrer",
  },
  {
    first: "Amelia",
    last: "Hart",
    dob: "2016-01-05",
    funding: "NDIS",
    plan: "Plan Managed",
    region: "Brisbane South",
    suburb: "Mount Gravatt",
    supports: [
      { support: "Functional Capacity Assessment", location: "Home", frequency: "Assessment" },
    ],
    submitted: "2026-10-06",
    submitter: "Parent or guardian",
  },
  {
    first: "Daniel",
    last: "Kovac",
    dob: "1990-03-12",
    funding: "Workers Compensation",
    plan: "",
    region: "Brisbane South",
    suburb: "Annerley",
    supports: [{ support: "Trauma Therapy", location: "Telehealth", frequency: "Weekly" }],
    submitted: "2026-10-13",
    submitter: "Other referrer",
  },
  {
    first: "Olivia",
    last: "Grant",
    dob: "2012-09-15",
    funding: "NDIS",
    plan: "Self-Managed",
    region: "Brisbane North",
    suburb: "Everton Park",
    supports: [
      { support: "Exercise Physiology", location: "Other community location", frequency: "Weekly" },
    ],
    submitted: "2026-10-20",
    submitter: "Parent or guardian",
  },
  {
    first: "Lucas",
    last: "Ferreira",
    dob: "1984-11-30",
    funding: "NDIS",
    plan: "",
    region: "Brisbane North",
    suburb: "Zillmere",
    supports: [{ support: "Physiotherapy", location: "Home", frequency: "Weekly" }],
    submitted: "2026-10-27",
    submitter: "Support coordinator",
  },
];

type Open = {
  first: string;
  last: string;
  dob: string;
  funding: FundingStream;
  plan: Person["plan"];
  status: ReferralStatus;
  supports: Support[];
  submitted: string;
  region: Region | null;
  note: string;
};
const openReferrals: Open[] = [
  {
    first: "Mason",
    last: "Kerr",
    dob: "2014-05-22",
    funding: "NDIS",
    plan: "Plan Managed",
    status: "Needs Information",
    supports: ["Occupational Therapy", "Functional Capacity Assessment"],
    submitted: "2026-11-03",
    region: "Brisbane North",
    note: "NDIS plan not attached",
  },
  {
    first: "Hazel",
    last: "Morgan",
    dob: "1950-02-14",
    funding: "Aged Care",
    plan: "",
    status: "Needs Information",
    supports: ["Physiotherapy"],
    submitted: "2026-11-09",
    region: "Brisbane South",
    note: "Home access details missing",
  },
  {
    first: "Jayden",
    last: "Cole",
    dob: "2018-08-30",
    funding: "NDIS",
    plan: "Agency Managed",
    status: "Needs Information",
    supports: ["Speech Therapy", "Swallowing Assessment"],
    submitted: "2026-11-12",
    region: null,
    note: "Booking contact not given",
  },
  {
    first: "Frank",
    last: "Dunn",
    dob: "1939-04-11",
    funding: "Private",
    plan: "",
    status: "Declined",
    supports: ["Psychological Therapy"],
    submitted: "2026-08-28",
    region: "Brisbane South",
    note: "Outside Medisense service area",
  },
  {
    first: "Zara",
    last: "Patel",
    dob: "1999-12-01",
    funding: "NDIS",
    plan: "Self-Managed",
    status: "Declined",
    supports: ["SDA Housing Assessment"],
    submitted: "2026-10-01",
    region: "Brisbane North",
    note: "Duplicate of an active referral with another provider",
  },
  {
    first: "Ethan",
    last: "Ward",
    dob: "2011-07-19",
    funding: "NDIS",
    plan: "Plan Managed",
    status: "Waitlisted",
    supports: ["Psychological Assessment"],
    submitted: "2026-10-15",
    region: "Brisbane North",
    note: "Waiting for a psychologist with paediatric scope",
  },
  {
    first: "Chloe",
    last: "Simmons",
    dob: "1988-03-03",
    funding: "Workers Compensation",
    plan: "",
    status: "Waitlisted",
    supports: ["Exercise Physiology", "Physiotherapy"],
    submitted: "2026-10-22",
    region: "Brisbane South",
    note: "Insurer approval pending",
  },
  {
    first: "Owen",
    last: "Blake",
    dob: "1972-10-10",
    funding: "NDIS",
    plan: "Plan Managed",
    status: "Withdrawn",
    supports: ["Occupational Therapy"],
    submitted: "2026-09-17",
    region: "Brisbane North",
    note: "Family chose another provider",
  },
  {
    first: "Ivy",
    last: "Chen",
    dob: "2016-06-06",
    funding: "NDIS",
    plan: "Plan Managed",
    status: "Under Admin Review",
    supports: ["Speech Therapy"],
    submitted: "2026-11-11",
    region: "Brisbane South",
    note: "",
  },
  {
    first: "Max",
    last: "Howard",
    dob: "1957-01-27",
    funding: "Aged Care",
    plan: "",
    status: "Under Admin Review",
    supports: ["Podiatry", "Other"],
    submitted: "2026-11-13",
    region: "Brisbane North",
    note: "",
  },
  {
    first: "Nina",
    last: "Lowe",
    dob: "1995-09-09",
    funding: "NDIS",
    plan: "Self-Managed",
    status: "Clinical Triage",
    supports: ["Trauma Therapy"],
    submitted: "2026-11-10",
    region: "Brisbane South",
    note: "",
  },
  {
    first: "Ben",
    last: "Ortiz",
    dob: "2009-02-02",
    funding: "NDIS",
    plan: "Plan Managed",
    status: "Funding Review",
    supports: ["Occupational Therapy", "Assistive Technology Assessment"],
    submitted: "2026-11-05",
    region: "Brisbane North",
    note: "Plan end date on referral doesn't match the plan",
  },
];

const rateFor = (d: string) =>
  d === "Psychology" || d === "Trauma Therapy"
    ? 232.99
    : d === "Exercise Physiology"
      ? 166.99
      : d === "Nursing"
        ? 145.0
        : 193.99;
const pathFor = (p: Pick<Person, "funding" | "plan">): FundingPath =>
  p.funding === "NDIS"
    ? p.plan || "Plan Managed"
    : p.funding === "Workers Compensation"
      ? "Insurer"
      : p.funding === "Aged Care"
        ? "Aged Care"
        : "Private";
const payerFor = (p: Person) =>
  p.funding === "NDIS"
    ? p.plan === "Agency Managed"
      ? "NDIA (agency managed)"
      : p.plan === "Self-Managed"
        ? `${p.first} ${p.last} (self-managed)`
        : "Example Plan Partners"
    : p.funding === "Workers Compensation"
      ? "Example Workers Insurance"
      : p.funding === "Aged Care"
        ? "Aged care package provider"
        : `${p.first} ${p.last}`;

function referralData(
  p: {
    first: string;
    last: string;
    dob: string;
    funding: FundingStream;
    plan: Person["plan"];
    suburb?: string;
    submitter?: Person["submitter"];
  },
  supports: { support: Support; frequency: string; nursingType?: string }[],
  location: ServiceLocation,
): ReferralInput {
  const guardian = Number(p.dob.slice(0, 4)) > 2008;
  const email = `${p.first}.${p.last}`.toLowerCase() + "@example.test";
  return {
    submitter: {
      role: p.submitter ?? (guardian ? "Parent or guardian" : "Participant"),
      name: guardian ? `Alex ${p.last}` : `${p.first} ${p.last}`,
      organisation: "",
      email,
      phone: "0400 000 000",
      authorityConfirmed: true,
    },
    participant: {
      firstName: p.first,
      lastName: p.last,
      dateOfBirth: p.dob,
      email: guardian ? "" : email,
      phone: "0400 000 000",
      address: {
        street: "1 Example Street",
        suburb: p.suburb ?? "Brisbane",
        state: "QLD",
        postcode: "4000",
      },
    },
    funding: {
      source: p.funding,
      ndisNumber:
        p.funding === "NDIS" ? `43${String(Math.floor(rand() * 1e7)).padStart(7, "0")}` : "",
      planEndDate: p.funding === "NDIS" ? "2027-06-30" : "",
      planType: p.plan,
      fundingPeriods: p.funding === "NDIS" ? "No" : "",
      periods: [],
      planManagerCompany: p.plan === "Plan Managed" ? "Example Plan Partners" : "",
      planManagerEmail: p.plan === "Plan Managed" ? "invoices@example.test" : "",
      otherDetails: "",
    },
    supportCoordinator: { name: "", email: "", phone: "" },
    signatory: {
      role: guardian ? "Parent or guardian" : "Participant",
      name: guardian ? `Alex ${p.last}` : `${p.first} ${p.last}`,
      email,
      phone: "0400 000 000",
    },
    booking: {
      role: guardian ? "Parent or guardian" : "Participant",
      name: guardian ? `Alex ${p.last}` : `${p.first} ${p.last}`,
      email,
      phone: "0400 000 000",
      method: "Phone",
      preferredTime: "Weekday mornings",
    },
    location: {
      type: location,
      sameAsHome: true,
      address: { street: "", suburb: "", state: "QLD", postcode: "" },
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      contactNotes: "",
    },
    clinical: {
      diagnosis: "Reported by referrer",
      behaviours: "No",
      behavioursDetails: "",
      knownRisk: "No",
      riskDetails: "",
      personPresent: guardian,
      personPresentDetails: guardian ? "Parent or guardian" : "",
    },
    supports: supports.map((s) => ({
      support: s.support,
      frequency: s.frequency as "Weekly",
      frequencyOther: "",
      nursingType: (s.nursingType ?? "") as "",
      details: s.support === "Other" ? "Dietetics review for nutrition" : "",
    })),
    goals: "Build independence at home and in the community.",
    comments: "",
    consent: { privacy: true, shareWithClinicians: true },
  } as ReferralInput;
}

export async function seedSharedHistory() {
  const db = await collections();
  const flags = db.db.collection<{ _id: string; at: Date }>("settings");
  if (await flags.findOne({ _id: SEEDED })) return;
  await flags.insertOne({ _id: SEEDED, at: new Date() });
  try {
    await seed();
  } catch (error) {
    serverLog(`reports history seed failed: ${error instanceof Error ? error.message : "unknown"}`);
  }
}

async function seed() {
  const db = await collections();
  const today = dayKey(new Date());
  const therapists = (await db.therapists
    .find({ active: { $ne: false } })
    .toArray()) as TherapistDoc[];
  const admins = await db.users.find({ role: "admin" }).toArray();
  const admin = (name: string) => admins.find((a) => a.name === name) ?? admins[0];
  const jo = admin("Jo Marsh");
  const neil = admin("Neil Hensley");
  if (!jo || !neil || !therapists.length) return;
  const therapistFor = (d: string, region: Region) =>
    pick(
      therapists.filter((t) => t.discipline === d && t.region === region).length
        ? therapists.filter((t) => t.discipline === d && t.region === region)
        : therapists.filter((t) => t.discipline === d).length
          ? therapists.filter((t) => t.discipline === d)
          : therapists,
    );

  const appts: AppointmentDoc[] = [];
  const invoices: InvoiceDoc[] = [];
  let apptN = 0;

  for (const [pi, p] of people.entries()) {
    const submittedAt = at(p.submitted, 9 + (pi % 6), 15);
    const acceptedDay = weekday(addDays(p.submitted, 1 + (pi % 5)));
    const acceptedAt = at(acceptedDay, 14, 30);
    const clientId = new ObjectId();
    const userId = new ObjectId();
    const referralId = new ObjectId();
    const mrn = await nextMrn(db.db, submittedAt);
    const needs = p.supports.map((s) => {
      const info = supportInfo(s.support);
      const discipline = (info.discipline ?? "Dietetics") as Discipline;
      const t = therapistFor(discipline, p.region);
      const waiting = pi === 15 || (pi === 11 && s.support === "Home Mod Assessment");
      return {
        id: randomUUID(),
        support: s.support,
        discipline,
        frequency: s.frequency,
        details: s.support === "Other" ? "Dietetics review for nutrition" : "",
        location: s.location,
        status: (waiting
          ? "needs-therapist"
          : info.kind === "assessment" && pi < 9
            ? "completed"
            : "assigned") as ClientDoc["needs"][number]["status"],
        therapistId: waiting ? null : t._id,
        referralId,
      };
    });
    const user: UserDoc = {
      _id: userId,
      demo: true,
      email: `${p.first}.${p.last}.${pi}`.toLowerCase() + "@example.test",
      name: `${p.first} ${p.last}`,
      role: "client",
      passwordHash: null,
      invite: null,
      therapistId: null,
      clientId,
      createdAt: acceptedAt,
    };
    const client: ClientDoc = {
      _id: clientId,
      demo: true,
      mrn,
      name: `${p.first} ${p.last}`,
      dateOfBirth: p.dob,
      email: user.email,
      phone: "0400 000 000",
      suburb: p.suburb,
      region: p.region,
      funding: p.funding,
      needs,
      notes: "",
      fundingDetails:
        p.funding === "NDIS"
          ? {
              payer: payerFor(p),
              payerEmail: "invoices@example.test",
              ndisNumber: "430000000",
              planEndDate: "2027-06-30",
              planType: p.plan,
            }
          : null,
      discharged: null,
      userId,
      createdBy: jo._id,
      createdAt: acceptedAt,
    };
    const services = p.supports.map((s, index) => ({
      index,
      support: s.support,
      decision: "Accepted" as const,
      reason: "",
      needId: needs[index]?.id ?? null,
      byName: jo.name,
      at: acceptedAt,
    }));
    const referral: ReferralDoc = {
      _id: referralId,
      demo: true,
      reference: `REF-${mrn}`,
      trackingHash: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      mrn,
      status: "Accepted",
      data: referralData(p, p.supports, p.supports[0]?.location ?? "Home"),
      services,
      region: p.region,
      gaps: [],
      infoRequests:
        pi % 4 === 1
          ? [
              {
                id: randomUUID(),
                items: [{ field: "funding.plan", label: "NDIS plan document" }],
                message: "Please send the current NDIS plan.",
                requestedBy: jo.name,
                at: new Date(submittedAt.getTime() + 3 * 3_600_000),
                answer: "Plan attached",
                answeredAt: new Date(submittedAt.getTime() + 20 * 3_600_000),
              },
            ]
          : [],
      duplicates: [],
      duplicateDecision: null,
      owner: { id: jo._id, name: jo.name },
      triage: {
        decision: "Accepted",
        notes: "Suitable for community-based services.",
        riskAction: "",
        precaution: "",
        byName: neil.name,
        at: new Date(acceptedAt.getTime() - 4 * 3_600_000),
      },
      fundingReview: {
        verification: pi === 15 ? "Exception" : "Verified",
        exceptionReason: pi === 15 ? "Plan type not confirmed with the participant" : "",
        agreement: "Signed",
        consentRecorded: true,
        notes: "",
        byName: jo.name,
        at: new Date(acceptedAt.getTime() - 3_600_000),
      },
      outcome: { reason: "Ready for booking", byName: jo.name, at: acceptedAt },
      clientId,
      submittedBy: "public",
      createdBy: null,
      history: [
        { status: "Submitted", byName: "Referral form", note: "", at: submittedAt },
        ...(pi % 4 === 1
          ? [
              {
                status: "Needs Information" as const,
                byName: jo.name,
                note: "NDIS plan document",
                at: new Date(submittedAt.getTime() + 3 * 3_600_000),
              },
            ]
          : []),
        {
          status: "Under Admin Review",
          byName: "Completeness check",
          note: "",
          at: new Date(submittedAt.getTime() + 21 * 3_600_000),
        },
        {
          status: "Clinical Triage",
          byName: jo.name,
          note: "",
          at: new Date(acceptedAt.getTime() - 6 * 3_600_000),
        },
        {
          status: "Funding Review",
          byName: neil.name,
          note: "Clinical decision: Accepted",
          at: new Date(acceptedAt.getTime() - 4 * 3_600_000),
        },
        {
          status: "Accepted",
          byName: jo.name,
          note: `${needs.length} service request${needs.length > 1 ? "s" : ""} created`,
          at: acceptedAt,
        },
      ],
      createdAt: submittedAt,
      updatedAt: acceptedAt,
    };
    await db.users.insertOne(user);
    await db.clients.insertOne(client);
    await db.referrals.insertOne(referral);

    for (const need of needs) {
      if (!need.therapistId) continue;
      const t = therapists.find((x) => x._id.equals(need.therapistId as ObjectId)) as TherapistDoc;
      const kind = supportInfo(need.support).kind;
      const telehealth = need.location === "Telehealth";
      const step = need.frequency === "Fortnightly" ? 14 : need.frequency === "Monthly" ? 28 : 7;
      const count = kind === "assessment" ? (pi === 12 ? 2 : 1 + (pi % 2)) : 30;
      let day = weekday(addDays(acceptedDay, 5 + (pi % 4)));
      const hour = 9 + ((pi * 2 + needs.indexOf(need)) % 7);
      for (let i = 0; i < count; i++) {
        const future = day > today;
        if (future && day > addDays(today, 21)) break;
        apptN += 1;
        const r = rand();
        const len = kind === "assessment" ? 90 : t.sessionMinutes || 60;
        const start = at(day, hour);
        const end = new Date(start.getTime() + len * 60_000);
        let status: AppointmentDoc["status"] = future
          ? "booked"
          : r < 0.07
            ? "cancelled"
            : r < 0.1
              ? "late-cancelled"
              : r < 0.15
                ? "no-show"
                : r < 0.165
                  ? "aborted"
                  : "completed";
        if (pi === 12 && !future) status = "completed";
        const done = status === "completed";
        const recent = Date.parse(`${today}T00:00:00Z`) - start.getTime() < 6 * DAY;
        const noteStatus = !done
          ? null
          : recent && r > 0.6
            ? "Draft"
            : recent && r > 0.45
              ? "Pending Signature"
              : apptN % 23 === 0
                ? "Pending Signature"
                : "Final";
        const minutesKnown = !(apptN % 29 === 0);
        const a: AppointmentDoc = {
          _id: new ObjectId(),
          demo: true,
          therapistId: t._id,
          clientId,
          discipline: need.discipline,
          start,
          end,
          status,
          holdsSlot: future,
          seriesId: null,
          replaces: null,
          cancellation:
            status === "cancelled" || status === "late-cancelled"
              ? {
                  by: r < 0.035 ? "medisense" : "client",
                  reason:
                    r < 0.035
                      ? pick(["Clinician unwell", "Clinician rostering change"])
                      : pick([
                          "Participant unwell",
                          "Family emergency",
                          "Transport not available",
                          "School event",
                          "Forgot the visit",
                        ]),
                  noticeHours: status === "late-cancelled" ? 6 : 48,
                  chargeable: status === "late-cancelled",
                  actorName: jo.name,
                  at: new Date(
                    start.getTime() - (status === "late-cancelled" ? 6 : 48) * 3_600_000,
                  ),
                }
              : null,
          note: noteStatus
            ? {
                text: "Session completed as planned. Progress noted against goals.",
                forPatient: "Thanks for today. Keep practising the home program.",
                status: noteStatus,
                aiDrafted: r > 0.5,
                signedAt:
                  noteStatus === "Final"
                    ? new Date(end.getTime() + (r > 0.8 ? 60 : 20) * 3_600_000)
                    : null,
                byName: t.name,
                at: new Date(end.getTime() + 2 * 3_600_000),
              }
            : null,
          checkIn: done
            ? { at: start, attendees: "Participant", safe: true, notes: "", byName: t.name }
            : null,
          checkOut:
            done && minutesKnown
              ? { at: end, minutes: len - (r > 0.85 ? 10 : 0), byName: t.name }
              : null,
          aborted:
            status === "aborted"
              ? {
                  reason: telehealth ? "Video connection failed" : "Participant unwell on arrival",
                  remaining: "Rebook the session",
                  byName: t.name,
                  at: start,
                }
              : null,
          invoiceId: null,
          needId: need.id,
          modality: telehealth ? "Telehealth" : "In person",
          confirmedByPatient: r > 0.3 ? new Date(start.getTime() - 2 * DAY) : null,
          ref: await nextRef(db.db, "appointment", "APT", 6),
          site: null,
          purpose:
            kind === "assessment"
              ? i === 0
                ? "Initial Assessment"
                : "Assessment Continuation"
              : telehealth
                ? "Telehealth Consultation"
                : "Treatment Session",
          noShow:
            status === "no-show"
              ? {
                  attempts: "Called twice, left a message",
                  concern: false,
                  byName: t.name,
                  at: new Date(start.getTime() + 20 * 60_000),
                }
              : null,
          moved:
            apptN % 17 === 0 && status !== "cancelled"
              ? {
                  from: new Date(start.getTime() - 2 * DAY),
                  reason: "Participant asked for another day",
                  byName: jo.name,
                  at: new Date(start.getTime() - 5 * DAY),
                  notified: "Participant",
                }
              : null,
          travelPlan: telehealth
            ? null
            : {
                bookedMinutes: 20 + Math.round(r * 25),
                recordedMinutes: done ? 18 + Math.round(r * 30) : null,
                charge:
                  p.funding === "NDIS"
                    ? done
                      ? "Charged on agreement"
                      : "Not charged"
                    : p.funding === "Private"
                      ? "Not chargeable for this payer"
                      : "Included in fee",
              },
          feedback:
            done && r > 0.75
              ? { rating: r > 0.9 ? 5 : 4, comment: "", at: new Date(end.getTime() + DAY) }
              : null,
          createdAt: new Date(start.getTime() - 10 * DAY),
        };
        appts.push(a);
        day = weekday(addDays(day, step));
      }
    }
  }

  for (const a of appts) {
    try {
      await db.appointments.insertOne(a);
    } catch {
      a.holdsSlot = false;
      a.start = new Date(a.start.getTime() + 30 * 60_000);
      a.end = new Date(a.end.getTime() + 30 * 60_000);
      await db.appointments.insertOne(a).catch(() => null);
    }
  }

  /* telehealth sessions: consent, reconnects and one failed connection (scenario D) */
  const tele = appts.filter((a) => a.modality === "Telehealth" && a.start < new Date());
  for (const [i, a] of tele.entries()) {
    const joined = a.status === "completed";
    const failed = a.status === "aborted";
    const drop = i % 5 === 2;
    const recConsent = i % 3 === 0;
    const recorded = joined && recConsent && i % 6 === 0;
    const doc: TelehealthDoc = {
      _id: new ObjectId(),
      demo: true,
      appointmentId: a._id,
      clientId: a.clientId,
      therapistId: a.therapistId,
      tokenHash: null,
      linkSentAt: new Date(a.start.getTime() - DAY),
      suitability: {
        ok: true,
        notes: "",
        byName: "Clinician",
        at: new Date(a.start.getTime() - 3 * DAY),
      },
      guest: null,
      consents: {
        video: joined ? { given: true, by: "Participant", at: a.start } : null,
        recording: joined ? { given: recConsent, by: "Participant", at: a.start } : null,
        transcription: null,
        sharing: null,
      },
      device:
        joined || failed
          ? { camera: true, microphone: true, network: drop || failed ? "poor" : "good" }
          : null,
      state: joined || failed ? "Ended" : "Not started",
      waitingSince: joined || failed ? a.start : null,
      admittedAt: joined ? new Date(a.start.getTime() + 60_000) : null,
      endedAt: joined || failed ? a.end : null,
      participants: joined ? [{ name: "Participant", role: "Patient", joinedAt: a.start }] : [],
      screenShare: false,
      recordingAllowed: recConsent,
      recording: {
        status: recorded ? "Access Restricted" : "Off",
        segments: recorded ? [{ start: a.start, end: a.end }] : [],
        availableAt: recorded ? a.end : null,
        durationSec: recorded ? Math.round((a.end.getTime() - a.start.getTime()) / 1000) : 0,
        retentionUntil: null,
        deleted: null,
        restricted: recorded,
      },
      transcript: [],
      accessLog: recorded
        ? [
            {
              byName: "Helen Brooks",
              purpose: "Clinical supervision",
              action: "Viewed",
              at: new Date(a.end.getTime() + 2 * DAY),
            },
          ]
        : [],
      events: [
        { at: a.start, text: "Participant waiting" },
        ...(failed
          ? [
              {
                at: new Date(a.start.getTime() + 5 * 60_000),
                text: "Video connection failed: couldn't connect after three tries",
              },
            ]
          : []),
        ...(drop && joined
          ? [
              {
                at: new Date(a.start.getTime() + 15 * 60_000),
                text: "Connection dropped; reconnecting",
              },
            ]
          : []),
        ...(joined
          ? [
              {
                at: a.end,
                text: recConsent
                  ? "Recording consent given"
                  : "No recording consent: session not recorded",
              },
            ]
          : []),
      ],
    };
    await db.telehealth.insertOne(doc).catch(() => null);
  }

  /* assessments and plans (scenario C: one FCA spread over visits, assessment-only) */
  const clients = await db.clients.find({ demo: true }).toArray();
  let asmN = 0;
  for (const c of clients) {
    for (const need of c.needs) {
      if (!need.therapistId) continue;
      const kind = supportInfo(need.support as Support).kind;
      const visits = appts
        .filter((a) => a.clientId.equals(c._id) && a.needId === need.id && a.status === "completed")
        .sort((x, y) => x.start.getTime() - y.start.getTime());
      if (!visits.length) continue;
      asmN += 1;
      const t = therapists.find((x) => x._id.equals(need.therapistId as ObjectId)) as TherapistDoc;
      const first = visits[0] as AppointmentDoc;
      const fca = c.name === "Amelia Hart";
      const status: AssessmentDoc["status"] = fca
        ? "In Progress"
        : asmN % 9 === 4
          ? "Awaiting Review"
          : asmN % 11 === 7
            ? "Draft"
            : asmN % 13 === 5
              ? "Amended"
              : asmN % 17 === 8
                ? "Cancelled"
                : "Signed";
      const signedAt =
        status === "Signed" || status === "Amended"
          ? new Date(
              first.end.getTime() +
                (kind === "assessment" ? 9 + (asmN % 12) : 2 + (asmN % 5)) * DAY,
            )
          : null;
      const asm: AssessmentDoc = {
        _id: new ObjectId(),
        demo: true,
        clientId: c._id,
        needId: need.id,
        therapistId: t._id,
        therapistName: t.name,
        support: need.support as Support,
        discipline: need.discipline,
        kind: "Initial",
        status,
        consent: { obtained: true, notes: "" },
        sections: {},
        activities: [],
        findings: "",
        limitations: "",
        recommendation: {
          decision: kind === "assessment" ? "Report only" : "Treatment",
          notes: "",
        },
        released: null,
        signed: signedAt ? { byName: t.name, at: signedAt } : null,
        amendments:
          status === "Amended"
            ? [
                {
                  reason: "Corrected a date",
                  text: "",
                  byName: t.name,
                  at: new Date((signedAt as Date).getTime() + 3 * DAY),
                },
              ]
            : [],
        reviews:
          status === "Awaiting Review"
            ? [
                {
                  requestedBy: t.name,
                  requestedAt: new Date(first.end.getTime() + 4 * DAY),
                  comment: null,
                  reviewedBy: null,
                  reviewedAt: null,
                },
              ]
            : [],
        cancelled:
          status === "Cancelled"
            ? {
                reason: "Withdrawn by the participant",
                byName: t.name,
                at: new Date(first.end.getTime() + DAY),
              }
            : null,
        createdAt: new Date(first.start.getTime() - 3 * DAY),
        updatedAt: signedAt ?? first.end,
      };
      await db.assessments.insertOne(asm);
      if (kind === "treatment" && signedAt && status !== "Cancelled") {
        const reviewDate = addDays(dayKey(signedAt), 70 + (asmN % 4) * 7);
        const plan: PlanDoc = {
          _id: new ObjectId(),
          demo: true,
          clientId: c._id,
          needId: need.id,
          therapistId: t._id,
          therapistName: t.name,
          support: need.support as Support,
          status: "Active",
          version: 1,
          indication: "",
          goals: [0, 1, 2].slice(0, 2 + (asmN % 2)).map((g) => ({
            id: randomUUID(),
            description:
              [
                "Walk 200 m with a frame",
                "Dress independently",
                "Use 3-word phrases",
                "Return to work duties",
              ][g + (asmN % 2)] ?? "Daily routine",
            domain: ["Mobility", "Self-care", "Communication"][g] ?? "Self-care",
            measure: "Observed",
            baseline: "With help",
            target: "Independent",
            current: "Improving",
            status: "Active",
            rationale: "",
            history: [],
          })),
          interventions: "",
          precautions: "",
          frequency: need.frequency,
          duration: "12 weeks",
          reviewDate,
          approved: { byName: t.name, at: signedAt },
          reviews:
            asmN % 3 === 0
              ? [
                  {
                    decision: "Continue",
                    notes: "",
                    byName: t.name,
                    at: new Date(signedAt.getTime() + 35 * DAY),
                  },
                ]
              : [],
          progressSummary: null,
          createdAt: signedAt,
          updatedAt: signedAt,
        };
        await db.plans.insertOne(plan);
      }
    }
  }

  /* invoices by participant and month, with payments; Kai has two payer routes (mixed) */
  const byClient = new Map(clients.map((c) => [c._id.toHexString(), c]));
  const groups = new Map<string, AppointmentDoc[]>();
  for (const a of appts.filter(
    (x) =>
      x.status === "completed" &&
      x.checkOut &&
      x.note?.status === "Final" &&
      dayKey(x.start) < addDays(today, -10),
  )) {
    const c = byClient.get(a.clientId.toHexString());
    if (!c) continue;
    const need = c.needs.find((n) => n.id === a.needId);
    const mixedPrivate = c.name === "Kai Thompson" && need?.discipline === "Psychology";
    const key = `${a.clientId.toHexString()}|${dayKey(a.start).slice(0, 7)}|${mixedPrivate ? "private" : "main"}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  let invN = 0;
  for (const [key, list] of groups) {
    const [cid, month, part] = key.split("|") as [string, string, string];
    const c = byClient.get(cid) as ClientDoc;
    const person = people.find((x) => `${x.first} ${x.last}` === c.name) as Person;
    const path: FundingPath = part === "private" ? "Private" : pathFor(person);
    invN += 1;
    const lines: InvoiceLine[] = list.map((a) => {
      const minutes = a.checkOut?.minutes ?? 60;
      const rate = rateFor(a.discipline);
      return {
        id: randomUUID(),
        kind: "service",
        visitId: a._id,
        date: a.start,
        description: `${a.discipline} session`,
        itemCode: "",
        minutes,
        rate,
        amount: Math.round((minutes / 60) * rate * 100) / 100,
        payerRoute: part === "private" ? `Private: ${c.name}` : payerFor(person),
        quantity: Math.round((minutes / 60) * 10000) / 10000,
        unit: "Hour",
        tax: "GST-free",
        gst: 0,
        discipline: a.discipline,
      };
    });
    const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
      .toISOString()
      .slice(0, 10);
    const issuedDay = weekday(addDays(monthEnd, 2));
    const isCurrent = issuedDay >= addDays(today, -3);
    const age = Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${issuedDay}T00:00:00Z`)) / DAY,
    );
    const r = rand();
    const status: InvoiceDoc["status"] = isCurrent
      ? invN % 3 === 0
        ? "Pending Approval"
        : "Draft"
      : age > 75
        ? r < 0.85
          ? "Paid"
          : "Part-Paid"
        : age > 40
          ? r < 0.55
            ? "Paid"
            : r < 0.75
              ? "Part-Paid"
              : r < 0.9
                ? "Issued"
                : "Disputed"
          : r < 0.35
            ? "Paid"
            : r < 0.5
              ? "Credited"
              : "Issued";
    const issuedAt = status === "Draft" || status === "Pending Approval" ? null : at(issuedDay, 10);
    const dueDate = issuedAt ? addDays(issuedDay, path === "Agency Managed" ? 7 : 14) : null;
    const _id = new ObjectId();
    const number = await nextRef(db.db, "invoice07", "INV", 6);
    const paidAmount =
      status === "Paid" ? total : status === "Part-Paid" ? Math.round(total * 0.5 * 100) / 100 : 0;
    const credit = status === "Credited" ? Math.round((lines[0]?.amount ?? 0) * 100) / 100 : 0;
    const payments: InvoiceDoc["payments"] = [];
    if (paidAmount > 0 && issuedAt) {
      const pid = new ObjectId();
      const receivedOn = addDays(issuedDay, path === "Agency Managed" ? 4 : 9 + (invN % 12));
      const pAt = at(receivedOn, 11);
      const pay: PaymentDoc = {
        demo: true,
        _id: pid,
        ref: await nextRef(db.db, "payment", "PAY", 4),
        payer: payerFor(person),
        receivedOn,
        method: "Bank Transfer",
        amount: paidAmount,
        reference: `REM-${number.slice(4)}`,
        note: "",
        status: "Reconciled",
        allocations: [{ target: "invoice", id: _id, amount: paidAmount, at: pAt, byName: jo.name }],
        recon: "Reconciled",
        refunded: 0,
        history: [{ at: pAt, byName: jo.name, action: `Recorded and allocated to ${number}` }],
        createdAt: pAt,
      };
      await db.payments.insertOne(pay);
      payments.push({
        amount: paidAmount,
        reference: pay.reference,
        byName: jo.name,
        at: pAt,
        paymentId: pid,
      });
    }
    const inv: InvoiceDoc = {
      demo: true,
      _id,
      number,
      clientId: c._id,
      funding: c.funding,
      payer: part === "private" ? c.name : payerFor(person),
      status,
      lines,
      payments,
      history: [
        {
          status: "Draft",
          byName: BY,
          note: "Prepared from verified visits",
          at: at(issuedDay, 9),
        },
        ...(issuedAt
          ? [{ status: "Issued" as const, byName: jo.name, note: "", at: issuedAt }]
          : []),
        ...(status !== "Issued" && issuedAt
          ? [{ status, byName: jo.name, note: "", at: new Date(issuedAt.getTime() + 10 * DAY) }]
          : []),
      ],
      issuedAt,
      createdAt: at(issuedDay, 9),
      updatedAt: at(issuedDay, 9),
      version: 1,
      path,
      dueDate,
      terms: path === "Agency Managed" ? "7 days" : "14 days",
      delivery: "Email",
      billTo: {
        type:
          path === "Plan Managed"
            ? "Plan Manager"
            : path === "Agency Managed"
              ? "Agency pathway"
              : "Participant",
        name: part === "private" ? c.name : payerFor(person),
        email: "invoices@example.test",
        address: "",
        abn: "",
        reference: c.mrn ?? "",
      },
      note: "",
      credits: credit
        ? [
            {
              adjustmentId: new ObjectId(),
              ref: `CR-${number.slice(4)}`,
              amount: credit,
              at: new Date((issuedAt as Date).getTime() + 6 * DAY),
              reason: "Session time corrected",
            },
          ]
        : [],
      dispute:
        status === "Disputed"
          ? {
              reason: "Payer queried the session dates",
              at: new Date((issuedAt as Date).getTime() + 12 * DAY),
              byName: jo.name,
            }
          : null,
    };
    invoices.push(inv);
    await db.invoices.insertOne(inv);
    await db.appointments.updateMany(
      { _id: { $in: list.map((a) => a._id) } },
      { $set: { invoiceId: _id } },
    );
  }

  /* recent verified visits go through Module 07's own capture, so the billable queue is real */
  const recent = appts
    .filter(
      (a) =>
        a.status === "completed" &&
        a.checkOut &&
        dayKey(a.start) >= addDays(today, -10) &&
        dayKey(a.start) <= today,
    )
    .slice(0, 14);
  for (const a of recent) {
    const fresh = await db.appointments.findOne({ _id: a._id });
    if (fresh) await captureVisit(fresh, "service", BY).catch(() => null);
  }

  /* referrals still in progress, declined, waitlisted or withdrawn (no participant yet) */
  for (const [i, o] of openReferrals.entries()) {
    const submittedAt = at(o.submitted, 10 + (i % 5), 5);
    const mrn = await nextMrn(db.db, submittedAt);
    const closed = ["Declined", "Withdrawn"].includes(o.status);
    const history: ReferralDoc["history"] = [
      { status: "Submitted", byName: "Referral form", note: "", at: submittedAt },
    ];
    const step = (status: ReferralStatus, h: number, note = "") =>
      history.push({
        status,
        byName: status === "Clinical Triage" || status === "Declined" ? neil.name : jo.name,
        note,
        at: new Date(submittedAt.getTime() + h * 3_600_000),
      });
    if (o.status === "Needs Information") step("Needs Information", 2, o.note);
    else {
      step("Under Admin Review", 1);
      if (
        ["Clinical Triage", "Funding Review", "Waitlisted", "Declined", "Withdrawn"].includes(
          o.status,
        )
      )
        step("Clinical Triage", 20);
      if (["Funding Review", "Waitlisted"].includes(o.status)) step("Funding Review", 30);
      if (
        o.status !== "Clinical Triage" &&
        o.status !== "Funding Review" &&
        o.status !== "Under Admin Review"
      )
        step(o.status, 50, o.note);
    }
    const ref: ReferralDoc = {
      _id: new ObjectId(),
      demo: true,
      reference: `REF-${mrn}`,
      trackingHash: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      mrn,
      status: o.status,
      data: referralData(
        o,
        o.supports.map((s) => ({
          support: s,
          frequency: supportInfo(s).kind === "assessment" ? "Assessment" : "Weekly",
        })),
        "Home",
      ),
      services:
        o.status === "Waitlisted"
          ? o.supports.map((s, index) => ({
              index,
              support: s,
              decision: "Waitlisted",
              reason: o.note,
              needId: null,
              byName: jo.name,
              at: new Date(submittedAt.getTime() + 50 * 3_600_000),
            }))
          : [],
      region: o.region,
      gaps:
        o.status === "Needs Information"
          ? [{ field: "funding", label: o.note }]
          : o.status === "Under Admin Review" && i % 2 === 0
            ? [{ field: "location", label: "Service address to confirm" }]
            : [],
      infoRequests:
        o.status === "Needs Information"
          ? [
              {
                id: randomUUID(),
                items: [{ field: "funding", label: o.note }],
                message: `Please send: ${o.note.toLowerCase()}.`,
                requestedBy: jo.name,
                at: new Date(submittedAt.getTime() + 2 * 3_600_000),
                answer: null,
                answeredAt: null,
              },
            ]
          : [],
      duplicates: [],
      duplicateDecision: null,
      owner:
        i % 3 === 2
          ? null
          : {
              id: (i % 2 ? jo : (admin("Sam Rivera") ?? jo))._id,
              name: (i % 2 ? jo : (admin("Sam Rivera") ?? jo)).name,
            },
      triage: ["Declined", "Waitlisted", "Funding Review", "Withdrawn"].includes(o.status)
        ? {
            decision:
              o.status === "Declined"
                ? "Declined"
                : o.status === "Waitlisted"
                  ? "Waitlisted"
                  : "Accepted",
            notes: o.note,
            riskAction: "",
            precaution: "",
            byName: neil.name,
            at: new Date(submittedAt.getTime() + 20 * 3_600_000),
          }
        : null,
      fundingReview:
        o.status === "Funding Review"
          ? {
              verification: "Exception",
              exceptionReason: o.note,
              agreement: "Sent",
              consentRecorded: true,
              notes: "",
              byName: jo.name,
              at: new Date(submittedAt.getTime() + 30 * 3_600_000),
            }
          : null,
      outcome: closed
        ? {
            reason: o.note,
            byName: neil.name,
            at: new Date(submittedAt.getTime() + 50 * 3_600_000),
          }
        : null,
      clientId: null,
      submittedBy: i % 4 === 3 ? "staff" : "public",
      createdBy: i % 4 === 3 ? jo._id : null,
      history,
      createdAt: submittedAt,
      updatedAt: history[history.length - 1]?.at ?? submittedAt,
    };
    await db.referrals.insertOne(ref);
  }

  /* work-queue tasks raised by rules and AI, in different review states */
  const taskSpecs: [
    string,
    OpsTaskDoc["category"],
    OpsTaskDoc["team"],
    OpsTaskDoc["status"],
    OpsTaskDoc["source"],
    number,
  ][] = [
    ["Chase NDIS plan for Mason K.", "Referral", "Intake", "Waiting for Patient", "Rule", -2],
    ["Sign overdue session notes (3)", "Documentation", "Clinical", "Assigned", "Rule", -1],
    [
      "Review AI-suggested service address correction",
      "Referral",
      "Intake",
      "Completed",
      "AI Proposed",
      -9,
    ],
    ["Confirm plan type with Lucas F.", "Funding", "Finance", "In Progress", "Rule", 1],
    ["Rebook failed telehealth session", "Telehealth", "Scheduling", "Completed", "Rule", -12],
    ["Follow up disputed invoice", "Billing", "Finance", "Escalated", "Manual", -3],
    ["Proposed: merge duplicate contact", "Referral", "Intake", "Cancelled", "AI Proposed", -6],
    [
      "Proposed: earlier visit slot for Sienna B.",
      "Scheduling",
      "Scheduling",
      "On Hold",
      "AI Proposed",
      2,
    ],
  ];
  for (const [i, [title, category, team, status, source, dueIn]] of taskSpecs.entries()) {
    const created = new Date(Date.now() - (14 - i) * DAY);
    await db.opsTasks
      .insertOne({
        _id: new ObjectId(),
        demo: true,
        ref: await nextRef(db.db, "opsTask", "TASK", 6),
        title,
        category,
        status,
        priority: dueIn < 0 && status !== "Completed" ? "High" : "Normal",
        urgentReason: "",
        team,
        assigneeId: null,
        assigneeName: team === "Finance" ? "Jo Marsh" : team === "Clinical" ? "Helen Brooks" : null,
        related: { kind: "Referral", ref: "—", label: title, href: null },
        clientId: null,
        referralId: null,
        appointmentId: null,
        participant: null,
        service: null,
        discipline: null,
        locationType: null,
        dueAt: new Date(Date.now() + dueIn * DAY),
        sla: "Standard",
        visibility: team === "Clinical" ? "Team Only" : "Internal",
        source,
        ruleCode: source === "Rule" ? "OP-R0" + ((i % 5) + 1) : null,
        ruleVersion: source === "Rule" ? 1 : null,
        idemKey: `reports-history:${i}`,
        checklist: [],
        notes: [],
        attachments: [],
        history: [{ at: created, by: source === "Rule" ? "Rule" : BY, action: "Created" }],
        resolution:
          status === "Completed"
            ? {
                code: "Completed",
                note: "",
                by: jo.name,
                at: new Date(created.getTime() + 2 * DAY),
              }
            : null,
        holdReason: status === "On Hold" ? "Waiting for the family to reply" : "",
        escalation:
          status === "Escalated"
            ? {
                owner: "Finance Manager",
                reason: "Payer hasn't replied",
                at: new Date(created.getTime() + 3 * DAY),
                outcome: "",
              }
            : null,
        acknowledged: null,
        tags: [],
        restrictedNote: null,
        recordingHref: null,
        suggestion: false,
        scenario: null,
        version: 1,
        createdAt: created,
        updatedAt: new Date(created.getTime() + DAY),
      })
      .catch(() => null);
  }

  /* saved views, schedules and exports (section 13: draft, active, failed, revoked) */
  const marco = admin("Marco Silva") ?? neil;
  const morgan = admin("Morgan Blake") ?? neil;
  const helen = admin("Helen Brooks") ?? neil;
  const f = (preset: "Last 30 Days" | "This Quarter" | "Last Month") => ({
    ...blankFilters(today),
    preset,
    ...presetRange(preset, today),
  });
  const view = (
    name: string,
    owner: UserDoc,
    scope: ReportViewDoc["scope"],
    team: string | null,
    reportId: string | null,
    status: ReportViewDoc["status"] = "Active",
  ): ReportViewDoc => ({
    _id: new ObjectId(),
    demo: true,
    name,
    description: "",
    ownerId: owner._id,
    ownerName: owner.name,
    team,
    scope,
    reportId,
    spec: null,
    filters: f("This Quarter"),
    status,
    version: 1,
    history: [{ at: new Date(), by: owner.name, action: "Created" }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.reportViews.insertMany([
    view("Weekly capacity review", marco, "Team", "Operations", "R06"),
    view("Referral pipeline: leadership", neil, "Organisation", null, "R02"),
    view("Invoice ageing for month end", morgan, "Team", "Finance", "R15"),
    view("My documentation backlog check", helen, "Private", null, "R12"),
    view("Q3 cancellation reasons", marco, "Organisation", null, "R08", "Archived"),
  ]);
  const sch = (
    name: string,
    owner: UserDoc,
    reportId: string,
    status: ReportScheduleDoc["status"],
    extra: Partial<ReportScheduleDoc> = {},
  ): ReportScheduleDoc => ({
    _id: new ObjectId(),
    demo: true,
    ref: "",
    name,
    reportId,
    viewId: null,
    preset: "Last 7 Days",
    filters: {},
    frequency: "Weekly",
    weekday: 1,
    monthDay: null,
    oneTimeDate: null,
    time: "07:00",
    timezone: "Australia/Brisbane",
    recipients: [{ kind: "self", id: owner._id.toHexString(), name: owner.name }],
    delivery: "In-app",
    format: "PDF summary",
    contents: "Summary only",
    status,
    ownerId: owner._id,
    ownerName: owner.name,
    nextRun: null,
    runs: [],
    history: [{ at: new Date(), by: owner.name, action: "Created" }],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  });
  const { nextRunAt } = await import("./report-actions");
  const s1 = sch("Monday capacity summary", marco, "R06", "Active", {
    recipients: [
      { kind: "self", id: marco._id.toHexString(), name: marco.name },
      { kind: "group", id: "ops-leadership", name: "Operations leadership" },
    ],
  });
  s1.nextRun = nextRunAt(s1, new Date());
  const s2 = sch("Month-end ageing pack", morgan, "R15", "Failed", {
    frequency: "Monthly",
    weekday: null,
    monthDay: "Last business day",
    format: "XLSX",
    contents: "Permitted detail rows",
    recipients: [
      { kind: "group", id: "finance-team", name: "Finance team" },
      { kind: "group", id: "intake-scheduling", name: "Intake and scheduling" },
    ],
    runs: [
      {
        id: randomUUID(),
        at: new Date(Date.now() - 14 * DAY),
        outcome: "Failed",
        detail: "The report service timed out while generating detail rows.",
        exportId: null,
        delivered: [],
        excluded: ["Sam Rivera: no access to Finance"],
        attempt: 1,
      },
    ],
  });
  const s3 = sch("Referral pipeline daily (draft)", neil, "R02", "Draft", {
    frequency: "Daily",
    weekday: null,
    time: "08:30",
  });
  for (const s of [s1, s2, s3]) {
    s.ref = await nextRef(db.db, "reportSchedule", "SCH", 4);
    await db.reportSchedules.insertOne(s);
  }
  const exp = async (
    owner: UserDoc,
    reportId: string,
    title: string,
    domain: string,
    status: ReportExportDoc["status"],
    revoked: ReportExportDoc["revoked"],
  ) =>
    db.reportExports.insertOne({
      demo: true,
      _id: new ObjectId(),
      ref: await nextRef(db.db, "reportExport", "EXP", 5),
      idemKey: `history:${reportId}:${status}`,
      reportId,
      title,
      domain,
      ownerId: owner._id,
      ownerName: owner.name,
      format: "CSV",
      contents: "Summary only",
      filters: f("Last Month"),
      summary: [
        `Last Month: ${presetRange("Last Month", today).from} to ${presetRange("Last Month", today).to}`,
      ],
      unit: "",
      basis: "",
      columns: [],
      rows: [],
      metrics: [],
      generatedAt: new Date(Date.now() - 9 * DAY),
      freshness: new Date(Date.now() - 9 * DAY),
      expiresAt: new Date(Date.now() - 2 * DAY + (status === "Revoked" ? 9 * DAY : 0)),
      status,
      revoked,
      recipientIds: [owner._id],
      scheduleId: null,
      downloads: [
        {
          by: owner.name,
          at: new Date(Date.now() - 9 * DAY),
          format: "CSV",
          outcome: "Downloaded",
        },
      ],
    });
  await exp(marco, "R06", "R06 Therapist workload", "Staff", "Ready", null);
  await exp(morgan, "R15", "R15 Invoice ageing", "Finance", "Revoked", {
    by: morgan.name,
    at: new Date(Date.now() - 5 * DAY),
    reason: "Sent to the wrong distribution group",
  });
  await exp(neil, "R02", "R02 Referral pipeline", "Referrals", "Ready", null);
  serverLog(
    `reports history: ${people.length} participants, ${appts.length} visits, ${invoices.length} invoices seeded`,
  );
}

/** Section 13 also asks for a failed automation example; added once, after the first seed. */
export async function seedHistoryExtras() {
  const db = await collections();
  const flags = db.db.collection<{ _id: string; at: Date }>("settings");
  if (await flags.findOne({ _id: "reports-history-v2" })) return;
  await flags.insertOne({ _id: "reports-history-v2", at: new Date() });
  const rule = await db.opsRules.findOne({ code: "AUT-08" });
  if (!rule) return;
  await db.opsRuns.insertOne({
    _id: new ObjectId(),
    ref: await nextRef(db.db, "opsRun", "RUN", 6),
    key: "reports-history:failed-reminder",
    ruleCode: rule.code,
    ruleName: rule.name,
    ruleVersion: rule.version,
    trigger: "Appointment booked",
    entity: "Appointment",
    input: "Reminder for a visit with no confirmed contact method",
    actions: ["Queue reminder message"],
    outcome: "Error",
    detail:
      "The booking contact has no phone or email on file, so the reminder couldn't be queued.",
    mode: "Execute Allowed Actions",
    retries: 2,
    resolved: false,
    at: new Date(Date.now() - 3 * DAY),
  });
}
