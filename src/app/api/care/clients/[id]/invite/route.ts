import { requireUser } from "@/server/auth";
import { reissueInvite } from "@/server/care-admin";
import { handle, parseId } from "@/server/http";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireUser("admin");
    return reissueInvite(admin, parseId((await params).id));
  });
}
