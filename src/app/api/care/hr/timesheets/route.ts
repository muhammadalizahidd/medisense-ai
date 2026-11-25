import { timesheetDecisionSchema } from "@/lib/live/timesheets";
import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { decideTimesheets, timesheetBoard } from "@/server/timesheets";

export async function GET(request: Request) {
  return handle(async () => {
    const me = await requireUser("admin");
    return timesheetBoard(me, new URL(request.url).searchParams.get("week"));
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser("admin");
    return decideTimesheets(me, await readJson(request, timesheetDecisionSchema));
  });
}
