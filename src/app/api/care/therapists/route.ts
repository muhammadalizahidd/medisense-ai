import { requireUser } from "@/server/auth";
import { mustCan } from "@/server/permissions";
import { cached, cacheKey } from "@/server/cache";
import { handle, readJson } from "@/server/http";
import { createTherapist, listTherapists, newTherapistSchema } from "@/server/therapists";

export async function GET(request: Request) {
  return handle(async () => {
    mustCan(await requireUser("admin"), "therapists.view");
    return cached(cacheKey(request), 60_000, async () => ({ therapists: await listTherapists() }));
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireUser("admin");
    mustCan(admin, "therapists.add");
    return createTherapist(admin, await readJson(request, newTherapistSchema));
  });
}
