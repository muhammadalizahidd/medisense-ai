import { z } from "zod";
import { requireUser } from "@/server/auth";
import { startPlan } from "@/server/clinical";
import { handle, objectId, readJson } from "@/server/http";

const schema = z.object({ clientId: objectId, needId: z.string().min(1) });

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    return startPlan(user, await readJson(request, schema));
  });
}
