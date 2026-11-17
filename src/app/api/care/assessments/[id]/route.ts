import { assessActionSchema } from "@/lib/live/assess";
import { requireUser } from "@/server/auth";
import { assessAction, assessDetail } from "@/server/assess";
import { handle, parseId, readJson } from "@/server/http";

type Params = { params: Promise<{ id: string }> };

/** Module 12: one assessment, at the level this person may see. */
export async function GET(_: Request, { params }: Params) {
  return handle(async () => ({
    assessment: await assessDetail(
      await requireUser("admin", "therapist"),
      parseId((await params).id),
    ),
  }));
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    return assessAction(
      user,
      parseId((await params).id),
      await readJson(request, assessActionSchema),
    );
  });
}
