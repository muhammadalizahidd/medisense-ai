import { workspaceActionSchema } from "@/lib/live/workspace";
import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { handle, readJson } from "@/server/http";
import { workspace, workspaceAction } from "@/server/workspace";

export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => workspace(await requireUser("therapist"))),
  );
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    return workspaceAction(user, await readJson(request, workspaceActionSchema));
  });
}
