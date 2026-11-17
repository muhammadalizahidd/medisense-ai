import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { ruleAction, ruleActionSchema, ruleDetail } from "@/server/operations-hub";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  return handle(async () => ruleDetail(await requireUser("admin"), parseId((await params).id)));
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin");
    return ruleAction(user, parseId((await params).id), await readJson(request, ruleActionSchema));
  });
}
