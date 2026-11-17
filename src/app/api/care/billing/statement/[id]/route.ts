import { requireUser } from "@/server/auth";
import { reconAction, reconActionSchema } from "@/server/finance-money";
import { handle, parseId, readJson } from "@/server/http";

/** Reconciliation: match, review and reconcile a statement line, each on explicit confirmation. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("admin");
    return reconAction(
      user,
      parseId((await params).id),
      await readJson(request, reconActionSchema),
    );
  });
}
