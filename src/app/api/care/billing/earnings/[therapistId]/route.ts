import { requireUser } from "@/server/auth";
import { handle, parseId } from "@/server/http";
import { therapistEarningVisits } from "@/server/pay";
import { readFilter } from "../filter";

type Params = { params: Promise<{ therapistId: string }> };

/** One therapist's visits as they see them, plus what was billed. Finance only. */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => ({
    rows: await therapistEarningVisits(
      await requireUser("admin"),
      parseId((await params).therapistId),
      readFilter(request),
    ),
  }));
}
