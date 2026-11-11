import { requireUser } from "@/server/auth";
import { searchMessages } from "@/server/chat";
import { handle } from "@/server/http";

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return { results: await searchMessages(user, q) };
  });
}
