import { z } from "zod";
import { requireUser } from "@/server/auth";
import {
  amendAssessment,
  amendSchema,
  assessmentSaveSchema,
  getAssessment,
  releaseAssessment,
  releaseSchema,
  saveAssessment,
  signAssessment,
} from "@/server/clinical";
import { handle, parseId, readJson } from "@/server/http";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("therapist", "admin");
    return { assessment: await getAssessment(user, parseId((await params).id)) };
  });
}

export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("therapist");
    await saveAssessment(
      user,
      parseId((await params).id),
      await readJson(request, assessmentSaveSchema),
    );
    return { ok: true };
  });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sign") }),
  amendSchema.extend({ action: z.literal("amend") }),
  releaseSchema.extend({ action: z.literal("release") }),
]);

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("therapist");
    const id = parseId((await params).id);
    const input = await readJson(request, actionSchema);
    if (input.action === "sign") return signAssessment(user, id);
    if (input.action === "amend") await amendAssessment(user, id, input);
    else await releaseAssessment(user, id, input);
    return { ok: true };
  });
}
