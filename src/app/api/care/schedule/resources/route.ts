import { requireUser } from "@/server/auth";
import { mustCan } from "@/server/permissions";
import { handle, readJson } from "@/server/http";
import { addLeave, leaveSchema, resourceWeek, schedulingAudit } from "@/server/scheduling";

/** S05-08 and S05-10: the week's resources, and the scheduling audit trail. */
export async function GET(request: Request) {
  return handle(async () => {
    mustCan(await requireUser("admin"), "schedule.manage");
    const week = new URL(request.url).searchParams.get("week");
    const monday = week ? new Date(`${week}T00:00:00+10:00`) : new Date();
    if (Number.isNaN(monday.getTime())) throw new Error("Check the week.");
    const [resources, audit] = await Promise.all([resourceWeek(monday), schedulingAudit()]);
    return { resources, audit };
  });
}

/** Records approved leave for a clinician; affected visits are flagged, not moved. */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireUser("admin");
    mustCan(admin, "schedule.manage");
    return addLeave(admin, await readJson(request, leaveSchema));
  });
}
