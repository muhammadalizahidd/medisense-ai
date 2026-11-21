import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { therapistHome } from "@/server/care-therapist";
import { handle } from "@/server/http";

export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => therapistHome(await requireUser("therapist"))),
  );
}
