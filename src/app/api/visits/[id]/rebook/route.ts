import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { rebookSchema, rebookVisit } from "@/server/visits";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    await rebookVisit(user, parseId((await params).id), await readJson(request, rebookSchema));
    return { ok: true };
  });
}
