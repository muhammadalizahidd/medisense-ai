import { z } from "zod";
import { allowAttempt, hashPassword, inviteMatches, startSession } from "@/server/auth";
import { collections } from "@/server/db";
import { handle, readJson, UserFacingError } from "@/server/http";
import { sessionUser } from "@/server/session-user";

const schema = z.object({
  email: z.string().trim().toLowerCase().min(3),
  code: z.string().trim().min(6).max(12),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

/** A client sets their password with the invite code their care team gave them. */
export async function POST(request: Request) {
  return handle(async () => {
    const { email, code, password } = await readJson(request, schema);
    if (!allowAttempt(`activate:${email}`)) {
      throw new UserFacingError("Too many attempts. Wait a minute and try again.");
    }
    const { users } = await collections();
    const user = await users.findOne({ email, role: "client" });
    if (!user || user.passwordHash || !inviteMatches(user, code)) {
      throw new UserFacingError(
        "That email and code don't match an open invite. Ask your care team for a new code.",
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
