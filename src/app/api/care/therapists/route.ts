import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { createTherapist, listTherapists, newTherapistSchema } from "@/server/therapists";

export async function GET() {
  return handle(async () => {
    await requireUser("admin");
    return { therapists: await listTherapists() };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireUser("admin");
    return createTherapist(admin, await readJson(request, newTherapistSchema));
  });
}
