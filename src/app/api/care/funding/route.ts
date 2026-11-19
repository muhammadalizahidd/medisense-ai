import { z } from "zod";
import { cached, cacheKey } from "@/server/cache";
import { priceItemInputSchema } from "@/lib/live/funding";
import { requireUser } from "@/server/auth";
import {
  acknowledgeAlert,
  fundingOverview,
  planFromReferral,
  policySchema,
  savePriceItem,
  setFundingPolicy,
} from "@/server/funding";
import { collections } from "@/server/db";
import { handle, parseId, readJson, UserFacingError } from "@/server/http";

/** Module 06 funding workspace: plans, alerts, agreements, payers and the price catalogue. */
export async function GET(request: Request) {
  return handle(() =>
    cached(cacheKey(request), 60_000, async () => ({
      overview: await fundingOverview(await requireUser("admin")),
    })),
  );
}

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("policy"), policy: policySchema }),
  z.object({ type: z.literal("price-item"), item: priceItemInputSchema }),
  z.object({
    type: z.literal("ack"),
    key: z.string().max(200),
    note: z.string().trim().max(300).default(""),
  }),
  z.object({ type: z.literal("from-referral"), referralId: z.string().max(40) }),
]);

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("admin");
    const action = await readJson(request, actionSchema);
    switch (action.type) {
      case "policy":
        await setFundingPolicy(user, action.policy);
        return { ok: true };
      case "price-item":
        await savePriceItem(user, action.item);
        return { ok: true };
      case "ack":
        await acknowledgeAlert(user, action.key, action.note);
        return { ok: true };
      case "from-referral": {
        const { referrals } = await collections();
        const r = await referrals.findOne({ _id: parseId(action.referralId) });
        if (!r) throw new UserFacingError("Referral not found.", 404);
        const plan = await planFromReferral(r, r.clientId, user.name);
        if (!plan) throw new UserFacingError("This referral isn't NDIS-funded.", 409);
        return { planId: plan._id.toHexString(), clientId: plan.clientId?.toHexString() ?? null };
      }
    }
  });
}
