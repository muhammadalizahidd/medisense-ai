import { timesheetAdjustSchema } from "@/lib/live/timesheets";
import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { adjustDay } from "@/server/timesheets";

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    return adjustDay(user, await readJson(request, timesheetAdjustSchema));
  });
}
