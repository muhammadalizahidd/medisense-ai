import { requireUser } from "@/server/auth";
import { myAgreements } from "@/server/agreements";
import { handle, UserFacingError } from "@/server/http";

/** The participant's own issued and signed agreements, for the patient app. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser("client");
    if (!user.clientId) throw new UserFacingError("No participant record.", 404);
    return { agreements: await myAgreements(user.clientId) };
  });
}
