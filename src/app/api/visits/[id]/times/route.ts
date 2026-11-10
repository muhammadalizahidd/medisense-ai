import { requireUser } from "@/server/auth";
import { handle, parseId } from "@/server/http";
import { newTimesFor } from "@/server/visits";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => ({
    slots: await newTimesFor(await requireUser(), parseId((await params).id)),
  }));
}
