import { requireUser } from "@/server/auth";
import { abortVisit, abortSchema } from "@/server/clinical";
import { handle, parseId, readJson } from "@/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("therapist", "admin");
    await abortVisit(user, parseId((await params).id), await readJson(request, abortSchema));
    return { ok: true };
  });
}
