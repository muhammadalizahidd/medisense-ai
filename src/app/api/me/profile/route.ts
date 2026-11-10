import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { sessionUser } from "@/server/session-user";
import { myTherapistDetail, profileSchema, saveProfile } from "@/server/therapists";

export async function GET() {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    return {
      user: { ...sessionUser(user), phone: user.phone ?? null },
      therapist: user.role === "therapist" ? await myTherapistDetail(user) : null,
    };
  });
}

export async function PUT(request: Request) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    await saveProfile(user, await readJson(request, profileSchema));
    return { ok: true };
  });
}
