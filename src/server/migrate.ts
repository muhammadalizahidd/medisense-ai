import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import {
  fundingStreams,
  referralReferenceFor,
  supportCatalogue,
  type Support,
} from "@/lib/live/catalogue";
import { serverLog } from "./log";
import { mrnAccess, mrnHash, nextMrn } from "./mrn";
import type {
  AssignmentDoc,
  ClientDoc,
  ReferralDoc,
  TherapistCredentials,
  TherapistDoc,
  UserDoc,
} from "./models";
import { ensureBuiltInRoles } from "./roles-seed";
import { ensureSingleSuperAdmin } from "./super-admin-seed";
import { seedAdmins, staffPasswordHash } from "./seed";

/** The support a discipline-only service request from before referrals most likely was. */
const supportFor = (discipline: string): Support =>
  supportCatalogue.find((s) => s.discipline === discipline && s.kind === "treatment")?.name ??
  "Other";

/** Fictional registration details. Seniors hold every assessment scope for their discipline. */
export function credentialsFor(
  t: Pick<TherapistDoc, "discipline" | "seniority" | "slug">,
  i: number,
  lapsed: boolean,
): TherapistCredentials {
  const prefix: Record<string, string> = {
    "Occupational Therapy": "OCC",
    "Speech Pathology": "SPA",
    Physiotherapy: "PHY",
    "Exercise Physiology": "AEP",
    Psychology: "PSY",
    "Trauma Therapy": "PSY",
    Dietetics: "APD",
    Podiatry: "POD",
    Nursing: "NMW",
  };
  const assessments = supportCatalogue
    .filter((s) => s.discipline === t.discipline && s.kind === "assessment")
    .map((s) => s.name);
  return {
    registration: `${prefix[t.discipline] ?? "REG"}000${String(1000 + i * 37).slice(-4)}`,
    registrationExpiry: lapsed ? "2026-10-31" : "2027-11-30",
    screeningExpiry: "2029-03-31",
    assessmentScopes:
      t.seniority === "Senior" || i % 2 === 0 ? assessments : assessments.slice(0, 1),
  };
}

/**
 * Brings records from earlier versions up to the current model. Every step is idempotent, so it
 * runs safely on each start.
 */
export async function migrate(db: Db) {
  await ensureBuiltInRoles(db);
  const users = db.collection<UserDoc>("users");
  for (const admin of seedAdmins) {
    await users.updateOne(
      { email: admin.email, staffRoles: { $exists: false } },
      { $set: { staffRoles: admin.staffRoles } },
    );
  }
  // Module 07: invoice statuses renamed to the specification's names.
  const invoices = db.collection("invoices");
  for (const [from, to] of [
    ["Ready for Review", "Pending Approval"],
    ["Partially Paid", "Part-Paid"],
    ["Adjusted", "Issued"],
  ]) {
    await invoices.updateMany({ status: from }, { $set: { status: to } });
  }
  // Admin accounts added to the seed later (Sam Rivera, Module 06) are created once.
  for (const admin of seedAdmins) {
    if (await users.findOne({ email: admin.email }, { projection: { _id: 1 } })) continue;
    const passwordHash = await staffPasswordHash();
    if (!passwordHash) continue;
    await users.insertOne({
      _id: new ObjectId(),
      ...admin,
      role: "admin",
      passwordHash,
      invite: null,
      therapistId: null,
      clientId: null,
      createdAt: new Date(),
    });
    serverLog(`Added demo admin ${admin.name}.`);
  }

  // One Super Admin for the whole platform, whatever earlier versions allowed.
  await ensureSingleSuperAdmin(db);

  const clients = db.collection<ClientDoc>("clients");
  let changed = 0;
  for (const client of await clients.find().toArray()) {
    const needsUpgrade = client.needs.some((n) => !n.id || !n.support);
    const funding = (fundingStreams as readonly string[]).includes(client.funding)
      ? client.funding
      : "Other";
    if (!needsUpgrade && funding === client.funding) continue;
    await clients.updateOne(
      { _id: client._id },
      {
        $set: {
          funding,
          needs: client.needs.map((n) => ({
            ...n,
            id: n.id ?? randomUUID(),
            support: n.support ?? supportFor(n.discipline),
            location: n.location ?? "Home",
          })),
        },
      },
    );
    changed += 1;
  }
  if (changed) serverLog(`Upgraded ${changed} patient records to service requests.`);

  const therapists = db.collection<TherapistDoc>("therapists");
  const all = await therapists
    .find({ credentials: { $exists: false } })
    .sort({ slug: 1 })
    .toArray();
  // One non-senior OT has a lapsed registration, so matching shows an unavailable clinician (E2E-05).
  const lapsedOt = (
    await therapists
      .find({ discipline: "Occupational Therapy", seniority: { $ne: "Senior" } })
      .sort({ slug: 1 })
      .limit(1)
      .toArray()
  )[0]?.slug;
  for (const [i, t] of all.entries()) {
    await therapists.updateOne(
      { _id: t._id },
      { $set: { credentials: credentialsFor(t, i, t.slug === lapsedOt) } },
    );
  }

  // Requests made before service requests had ids point at the patient's need for that discipline.
  const assignments = db.collection<AssignmentDoc>("assignments");
  for (const a of await assignments.find({ needId: { $exists: false } }).toArray()) {
    const client = await clients.findOne({ _id: a.clientId });
    const need = client?.needs.find((n) => n.discipline === a.discipline);
    if (need) await assignments.updateOne({ _id: a._id }, { $set: { needId: need.id } });
  }

  await upgradeToMrn(db);
}

