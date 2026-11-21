import { requireUser } from "@/server/auth";
import { therapistConstraints } from "@/server/agreements";
import { handle, parseId } from "@/server/http";

/** AT-29: the treating clinician sees service limits only: no payer, budget or prices. */
export async function GET(_: Request, { params }: { params: Promise<{ clientId: string }> }) {
  return handle(async () => {
    const user = await requireUser("therapist");
    return { constraints: await therapistConstraints(user, parseId((await params).clientId)) };
  });
}
