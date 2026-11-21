import { requireUser } from "@/server/auth";
import { adjustmentAction, adjustmentActionSchema } from "@/server/finance-money";
import { handle, parseId, readJson } from "@/server/http";

/** Credit notes, debit notes, write-offs and refunds: review, decide (Finance Manager), apply. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("admin");
    return adjustmentAction(
      user,
      parseId((await params).id),
      await readJson(request, adjustmentActionSchema),
    );
  });
}
