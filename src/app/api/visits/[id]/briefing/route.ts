import { requireUser } from "@/server/auth";
import { briefing } from "@/server/clinical";
import { handle, parseId } from "@/server/http";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("therapist", "admin");
    return { briefing: await briefing(user, parseId((await params).id)) };
  });
}
