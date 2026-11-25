import { timesheetSubmitSchema } from "@/lib/live/timesheets";
import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { myTimesheet, submitTimesheet } from "@/server/timesheets";

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    return myTimesheet(user, new URL(request.url).searchParams.get("week"));
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    const input = await readJson(request, timesheetSubmitSchema);
    return submitTimesheet(user, input.week, input.comment);
  });
}
