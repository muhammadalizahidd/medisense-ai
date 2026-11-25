import { z } from "zod";
import { requireUser } from "@/server/auth";
import { mustCan } from "@/server/permissions";
import { autoAllocate } from "@/server/care-admin";
import { handle, parseId, readJson } from "@/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireUser("admin");
    mustCan(admin, "schedule.assign");
    const { needId } = await readJson(request, z.object({ needId: z.string().min(1) }));
    return autoAllocate(admin, parseId((await params).id), needId);
  });
}
