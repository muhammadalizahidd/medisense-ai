import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { enhanceActionSchema } from "@/lib/live/enhance";
import { enhanceAction, patientEnhance, therapistEnhance, therapistInbox } from "@/server/enhance";
import { oversight } from "@/server/enhance-more";
import { handle, readJson } from "@/server/http";

/**
 * AI Enhancements 01–07: the patient's view, a therapist's patient view or review inbox, or the
 * admin's counts-only oversight. Reads share the one-minute cache; any change clears it.
 */
export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => {
      const user = await requireUser("client", "therapist", "admin");
      if (user.role === "admin") return oversight(user);
      const clientId = new URL(request.url).searchParams.get("clientId");
      if (user.role === "client") return patientEnhance(user);
      return clientId ? therapistEnhance(user, clientId) : therapistInbox(user);
    }),
  );
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("client", "therapist");
    return enhanceAction(user, await readJson(request, enhanceActionSchema));
  });
}
