import { requireUser } from "@/server/auth";
import { handle, parseId } from "@/server/http";
import { aiReferralReview } from "@/server/referrals";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireUser("admin");
    return aiReferralReview(parseId((await params).id));
  });
}
