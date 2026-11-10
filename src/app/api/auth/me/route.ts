import { currentUser } from "@/server/auth";
import { handle } from "@/server/http";
import { sessionUser } from "@/server/session-user";

export async function GET() {
  return handle(async () => {
    const user = await currentUser();
    return { user: user ? sessionUser(user) : null };
  });
}
