import { requireUser } from "@/server/auth";
import { aiFundingCheck } from "@/server/funding";
import { handle, parseId } from "@/server/http";

/** Workflow step 2: AI flags gaps and drafts a non-clinical follow-up. A person sends it. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("admin");
    return { check: await aiFundingCheck(user, parseId((await params).id)) };
  });
}
