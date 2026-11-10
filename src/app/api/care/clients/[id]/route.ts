import { requireUser } from "@/server/auth";
import { clientDetail } from "@/server/care-admin";
import { handle, parseId } from "@/server/http";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireUser("admin");
    return { client: await clientDetail(parseId((await params).id)) };
  });
}
