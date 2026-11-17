import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { sessionList } from "@/server/sessions";
import { ensureSessionSeed } from "@/server/sessions-seed";

/** Module 14: therapy sessions in the four-week window, filtered to this person. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    await ensureSessionSeed();
    return { rows: await sessionList(user) };
  });
}
