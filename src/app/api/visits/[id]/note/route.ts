import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { noteSchema, writeNote } from "@/server/visits";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("therapist", "admin");
    await writeNote(user, parseId((await params).id), await readJson(request, noteSchema));
    return { ok: true };
  });
}
