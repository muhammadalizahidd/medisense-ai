import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { handle } from "@/server/http";
import { sessionList } from "@/server/sessions";
import { ensureSessionSeed } from "@/server/sessions-seed";

/** Module 14: therapy sessions in the four-week window, filtered to this person. */
export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => {
      const user = await requireUser("admin", "therapist");
      await ensureSessionSeed();
      return { rows: await sessionList(user) };
    }),
  );
}
