import { requestDecisionSchema } from "@/lib/live/portal";
import { requireUser } from "@/server/auth";
import { mustCan } from "@/server/permissions";
import { handle, readJson } from "@/server/http";
import { decideRequest, patientRequests } from "@/server/portal";
import { ensurePortalSeed } from "@/server/portal-seed";

/** Staff review of identity and health-record corrections patients asked for. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser("admin");
    mustCan(user, "patient-requests.process");
    await ensurePortalSeed();
    return { requests: await patientRequests(user) };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("admin");
    mustCan(user, "patient-requests.process");
    const body = await readJson(request, requestDecisionSchema);
    return decideRequest(user, body.id, body.decision, body.reason);
  });
}
