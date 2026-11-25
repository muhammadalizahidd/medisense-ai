import { leaveDecisionSchema } from "@/lib/live/leave";
import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { decideLeave, leaveBoard } from "@/server/leave";

export async function GET() {
  return handle(async () => leaveBoard(await requireUser("admin")));
}

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser("admin");
    return decideLeave(me, await readJson(request, leaveDecisionSchema));
  });
}
