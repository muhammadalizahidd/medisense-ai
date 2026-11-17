import { requireUser } from "@/server/auth";
import { handle, parseId } from "@/server/http";
import { caseMatches } from "@/server/operations-hub";

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser("admin");
    const q = new URL(request.url).searchParams;
    return caseMatches(user, parseId(q.get("client") ?? ""), q.get("need") ?? "");
  });
}
