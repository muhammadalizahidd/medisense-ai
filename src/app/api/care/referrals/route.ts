import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { handle } from "@/server/http";
import { listReferrals, submitReferral } from "@/server/referrals";
import { ObjectId } from "mongodb";
import { putPhoto } from "@/server/photos";
import { readMultipart } from "@/server/uploads";

export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => {
      await requireUser("admin");
      return { referrals: await listReferrals() };
    }),
  );
}

/** Staff enter a referral received by phone or email; it follows the same intake path. */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireUser("admin");
    const { referral, files, photo } = await readMultipart(request);
    const sent = await submitReferral(referral, files, admin);
    // Staff may add the participant's photo; it moves to their record when accepted.
    if (photo) await putPhoto("referral", new ObjectId(sent.id), photo);
    return sent;
  });
}
