import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import {
  caseloadStatus,
  CLOSE_MINUTES,
  disciplines,
  OPEN_MINUTES,
  regions,
  supports,
} from "@/lib/live/catalogue";
import { brisbaneDay, brisbaneMinutes, isoWeekday, slotLabel } from "@/lib/live/time";
import type { TherapistCardDto, TherapistDetailDto } from "@/lib/live/types";
import { hashPassword } from "./auth";
import { ensureStaff, staffBlocks } from "./staff";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { adminIds, audit, publish } from "./live";
import { availabilitySummary, isAway } from "./matching";
import type { AppointmentDoc, TherapistDoc, UserDoc } from "./models";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const availabilitySchema = z
  .object({
    weekly: z
      .array(
        z.object({
          weekday: z.number().int().min(1).max(5),
          start: z.number().int().min(OPEN_MINUTES).max(CLOSE_MINUTES),
          end: z.number().int().min(OPEN_MINUTES).max(CLOSE_MINUTES),
        }),
      )
      .max(5)
      .refine(
        (days) => days.every((d) => d.end - d.start >= 60),
        "Each working day needs at least an hour",
      )
      .refine((days) => new Set(days.map((d) => d.weekday)).size === days.length, "Each day once"),
    timeOff: z
      .array(
        z.object({
          id: z.string().max(64).optional(),
          from: z.string().regex(DAY),
          to: z.string().regex(DAY),
          reason: z.string().trim().min(1, "Add a reason").max(80),
        }),
      )
      .max(30)
      .refine((list) => list.every((o) => o.from <= o.to), "Time off must end after it starts"),
  })
  .strict();

async function therapistFor(user: UserDoc) {
  const { therapists } = await collections();
  const t = user.therapistId ? await therapists.findOne({ _id: user.therapistId }) : null;
  if (!t) throw new UserFacingError("No therapist profile is linked to this account.", 404);
  return t;
}

/** Booked visits that the new hours or time off would leave stranded, for the therapist to move. */
function stranded(t: TherapistDoc, visits: AppointmentDoc[]) {
  return visits.filter((v) => {
    const day = brisbaneDay(v.start);
    if (isAway(t, day)) return true;
    const hours = t.weekly.find((w) => w.weekday === isoWeekday(day));
    const from = brisbaneMinutes(v.start);
    return !hours || from < hours.start || brisbaneMinutes(v.end) > hours.end;
  });
}

export async function saveAvailability(user: UserDoc, input: z.infer<typeof availabilitySchema>) {
  const { therapists, appointments, clients } = await collections();
  const current = await therapistFor(user);
  const next: TherapistDoc = {
    ...current,
    weekly: [...input.weekly].sort((a, b) => a.weekday - b.weekday),
    timeOff: input.timeOff.map((o) => ({ ...o, id: o.id ?? randomUUID() })),
  };
  await therapists.updateOne(
    { _id: current._id },
    { $set: { weekly: next.weekly, timeOff: next.timeOff, availabilityUpdatedAt: new Date() } },
  );
  await audit(user, "Updated working hours and time off", null);
  await publish([...(await adminIds()), user._id], "care", {});

  const upcoming = await appointments
    .find({ therapistId: current._id, status: "booked", start: { $gte: new Date() } })
    .toArray();
  const clash = stranded(next, upcoming);
  const names = new Map(
    (await clients.find({ _id: { $in: clash.map((v) => v.clientId) } }).toArray()).map((c) => [
      c._id.toHexString(),
      c.name,
    ]),
  );
  return {
    availability: availabilitySummary(next),
    clashes: clash.map((v) => ({
      id: v._id.toHexString(),
      when: slotLabel(v.start),
      patient: names.get(v.clientId.toHexString()) ?? "Patient",
    })),
  };
}

export const profileSchema = z
  .object({
    phone: z.string().trim().max(30).nullable(),
    bio: z.string().trim().max(800).optional(),
    qualifications: z.string().trim().max(300).optional(),
    languages: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  })
  .strict();

export async function saveProfile(user: UserDoc, input: z.infer<typeof profileSchema>) {
  const { users, therapists } = await collections();
  await users.updateOne({ _id: user._id }, { $set: { phone: input.phone || null } });
  if (user.role === "therapist") {
    const t = await therapistFor(user);
    await therapists.updateOne(
      { _id: t._id },
      {
        $set: {
          profile: {
            bio: input.bio ?? t.profile?.bio ?? "",
            qualifications: input.qualifications ?? t.profile?.qualifications ?? "",
            languages: input.languages ?? t.profile?.languages ?? ["English"],
          },
        },
      },
    );
  }
  await audit(user, "Updated their profile", null);
}

/* -------------------------------------------------------------- read */

type Ratings = Map<string, { sum: number; count: number }>;

