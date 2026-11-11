import { z } from "zod";
import { requireUser } from "@/server/auth";
import {
  activatePlan,
  draftProgressSummary,
  getPlan,
  planSaveSchema,
  reviewPlan,
  reviewSchema,
  savePlan,
} from "@/server/clinical";
import { handle, parseId, readJson } from "@/server/http";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("therapist", "admin");
    return { plan: await getPlan(user, parseId((await params).id)) };
  });
}

export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("therapist");
    await savePlan(user, parseId((await params).id), await readJson(request, planSaveSchema));
    return { ok: true };
  });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("progress-summary") }),
  reviewSchema.extend({ action: z.literal("review") }),
]);

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("therapist");
    const id = parseId((await params).id);
    const input = await readJson(request, actionSchema);
    if (input.action === "activate") await activatePlan(user, id);
    else if (input.action === "progress-summary") return draftProgressSummary(user, id);
    else await reviewPlan(user, id, input);
    return { ok: true };
  });
}
