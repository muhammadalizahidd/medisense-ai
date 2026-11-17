import { episodeActionSchema } from "@/lib/live/progress";
import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { episodeAction, episodeDetail } from "@/server/progress";

type Params = { params: Promise<{ key: string }> };

/** Module 16: one service episode's outcomes, reassessments, reports and discharge. */
export async function GET(_: Request, { params }: Params) {
  return handle(async () => ({
    episode: await episodeDetail(
      await requireUser("admin", "therapist"),
      decodeURIComponent((await params).key),
    ),
  }));
}

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    return episodeAction(
      user,
      decodeURIComponent((await params).key),
      await readJson(request, episodeActionSchema),
    );
  });
}
