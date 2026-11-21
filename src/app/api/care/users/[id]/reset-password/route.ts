import { requireUser } from "@/server/auth";
import { handle, parseId } from "@/server/http";
import { resetUserPassword } from "@/server/user-control";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () =>
    resetUserPassword(await requireUser("admin"), parseId((await params).id)),
  );
}