async function ratingsByTherapist(): Promise<Ratings> {
  const { appointments } = await collections();
  const rows = await appointments
    .aggregate<{ _id: ObjectId; sum: number; count: number }>([
      { $match: { "feedback.rating": { $gte: 1 } } },
      { $group: { _id: "$therapistId", sum: { $sum: "$feedback.rating" }, count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id.toHexString(), { sum: r.sum, count: r.count }]));
}

function card(t: TherapistDoc, ratings: Ratings): TherapistCardDto {
  const r = ratings.get(t._id.toHexString());
  return {
    id: t._id.toHexString(),
    active: t.active !== false,
    staffId: t.staff?.staffId ?? null,
    engagement: t.staff?.status ?? (t.active === false ? "Inactive" : "Active"),
    approvedServices: (t.staff?.competencies ?? [])
      .filter((c) => c.status === "Approved")
      .map((c) => c.support),
    blocks: staffBlocks(t, null, null),
    credentialDays: soonestExpiry(t),
    registrationExpiry: t.credentials?.registrationExpiry ?? null,
    name: t.name,
    discipline: t.discipline,
    region: t.region,
    seniority: t.seniority,
    status: caseloadStatus(t.caseloadScore),
    activeClients: t.activeClients,
    capacity: t.capacity,
    availability: availabilitySummary(t),
    rating: r ? { average: Math.round((r.sum / r.count) * 10) / 10, count: r.count } : null,
  };
}

/** Days until the first required credential runs out. */
function soonestExpiry(t: TherapistDoc) {
  const on = Date.parse(new Date().toISOString().slice(0, 10));
  const days = (t.staff?.credentials ?? [])
    .filter((c) => c.required && c.expiry)
    .map((c) => Math.round((Date.parse(c.expiry) - on) / 86_400_000));
  return days.length ? Math.min(...days) : null;
}

export async function listTherapists(): Promise<TherapistCardDto[]> {
  const { therapists, db } = await collections();
  const [found, ratings] = await Promise.all([
    therapists.find().sort({ name: 1 }).toArray(),
    ratingsByTherapist(),
  ]);
  // Staff from before Module 04 get their record (and STF number) once, in name order.
  const rows = [];
  for (const t of found) rows.push(await ensureStaff(db, t));
  return rows.map((t) => card(t, ratings));
}

export async function therapistDetail(id: ObjectId): Promise<TherapistDetailDto> {
  const db = await collections();
  const t = await db.therapists.findOne({ _id: id });
  if (!t) throw new UserFacingError("Therapist not found.", 404);
  const [account, ratings, visits, assigned, log] = await Promise.all([
    db.users.findOne({ _id: t.userId }),
    ratingsByTherapist(),
    db.appointments.find({ therapistId: id }).sort({ start: -1 }).limit(400).toArray(),
    db.assignments
      .find({ therapistId: id, status: "accepted" })
      .sort({ respondedAt: -1 })
      .toArray(),
    db.audit.find({ actorId: t.userId }).sort({ at: -1 }).limit(25).toArray(),
  ]);
  const patients = await db.clients
    .find(
      { _id: { $in: [...new Set(visits.map((v) => v.clientId))] } },
      { projection: { name: 1, discharged: 1 } },
    )
    .toArray();
  const patientName = new Map(patients.map((p) => [p._id.toHexString(), p.name]));
  const now = new Date();
  return {
    ...card(t, ratings),
    email: account?.email ?? "",
    phone: account?.phone ?? null,
    profile: t.profile ?? { bio: "", qualifications: "", languages: ["English"] },
    weekly: t.weekly,
    timeOff: t.timeOff ?? [],
    sessionMinutes: t.sessionMinutes,
    stats: {
      upcoming: visits.filter((v) => v.status === "booked" && v.start >= now).length,
      completed: visits.filter((v) => v.status === "completed").length,
      noShows: visits.filter((v) => v.status === "no-show").length,
      lateCancellations: visits.filter((v) => v.status === "late-cancelled").length,
    },
    patients: assigned.map((a) => ({
      id: a.clientId.toHexString(),
      name: patientName.get(a.clientId.toHexString()) ?? "Patient",
      discipline: a.discipline,
      since: (a.respondedAt ?? a.createdAt).toISOString(),
      discharged: Boolean(patients.find((p) => p._id.equals(a.clientId))?.discharged),
    })),
    feedback: visits
      .filter((v) => v.feedback)
      .slice(0, 20)
      .map((v) => ({
        rating: v.feedback?.rating ?? 0,
        comment: v.feedback?.comment ?? "",
        at: (v.feedback?.at ?? v.start).toISOString(),
        patient: patientName.get(v.clientId.toHexString()) ?? "Patient",
        visit: v.start.toISOString(),
      })),
    history: log.map((e) => ({
      id: e._id.toHexString(),
      action: e.action,
      at: e.at.toISOString(),
    })),
  };
}

export async function myTherapistDetail(user: UserDoc) {
  return therapistDetail((await therapistFor(user))._id);
}

/** A one-off password the admin passes on; the therapist changes it in My profile. */
export async function resetStaffPassword(admin: UserDoc, therapistId: ObjectId) {
  const { therapists, users, sessions } = await collections();
  const t = await therapists.findOne({ _id: therapistId });
  if (!t) throw new UserFacingError("Therapist not found.", 404);
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const temporary = Array.from({ length: 14 }, () => alphabet[randomInt(alphabet.length)]).join("");
  await users.updateOne(
    { _id: t.userId },
    { $set: { passwordHash: await hashPassword(temporary) } },
  );
  await sessions.deleteMany({ userId: t.userId });
  await audit(admin, `Reset the password for ${t.name}`, null);
  return { temporaryPassword: temporary };
}

/* ------------------------------------------------------- adding staff (A04) */

const temporaryPassword = () => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 14 }, () => alphabet[randomInt(alphabet.length)]).join("");
};

