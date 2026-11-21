import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { scheduleAction, scheduleActionSchema } from "@/server/report-actions";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin");
    return scheduleAction(
      user,
      parseId((await params).id),
      await readJson(request, scheduleActionSchema),
    );
  });
}
