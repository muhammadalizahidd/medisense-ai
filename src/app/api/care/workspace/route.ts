import { workspaceActionSchema } from "@/lib/live/workspace";
import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { workspace, workspaceAction } from "@/server/workspace";

export async function GET() {
  return handle(async () => workspace(await requireUser("therapist")));
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    return workspaceAction(user, await readJson(request, workspaceActionSchema));
  });
}
