import "server-only";
import bcrypt from "bcryptjs";
import { ObjectId, type Db } from "mongodb";
import { clinicians } from "@/data/clinicians";
import type { Discipline, Region } from "@/lib/live/catalogue";
import { CLOSE_MINUTES, OPEN_MINUTES } from "@/lib/live/catalogue";
import { serverLog } from "./log";
import type { TherapistDoc, UserDoc, WeeklyHours } from "./models";

type SeedTherapist = {
  slug: string;
  name: string;
  discipline: Discipline;
  region: Region;
  fte: number;
  activeClients: number;
  capacity: number;
  caseloadScore: number;
  seniority: TherapistDoc["seniority"];
};

/**
 * The twelve clinicians the platform already describes keep their figures, so the caseload
 * story still holds. Eight more cover the other disciplines on medisense.com.au.
 */
const extraTherapists: SeedTherapist[] = [
  {
    slug: "olivia-reyes",
    name: "Olivia Reyes",
    discipline: "Physiotherapy",
    region: "Brisbane North",
    fte: 1,
    activeClients: 19,
    capacity: 24,
    caseloadScore: 46,
    seniority: "Senior",
  },
  {
    slug: "jacob-morris",
    name: "Jacob Morris",
    discipline: "Physiotherapy",
    region: "Brisbane South",
    fte: 0.8,
    activeClients: 14,
    capacity: 19,
    caseloadScore: 41,
    seniority: "Clinician",
  },
  {
    slug: "chloe-adams",
    name: "Chloe Adams",
    discipline: "Exercise Physiology",
    region: "Brisbane North",
    fte: 1,
    activeClients: 17,
    capacity: 24,
    caseloadScore: 39,
    seniority: "Clinician",
  },
  {
    slug: "nadia-hassan",
    name: "Nadia Hassan",
    discipline: "Psychology",
    region: "Brisbane South",
    fte: 0.8,
    activeClients: 16,
    capacity: 18,
    caseloadScore: 58,
    seniority: "Senior",
  },
  {
    slug: "ryan-cole",
    name: "Ryan Cole",
    discipline: "Trauma Therapy",
    region: "Brisbane North",
    fte: 0.6,
    activeClients: 9,
    capacity: 12,
    caseloadScore: 44,
    seniority: "Senior",
  },
  {
    slug: "mei-tanaka",
    name: "Mei Tanaka",
    discipline: "Dietetics",
    region: "Brisbane South",
    fte: 0.6,
    activeClients: 10,
    capacity: 15,
    caseloadScore: 30,
    seniority: "Clinician",
  },
  {
    slug: "sam-oconnor",
    name: "Sam O'Connor",
    discipline: "Podiatry",
    region: "Brisbane North",
    fte: 0.6,
    activeClients: 11,
    capacity: 15,
    caseloadScore: 35,
    seniority: "Clinician",
  },
  {
    slug: "lucy-grant",
    name: "Lucy Grant",
    discipline: "Nursing",
    region: "Brisbane South",
    fte: 0.8,
    activeClients: 13,
    capacity: 16,
    caseloadScore: 37,
    seniority: "Senior",
  },
];

const seniors = new Set(["grace-liu", "sarah-thompson", "marcus-bell"]);

function fromStory(): SeedTherapist[] {
  return clinicians.map((c) => ({
    slug: c.id,
    name: c.name,
    discipline: c.discipline,
    region: c.site,
    fte: c.fte,
    activeClients: c.active,
    capacity: c.capacity,
    caseloadScore: c.score,
    seniority: seniors.has(c.id) ? "Senior" : "Clinician",
  }));
}

/** Working days from FTE: 1.0 is Monday to Friday, 0.6 is three days, and so on. */
function weeklyHours(slug: string, fte: number): WeeklyHours[] {
  const days = Math.max(1, Math.round(fte * 5));
  const offset = [...slug].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 5;
  return Array.from({ length: days }, (_, i) => ({
    weekday: ((offset + i) % 5) + 1,
    start: OPEN_MINUTES,
    end: CLOSE_MINUTES,
  })).sort((a, b) => a.weekday - b.weekday);
}

const sessionMinutes: Partial<Record<Discipline, number>> = { "Speech Pathology": 45 };

export const staffEmail = (name: string) =>
  `${name
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .trim()
    .replace(/\s+/g, ".")}@medisense.test`;

/** Staff accounts sign in with SEED_PASSWORD; without it they are created unable to sign in. */
async function staffPasswordHash() {
  const password = process.env.SEED_PASSWORD;
  if (!password) {
    serverLog("SEED_PASSWORD is not set, so seeded staff accounts cannot sign in yet.");
    return null;
  }
  return bcrypt.hash(password, 11);
}

export async function seedIfEmpty(db: Db) {
  const therapists = db.collection<TherapistDoc>("therapists");
  if ((await therapists.estimatedDocumentCount()) > 0) return;

  const users = db.collection<UserDoc>("users");
  const passwordHash = await staffPasswordHash();
  const now = new Date();

  const admins = [
    { name: "Jo Marsh", email: "jo.marsh@medisense.test" },
    { name: "Neil Hensley", email: "neil.hensley@medisense.test" },
  ];
  for (const admin of admins) {
    await users.updateOne(
      { email: admin.email },
      {
        $setOnInsert: {
          _id: new ObjectId(),
          ...admin,
          role: "admin",
          passwordHash,
          invite: null,
          therapistId: null,
          clientId: null,
          createdAt: now,
        },
      },
      { upsert: true },
    );
  }

  for (const t of [...fromStory(), ...extraTherapists]) {
    const therapistId = new ObjectId();
    const userId = new ObjectId();
    const email = staffEmail(t.name);
    const user = await users.findOneAndUpdate(
      { email },
      {
        $setOnInsert: {
          _id: userId,
          email,
          name: t.name,
          role: "therapist",
          passwordHash,
          invite: null,
          therapistId,
          clientId: null,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    await therapists.updateOne(
      { slug: t.slug },
      {
        $setOnInsert: {
          _id: user?.therapistId ?? therapistId,
          slug: t.slug,
          name: t.name,
          discipline: t.discipline,
          region: t.region,
          seniority: t.seniority,
          capacity: t.capacity,
          activeClients: t.activeClients,
          caseloadScore: t.caseloadScore,
          sessionMinutes: sessionMinutes[t.discipline] ?? 60,
          weekly: weeklyHours(t.slug, t.fte),
          userId: user?._id ?? userId,
        },
      },
      { upsert: true },
    );
  }
  serverLog(
    `Seeded ${admins.length} admin and ${clinicians.length + extraTherapists.length} therapist accounts.`,
  );
}