export const newTherapistSchema = z.object({
  name: z.string().trim().min(3, "Enter the full name").max(80),
  email: z.email("Enter a valid work email").transform((v) => v.toLowerCase()),
  phone: z.string().trim().max(30),
  discipline: z.enum(disciplines),
  region: z.enum(regions),
  seniority: z.enum(["Graduate", "Clinician", "Senior"]),
  capacity: z.number().int().min(1, "Capacity is at least 1").max(60),
  sessionMinutes: z.number().int().min(30).max(120),
  weekdays: z.array(z.number().int().min(1).max(5)).min(1, "Choose at least one working day"),
  registration: z.string().trim().min(3, "Enter the registration number").max(30),
  registrationExpiry: z.string().regex(DAY, "Enter the registration expiry date"),
  screeningExpiry: z.string().regex(DAY, "Enter the worker screening expiry date"),
  assessmentScopes: z.array(z.enum(supports)).max(20),
});

/**
 * An admin adds a therapist (module A04): their profile, credentials and working days, and a
 * login with a temporary password shown once. They're offered in matching straight away.
 */
export async function createTherapist(admin: UserDoc, input: z.infer<typeof newTherapistSchema>) {
  const { users, therapists } = await collections();
  if (await users.findOne({ email: input.email })) {
    throw new UserFacingError("An account already uses this email.", 409);
  }
  const today = brisbaneDay(new Date()).toISOString().slice(0, 10);
  if (input.registrationExpiry < today) {
    throw new UserFacingError(
      "The registration has expired. They can't be added until it's renewed.",
    );
  }
  const temporary = temporaryPassword();
  const userId = new ObjectId();
  const therapistId = new ObjectId();
  const base = input.name
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const slug = (await therapists.findOne({ slug: base }))
    ? `${base}-${randomUUID().slice(0, 4)}`
    : base;
  await users.insertOne({
    _id: userId,
    email: input.email,
    name: input.name,
    role: "therapist",
    passwordHash: await hashPassword(temporary),
    invite: null,
    therapistId,
    clientId: null,
    phone: input.phone || null,
    createdAt: new Date(),
  });
  await therapists.insertOne({
    _id: therapistId,
    slug,
    name: input.name,
    discipline: input.discipline,
    region: input.region,
    seniority: input.seniority,
    capacity: input.capacity,
    activeClients: 0,
    caseloadScore: 30,
    sessionMinutes: input.sessionMinutes,
    weekly: [...new Set(input.weekdays)]
      .sort()
      .map((weekday) => ({ weekday, start: OPEN_MINUTES, end: CLOSE_MINUTES })),
    timeOff: [],
    credentials: {
      registration: input.registration,
      registrationExpiry: input.registrationExpiry,
      screeningExpiry: input.screeningExpiry,
      assessmentScopes: input.assessmentScopes,
    },
    active: true,
    availabilityUpdatedAt: null,
    userId,
  });
  await audit(admin, `Added therapist ${input.name} (${input.discipline}, ${input.region})`, null);
  await publish(await adminIds(), "care", {});
  return { id: therapistId.toHexString(), email: input.email, temporaryPassword: temporary };
}

/** A therapist who leaves: they can't sign in and aren't offered for new patients. */
export async function setTherapistActive(admin: UserDoc, id: ObjectId, active: boolean) {
  const { therapists, users, sessions } = await collections();
  const t = await therapists.findOne({ _id: id });
  if (!t) throw new UserFacingError("Therapist not found.", 404);
  await therapists.updateOne({ _id: id }, { $set: { active } });
  await users.updateOne({ _id: t.userId }, { $set: { disabled: !active } });
  if (!active) await sessions.deleteMany({ userId: t.userId });
  await audit(
    admin,
    `${active ? "Reactivated" : "Deactivated"} therapist ${t.name}${active ? "" : ` (${t.activeClients} current patients)`}`,
    null,
  );
  await publish(await adminIds(), "care", {});
}
