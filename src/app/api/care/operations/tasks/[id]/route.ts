import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { taskAction, taskActionSchema, taskDetail } from "@/server/operations";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    return taskDetail(user, parseId((await params).id));
  });
}

const bodySchema = z.object({ version: z.number().int().min(1), action: taskActionSchema });

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    const body = await readJson(request, bodySchema);
    return taskAction(user, parseId((await params).id), body.version, body.action);
  });
}
