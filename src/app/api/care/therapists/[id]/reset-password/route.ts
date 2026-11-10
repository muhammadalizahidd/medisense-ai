import { requireUser } from "@/server/auth";
import { handle, parseId } from "@/server/http";
import { resetStaffPassword } from "@/server/therapists";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireUser("admin");
    return resetStaffPassword(admin, parseId((await params).id));
  });
}
