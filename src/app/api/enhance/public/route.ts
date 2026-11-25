import { z } from "zod";
import { AiDisabled } from "@/lib/ai/types";
import { aiSwitchOn } from "@/server/ai-switch";
import { publicAssistant } from "@/server/enhance-more";
import { handle, readJson } from "@/server/http";

/** The visitor assistant on the referral page: general help only, never personal information. */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request, z.object({ text: z.string().trim().min(1).max(500) }));
    if (!(await aiSwitchOn())) throw new AiDisabled();
    return { reply: await publicAssistant(body.text) };
  });
}
