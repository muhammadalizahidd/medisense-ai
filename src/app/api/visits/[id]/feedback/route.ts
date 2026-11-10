import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { feedbackSchema, leaveFeedback } from "@/server/visits";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("client");
    await leaveFeedback(user, parseId((await params).id), await readJson(request, feedbackSchema));
    return { ok: true };
  });
}
