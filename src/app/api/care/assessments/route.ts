import { z } from "zod";
import { requireUser } from "@/server/auth";
import { assessQueue, createAssess } from "@/server/assess";
import { ensureAssessSeed } from "@/server/assess-seed";
import { handle, parseId, readJson } from "@/server/http";

/** Module 12: the assessment queue, filtered to what this person may see. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser("admin", "therapist");
    await ensureAssessSeed();
    return { rows: await assessQueue(user) };
  });
}

const schema = z.object({
  clientId: z.string(),
  needId: z.string().min(1),
  kind: z.enum(["Initial", "Reassessment"]),
});

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("therapist");
    const body = await readJson(request, schema);
    return createAssess(user, parseId(body.clientId), body.needId, body.kind);
  });
}
