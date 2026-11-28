import { earningsFilterSchema } from "@/lib/live/pay";
import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { myEarnings } from "@/server/pay";

/**
 * A therapist's own earnings: their fee per visit and their totals. Always their own visits,
 * whatever the query says; never what was charged, who pays, or any invoice or claim.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    const q = new URL(request.url).searchParams;
    const filter = earningsFilterSchema.omit({ therapist: true }).parse({
      from: q.get("from") || undefined,
      to: q.get("to") || undefined,
      service: q.get("service") || undefined,
    });
    return myEarnings(user, filter);
  });
}
