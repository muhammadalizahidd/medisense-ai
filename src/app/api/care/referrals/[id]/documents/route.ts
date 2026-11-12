import { requireUser } from "@/server/auth";
import { handle, parseId, UserFacingError } from "@/server/http";
import { replaceDocument } from "@/server/referrals";
import { readMultipart } from "@/server/uploads";

type Params = { params: Promise<{ id: string }> };

/** Staff upload a new version of a referral document; the earlier version is kept. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const admin = await requireUser("admin");
    const { files, answer } = await readMultipart(request);
    const file = files[0];
    if (!file) throw new UserFacingError("Choose the new file.");
    await replaceDocument(admin, parseId((await params).id), parseId(answer), file);
    return { ok: true };
  });
}
