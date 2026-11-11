import { z } from "zod";
import { requireUser } from "@/server/auth";
import { startAssessment } from "@/server/clinical";
import { handle, objectId, readJson } from "@/server/http";

const schema = z.object({
  clientId: objectId,
  needId: z.string().min(1),
  kind: z.enum(["Initial", "Reassessment"]).default("Initial"),
});

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    return startAssessment(user, await readJson(request, schema));
  });
}
