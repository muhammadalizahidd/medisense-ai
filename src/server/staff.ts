import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { practitioner, supportCatalogue, type Discipline } from "@/lib/live/catalogue";
import {
  competencyStatuses,
  coverageSchema,
  credentialSchema,
  engagementStatuses,
  staffProfileSchema,
  type CapacityLine,
  type StaffRecordDto,
} from "@/lib/live/staff";
import { addDays, brisbaneDay, isoWeekday } from "@/lib/live/time";
import { csvCell } from "@/lib/live/csv";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { adminIds, publish } from "./live";
import { photoUrl } from "./photos";
import { caseloadVisits, isAway } from "./matching";
import type { StaffDoc, TherapistDoc, UserDoc } from "./models";

const today = () => new Date(Date.now() + 10 * 3_600_000).toISOString().slice(0, 10);
const DAY_MS = 86_400_000;

/** Supports a discipline delivers, from the referral form's catalogue. */
const supportsFor = (d: Discipline) => supportCatalogue.filter((s) => s.discipline === d);

/** The staff record built from what's already known about a therapist, the first time it's needed. */
function initialStaff(t: TherapistDoc, staffId: string): StaffDoc {
  const c = t.credentials;
  const weeklyHours = t.weekly.reduce((sum, w) => sum + (w.end - w.start) / 60, 0);
  const verified = (name: string) => ({
    reviewedBy: "Credentialing (migrated)",
    reviewedAt: new Date(),
    note: `${name} carried over from the therapist record`,
  });
  return {
    staffId,
    status: t.active === false ? "Inactive" : "Active",
    statusNote: null,
    profile: {
      jobTitle: practitioner[t.discipline],
      displayName: t.name,
      employmentType: "Employee",
      secondaryDisciplines: [],
      primaryLocation: "Brisbane",
      supervisorId: "",
      startDate: "2024-01-15",
      endDate: "",
      languages: t.profile?.languages ?? ["English"],
      bio: t.profile?.bio ?? "",
      workSettings: [
        "Home",
        "School",
        "Telehealth",
        "Daycare",
        "Day Program",
        "Other community location",
      ],
      employeeNumber: "",
    },
    coverage: {
      postcodes: [],
      travelWillingness: "Within zone",
      travelMode: "Car",
      bufferMinutes: 15,
      maxPerDay: 6,
      maxHoursWeek: Math.max(1, Math.round(weeklyHours * 0.8)),
    },
    credentials: [
      {
        id: randomUUID(),
        kind: "Registration",
        name: "Professional registration",
        body: t.discipline === "Exercise Physiology" ? "ESSA" : "Ahpra",
        number: c?.registration ?? "",
        start: "",
        expiry: c?.registrationExpiry ?? "",
        evidence: "registration-certificate.pdf",
        required: true,
        status: c ? "Verified" : "Not Submitted",
        ...verified("Registration"),
      },
      {
        id: randomUUID(),
        kind: "Check",
        name: "Worker screening (NDIS)",
        body: "NDIS Worker Screening",
        number: "",
        start: "",
        expiry: c?.screeningExpiry ?? "",
        evidence: "worker-screening.pdf",
        required: true,
        status: c ? "Verified" : "Not Submitted",
        ...verified("Screening"),
      },
      {
        id: randomUUID(),
        kind: "Indemnity",
        name: "Professional indemnity insurance",
        body: "Insurer on file",
        number: "",
        start: "",
        expiry: "2027-06-30",
        evidence: "indemnity-certificate.pdf",
        required: false,
        status: "Verified",
        ...verified("Indemnity"),
      },
      {
        id: randomUUID(),
        kind: "Training",
        name: "Manual handling",
        body: "Medisense training",
        number: "",
        start: "",
        expiry: "2027-03-31",
        evidence: "",
        required: false,
        status: "Verified",
        ...verified("Training"),
      },
    ],
    competencies: supportsFor(t.discipline).map((s) => {
      const approved = s.kind === "treatment" || Boolean(c?.assessmentScopes.includes(s.name));
      return {
        support: s.name,
        status: approved ? "Approved" : "Not approved",
        reviewedBy: approved ? "Credentialing (migrated)" : null,
        reviewedAt: approved ? new Date() : null,
        note: "",
        supervisionRequired: t.seniority === "Graduate",
      };
    }),
  };
}

