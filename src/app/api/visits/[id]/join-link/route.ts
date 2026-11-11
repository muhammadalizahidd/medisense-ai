import { requireUser } from "@/server/auth";
import { handle, parseId } from "@/server/http";
import { patientJoinLink } from "@/server/telehealth";

/** A signed-in patient gets a fresh one-time link to their video visit. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("client");
    return patientJoinLink(user, parseId((await params).id));
  });
}
