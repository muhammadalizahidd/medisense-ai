import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { handle } from "@/server/http";
import { listVisits } from "@/server/visits";

export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => ({
      visits: await listVisits(await requireUser("therapist", "client")),
    })),
  );
}
