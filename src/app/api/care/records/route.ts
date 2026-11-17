import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { recordList } from "@/server/records";
import { ensureRecordScenarios } from "@/server/records-seed";

/** Module 11 CR-01: clinical records this person may open, with the access level for each. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    await ensureRecordScenarios();
    return { records: await recordList(user) };
  });
}
