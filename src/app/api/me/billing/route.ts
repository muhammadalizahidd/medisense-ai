import { requireUser } from "@/server/auth";
import { myBillables } from "@/server/finance-money";
import { handle } from "@/server/http";

/** A therapist's delivered services to confirm (time and travel). No rates, payers or claims. */
export async function GET() {
  return handle(async () => ({ lines: await myBillables(await requireUser("therapist")) }));
}
