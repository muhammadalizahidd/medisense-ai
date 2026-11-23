import "server-only";
import type { SessionUser } from "@/lib/live/types";
import type { UserDoc } from "./models";
import { permissionsOf } from "./roles";

export const sessionUser = async (u: UserDoc): Promise<SessionUser> => ({
  id: u._id.toHexString(),
  name: u.name,
  email: u.email,
  role: u.role,
  staffRoles: u.staffRoles ?? [],
  permissions: await permissionsOf(u),
  appearance: u.appearance ?? null,
  mustChangePassword: Boolean(u.mustChangePassword),
});
