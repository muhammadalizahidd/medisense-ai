import { requireUser } from "@/server/auth";
import { mustCan, mustCanAny } from "@/server/permissions";
import { handle, parseId, readJson } from "@/server/http";
import { referralAction, referralActionSchema, referralDetail } from "@/server/referrals";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  return handle(async () => {
    const admin = await requireUser("admin");
    mustCanAny(admin, ["referrals.process", "referrals.triage"]);
    return { referral: await referralDetail(parseId((await params).id), admin) };
  });
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const admin = await requireUser("admin");
    const action = await readJson(request, referralActionSchema);
    // The triage decision checks its own permission; every other step is intake work.
    if (action.type !== "triage") mustCan(admin, "referrals.process");
    return referralAction(admin, parseId((await params).id), action);
  });
}
