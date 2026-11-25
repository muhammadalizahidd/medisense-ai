import { requireUser } from "@/server/auth";
import { mustCan } from "@/server/permissions";
import { handle, parseId, readJson } from "@/server/http";
import { staffAction, staffActionSchema, staffRecord } from "@/server/staff";

type Params = { params: Promise<{ id: string }> };

/** Module 04: a staff member's profile, credentials, service eligibility, coverage and capacity. */
export async function GET(_: Request, { params }: Params) {
  return handle(async () => {
    const admin = await requireUser("admin");
    mustCan(admin, "therapists.view");
    return { staff: await staffRecord(parseId((await params).id), admin) };
  });
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const admin = await requireUser("admin");
    mustCan(admin, "therapists.view");
    const action = await readJson(request, staffActionSchema);
    return staffAction(admin, parseId((await params).id), action);
  });
}
