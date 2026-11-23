import { requireUser } from "@/server/auth";
import { mustCan } from "@/server/permissions";
import { matchesFor } from "@/server/care-admin";
import { handle, parseId } from "@/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    mustCan(await requireUser("admin"), "schedule.assign");
    const need = new URL(request.url).searchParams.get("need") ?? "";
    return { matches: await matchesFor(parseId((await params).id), need) };
  });
}
