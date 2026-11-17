import { reportActionSchema } from "@/lib/live/progress";
import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { reportAction, reportDetail } from "@/server/progress";

type Params = { params: Promise<{ id: string }> };

/** Module 16: one clinical report, at the level this person may see. */
export async function GET(_: Request, { params }: Params) {
  return handle(async () => ({
    report: await reportDetail(await requireUser("admin", "therapist"), parseId((await params).id)),
  }));
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    return reportAction(
      user,
      parseId((await params).id),
      await readJson(request, reportActionSchema),
    );
  });
}
