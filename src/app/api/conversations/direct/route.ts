import { requireUser } from "@/server/auth";
import { startChatSchema, startDirectChat } from "@/server/chat";
import { handle, parseId, readJson } from "@/server/http";

/** Opens an admin's chat with someone, or returns the one they already have. */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("admin");
    const { userId } = await readJson(request, startChatSchema);
    return await startDirectChat(user, parseId(userId));
  });
}
