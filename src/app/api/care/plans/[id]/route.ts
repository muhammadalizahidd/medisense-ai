import { planActionSchema } from "@/lib/live/tplan";
import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { planAction, planDetail } from "@/server/tplan";

type Params = { params: Promise<{ id: string }> };

/** Module 13: one treatment plan, at the level this person may see. */
export async function GET(_: Request, { params }: Params) {
  return handle(async () => ({
    plan: await planDetail(await requireUser("admin", "therapist"), parseId((await params).id)),
  }));
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    return planAction(user, parseId((await params).id), await readJson(request, planActionSchema));
  });
}
