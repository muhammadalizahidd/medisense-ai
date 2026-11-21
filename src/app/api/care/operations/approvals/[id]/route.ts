import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { approvalAction, approvalActionSchema } from "@/server/operations";
import { onRuleDecision } from "@/server/operations-hub";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("admin");
    const action = await readJson(request, approvalActionSchema);
    return approvalAction(user, parseId((await params).id), action, onRuleDecision);
  });
}
