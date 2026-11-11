import { requireUser } from "@/server/auth";
import { checkIn, checkInSchema } from "@/server/clinical";
import { handle, parseId, readJson } from "@/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("therapist");
    await checkIn(user, parseId((await params).id), await readJson(request, checkInSchema));
    return { ok: true };
  });
}
