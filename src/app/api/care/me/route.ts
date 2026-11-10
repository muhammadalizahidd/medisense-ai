import { requireUser } from "@/server/auth";
import { clientHome } from "@/server/care-client";
import { patientProfileSchema, savePatientProfile } from "@/server/discharge";
import { handle, readJson } from "@/server/http";

export async function GET() {
  return handle(async () => clientHome(await requireUser("client")));
}

export async function PUT(request: Request) {
  return handle(async () => {
    const user = await requireUser("client");
    await savePatientProfile(user, await readJson(request, patientProfileSchema));
    return { ok: true };
  });
}
