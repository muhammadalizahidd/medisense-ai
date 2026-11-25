import { requireUser } from "@/server/auth";
import { mustCan } from "@/server/permissions";
import { chatDirectory } from "@/server/chat";
import { handle } from "@/server/http";

/** Everyone an admin can start a chat with. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser("admin");
    mustCan(user, "messages.use");
    return { people: await chatDirectory(user) };
  });
}
