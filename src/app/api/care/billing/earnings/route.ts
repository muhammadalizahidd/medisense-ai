import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { therapistEarningsReport } from "@/server/pay";
import { readFilter } from "./filter";

/** Billing reports: each therapist's visits, billed amount, pay and margin. Finance only. */
export async function GET(request: Request) {
  return handle(async () =>
    therapistEarningsReport(await requireUser("admin"), readFilter(request)),
  );
}
