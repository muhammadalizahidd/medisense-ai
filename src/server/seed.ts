import "server-only";
import bcrypt from "bcryptjs";
import { ObjectId, type Db } from "mongodb";
import { clinicians } from "@/data/clinicians";
import type { Discipline, Region, StaffRole } from "@/lib/live/catalogue";
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

const seniors = new Set([
  "grace-liu",
  "sarah-thompson",
  "marcus-bell",
  "olivia-reyes",
  "nadia-hassan",
  "ryan-cole",
  "lucy-grant",
]);

/** Every therapist comes from the one clinician list the rest of the platform uses. */
function fromClinicians(): SeedTherapist[] {
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
export async function staffPasswordHash() {
  const password = process.env.SEED_PASSWORD;
  if (!password) {
    serverLog("SEED_PASSWORD is not set, so seeded staff accounts cannot sign in yet.");
    return null;
  }
  return bcrypt.hash(password, 11);
}

/** Jo runs intake, scheduling and finance; Neil is the Super Admin and Clinical Lead. */
export const seedAdmins = [
  {
    name: "Jo Marsh",
    email: "jo.marsh@medisense.test",
    staffRoles: ["Intake Officer", "Scheduler", "Finance"] as StaffRole[],
  },
  {
    name: "Neil Hensley",
    email: "neil.hensley@medisense.test",
    staffRoles: ["Super Admin", "Clinical Lead"] as StaffRole[],
  },
  /** Module 07: approves credits, write-offs, refunds and rate overrides (AC-31). */
  {
    name: "Morgan Blake",
    email: "morgan.blake@medisense.test",
    staffRoles: ["Finance Manager"] as StaffRole[],
  },
  /** Module 06: intake and scheduling only, so funding verification is visibly Finance's (AT-10). */
  {
    name: "Sam Rivera",
    email: "sam.rivera@medisense.test",
    staffRoles: ["Intake Officer", "Scheduler"] as StaffRole[],
  },
  /** Module 08: reviews clinically flagged referrals and sees restricted tasks. */
  {
    name: "Helen Brooks",
    email: "helen.brooks@medisense.test",
    staffRoles: ["Clinical Lead"] as StaffRole[],
  },
  /** Module 08: approves workflow rules, travel and booking exceptions; no clinical access. */
  {
    name: "Marco Silva",
    email: "marco.silva@medisense.test",
    staffRoles: ["Operations Manager"] as StaffRole[],
  },
];

export async function seedIfEmpty(db: Db) {
  const therapists = db.collection<TherapistDoc>("therapists");
  if ((await therapists.estimatedDocumentCount()) > 0) return;

  const users = db.collection<UserDoc>("users");
  const passwordHash = await staffPasswordHash();
  const now = new Date();

  const admins = seedAdmins;
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

  for (const t of fromClinicians()) {
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
  serverLog(`Seeded ${admins.length} admin and ${clinicians.length} therapist accounts.`);
}