/**
 * Builds the Module 04 record once (with the next STF number), then keeps it. Clinicians from
 * before Module 04 carry over as verified; a newly added one starts Pending Verification, with
 * every credential awaiting review and every service pending, until a Clinical Lead approves
 * them (AC-01, AC-02).
 */
export async function ensureStaff(db: Db, t: TherapistDoc, isNew = false): Promise<TherapistDoc> {
  if (t.staff) return t;
  const counter = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: "staff" },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  const staff = initialStaff(t, `STF-${String(counter?.seq ?? 1).padStart(4, "0")}`);
  if (isNew) {
    staff.status = "Pending Verification";
    staff.credentials = staff.credentials.map((c) => ({
      ...c,
      status: c.required ? "Awaiting Review" : "Not Submitted",
      reviewedBy: null,
      reviewedAt: null,
      note: "Submitted when the clinician was added",
      evidence: c.required ? c.evidence : "",
    }));
    staff.competencies = staff.competencies.map((c) => ({
      ...c,
      status: "Pending",
      reviewedBy: null,
      reviewedAt: null,
    }));
  }
  await db
    .collection<TherapistDoc>("therapists")
    .updateOne({ _id: t._id, staff: { $exists: false } }, { $set: { staff } });
  const fresh = await db.collection<TherapistDoc>("therapists").findOne({ _id: t._id });
  return fresh ?? { ...t, staff };
}

const credentialState = (c: StaffDoc["credentials"][number], on: string) =>
  c.status === "Verified" && c.expiry && c.expiry < on ? ("Expired" as const) : c.status;

/**
 * The hard stops (section 11): reasons this clinician can't be offered a service on a date. Ranking
 * never outweighs these.
 */
/** True when an in-person visit's postcode is outside the clinician's listed coverage. */
export function outsideCoverage(t: TherapistDoc, location: string | null, postcode: string | null) {
  const codes = t.staff?.coverage.postcodes ?? [];
  if (!location || location === "Telehealth" || !postcode || codes.length === 0) return false;
  return !codes.includes(postcode);
}

export function staffBlocks(
  t: TherapistDoc,
  support: string | null,
  location: string | null,
  on = today(),
  postcode: string | null = null,
): string[] {
  const s = t.staff;
  if (!s) return [];
  const out: string[] = [];
  if (s.status !== "Active") out.push(`Status: ${s.status}`);
  for (const c of s.credentials.filter((x) => x.required)) {
    const state = credentialState(c, on);
    if (state === "Expired") out.push(`${c.name} expired ${c.expiry}`);
    else if (state !== "Verified") out.push(`${c.name}: ${state.toLowerCase()}`);
  }
  if (support) {
    const comp = s.competencies.find((c) => c.support === support);
    if (!comp) out.push(`${support} isn't in their scope`);
    else if (comp.status !== "Approved")
      out.push(`Not approved for ${support} (${comp.status.toLowerCase()})`);
  }
  if (location && !s.profile.workSettings.includes(location as never)) {
    out.push(`Doesn't work in ${location.toLowerCase()} settings`);
  }
  if (
    outsideCoverage(t, location, postcode) &&
    s.coverage.travelWillingness !== "Outside zone by approval"
  ) {
    out.push(`Postcode ${postcode} is outside their coverage`);
  }
  return out;
}

const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

