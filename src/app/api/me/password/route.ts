import { z } from "zod";
import { allowAttempt, checkPassword, hashPassword, requireUser } from "@/server/auth";
import { collections } from "@/server/db";
import { handle, readJson, UserFacingError } from "@/server/http";
import { audit } from "@/server/live";

const schema = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(10, "Use at least 10 characters").max(200),
});

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { current, next } = await readJson(request, schema);
    if (!allowAttempt(`password:${user._id.toHexString()}`)) {
      throw new UserFacingError("Too many attempts. Wait a minute and try again.");
    }
    if (!(await checkPassword(user, current))) {
      throw new UserFacingError("Your current password is incorrect.");
    }
    const { users, sessions } = await collections();
    if (next === current)
      throw new UserFacingError("Choose a password different from the current one.");
    await users.updateOne(
      { _id: user._id },
      { $set: { passwordHash: await hashPassword(next), mustChangePassword: false } },
    );
    await audit(
      user,
      user.mustChangePassword
        ? "Set their own password at first sign-in"
        : "Changed their password",
      null,
    );
    return {
      ok: true,
      signedOutElsewhere: (await sessions.countDocuments({ userId: user._id })) > 1,
    };
  });
}
