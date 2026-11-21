import { allowAttempt } from "@/server/auth";
import { handle, readJson, UserFacingError } from "@/server/http";
import {
  publicActionSchema,
  publicAppointment,
  publicAppointmentAction,
} from "@/server/scheduling";
import { clientAddress } from "@/server/uploads";

type Params = { params: Promise<{ token: string }> };

function guard(request: Request) {
  if (!allowAttempt(`appt:${clientAddress(request)}`)) {
    throw new UserFacingError("Too many attempts. Try again in a minute.");
  }
}

/** Public: a participant opens their appointment from a secure link, no account needed. */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    guard(request);
    return { appointment: await publicAppointment((await params).token) };
  });
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    guard(request);
    const input = await readJson(request, publicActionSchema);
    return { appointment: await publicAppointmentAction((await params).token, input) };
  });
}