/** The next seven days of capacity, with every line's formula and source (AC-22). */
async function capacityOf(t: TherapistDoc) {
  const { appointments } = await collections();
  const s = t.staff!;
  const start = brisbaneDay(new Date());
  const end = addDays(start, 7);
  const booked = await appointments
    .find({
      therapistId: t._id,
      status: { $in: ["booked", "completed", "tentative"] },
      start: { $gte: start, $lt: end },
    })
    .toArray();
  let contracted = 0;
  let leave = 0;
  let existing = 0;
  let existingCount = 0;
  for (let d = 0; d < 7; d += 1) {
    const day = addDays(start, d);
    const w = t.weekly.find((x) => x.weekday === isoWeekday(day));
    if (!w) continue;
    contracted += w.end - w.start;
    if (isAway(t, day)) {
      leave += w.end - w.start;
      continue;
    }
    const visits = caseloadVisits(t, day);
    existingCount += visits.length;
    existing += visits.reduce((sum, v) => sum + (v.end - v.start), 0);
  }
  const bookedMinutes = booked.reduce(
    (sum, a) => sum + (a.end.getTime() - a.start.getTime()) / 60_000,
    0,
  );
  const inPerson = existingCount + booked.filter((a) => a.modality !== "Telehealth").length;
  const travel = inPerson * s.coverage.bufferMinutes * 2;
  const admin = Math.round(contracted * 0.1);
  const workable = contracted - leave;
  const committed = existing + bookedMinutes + travel + admin;
  const lines: CapacityLine[] = [
    {
      label: "Contracted working hours",
      hours: hours(contracted),
      source: "Weekly availability pattern",
    },
    { label: "Leave", hours: -hours(leave), source: "Approved time off in the period" },
    {
      label: "Existing caseload visits",
      hours: -hours(existing),
      source: `${existingCount} visits from the practice system`,
    },
    {
      label: "Booked through Medisense",
      hours: -hours(bookedMinutes),
      source: `${booked.length} confirmed or held visits`,
    },
    {
      label: "Travel buffers",
      hours: -hours(travel),
      source: `${inPerson} in-person visits × ${s.coverage.bufferMinutes} min before and after; telehealth has none`,
    },
    {
      label: "Reserved admin time",
      hours: -hours(admin),
      source: "Notes, reports and supervision: 10% of contracted hours",
    },
  ];
  const pendingNotes = await appointments.countDocuments({
    therapistId: t._id,
    status: "completed",
    $or: [
      { note: null },
      { note: { $exists: false } },
      { "note.status": { $in: ["Draft", "Pending Signature"] } },
    ],
  });
  return {
    period: `${start.toISOString().slice(0, 10)} to ${addDays(start, 6).toISOString().slice(0, 10)}`,
    lines,
    contracted: hours(contracted),
    committed: hours(committed),
    available: hours(Math.max(0, workable - committed)),
    utilisation: workable > 0 ? Math.round((committed / workable) * 100) : 0,
    activePatients: t.activeClients,
    pendingNotes,
    over: committed > workable,
  };
}

const isClinical = (u: UserDoc) =>
  Boolean(u.staffRoles?.some((r) => r === "Clinical Lead" || r === "Super Admin"));

async function loadStaff(id: ObjectId) {
  const { therapists, db } = await collections();
  const t = await therapists.findOne({ _id: id });
  if (!t) throw new UserFacingError("Staff member not found.", 404);
  return ensureStaff(db, t);
}

