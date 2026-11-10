import { requireUser } from "@/server/auth";
import { listConversations } from "@/server/chat";
import { handle } from "@/server/http";

export async function GET() {
  return handle(async () => ({
    conversations: await listConversations(await requireUser("therapist", "client")),
  }));
}
