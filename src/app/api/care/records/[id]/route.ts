import { recordActionSchema } from "@/lib/live/records";
import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { recordAction, recordFor } from "@/server/records";
import { ensureRecordScenarios } from "@/server/records-seed";

type Params = { params: Promise<{ id: string }> };

/** Module 11: one participant's clinical record, filtered to what this person may see. */
export async function GET(_: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    await ensureRecordScenarios();
    return { record: await recordFor(user, parseId((await params).id)) };
  });
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    const action = await readJson(request, recordActionSchema);
    return recordAction(user, parseId((await params).id), action);
  });
}
