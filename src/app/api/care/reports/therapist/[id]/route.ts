import { requireUser } from "@/server/auth";
import { handle, parseId } from "@/server/http";
import { therapistHub } from "@/server/therapist-reports";

type Params = { params: Promise<{ id: string }> };

/** One therapist's reports, for an admin who may view therapist reports (or the therapist themself). */
export async function GET(_: Request, { params }: Params) {
  return handle(async () =>
    therapistHub(await requireUser("admin", "therapist"), parseId((await params).id)),
  );
}
