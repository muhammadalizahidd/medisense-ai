import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { availabilitySchema, myTherapistDetail, saveAvailability } from "@/server/therapists";

export async function GET() {
  return handle(async () => {
    const t = await myTherapistDetail(await requireUser("therapist"));
    return { weekly: t.weekly, timeOff: t.timeOff, availability: t.availability };
  });
}

export async function PUT(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    return saveAvailability(user, await readJson(request, availabilitySchema));
  });
}
