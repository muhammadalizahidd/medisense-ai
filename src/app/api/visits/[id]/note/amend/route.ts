import { requireUser } from "@/server/auth";
import { amendNote, amendSchema } from "@/server/clinical";
import { handle, parseId, readJson } from "@/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("therapist");
    await amendNote(user, parseId((await params).id), await readJson(request, amendSchema));
    return { ok: true };
  });
}
