import { createHash } from "node:crypto";
import { z } from "zod";
import { allowAttempt, hashPassword, inviteMatches, startSession } from "@/server/auth";
import { collections } from "@/server/db";
import { handle, readJson, UserFacingError } from "@/server/http";
import { referralByCode, referralByCodeOnly } from "@/server/referrals";
import { sessionUser } from "@/server/session-user";

const schema = z.object({
  /** Optional: the code alone identifies the patient. */
  email: z.string().trim().toLowerCase().max(200).default(""),
  /** The patient's MRN (MRN-DDMMYYYY-0001), or an older 8-character code. */
  code: z.string().trim().min(6).max(24),
  /** Optional. A patient can also set a password to sign in with email later. */
  password: z.string().max(200).default(""),
});

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** How long an MRN keeps working after each sign-in with it. */
const CODE_DAYS = 365;

/**
 * A patient signs in with the code from their referral or from the care team. The code alone is
 * enough: once the referral is accepted it opens the patient app; before that it shows the
 * referral's progress. Each sign-in keeps the code working for another 90 days.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const { email, code, password } = await readJson(request, schema);
    const from = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!allowAttempt(`activate:${email || from}`)) {
      throw new UserFacingError("Too many attempts. Wait a minute and try again.");
    }
    const { users } = await collections();
    const now = new Date();

    const user = email
      ? await users.findOne({ email, role: "client" })
      : await users.findOne({
          role: "client",
          "invite.codeHash": sha256(code.toUpperCase()),
          "invite.expiresAt": { $gt: now },
        });

    if (!user || !inviteMatches(user, code)) {
      const pending = user
        ? null
        : email
          ? await referralByCode(email, code)
          : await referralByCodeOnly(code);
      if (pending) return { pending: true, referral: pending };
      throw new UserFacingError(
        "That MRN doesn't match a referral or a patient record. Check it, or ask your care team.",
      );
    }
    if (user.disabled) throw new UserFacingError("This account is closed. Ask your care team.");
    if (password && password.length < 10) {
      throw new UserFacingError("A password needs at least 10 characters, or leave it blank.");
    }

    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          ...(password ? { passwordHash: await hashPassword(password) } : {}),
          "invite.expiresAt": new Date(now.getTime() + CODE_DAYS * 86_400_000),
        },
      },
    );
    await startSession(user._id);
    return { user: await sessionUser(user) };
  });
}
