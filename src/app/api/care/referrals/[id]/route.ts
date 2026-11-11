import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { referralAction, referralActionSchema, referralDetail } from "@/server/referrals";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  return handle(async () => {
    const admin = await requireUser("admin");
    return { referral: await referralDetail(parseId((await params).id), admin) };
  });
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const admin = await requireUser("admin");
    const action = await readJson(request, referralActionSchema);
    return referralAction(admin, parseId((await params).id), action);
  });
}
