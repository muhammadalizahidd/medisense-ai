import { requireUser } from "@/server/auth";
import { uploadEvidence } from "@/server/funding";
import { handle, parseId, UserFacingError } from "@/server/http";

/** AT-08: upload plan evidence, or a new version replacing an earlier one. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("admin");
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new UserFacingError("The upload couldn't be read. Try again.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new UserFacingError("Choose a file to upload.");
    await uploadEvidence(
      user,
      parseId((await params).id),
      {
        name: file.name || "evidence",
        type: file.type,
        bytes: Buffer.from(await file.arrayBuffer()),
      },
      {
        category: String(form.get("category") ?? ""),
        source: String(form.get("source") ?? ""),
        replaceId: String(form.get("replaceId") ?? ""),
      },
    );
    return { ok: true };
  });
}
