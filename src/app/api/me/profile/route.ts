import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { handle, readJson } from "@/server/http";
import { sessionUser } from "@/server/session-user";
import { myTherapistDetail, profileSchema, saveProfile } from "@/server/therapists";

export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => {
      const user = await requireUser("admin", "therapist");
      return {
        user: { ...(await sessionUser(user)), phone: user.phone ?? null },
        therapist: user.role === "therapist" ? await myTherapistDetail(user) : null,
      };
    }),
  );
}

export async function PUT(request: Request) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    await saveProfile(user, await readJson(request, profileSchema));
    return { ok: true };
  });
}
