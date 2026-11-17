import { z } from "zod";
import { requireUser } from "@/server/auth";
import { createAgreement } from "@/server/agreements";
import { fundingWorkspace, newPlan, reviewGate, reviewSchema } from "@/server/funding";
import { handle, parseId, readJson } from "@/server/http";

type Params = { params: Promise<{ clientId: string }> };

/** One participant's plans, budgets, agreements, readiness and history. */
export async function GET(_: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin");
    return { workspace: await fundingWorkspace(user, parseId((await params).clientId)) };
  });
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("new-plan") }),
  z.object({ type: z.literal("new-agreement"), planId: z.string().max(40).default("") }),
  z.object({ type: z.literal("review-gate"), review: reviewSchema }),
]);

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin");
    const clientId = parseId((await params).clientId);
    const action = await readJson(request, actionSchema);
    if (action.type === "new-plan") return newPlan(user, clientId);
    if (action.type === "new-agreement") return createAgreement(user, clientId, action.planId);
    await reviewGate(user, clientId, action.review);
    return { ok: true };
  });
}
