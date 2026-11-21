import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { scheduleAction, scheduleActionSchema } from "@/server/scheduling";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireUser("admin");
    const action = await readJson(request, scheduleActionSchema);
    return scheduleAction(admin, parseId((await params).id), action);
  });
}
