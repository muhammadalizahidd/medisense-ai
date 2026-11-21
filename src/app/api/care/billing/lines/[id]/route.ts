import { requireUser } from "@/server/auth";
import { lineAction, lineActionSchema } from "@/server/finance";
import { handle, parseId, readJson } from "@/server/http";

/** Billable line actions: confirm, correct, travel, rate override, hold, release, reject. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    return lineAction(user, parseId((await params).id), await readJson(request, lineActionSchema));
  });
}
