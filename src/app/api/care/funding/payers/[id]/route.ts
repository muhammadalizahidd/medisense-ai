import { requireUser } from "@/server/auth";
import { payerAction, payerActionSchema } from "@/server/funding";
import { handle, parseId, readJson } from "@/server/http";

/** Edit, verify, inactivate or replace a payer. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("admin");
    return payerAction(
      user,
      parseId((await params).id),
      await readJson(request, payerActionSchema),
    );
  });
}
