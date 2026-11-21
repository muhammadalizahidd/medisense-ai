import { requireUser } from "@/server/auth";
import { openMyAgreement } from "@/server/agreements";
import { handle, parseId, UserFacingError } from "@/server/http";

/** Opens one of the participant's own agreements through a short-lived secure link. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("client");
    if (!user.clientId) throw new UserFacingError("No participant record.", 404);
    return openMyAgreement(user.clientId, parseId((await params).id));
  });
}
