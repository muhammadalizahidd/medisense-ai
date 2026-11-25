import { requireUser } from "@/server/auth";
import { markRead } from "@/server/chat";
import { handle, parseId } from "@/server/http";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await markRead(await requireUser("therapist", "client", "admin"), parseId((await params).id));
    return { ok: true };
  });
}
