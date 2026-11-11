import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { modalitySchema, setModality } from "@/server/visits";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("therapist", "admin");
    await setModality(user, parseId((await params).id), await readJson(request, modalitySchema));
    return { ok: true };
  });
}
