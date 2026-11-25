import "server-only";
import { z } from "zod";
import { SUPER_ADMIN_ROLE } from "@/lib/permissions/can";
import { allowAttempt, checkPassword } from "./auth";
import { collections } from "./db";
import { UserFacingError, parseId } from "./http";
import { adminIds, audit, publish } from "./live";
import type { UserDoc } from "./models";
import { ensureSingleSuperAdmin, PLATFORM_ID } from "./super-admin-seed";
import { requireSuperAdmin } from "./user-control";

/*
 * Transfer Super Admin: hands the single platform Super Admin role to another active office-staff
 * account. The current owner confirms with their password and the new owner's name. They keep any
 * other responsibilities they hold and lose everything that came from being Super Admin.
 */

export const transferSchema = z.object({
  targetId: z.string().trim().min(1, "Choose who becomes the Super Admin"),
  password: z.string().min(1, "Enter your password").max(200),
  confirmName: z.string().trim().min(1, "Type the new Super Admin's name").max(120),
});

const squash = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();

/** Why this account can't take the role, or null when it can. */
export function transferBlocker(me: UserDoc, target: UserDoc | null): string | null {
  if (!target) return "That account was not found.";
  if (target._id.equals(me._id)) return "You already are the Super Admin.";
  if (target.role !== "admin") return "The Super Admin must be an office staff account.";
  if (target.disabled) return "That account is deactivated.";
  if (target.mustChangePassword || !target.lastSignInAt) {
    return "They need to sign in and set their own password first.";
  }
  return null;
}

export async function transferSuperAdmin(me: UserDoc, input: z.infer<typeof transferSchema>) {
  requireSuperAdmin(me);
  if (!allowAttempt(`transfer:${me._id.toHexString()}`)) {
    throw new UserFacingError("Too many attempts. Wait a minute and try again.");
  }
  if (!(await checkPassword(me, input.password))) {
    throw new UserFacingError("Your password is incorrect.");
  }
  const { users, platform, db } = await collections();
  // A database from before the single-owner model has no owner record yet: create it first.
  if (!(await platform.findOne({ _id: PLATFORM_ID }))) await ensureSingleSuperAdmin(db);
  const target = await users.findOne({ _id: parseId(input.targetId) });
  const blocker = transferBlocker(me, target);
  if (blocker || !target) throw new UserFacingError(blocker ?? "That account was not found.");
  if (squash(input.confirmName) !== squash(target.name)) {
    throw new UserFacingError("The name doesn't match. Type it exactly as shown.");
  }

  // The record changes only if it still names the caller, so two transfers can't both win.
  const moved = await platform.updateOne(
    { _id: PLATFORM_ID, superAdminId: me._id },
    { $set: { superAdminId: target._id, updatedAt: new Date() } },
  );
  if (moved.matchedCount === 0) {
    throw new UserFacingError(
      "The platform owner record doesn't match. Reload and check who the Super Admin is.",
      409,
    );
  }
  await users.updateOne(
    { _id: target._id },
    { $addToSet: { staffRoles: SUPER_ADMIN_ROLE as never } },
  );
  await users.updateOne({ _id: me._id }, { $pull: { staffRoles: SUPER_ADMIN_ROLE as never } });
  await audit(me, `Transferred the Super Admin role from ${me.name} to ${target.name}`, null);
  const everyone = await adminIds();
  await publish(everyone, "care", {});
  return { ok: true, newSuperAdmin: target.name };
}
