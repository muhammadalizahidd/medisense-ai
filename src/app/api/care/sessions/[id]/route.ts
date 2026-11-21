import { sessionActionSchema } from "@/lib/live/sessions";
import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { sessionAction, sessionDetail } from "@/server/sessions";

type Params = { params: Promise<{ id: string }> };

/** Module 14: one session, at the level this person may see. */
export async function GET(_: Request, { params }: Params) {
  return handle(async () => ({
    session: await sessionDetail(
      await requireUser("admin", "therapist"),
      parseId((await params).id),
    ),
  }));
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    return sessionAction(
      user,
      parseId((await params).id),
      await readJson(request, sessionActionSchema),
    );
  });
}
