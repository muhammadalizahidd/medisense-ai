import { requireUser } from "@/server/auth";
import { matchesFor } from "@/server/care-admin";
import { handle, parseId } from "@/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireUser("admin");
    const discipline = new URL(request.url).searchParams.get("discipline") ?? "";
    return { matches: await matchesFor(parseId((await params).id), discipline) };
  });
}
