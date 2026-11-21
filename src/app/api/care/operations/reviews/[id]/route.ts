import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import {
  decideFinding,
  findingActionSchema,
  runAiReview,
  runValidator,
} from "@/server/operations-review";

const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("validate") }),
  z.object({ type: z.literal("ai") }),
  z.object({ type: z.literal("decide"), finding: findingActionSchema }),
]);

/** OP-06: the referral review for one referral; the id is the referral's. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("admin");
    const id = parseId((await params).id);
    const action = await readJson(request, schema);
    if (action.type === "validate") return runValidator(user, id);
    if (action.type === "ai") return runAiReview(user, id);
    return decideFinding(user, id, action.finding);
  });
}
