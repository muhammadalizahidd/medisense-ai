import { requestDecisionSchema } from "@/lib/live/portal";
import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { decideRequest, patientRequests } from "@/server/portal";
import { ensurePortalSeed } from "@/server/portal-seed";

/** Staff review of identity and health-record corrections patients asked for. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser("admin");
    await ensurePortalSeed();
    return { requests: await patientRequests(user) };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("admin");
    const body = await readJson(request, requestDecisionSchema);
    return decideRequest(user, body.id, body.decision, body.reason);
  });
}
