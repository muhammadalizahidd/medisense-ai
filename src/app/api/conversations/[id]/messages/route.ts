import { requireUser } from "@/server/auth";
import { listMessages, messageSchema, sendMessage } from "@/server/chat";
import { handle, parseId, readJson } from "@/server/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await requireUser("therapist", "client");
    const before = new URL(request.url).searchParams.get("before");
    const date = before ? new Date(before) : undefined;
    return {
      messages: await listMessages(
        user,
        parseId((await params).id),
        date && !Number.isNaN(date.getTime()) ? date : undefined,
      ),
    };
  });
}

export async function POST(request: Request, { params }: Context) {
  return handle(async () => {
    const user = await requireUser("therapist", "client");
    const { body } = await readJson(request, messageSchema);
    return { message: await sendMessage(user, parseId((await params).id), body) };
  });
}
