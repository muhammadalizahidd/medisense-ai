import "server-only";
import { randomInt } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { type StaffRole } from "@/lib/live/catalogue";
import type { UserAccountDto, UserControlDto, UserKind, UserStatus } from "@/lib/live/types";
import { AuthError, hashPassword, SESSION_DAYS } from "./auth";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { adminIds, audit, publish } from "./live";
import type { UserDoc } from "./models";
import { assignableRoles } from "./roles";
import { setTherapistActive } from "./therapists";

/*
 * User control: the Super Admin creates office staff accounts, sets what each person is responsible
 * for (which decides the menus and pages they get), resets passwords and deactivates people who
 * leave. Therapists are added through Add therapist, which also takes their credentials.
 *
 * There is exactly one Super Admin. It is never handed out as a responsibility: it only moves
 * through a transfer (super-admin.ts), and the account that holds it cannot be deactivated.
 */

const SUPER: StaffRole = "Super Admin";
export const isSuper = (u: UserDoc) => u.role === "admin" && (u.staffRoles ?? []).includes(SUPER);

/** Only a Super Admin manages accounts; the page is hidden from everyone else as well. */
export function requireSuperAdmin(u: UserDoc) {
  if (!isSuper(u)) throw new AuthError(403);
}

const temporaryPassword = () => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 14 }, () => alphabet[randomInt(alphabet.length)]).join("");
};

const kindOf = (u: UserDoc): UserKind => (u.role === "admin" ? "Office staff" : "Therapist");

const statusOf = (u: UserDoc, lastSignIn: Date | null): UserStatus =>
  u.disabled
    ? "Deactivated"
    : u.mustChangePassword
      ? "Must set password"
      : lastSignIn
        ? "Active"
        : "Never signed in";

export async function listUsers(me: UserDoc): Promise<UserControlDto> {
  requireSuperAdmin(me);
  const { users, sessions } = await collections();
  // Sign-ins before lastSignInAt was recorded still show: a session starts SESSION_DAYS before
  // it expires.
  const started = new Map(
    (
      await sessions
        .aggregate<{ _id: ObjectId; expiresAt: Date }>([
          { $group: { _id: "$userId", expiresAt: { $max: "$expiresAt" } } },
        ])
        .toArray()
    ).map((r) => [
      r._id.toHexString(),
      new Date(r.expiresAt.getTime() - SESSION_DAYS * 86_400_000),
    ]),
  );
  const lastOf = (u: UserDoc) => u.lastSignInAt ?? started.get(u._id.toHexString()) ?? null;
  const all = (await users
    .find(
      // Staff logins only: patients and families sign in by MRN and are managed from their record.
      { role: { $ne: "client" } },
      { projection: { passwordHash: 0, invite: 0, appearance: 0, workspacePrefs: 0 } },
    )
    .toArray()) as UserDoc[];
  const names = new Map(all.map((u) => [u._id.toHexString(), u.name]));
  const order: Record<UserKind, number> = { "Office staff": 0, Therapist: 1 };
  const rows: UserAccountDto[] = all
    .map((u) => ({
      id: u._id.toHexString(),
      name: u.name,
      email: u.email,
      phone: u.phone ?? null,
      kind: kindOf(u),
      staffRoles: u.staffRoles ?? [],
      status: statusOf(u, lastOf(u)),
      lastSignInAt: lastOf(u)?.toISOString() ?? null,
      // Some seeded accounts predate createdAt; the id still records when they were made.
      createdAt: (u.createdAt ?? u._id.getTimestamp()).toISOString(),
      createdBy: u.createdBy ? (names.get(u.createdBy.toHexString()) ?? null) : null,
      href: u.therapistId ? `/care/therapists/${u.therapistId.toHexString()}` : null,
      isSelf: u._id.equals(me._id),
    }))
    .sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
  return {
    users: rows,
    superAdmins: all.filter((u) => isSuper(u) && !u.disabled).length,
  };
}

export const newUserSchema = z.object({
  name: z.string().trim().min(3, "Enter the full name").max(80),
  email: z.email("Enter a valid work email").transform((v) => v.toLowerCase()),
  phone: z.string().trim().max(30).default(""),
  staffRoles: z
    .array(z.string().trim().min(1).max(60))
    .min(1, "Choose at least one responsibility"),
});

