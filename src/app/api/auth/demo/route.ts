import { z } from "zod";
import { startSession } from "@/server/auth";
import { collections } from "@/server/db";
import { handle, readJson, UserFacingError } from "@/server/http";
import { sessionUser } from "@/server/session-user";

const schema = z.object({ email: z.string().trim().toLowerCase().max(200) });

/**
 * One-click sign-in for the demo staff accounts (the team's private demo). The password never
 * reaches the browser. Set HIDE_TEST_ACCOUNTS=1 to turn this off along with the demo list.
 */
export async function POST(request: Request) {
  return handle(async () => {
    if (process.env.HIDE_TEST_ACCOUNTS === "1") throw new UserFacingError("Not found.", 404);
    const { email } = await readJson(request, schema);
    if (!email.endsWith("@medisense.test")) throw new UserFacingError("Only demo accounts.", 404);
    const { users } = await collections();
    const user = await users.findOne({ email, role: { $in: ["admin", "therapist"] } });
    if (!user || user.disabled) throw new UserFacingError("Demo account not found.", 404);
    await startSession(user._id);
    return { user: await sessionUser(user) };
  });
}
