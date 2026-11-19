import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { listClients } from "@/server/care-admin";
import { handle } from "@/server/http";

export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => {
      await requireUser("admin");
      return { clients: await listClients() };
    }),
  );
}
