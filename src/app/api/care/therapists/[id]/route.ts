import { requireUser } from "@/server/auth";
import { handle, parseId } from "@/server/http";
import { therapistDetail } from "@/server/therapists";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireUser("admin");
    return { therapist: await therapistDetail(parseId((await params).id)) };
  });
}
