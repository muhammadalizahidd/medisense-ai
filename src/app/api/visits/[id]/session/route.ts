import { requireUser } from "@/server/auth";
import { saveSession, sessionSchema } from "@/server/clinical";
import { handle, parseId, readJson } from "@/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("therapist");
    await saveSession(user, parseId((await params).id), await readJson(request, sessionSchema));
    return { ok: true };
  });
}
