import { requireUser } from "@/server/auth";
import { claimAction, claimActionSchema } from "@/server/finance";
import { handle, parseId, readJson } from "@/server/http";

/** Agency-managed claim queue: prepare, submit (simulated), outcome, correct, close. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("admin");
    return claimAction(
      user,
      parseId((await params).id),
      await readJson(request, claimActionSchema),
    );
  });
}
