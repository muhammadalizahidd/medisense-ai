import { taskActionSchema } from "@/lib/live/coord";
import { requireUser } from "@/server/auth";
import { taskAction, taskDetail } from "@/server/coord";
import { handle, parseId, readJson } from "@/server/http";

type Params = { params: Promise<{ id: string }> };

/** Module 17: one task, at the level this person may see. */
export async function GET(_: Request, { params }: Params) {
  return handle(async () => ({
    task: await taskDetail(await requireUser("admin", "therapist"), parseId((await params).id)),
  }));
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    return taskAction(user, parseId((await params).id), await readJson(request, taskActionSchema));
  });
}
