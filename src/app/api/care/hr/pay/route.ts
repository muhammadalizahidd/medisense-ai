import { z } from "zod";
import { payRateInputSchema } from "@/lib/live/pay";
import { requireUser } from "@/server/auth";
import { cached, cacheKey } from "@/server/cache";
import { handle, parseId, readJson } from "@/server/http";
import { payRatesBoard, setPayRate, withdrawPayRate } from "@/server/pay";

/** People and HR, pay rates: how each therapist is paid, with the history of every change. */
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser("admin");
    return cached(`${cacheKey(request)}:${user._id.toHexString()}`, 60_000, () =>
      payRatesBoard(user),
    );
  });
}

const id = z.string().regex(/^[a-f0-9]{24}$/);
const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("set"),
    therapistId: id,
    basedOnSeq: z.number().int().min(0),
    rate: payRateInputSchema,
  }),
  z.object({ type: z.literal("withdraw"), rateId: id }),
]);

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser("admin");
    const action = await readJson(request, actionSchema);
    if (action.type === "set")
      return setPayRate(user, parseId(action.therapistId), action.rate, action.basedOnSeq);
    return withdrawPayRate(user, parseId(action.rateId));
  });
}
