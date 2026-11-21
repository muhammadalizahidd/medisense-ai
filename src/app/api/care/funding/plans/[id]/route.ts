import { requireUser } from "@/server/auth";
import { planAction, planActionSchema } from "@/server/funding";
import { handle, parseId, readJson } from "@/server/http";

/** Plan edits, field and evidence reviews, budgets, information requests (role-checked). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("admin");
    return planAction(user, parseId((await params).id), await readJson(request, planActionSchema));
  });
}
