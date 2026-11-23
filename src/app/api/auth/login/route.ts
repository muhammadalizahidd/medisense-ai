import { z } from "zod";
import { allowAttempt, checkPassword, startSession } from "@/server/auth";
import { collections } from "@/server/db";
import { handle, readJson, UserFacingError } from "@/server/http";
import { sessionUser } from "@/server/session-user";

const schema = z.object({
  email: z.string().trim().toLowerCase().min(3),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  return handle(async () => {
    const { email, password } = await readJson(request, schema);
    if (!allowAttempt(`login:${email}`)) {
      throw new UserFacingError("Too many attempts. Wait a minute and try again.");
    }
    const { users } = await collections();
    const user = await users.findOne({ email });
    if (!(await checkPassword(user, password)) || !user) {
      throw new UserFacingError("Email or password is incorrect.");
    }
    if (user.disabled) {
      throw new UserFacingError("This account has been deactivated. Contact a Medisense admin.");
    }
    await startSession(user._id);
    return { user: await sessionUser(user) };
  });
}
