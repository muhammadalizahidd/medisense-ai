import { z } from "zod";
import { cached, cacheKey } from "@/server/cache";
import { adjustmentInputSchema, paymentInputSchema } from "@/lib/live/finance";
import { requireUser } from "@/server/auth";
import { prepareLines, rulesSchema, saveRules } from "@/server/finance";
import {
  aiFinanceReview,
  financeHub,
  importStatement,
  recordPayment,
  requestAdjustment,
} from "@/server/finance-money";
import { handle, parseId, readJson } from "@/server/http";

/** Module 07: the finance hub (queue, invoices, claims, payments, reconciliation, adjustments). */
export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => ({
      hub: await financeHub(await requireUser("admin")),
    })),
  );
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("prepare"), ids: z.array(z.string().max(40)).min(1).max(200) }),
  z.object({ type: z.literal("payment"), payment: paymentInputSchema }),
  z.object({ type: z.literal("import-statement") }),
  z.object({ type: z.literal("rules"), rules: rulesSchema }),
  z.object({ type: z.literal("adjustment"), adjustment: adjustmentInputSchema }),
  z.object({ type: z.literal("ai-review"), ids: z.array(z.string().max(40)).min(1).max(25) }),
]);

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("admin");
    const action = await readJson(request, actionSchema);
    switch (action.type) {
      case "prepare":
        return prepareLines(user, action.ids.map(parseId));
      case "payment":
        return recordPayment(user, action.payment);
      case "import-statement":
        return importStatement(user);
      case "rules":
        await saveRules(user, action.rules);
        return { ok: true };
      case "adjustment":
        return requestAdjustment(user, action.adjustment);
      case "ai-review":
        return { review: await aiFinanceReview(user, action.ids) };
    }
  });
}
