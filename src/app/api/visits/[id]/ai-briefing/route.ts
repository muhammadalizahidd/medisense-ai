import { requireUser } from "@/server/auth";
import { aiBriefing } from "@/server/clinical";
import { handle, parseId } from "@/server/http";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("therapist");
    return aiBriefing(user, parseId((await params).id));
  });
}
