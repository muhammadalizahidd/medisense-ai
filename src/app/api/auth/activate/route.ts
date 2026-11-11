import { z } from "zod";
import { allowAttempt, hashPassword, inviteMatches, startSession } from "@/server/auth";
import { collections } from "@/server/db";
import { handle, readJson, UserFacingError } from "@/server/http";
import { referralByCode } from "@/server/referrals";
import { sessionUser } from "@/server/session-user";

const schema = z.object({
  email: z.string().trim().toLowerCase().min(3),
  code: z.string().trim().min(6).max(12),
  /** Not needed to check a referral's progress; required to activate an account. */
  password: z.string().max(200).default(""),
});

/**
 * A patient signs in for the first time with their email and code (from their referral, or from
 * the care team), choosing a password. Before the referral is accepted, the same email and code
 * show its progress instead.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const { email, code, password } = await readJson(request, schema);
    if (!allowAttempt(`activate:${email}`)) {
      throw new UserFacingError("Too many attempts. Wait a minute and try again.");
    }
    const { users } = await collections();
    const user = await users.findOne({ email, role: "client" });
    if (!user || user.passwordHash || !inviteMatches(user, code)) {
      const pending = !user ? await referralByCode(email, code) : null;
      if (pending) return { pending: true, referral: pending };
      throw new UserFacingError(
        "That email and code don't match a referral or an open invite. Check them, or ask your care team for a new code.",
      );
    }
    if (password.length < 10) {
      throw new UserFacingError(
        "Your referral is accepted. Choose a password of at least 10 characters.",
      );
    }
    await users.updateOne(
      { _id: user._id },
      { $set: { passwordHash: await hashPassword(password), invite: null } },
    );
    await startSession(user._id);
    return { user: sessionUser(user) };
  });
}
