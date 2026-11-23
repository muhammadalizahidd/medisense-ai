import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { deleteRole, updateRole, updateRoleSchema } from "@/server/role-admin";

type Params = { params: Promise<{ slug: string }> };

/** Renames a role, changes its description, or changes what it allows. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser("admin");
    return updateRole(me, (await params).slug, await readJson(request, updateRoleSchema));
  });
}

/** Deletes a custom role that nobody holds. */
export async function DELETE(_: Request, { params }: Params) {
  return handle(async () => {
    const me = await requireUser("admin");
    await deleteRole(me, (await params).slug);
    return { ok: true };
  });
}
