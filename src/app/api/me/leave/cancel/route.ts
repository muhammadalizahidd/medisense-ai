import { leaveCancelSchema } from "@/lib/live/leave";
import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { cancelLeave } from "@/server/leave";

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    return cancelLeave(user, (await readJson(request, leaveCancelSchema)).id);
  });
}
