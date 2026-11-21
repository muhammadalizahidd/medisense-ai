import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { viewAction, viewActionSchema } from "@/server/report-actions";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    return viewAction(user, parseId((await params).id), await readJson(request, viewActionSchema));
  });
}
