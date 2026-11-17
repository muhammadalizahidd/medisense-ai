import { handle, UserFacingError } from "@/server/http";
import { uploadByToken, uploadRequest } from "@/server/funding";

type Params = { params: Promise<{ token: string }> };

/** Workflow step 3: the person asked uploads plan documents through a secure link. */
export async function GET(_: Request, { params }: Params) {
  return handle(async () => ({ request: await uploadRequest((await params).token) }));
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new UserFacingError("The upload couldn't be read. Try again.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new UserFacingError("Choose a file to upload.");
    const token = (await params).token;
    await uploadByToken(
      token,
      {
        name: file.name || "document",
        type: file.type,
        bytes: Buffer.from(await file.arrayBuffer()),
      },
      String(form.get("category") ?? ""),
    );
    return { request: await uploadRequest(token) };
  });
}
