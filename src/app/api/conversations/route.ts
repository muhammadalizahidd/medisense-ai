import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { listConversations } from "@/server/chat";
import { handle } from "@/server/http";

export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => ({
      conversations: await listConversations(await requireUser("therapist", "client", "admin")),
    })),
  );
}
