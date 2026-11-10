import { requireUser } from "@/server/auth";
import { signalTyping } from "@/server/chat";
import { handle, parseId } from "@/server/http";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await signalTyping(await requireUser("therapist", "client"), parseId((await params).id));
    return { ok: true };
  });
}
