import { z } from "zod";
import { requireUser } from "@/server/auth";
import {
  aiAssessmentCheck,
  aiReportDraft,
  cancelAssessment,
  cancelAssessmentSchema,
  completeAssessmentReview,
  requestAssessmentReview,
  reviewCommentSchema,
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
  z.object({ action: z.literal("request-review") }),
  reviewCommentSchema.extend({ action: z.literal("review") }),
  cancelAssessmentSchema.extend({ action: z.literal("cancel") }),
  z.object({ action: z.literal("ai-check") }),
  z.object({ action: z.literal("ai-report") }),
]);

export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser("therapist", "admin");
    const id = parseId((await params).id);
    const input = await readJson(request, actionSchema);
    if (input.action === "review") {
      await completeAssessmentReview(user, id, input);
      return { ok: true };
    }
    if (user.role !== "therapist") return { ok: false };
    if (input.action === "sign") return signAssessment(user, id);
    if (input.action === "ai-check") return aiAssessmentCheck(user, id);
    if (input.action === "ai-report") return aiReportDraft(user, id);
    if (input.action === "amend") await amendAssessment(user, id, input);
    else if (input.action === "release") await releaseAssessment(user, id, input);
    else if (input.action === "request-review") await requestAssessmentReview(user, id);
    else await cancelAssessment(user, id, input);
    return { ok: true };
  });
}