/**
 * Medical record numbers (MRN-DDMMYYYY-0001) for patients and referrals from before them. The
 * patient signs in with their MRN; a referral's reference becomes REF- followed by it. Also the
 * renamed support and the funding-periods answer from the referral form's exact wording.
 */
async function upgradeToMrn(db: Db) {
  const clients = db.collection<ClientDoc>("clients");
  const users = db.collection<UserDoc>("users");
  const referrals = db.collection<ReferralDoc>("referrals");
  let changed = 0;

  for (const client of await clients
    .find({ mrn: { $exists: false } })
    .sort({ createdAt: 1 })
    .toArray()) {
    const mrn = await nextMrn(db, client.createdAt);
    await clients.updateOne({ _id: client._id }, { $set: { mrn } });
    await users.updateOne(
      { _id: client.userId },
      { $set: { invite: { codeHash: mrnHash(mrn), ...mrnAccess() } } },
    );
    changed += 1;
  }

  for (const r of await referrals
    .find({ mrn: { $exists: false } })
    .sort({ createdAt: 1 })
    .toArray()) {
    const client = r.clientId ? await clients.findOne({ _id: r.clientId }) : null;
    const mrn = client?.mrn ?? (await nextMrn(db, r.createdAt));
    // A patient with several referrals: REF-MRN-…, then REF-MRN-…-2, -3.
    let reference = referralReferenceFor(mrn);
    for (let n = 2; await referrals.findOne({ reference, _id: { $ne: r._id } }); n += 1) {
      reference = `${referralReferenceFor(mrn)}-${n}`;
    }
    await referrals.updateOne(
      { _id: r._id },
      {
        $set: {
          mrn,
          reference,
          ...(r.status !== "Accepted"
            ? { access: { codeHash: mrnHash(mrn), ...mrnAccess() } }
            : {}),
        },
      },
    );
    changed += 1;
  }

  const renamed = { from: "Home Modification Assessment", to: "Home Mod Assessment" };
  await clients.updateMany(
    { "needs.support": renamed.from },
    { $set: { "needs.$[n].support": renamed.to } },
    { arrayFilters: [{ "n.support": renamed.from }] },
  );
  await referrals.updateMany(
    { "data.supports.support": renamed.from },
    { $set: { "data.supports.$[s].support": renamed.to } },
    { arrayFilters: [{ "s.support": renamed.from }] },
  );
  await referrals.updateMany(
    { "data.funding.fundingPeriods": "Unknown" },
    { $set: { "data.funding.fundingPeriods": "Unsure" } },
  );
  if (changed) serverLog(`Gave ${changed} patient and referral records an MRN.`);
}