export async function staffRecord(id: ObjectId, viewer: UserDoc): Promise<StaffRecordDto> {
  const { users, therapists, audit } = await collections();
  const t = await loadStaff(id);
  const s = t.staff!;
  const on = today();
  const { appointments, clients } = await collections();
  const [account, team, log, capacity, upcoming, supervised] = await Promise.all([
    users.findOne({ _id: t.userId }),
    therapists
      .find({ _id: { $ne: id }, active: { $ne: false } }, { projection: { name: 1, seniority: 1 } })
      .sort({ name: 1 })
      .toArray(),
    audit
      .find({ $or: [{ therapistId: id }, { actorId: t.userId }] })
      .sort({ at: -1 })
      .limit(60)
      .toArray(),
    capacityOf(t),
    appointments
      .find({
        therapistId: id,
        status: { $in: ["booked", "tentative"] },
        start: { $gte: new Date() },
      })
      .sort({ start: 1 })
      .toArray(),
    therapists.find({ "staff.profile.supervisorId": id.toHexString() }).toArray(),
  ]);
  const blocked = staffBlocks(t, null, null, on);
  const names = new Map(
    (
      await clients
        .find({ _id: { $in: upcoming.map((v) => v.clientId) } }, { projection: { name: 1 } })
        .toArray()
    ).map((c) => [c._id.toHexString(), c.name]),
  );
  const affected = upcoming.flatMap((v) => {
    const reason = isAway(t, brisbaneDay(v.start))
      ? "On leave that day"
      : blocked.length
        ? blocked[0]!
        : null;
    return reason
      ? [
          {
            id: v._id.toHexString(),
            ref: v.ref ?? "Visit",
            start: v.start.toISOString(),
            patient: names.get(v.clientId.toHexString()) ?? "Patient",
            reason,
          },
        ]
      : [];
  });
  const credentials = s.credentials.map((c) => {
    const status = credentialState(c, on);
    return {
      ...c,
      status,
      reviewedAt: c.reviewedAt?.toISOString() ?? null,
      daysLeft: c.expiry
        ? Math.round(
            (new Date(`${c.expiry}T00:00:00Z`).getTime() - new Date(`${on}T00:00:00Z`).getTime()) /
              DAY_MS,
          )
        : null,
    };
  });
  const warnings = [
    ...credentials
      .filter((c) => c.status === "Verified" && c.daysLeft !== null && c.daysLeft <= 30)
      .map((c) => `${c.name} expires in ${c.daysLeft} days`),
    ...(capacity.over ? ["Committed hours are above available hours this week"] : []),
  ];
  return {
    id: t._id.toHexString(),
    photoUrl: photoUrl("therapist", t._id, t.photoAt),
    staffId: s.staffId,
    name: t.name,
    email: account?.email ?? "",
    phone: account?.phone ?? null,
    discipline: t.discipline,
    region: t.region,
    seniority: t.seniority,
    status: s.status,
    statusNote: s.statusNote ? { ...s.statusNote, at: s.statusNote.at.toISOString() } : null,
    profile: {
      ...s.profile,
      supervisorName:
        team.find((x) => x._id.toHexString() === s.profile.supervisorId)?.name ?? null,
    },
    coverage: { ...s.coverage, region: t.region },
    credentials,
    competencies: s.competencies.map((c) => ({
      ...c,
      kind: supportCatalogue.find((x) => x.name === c.support)?.kind ?? "treatment",
      reviewedAt: c.reviewedAt?.toISOString() ?? null,
    })),
    blocks: staffBlocks(t, null, null, on),
    warnings,
    capacity,
    supervisors: team
      .filter((x) => x.seniority === "Senior")
      .map((x) => ({ id: x._id.toHexString(), name: x.name })),
    canVerify: isClinical(viewer),
    affected,
    supervisees: supervised.map((x) => ({
      id: x._id.toHexString(),
      name: x.name,
      discipline: x.discipline,
      status: x.staff?.status ?? "Active",
      dueSoon: (x.staff?.credentials ?? []).filter((c) => {
        if (!c.expiry) return false;
        const days = (Date.parse(c.expiry) - Date.parse(on)) / DAY_MS;
        return days <= 30;
      }).length,
    })),
    activity: log.map((e) => ({
      id: e._id.toHexString(),
      action: e.action,
      actor: e.actorName,
      at: e.at.toISOString(),
    })),
  };
}

export const staffActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("profile"), profile: staffProfileSchema }),
  z.object({ type: z.literal("coverage"), coverage: coverageSchema }),
  z.object({
    type: z.literal("status"),
    to: z.enum(engagementStatuses),
    reason: z.string().trim().min(3, "Give a reason").max(500),
  }),
  z.object({ type: z.literal("credential-add"), credential: credentialSchema }),
  z.object({
    type: z.literal("credential-review"),
    id: z.string(),
    decision: z.enum(["Verified", "Rejected", "Under Review"]),
    note: z.string().trim().max(300).default(""),
  }),
  z.object({
    type: z.literal("competency"),
    support: z.string().max(80),
    status: z.enum(competencyStatuses),
    note: z.string().trim().max(300).default(""),
    supervisionRequired: z.boolean(),
  }),
]);
export type StaffAction = z.infer<typeof staffActionSchema>;

