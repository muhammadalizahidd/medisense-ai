import { allowAttempt, currentUser } from "@/server/auth";
import { collections } from "@/server/db";
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
    // From inside the patient app, a signed-in patient's referral joins their own record.
    const user = await currentUser();
    const patient =
      user?.role === "client" && user.clientId
        ? await (await collections()).clients.findOne({ _id: user.clientId })
        : null;
    return submitReferral(referral, files, null, patient);
  });
}
