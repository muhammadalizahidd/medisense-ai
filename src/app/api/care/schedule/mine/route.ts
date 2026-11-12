import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { clinicianChange, clinicianChangeSchema, mySchedule } from "@/server/scheduling";

/** The signed-in clinician's agenda. */
export async function GET() {
  return handle(async () => mySchedule(await requireUser("therapist")));
}

/** The clinician asks scheduling to change one of their visits. */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    await clinicianChange(user, await readJson(request, clinicianChangeSchema));
    return { ok: true };
  });
}
