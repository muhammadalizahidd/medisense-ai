import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { myBillables } from "@/server/finance-money";
import { handle } from "@/server/http";

/** A therapist's delivered services to confirm (time and travel). No rates, payers or claims. */
export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => ({
      lines: await myBillables(await requireUser("therapist")),
    })),
  );
}
