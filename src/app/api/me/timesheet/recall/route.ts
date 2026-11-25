import { timesheetWeekSchema } from "@/lib/live/timesheets";
import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { recallTimesheet } from "@/server/timesheets";

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    const input = await readJson(request, timesheetWeekSchema);
    return recallTimesheet(user, input.week);
  });
}
