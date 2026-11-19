import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { handle, readJson } from "@/server/http";
import { createTherapist, listTherapists, newTherapistSchema } from "@/server/therapists";

export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => {
      await requireUser("admin");
      return { therapists: await listTherapists() };
    }),
  );
}

export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireUser("admin");
    return createTherapist(admin, await readJson(request, newTherapistSchema));
  });
}
