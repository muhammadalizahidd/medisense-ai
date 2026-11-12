import "server-only";
import type { SessionUser } from "@/lib/live/types";
import type { UserDoc } from "./models";

export const sessionUser = (u: UserDoc): SessionUser => ({
  id: u._id.toHexString(),
  name: u.name,
  email: u.email,
  role: u.role,
  staffRoles: u.staffRoles ?? [],
  appearance: u.appearance ?? null,
});
