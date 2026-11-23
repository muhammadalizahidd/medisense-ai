import { requireUser } from "@/server/auth";
import { handle, readJson } from "@/server/http";
import { transferSchema, transferSuperAdmin } from "@/server/super-admin";

/** Moves the single Super Admin role to another active office-staff account. */
export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser("admin");
    return transferSuperAdmin(me, await readJson(request, transferSchema));
  });
}
