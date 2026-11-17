import { requireUser } from "@/server/auth";
import { handle, readJson, UserFacingError } from "@/server/http";
import { insightAction, insightActionSchema } from "@/server/report-actions";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin");
    const id = decodeURIComponent((await params).id);
    if (!/^[\w:.\-]{3,120}$/.test(id)) throw new UserFacingError("Insight not found.", 404);
    return insightAction(user, id, await readJson(request, insightActionSchema));
  });
}
