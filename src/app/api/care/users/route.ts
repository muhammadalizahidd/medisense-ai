import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { createUser, listUsers, newUserSchema } from "@/server/user-control";

export async function GET() {
  return handle(async () => listUsers(await requireUser("admin")));
}

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser("admin");
    return createUser(me, await readJson(request, newUserSchema));
  });
}
