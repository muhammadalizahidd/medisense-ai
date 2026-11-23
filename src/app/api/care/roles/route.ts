import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { createRole, listRoles, newRoleSchema } from "@/server/role-admin";

export async function GET() {
  return handle(async () => listRoles(await requireUser("admin")));
}

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser("admin");
    return createRole(me, await readJson(request, newRoleSchema));
  });
}
