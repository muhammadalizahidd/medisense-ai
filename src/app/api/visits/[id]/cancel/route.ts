import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { cancelSchema, cancelVisit } from "@/server/visits";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    return cancelVisit(user, parseId((await params).id), await readJson(request, cancelSchema));
  });
}
