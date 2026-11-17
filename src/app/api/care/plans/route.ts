import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { createPlan13, planList } from "@/server/tplan";
import { ensurePlanSeed } from "@/server/tplan-seed";

/** Module 13: treatment plans and episodes still to plan, filtered to this person. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    await ensurePlanSeed();
    return { rows: await planList(user) };
  });
}

const schema = z.object({ clientId: z.string(), needId: z.string().min(1) });

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    const body = await readJson(request, schema);
    return createPlan13(user, parseId(body.clientId), body.needId);
  });
}