/** Staff record changes. Verifying credentials and approving services needs a Clinical Lead. */
export async function staffAction(admin: UserDoc, id: ObjectId, action: StaffAction) {
  const { therapists, users, sessions, audit } = await collections();
  const t = await loadStaff(id);
  const s = t.staff!;
  const now = new Date();
  const log = (text: string) =>
    audit.insertOne({
      _id: new ObjectId(),
      actorId: admin._id,
      actorName: admin.name,
      action: text,
      clientId: null,
      therapistId: id,
      at: now,
    });
  const result: { warning?: string } = {};

  switch (action.type) {
    case "profile": {
      const p = action.profile;
      if (p.endDate && p.endDate < p.startDate)
        throw new UserFacingError("The end date must be after the start date.");
      if (p.supervisorId === id.toHexString())
        throw new UserFacingError("Someone can't supervise themselves.");
      const changed = (Object.keys(p) as (keyof typeof p)[]).filter(
        (k) => JSON.stringify(p[k]) !== JSON.stringify(s.profile[k]),
      );
      if (!changed.length) throw new UserFacingError("Nothing has changed.");
      await therapists.updateOne({ _id: id }, { $set: { "staff.profile": p } });
      await log(`Updated staff profile: ${changed.join(", ")}`);
      break;
    }
    case "coverage": {
      await therapists.updateOne({ _id: id }, { $set: { "staff.coverage": action.coverage } });
      await log(
        `Coverage: ${action.coverage.postcodes.length || "region-wide"} postcodes, ${action.coverage.travelWillingness.toLowerCase()}, ${action.coverage.bufferMinutes} min travel buffer, up to ${action.coverage.maxPerDay} visits a day`,
      );
      break;
    }
    case "status": {
      if (action.to === s.status) throw new UserFacingError(`Already ${s.status.toLowerCase()}.`);
      const loginOff = ["Inactive", "Archived"].includes(action.to);
      await therapists.updateOne(
        { _id: id },
        {
          $set: {
            "staff.status": action.to,
            "staff.statusNote": {
              status: action.to,
              reason: action.reason,
              byName: admin.name,
              at: now,
            },
            active: !loginOff,
          },
        },
      );
      await users.updateOne({ _id: t.userId }, { $set: { disabled: loginOff } });
      if (loginOff) await sessions.deleteMany({ userId: t.userId });
      await log(`Status ${s.status} → ${action.to}: ${action.reason}`);
      if (action.to !== "Active" && t.activeClients > 0) {
        result.warning = `${t.name} has ${t.activeClients} current patients. They won't be offered new ones; review their caseload and hand over where needed.`;
      }
      break;
    }
    case "credential-add": {
      const c = action.credential;
      if (c.start && c.expiry && c.expiry < c.start)
        throw new UserFacingError("The expiry must be after the start date.");
      await therapists.updateOne(
        { _id: id },
        {
          $push: {
            "staff.credentials": {
              ...c,
              id: randomUUID(),
              status: c.evidence ? "Awaiting Review" : "Not Submitted",
              reviewedBy: null,
              reviewedAt: null,
              note: "",
            },
          },
        },
      );
      await log(
        `Added credential ${c.name}${c.evidence ? " with evidence, awaiting review" : " without evidence"}`,
      );
      break;
    }
    case "credential-review": {
      if (!isClinical(admin))
        throw new UserFacingError("Only a Clinical Lead can verify credentials.", 409);
      const c = s.credentials.find((x) => x.id === action.id);
      if (!c) throw new UserFacingError("Credential not found.", 404);
      if (action.decision === "Verified" && !c.evidence) {
        throw new UserFacingError("There's no evidence on file to verify.");
      }
      if (action.decision === "Rejected" && !action.note)
        throw new UserFacingError("Say why it's rejected.");
      await therapists.updateOne(
        { _id: id, "staff.credentials.id": action.id },
        {
          $set: {
            "staff.credentials.$.status": action.decision,
            "staff.credentials.$.reviewedBy": admin.name,
            "staff.credentials.$.reviewedAt": now,
            "staff.credentials.$.note": action.note,
          },
        },
      );
      await log(
        `${c.name}: ${c.status} → ${action.decision}${action.note ? ` (${action.note})` : ""}`,
      );
      break;
    }
    case "competency": {
      if (!isClinical(admin))
        throw new UserFacingError("Only a Clinical Lead can approve service eligibility.", 409);
      const c = s.competencies.find((x) => x.support === action.support);
      if (!c) throw new UserFacingError("That service isn't in their discipline.", 404);
      await therapists.updateOne(
        { _id: id, "staff.competencies.support": action.support },
        {
          $set: {
            "staff.competencies.$.status": action.status,
            "staff.competencies.$.reviewedBy": admin.name,
            "staff.competencies.$.reviewedAt": now,
            "staff.competencies.$.note": action.note,
            "staff.competencies.$.supervisionRequired": action.supervisionRequired,
          },
        },
      );
      await log(
        `${action.support}: ${c.status} → ${action.status}${action.note ? ` (${action.note})` : ""}`,
      );
      break;
    }
  }
  await publish(await adminIds(), "care", {});
  return result;
}

