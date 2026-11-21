import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { rolesSchema, setUserActive, updateRoles } from "@/server/user-control";

const schema = z.union([rolesSchema, z.object({ active: z.boolean() })]);

/** Changes one account's responsibilities, or deactivates and reactivates it. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireUser("admin");
    const id = parseId((await params).id);
    const body = await readJson(request, schema);
    if ("active" in body) await setUserActive(me, id, body.active);
    else await updateRoles(me, id, body);
    return { ok: true };
  });
}
