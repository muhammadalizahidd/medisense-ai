import { AiDisabled } from "@/lib/ai/types";
import { agentActionSchema } from "@/lib/live/agent";
import { adminAgentAction, adminAgentView } from "@/server/agent";
import { aiSwitchOn } from "@/server/ai-switch";
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
  return handle(async () => {
    const user = await requireUser();
    const action = await readJson(request, agentActionSchema);
    // Booking confirmations arrive here too and stay; asking the agent a question does not.
    if (action.type === "ask" && !(await aiSwitchOn())) throw new AiDisabled();
    return adminAgentAction(user, action);
  });
}
