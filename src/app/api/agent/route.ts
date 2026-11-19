import { agentActionSchema } from "@/lib/live/agent";
import { adminAgentAction, adminAgentView } from "@/server/agent";
import "@/server/agent-tools";
import "@/server/booking-agent";
import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";

/**
 * The admin operations agent: briefing, features and run history. Any signed-in person may confirm
 * or cancel proposals they asked for in their own assistant; asking here is admin only.
 */
export async function GET() {
  return handle(async () => adminAgentView(await requireUser("admin")));
}

export async function POST(request: Request) {
  return handle(async () =>
    adminAgentAction(await requireUser(), await readJson(request, agentActionSchema)),
  );
}
