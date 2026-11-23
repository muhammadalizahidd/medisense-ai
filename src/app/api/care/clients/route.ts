import { pagePermissions } from "@/lib/permissions/pages";
import { requireUser } from "@/server/auth";
import { mustCanAny } from "@/server/permissions";
import { cached, cacheKey } from "@/server/cache";
import { listClients } from "@/server/care-admin";
import { handle } from "@/server/http";

export async function GET(request: Request) {
  return handle(async () => {
    // The patient onboarding board: the roles that can open it.
    mustCanAny(await requireUser("admin"), pagePermissions["/care"]!);
    return cached(cacheKey(request), 60_000, async () => ({ clients: await listClients() }));
  });
}
