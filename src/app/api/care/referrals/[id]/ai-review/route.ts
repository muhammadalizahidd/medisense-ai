import { requireUser } from "@/server/auth";
import { mustCan } from "@/server/permissions";
import { handle, parseId } from "@/server/http";
import { aiReferralReview } from "@/server/referrals";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    mustCan(await requireUser("admin"), "referrals.process");
    return aiReferralReview(parseId((await params).id));
  });
}
