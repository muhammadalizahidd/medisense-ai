import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { messageAction, messageActionSchema } from "@/server/operations";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("admin");
    return messageAction(
      user,
      parseId((await params).id),
      await readJson(request, messageActionSchema),
    );
  });
}
