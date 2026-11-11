import { allowAttempt } from "@/server/auth";
import { handle, UserFacingError } from "@/server/http";
import { submitReferral } from "@/server/referrals";
import { clientAddress, readMultipart } from "@/server/uploads";

/** Public: anyone can send a referral without an account (requirements, P01). */
export async function POST(request: Request) {
  return handle(async () => {
    if (!allowAttempt(`referral:${clientAddress(request)}`)) {
      throw new UserFacingError("Too many referrals from this connection. Try again in a minute.");
    }
    const { referral, files } = await readMultipart(request);
    return submitReferral(referral, files, null);
  });
}
