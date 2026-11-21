import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handle, parseId, readJson } from "@/server/http";
import { retryRun } from "@/server/operations-hub";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("admin");
    const { skip } = await readJson(request, z.object({ skip: z.boolean() }));
    return retryRun(user, parseId((await params).id), skip);
  });
}
