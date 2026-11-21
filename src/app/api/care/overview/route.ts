import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { handle } from "@/server/http";
import { liveOverview } from "@/server/overview";

export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => {
      await requireUser("admin");
      return liveOverview();
    }),
  );
}