/** An operational summary of staff: no contact details, evidence files or clinical content (AC-29). */
export async function exportStaff(admin: UserDoc) {
  const { therapists, db, audit } = await collections();
  const rows = await Promise.all(
    (await therapists.find().sort({ name: 1 }).toArray()).map((t) => ensureStaff(db, t)),
  );
  const on = today();
  const header = [
    "Staff ID",
    "Name",
    "Discipline",
    "Region",
    "Status",
    "Approved services",
    "Required credentials current",
    "Active patients",
  ];
  const lines = rows.map((t) => {
    const s = t.staff!;
    const required = s.credentials.filter((c) => c.required);
    return [
      s.staffId,
      t.name,
      t.discipline,
      t.region,
      s.status,
      s.competencies
        .filter((c) => c.status === "Approved")
        .map((c) => c.support)
        .join("; "),
      required.every((c) => credentialState(c, on) === "Verified") ? "Yes" : "No",
      t.activeClients,
    ]
      .map(csvCell)
      .join(",");
  });
  await audit.insertOne({
    _id: new ObjectId(),
    actorId: admin._id,
    actorName: admin.name,
    action: `Exported the staff summary (${rows.length} rows, operational columns only)`,
    clientId: null,
    at: new Date(),
  });
  return [header.map(csvCell).join(","), ...lines].join("\n");
}

/** A therapist's own record: they can add credentials for review, never verify them (AC-23). */
export async function myStaffRecord(user: UserDoc) {
  if (!user.therapistId)
    throw new UserFacingError("Only therapists have a staff record here.", 409);
  return staffRecord(user.therapistId, user);
}

export const myCredentialSchema = z.object({ credential: credentialSchema });

export async function submitMyCredential(user: UserDoc, input: z.infer<typeof myCredentialSchema>) {
  if (!user.therapistId)
    throw new UserFacingError("Only therapists can submit credentials here.", 409);
  const { therapists, audit } = await collections();
  const c = input.credential;
  await loadStaff(user.therapistId);
  await therapists.updateOne(
    { _id: user.therapistId },
    {
      $push: {
        "staff.credentials": {
          ...c,
          id: randomUUID(),
          status: c.evidence ? "Awaiting Review" : "Not Submitted",
          reviewedBy: null,
          reviewedAt: null,
          note: "Submitted by the clinician",
        },
      },
    },
  );
  await audit.insertOne({
    _id: new ObjectId(),
    actorId: user._id,
    actorName: user.name,
    action: `Submitted ${c.name} for review`,
    clientId: null,
    therapistId: user.therapistId,
    at: new Date(),
  });
  await publish(await adminIds(), "care", {});
}
