import "server-only";
import { ObjectId, type Db } from "mongodb";
import { SUPER_ADMIN_ROLE } from "@/lib/permissions/can";
import { seedAdmins } from "./seed";
import type { PlatformDoc, UserDoc } from "./models";

/** The seeded owner: Neil Hensley, the Director. */
export const SEEDED_OWNER_EMAIL =
  seedAdmins.find((a) => a.staffRoles.includes(SUPER_ADMIN_ROLE))?.email ??
  "neil.hensley@medisense.test";

export const PLATFORM_ID = "platform";

type Candidate = Pick<UserDoc, "_id" | "email" | "disabled" | "createdAt">;

export type SuperAdminPlan = {
  /** The one account that holds Super Admin, or null when there is nobody to hold it. */
  owner: ObjectId | null;
  /** Accounts that hold it now and must lose it. */
  demote: ObjectId[];
  /** True when the owner does not yet carry the marker. */
  grant: boolean;
  /** Why this account was chosen, for the audit trail. */
  reason: string;
};

const created = (u: Candidate) => (u.createdAt ?? u._id.getTimestamp()).getTime();

/**
 * Picks the single Super Admin. The recorded owner wins; otherwise the seeded owner (Neil), then
 * the earliest-created active holder. With no holder at all, the seeded owner takes it back so the
 * platform is never left without one.
 */
export function planSuperAdmin(input: {
  holders: readonly Candidate[];
  recordedOwner: ObjectId | null;
  /** Every office-staff account, to find the owner when nobody holds the role. */
  admins: readonly Candidate[];
}): SuperAdminPlan {
  const { holders, recordedOwner, admins } = input;
  const holdersById = new Map(holders.map((h) => [h._id.toHexString(), h]));
  const recorded = recordedOwner ? admins.find((a) => a._id.equals(recordedOwner)) : undefined;

  let owner: Candidate | undefined;
  let reason = "";
  if (recorded) {
    owner = recorded;
    reason = "recorded platform owner";
  } else {
    const seeded = admins.find((a) => a.email === SEEDED_OWNER_EMAIL);
    const seededHolds = seeded && holdersById.has(seeded._id.toHexString());
    if (seeded && seededHolds) {
      owner = seeded;
      reason = "seeded owner";
    } else if (holders.length > 0) {
      owner = [...holders].sort(
        (a, b) =>
          Number(Boolean(a.disabled)) - Number(Boolean(b.disabled)) || created(a) - created(b),
      )[0];
      reason = "earliest created holder";
    } else if (seeded) {
      owner = seeded;
      reason = "seeded owner restored, nobody held the role";
    }
  }
  if (!owner) return { owner: null, demote: [], grant: false, reason: "no account to hold it" };
  const ownerId = owner._id;
  return {
    owner: ownerId,
    demote: holders.filter((h) => !h._id.equals(ownerId)).map((h) => h._id),
    grant: !holdersById.has(ownerId.toHexString()),
    reason,
  };
}

/**
 * Makes sure exactly one office-staff account holds Super Admin and the platform record names it.
 * Safe on every start: with one holder and a matching record it writes nothing.
 */
export async function ensureSingleSuperAdmin(db: Db) {
  const users = db.collection<UserDoc>("users");
  const platform = db.collection<PlatformDoc>("platform");
  const projection = { _id: 1, email: 1, disabled: 1, createdAt: 1 };
  const admins = (await users.find({ role: "admin" }, { projection }).toArray()) as Candidate[];
  const holders = (await users
    .find({ role: "admin", staffRoles: SUPER_ADMIN_ROLE }, { projection })
    .toArray()) as Candidate[];
  const record = await platform.findOne({ _id: PLATFORM_ID });
  const plan = planSuperAdmin({
    holders,
    recordedOwner: record?.superAdminId ?? null,
    admins,
  });
  if (!plan.owner) return plan;

  const now = new Date();
  const audit = db.collection("audit");
  const note = async (action: string) =>
    audit.insertOne({
      _id: new ObjectId(),
      actorId: plan.owner!,
      actorName: "System",
      action,
      clientId: null,
      at: now,
    });

  if (plan.grant) {
    await users.updateOne(
      { _id: plan.owner },
      { $addToSet: { staffRoles: SUPER_ADMIN_ROLE as never } },
    );
    await note(`Made the Super Admin the single platform owner (${plan.reason})`);
  }
  for (const id of plan.demote) {
    await users.updateOne({ _id: id }, { $pull: { staffRoles: SUPER_ADMIN_ROLE as never } });
    await note(
      `Removed Super Admin from a second holder: there is now one platform Super Admin (${plan.reason})`,
    );
  }
  if (!record || !record.superAdminId.equals(plan.owner)) {
    await platform.updateOne(
      { _id: PLATFORM_ID },
      { $set: { superAdminId: plan.owner, updatedAt: now } },
      { upsert: true },
    );
  }
  return plan;
}
