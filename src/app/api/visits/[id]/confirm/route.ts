import { requireUser } from "@/server/auth";
import { handle, parseId } from "@/server/http";
import { confirmVisit } from "@/server/visits";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("client");
    await confirmVisit(user, parseId((await params).id));
    return { ok: true };
  });
}
