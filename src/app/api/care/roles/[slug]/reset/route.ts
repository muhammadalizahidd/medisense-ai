import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { resetRole } from "@/server/role-admin";

/** Puts a built-in role back to its default permissions. */
export async function POST(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const me = await requireUser("admin");
    await resetRole(me, (await params).slug);
    return { ok: true };
  });
}
