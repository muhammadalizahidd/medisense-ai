import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { UserFacingError } from "@/server/http";
import { serverLog } from "@/server/log";
import { can } from "@/server/permissions";
import { systemOverview } from "@/server/system-reports";

const plain = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });

/** The reports overview for one period and set of filters, counted on the server and cached. */
export async function GET(request: Request) {
  const admin = await requireUser("admin").catch(() => null);
  if (!admin) return plain("Sign in as staff to open reports.", 401);
  // Checked before the cache, which is shared by everyone allowed to see the overview.
  if (!can(admin, "reports.detail.scheduling")) {
    return plain("You don't have access to the reports overview.", 403);
  }
  const params = new URL(request.url).searchParams;
  const filters = {
    from: params.get("from"),
    to: params.get("to"),
    region: params.get("region"),
    discipline: params.get("discipline"),
    therapist: params.get("therapist"),
    status: params.get("status"),
  };
  try {
    // Cached per signed-in person and filters; a change to the records clears it.
    const overview = await cached(
      cacheKey(request),
      120_000,
      () => systemOverview(admin, filters),
      {
        warm: true,
      },
    );
    return NextResponse.json({ overview }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UserFacingError) return plain(error.message, error.status);
    serverLog(`Reports overview failed: ${error instanceof Error ? error.message : String(error)}`);
    return plain("The overview couldn't be made just now. Try again.", 503);
  }
}
