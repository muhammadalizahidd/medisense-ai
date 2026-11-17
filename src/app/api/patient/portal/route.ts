import { portalActionSchema } from "@/lib/live/portal";
import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { portalAction, portalView } from "@/server/portal";
import { ensurePortalSeed } from "@/server/portal-seed";

/** Modules 18–22: the patient's own app. Only released, patient-safe content is returned. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser("client");
    await ensurePortalSeed();
    return portalView(user);
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("client");
    return portalAction(user, await readJson(request, portalActionSchema));
  });
}
