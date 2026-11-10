import { requireUser } from "@/server/auth";
import { requestSchema, requestTherapist } from "@/server/care-admin";
import { handle, parseId, readJson } from "@/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireUser("admin");
    await requestTherapist(
      admin,
      parseId((await params).id),
      await readJson(request, requestSchema),
    );
    return { ok: true };
  });
}
