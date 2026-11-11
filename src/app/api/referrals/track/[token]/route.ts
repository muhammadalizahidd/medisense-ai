import { allowAttempt } from "@/server/auth";
import { handle, UserFacingError } from "@/server/http";
import { answerInfoRequest, trackReferral, withdrawByToken } from "@/server/referrals";
import { clientAddress, readMultipart } from "@/server/uploads";

type Params = { params: Promise<{ token: string }> };

function guard(request: Request) {
  if (!allowAttempt(`track:${clientAddress(request)}`)) {
    throw new UserFacingError("Too many attempts. Try again in a minute.");
  }
}

export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    guard(request);
    return { referral: await trackReferral((await params).token) };
  });
}

/** The submitter answers a request for information, with optional documents. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    guard(request);
    const { answer, files } = await readMultipart(request);
    await answerInfoRequest((await params).token, answer, files);
    return { ok: true };
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    guard(request);
    await withdrawByToken((await params).token);
    return { ok: true };
  });
}
