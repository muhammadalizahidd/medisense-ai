import { allowAttempt } from "@/server/auth";
import { handle, UserFacingError } from "@/server/http";
import { contactAppointments } from "@/server/participants";
import { clientAddress } from "@/server/uploads";

/** Public: an authorised guardian or coordinator sees the participant's appointments only. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return handle(async () => {
    if (!allowAttempt(`contact:${clientAddress(request)}`)) {
      throw new UserFacingError("Too many attempts. Try again in a minute.");
    }
    return { view: await contactAppointments((await params).token) };
  });
}
