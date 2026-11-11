import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { listReferrals, submitReferral } from "@/server/referrals";
import { readMultipart } from "@/server/uploads";

export async function GET() {
  return handle(async () => {
    await requireUser("admin");
    return { referrals: await listReferrals() };
  });
}

/** Staff enter a referral received by phone or email; it follows the same intake path. */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireUser("admin");
    const { referral, files } = await readMultipart(request);
    return submitReferral(referral, files, admin);
  });
}
