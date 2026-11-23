import { requireUser } from "@/server/auth";
import { mustCan } from "@/server/permissions";
import { handle, parseId } from "@/server/http";
import { resetStaffPassword } from "@/server/therapists";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireUser("admin");
    mustCan(admin, "therapists.reset-password");
    return resetStaffPassword(admin, parseId((await params).id));
  });
}
