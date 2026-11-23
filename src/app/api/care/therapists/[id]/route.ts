import { requireUser } from "@/server/auth";
import { mustCan } from "@/server/permissions";
import { handle, parseId } from "@/server/http";
import { therapistDetail } from "@/server/therapists";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    mustCan(await requireUser("admin"), "therapists.view");
    return { therapist: await therapistDetail(parseId((await params).id)) };
  });
}
