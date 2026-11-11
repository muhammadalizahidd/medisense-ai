import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { setTherapistActive } from "@/server/therapists";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireUser("admin");
    const { active } = await readJson(request, z.object({ active: z.boolean() }));
    await setTherapistActive(admin, parseId((await params).id), active);
    return { ok: true };
  });
}
