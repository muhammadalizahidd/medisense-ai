import { requireUser } from "@/server/auth";
import { chatDirectory } from "@/server/chat";
import { handle } from "@/server/http";

/** Everyone an admin can start a chat with. */
export async function GET() {
  return handle(async () => ({ people: await chatDirectory(await requireUser("admin")) }));
}
