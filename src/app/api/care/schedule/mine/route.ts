import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { handle, readJson } from "@/server/http";
import { clinicianChange, clinicianChangeSchema, mySchedule } from "@/server/scheduling";

/** The signed-in clinician's agenda. */
export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => mySchedule(await requireUser("therapist"))),
  );
}

/** The clinician asks scheduling to change one of their visits. */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    await clinicianChange(user, await readJson(request, clinicianChangeSchema));
    return { ok: true };
  });
}