/** A new office staff account with a temporary password, shown once to the Super Admin. */
export async function createUser(me: UserDoc, input: z.infer<typeof newUserSchema>) {
  requireSuperAdmin(me);
  const { users } = await collections();
  if (await users.findOne({ email: input.email })) {
    throw new UserFacingError("An account already uses this email.", 409);
  }
  const temporary = temporaryPassword();
  const chosen = await assignableRoles(input.staffRoles);
  const roles = chosen.map((r) => r.key);
  const id = new ObjectId();
  await users.insertOne({
    _id: id,
    email: input.email,
    name: input.name,
    role: "admin",
    passwordHash: await hashPassword(temporary),
    invite: null,
    therapistId: null,
    clientId: null,
    phone: input.phone || null,
    staffRoles: roles,
    mustChangePassword: true,
    lastSignInAt: null,
    createdBy: me._id,
    createdAt: new Date(),
  });
  await audit(
    me,
    `Created a user account for ${input.name} (${chosen.map((r) => r.name).join(", ")})`,
    null,
  );
  await publish(await adminIds(), "care", {});
  return { id: id.toHexString(), email: input.email, temporaryPassword: temporary };
}

async function target(id: ObjectId) {
  const { users } = await collections();
  const u = await users.findOne({ _id: id });
  if (!u) throw new UserFacingError("User not found.", 404);
  return u;
}

export const rolesSchema = z.object({
  staffRoles: z
    .array(z.string().trim().min(1).max(60))
    .min(1, "Choose at least one responsibility"),
});

export async function updateRoles(me: UserDoc, id: ObjectId, input: z.infer<typeof rolesSchema>) {
  requireSuperAdmin(me);
  const u = await target(id);
  if (u.role !== "admin") {
    throw new UserFacingError("Responsibilities apply to office staff accounts only.");
  }
  // The Super Admin holds that role permanently: it can't be given or taken away here.
  const chosen = await assignableRoles(input.staffRoles);
  const roles = chosen.map((r) => r.key);
  const stored = isSuper(u) ? [SUPER, ...roles] : roles;
  const { users } = await collections();
  // Menus and pages follow the new responsibilities on their next page load; no sign-out needed.
  await users.updateOne({ _id: id }, { $set: { staffRoles: stored } });
  await audit(
    me,
    `Changed ${u.name}'s responsibilities to ${chosen.map((r) => r.name).join(", ")}`,
    null,
  );
  await publish(await adminIds(), "care", {});
}

export async function resetUserPassword(me: UserDoc, id: ObjectId) {
  requireSuperAdmin(me);
  const u = await target(id);
  if (u.role === "client") {
    throw new UserFacingError("Patients and families sign in with their MRN, not a password.");
  }
  if (u._id.equals(me._id)) throw new UserFacingError("Change your own password in My profile.");
  const temporary = temporaryPassword();
  const { users, sessions } = await collections();
  await users.updateOne(
    { _id: id },
    { $set: { passwordHash: await hashPassword(temporary), mustChangePassword: true } },
  );
  await sessions.deleteMany({ userId: id });
  await audit(me, `Reset the password for ${u.name}`, null);
  await publish(await adminIds(), "care", {});
  return { temporaryPassword: temporary };
}

export async function setUserActive(me: UserDoc, id: ObjectId, active: boolean) {
  requireSuperAdmin(me);
  const u = await target(id);
  if (isSuper(u)) {
    throw new UserFacingError(
      "The Super Admin can't be deactivated. Transfer the role to someone else first.",
    );
  }
  if (u._id.equals(me._id)) throw new UserFacingError("You can't deactivate your own account.");
  if (u.role === "client") {
    throw new UserFacingError("Patient access is managed from their patient record.");
  }
  if (u.role === "therapist" && u.therapistId) {
    // Therapists also leave matching and new bookings, exactly as from their staff record.
    await setTherapistActive(me, u.therapistId, active);
    return;
  }
  const { users, sessions } = await collections();
  await users.updateOne({ _id: id }, { $set: { disabled: !active } });
  if (!active) await sessions.deleteMany({ userId: id });
  await audit(me, `${active ? "Reactivated" : "Deactivated"} the account for ${u.name}`, null);
  await publish(await adminIds(), "care", {});
}
