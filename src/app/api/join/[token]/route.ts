import { allowAttempt } from "@/server/auth";
import { handle, readJson, UserFacingError } from "@/server/http";
import { guestAction, guestSchema, guestView } from "@/server/telehealth";
import { clientAddress } from "@/server/uploads";

type Params = { params: Promise<{ token: string }> };

/** Public: a participant joins with their one-time link, no account needed (section 12). */
export async function GET(_: Request, { params }: Params) {
  return handle(async () => ({ call: await guestView((await params).token) }));
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    if (!allowAttempt(`join:${clientAddress(request)}`)) {
      throw new UserFacingError("Too many attempts. Wait a minute and try again.");
    }
    const token = (await params).token;
    await guestAction(token, await readJson(request, guestSchema));
    return { call: await guestView(token) };
  });
}
