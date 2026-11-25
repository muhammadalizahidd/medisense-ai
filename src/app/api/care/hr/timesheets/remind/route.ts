import { timesheetRemindSchema } from "@/lib/live/timesheets";
import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { remindTimesheets } from "@/server/timesheets";

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser("admin");
    const input = await readJson(request, timesheetRemindSchema);
    return remindTimesheets(me, input.staffIds, input.week);
  });
}
