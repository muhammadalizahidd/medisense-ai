import { leaveRequestSchema } from "@/lib/live/leave";
import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { myLeave, requestLeave } from "@/server/leave";

export async function GET() {
  return handle(async () => myLeave(await requireUser("therapist")));
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    return requestLeave(user, await readJson(request, leaveRequestSchema));
  });
}
